from fastapi import APIRouter, HTTPException, Request, Depends, status, Query
import threading
from db.supabase_client import get_supabase_client
from db.auth_dependency import get_current_user
from db.google_credentials import GoogleCalendarService
from db.calendar_sync import CalendarSyncService
from supabase import Client
from models.user import User
from typing import Optional
import logging
from fastapi.responses import JSONResponse
from datetime import datetime, timezone, timedelta
from uuid import UUID
from starlette.requests import ClientDisconnect
from urllib.parse import urlparse
from pydantic import BaseModel

import httpx
from icalendar import Calendar as IcsCalendar

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/calendar", tags=["Calendar"])

class CalendarUpdate(BaseModel):
    color: Optional[str] = None
    selected: Optional[bool] = None

    model_config = {"extra": "ignore"}

def _normalize_subscription_url(value: str) -> str:
    return value.strip() if isinstance(value, str) else ""

def _validate_subscription_url(value: str) -> str:
    url = _normalize_subscription_url(value)
    if not url:
        raise HTTPException(status_code=400, detail="Subscription url is required")
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Subscription url must be an http(s) URL")
    return url

def _parse_ics_datetime(prop):
    if prop is None:
        return None
    dt = getattr(prop, "dt", None)
    if dt is None:
        return None
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    try:
        return datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
    except Exception:
        return None

async def _fetch_ics_events(url: str, start_dt: datetime, end_dt: datetime, calendar_id: str):
    if not url:
        return []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers={"User-Agent": "Chronos/1.0"})
            resp.raise_for_status()
            content = resp.content
    except Exception as e:
        return []

    try:
        cal = IcsCalendar.from_ical(content)
    except Exception as e:
        return []

    out = []
    for component in cal.walk():
        if component.name != "VEVENT":
            continue
        evt = _ics_event_to_api_event(component, calendar_id)
        if not evt:
            continue

        try:
            start_val = evt.get("start", {})
            raw = start_val.get("dateTime") or start_val.get("date")
            if not raw:
                continue
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            parsed = parsed.astimezone(timezone.utc)
            if parsed < start_dt or parsed > end_dt:
                continue
        except Exception:
            continue

        out.append(evt)
    return out

def _extract_location_text(value):
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for key in (
            "formatted_address",
            "description",
            "address",
            "value",
            "name",
            "label",
            "title",
            "main_text",
            "secondary_text",
        ):
            candidate = value.get(key)
            if isinstance(candidate, str):
                trimmed = candidate.strip()
                if trimmed or candidate == "":
                    return trimmed
        for candidate in value.values():
            if isinstance(candidate, str):
                trimmed = candidate.strip()
                if trimmed:
                    return trimmed
        return None
    if isinstance(value, (list, tuple)):
        for item in value:
            normalized = _extract_location_text(item)
            if normalized:
                return normalized
        return None
    return str(value).strip()

def _normalize_event_location(event_data):
    if not isinstance(event_data, dict):
        return event_data
    raw_location = event_data.get("location")
    normalized = _extract_location_text(raw_location)
    if normalized is None:
        if raw_location is None:
            event_data.pop("location", None)
        else:
            event_data["location"] = ""
    else:
        event_data["location"] = normalized
    return event_data

def _is_uuid(value: str) -> bool:
    try:
        UUID(str(value))
        return True
    except Exception:
        return False

@router.post("/credentials")
async def save_credentials(request: Request, user: User = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    try:
        body = await request.json()
        access_token = body.get("access_token")
        refresh_token = body.get("refresh_token")
        expires_at = body.get("expires_at")
        scopes = body.get("scopes")
        
        if not access_token or not refresh_token or not expires_at:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing tokens")
        
        if scopes:
            if isinstance(scopes, str):
                scopes = [s.strip() for s in scopes.split(',') if s.strip()]
            elif not isinstance(scopes, list):
                scopes = [str(scopes)]
        
        external_account_id = user.email
        
        payload = {
            "user_id": str(user.id),
            "provider": "google",
            "external_account_id": external_account_id,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": expires_at,
            "scopes": scopes
        }
        payload["account_email"] = user.email
        
        result = supabase.table("calendar_accounts").upsert(payload, on_conflict="user_id,provider,external_account_id").execute()
        
        sync_service = CalendarSyncService(str(user.id), external_account_id, supabase)
        calendars = sync_service.google_service.list_calendars()
        primary_email = None
        for cal in calendars or []:
            if cal.get("primary") is True and isinstance(cal.get("id"), str) and "@" in cal.get("id"):
                primary_email = cal.get("id")
                break
        if primary_email:
            supabase.table("calendar_accounts").update({"account_email": primary_email}).eq("user_id", str(user.id)).eq("provider", "google").eq("external_account_id", external_account_id).execute()
        for cal in calendars:
            cal_id = sync_service.get_calendar_id(cal)
            sync_state = sync_service.sync_state(cal_id)
            if sync_state.get('backfill_before_ts'):
                return JSONResponse(status_code=status.HTTP_200_OK, content={"message": "Credentials saved successfully"})
        
        sync_service.backfill_calendar()
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"message": "Credentials saved successfully", "syncing": True}
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save credentials")

@router.get("/calendars")
async def get_calendars(user: User = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    calendars_result = supabase.table("connected_calendars").select("*").eq("user_id", str(user.id)).execute()
    accounts_result = (
        supabase.table("calendar_accounts")
        .select("external_account_id,account_email")
        .eq("user_id", str(user.id))
        .eq("provider", "google")
        .execute()
    )
    account_email_by_external = {
        row.get("external_account_id"): row.get("account_email")
        for row in (accounts_result.data or [])
        if row.get("external_account_id")
    }
    calendars = []
    for cal in calendars_result.data or []:
        ext = cal.get("external_account_id")
        color = cal.get("color") or cal.get("provider_color")
        calendars.append({
            "id": cal.get("id"),
            "provider_calendar_id": cal.get("provider_calendar_id"),
            "summary": cal.get("summary"),
            "backgroundColor": color,
            "accessRole": cal.get("access_role"),
            "selected": cal.get("selected", True),
            "external_account_id": cal.get("external_account_id"),
            "account_email": account_email_by_external.get(ext),
        })

    try:
        subs_result = (
            supabase.table("calendar_url_subscriptions")
            .select("id,url,name,color,enabled")
            .eq("user_id", str(user.id))
            .eq("enabled", True)
            .execute()
        )
        for sub in subs_result.data or []:
            sub_id = sub.get("id")
            if not sub_id:
                continue
            calendars.append({
                "id": f"ics:{sub_id}",
                "provider_calendar_id": f"ics:{sub_id}",
                "summary": sub.get("name") or sub.get("url"),
                "backgroundColor": sub.get("color") or "#3b82f6",
                "accessRole": "reader",
                "selected": True,
                "external_account_id": None,
                "account_email": None,
                "url": sub.get("url"),
                "source": "ics",
            })
    except Exception as e:
        pass
    return {"calendars": calendars}

@router.patch("/calendars/{calendar_id}")
async def update_calendar(
    calendar_id: str,
    calendar_update: CalendarUpdate,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    updates = calendar_update.model_dump(exclude_unset=True)
    if "color" in updates:
        updates["color"] = (updates["color"] or "").strip()
        if not updates["color"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid color")

    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No updates provided")

    if calendar_id.startswith("ics:"):
        subscription_id = calendar_id.split("ics:", 1)[1]
        if not subscription_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid calendar id")
        sub_updates = {}
        if "color" in updates:
            sub_updates["color"] = updates["color"]
        if "selected" in updates:
            sub_updates["enabled"] = updates["selected"]
        if not sub_updates:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No supported updates provided")

        result = (
            supabase.table("calendar_url_subscriptions")
            .update(sub_updates)
            .eq("user_id", str(user.id))
            .eq("id", subscription_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar not found")
        return {"calendar": {"id": calendar_id, **sub_updates}}

    result = (
        supabase.table("connected_calendars")
        .update(updates)
        .eq("user_id", str(user.id))
        .eq("id", calendar_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Calendar not found")
    return {"calendar": result.data[0]}

@router.get("/subscriptions")
async def list_calendar_subscriptions(
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    try:
        result = (
            supabase.table("calendar_url_subscriptions")
            .select("id,url,name,color,enabled")
            .eq("user_id", str(user.id))
            .eq("enabled", True)
            .execute()
        )
        return {"subscriptions": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to list subscriptions")


@router.post("/subscriptions")
async def create_calendar_subscription(
    request: Request,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    try:
        body = await request.json()
    except ClientDisconnect:
        raise HTTPException(status_code=400, detail="Client disconnected")

    url = _validate_subscription_url(body.get("url"))
    name = body.get("name")
    color = body.get("color")
    if isinstance(name, str):
        name = name.strip() or None
    else:
        name = None
    if isinstance(color, str):
        color = color.strip() or None
    else:
        color = None

    try:
        existing = (
            supabase.table("calendar_url_subscriptions")
            .select("id,url,name,color,enabled")
            .eq("user_id", str(user.id))
            .eq("url", url)
            .limit(1)
            .execute()
        )
        if existing.data:
            sub = existing.data[0]
            updates = {"enabled": True}
            if name is not None:
                updates["name"] = name
            if color is not None:
                updates["color"] = color
            if updates:
                updated = (
                    supabase.table("calendar_url_subscriptions")
                    .update(updates)
                    .eq("user_id", str(user.id))
                    .eq("id", sub["id"])
                    .execute()
                )
                sub = (updated.data or [sub])[0]
            return {"subscription": sub, "created": False}

        payload = {"user_id": str(user.id), "url": url, "enabled": True}
        if name is not None:
            payload["name"] = name
        if color is not None:
            payload["color"] = color

        inserted = supabase.table("calendar_url_subscriptions").insert(payload).execute()
        sub = (inserted.data or [payload])[0]
        return {"subscription": sub, "created": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to create subscription")


@router.delete("/subscriptions/{subscription_id}")
async def delete_calendar_subscription(
    subscription_id: str,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client),
):
    subscription_id = (subscription_id or "").strip()
    if not subscription_id:
        raise HTTPException(status_code=400, detail="subscription_id is required")

    try:
        updated = (
            supabase.table("calendar_url_subscriptions")
            .update({"enabled": False})
            .eq("user_id", str(user.id))
            .eq("id", subscription_id)
            .execute()
        )
        if not (updated.data or []):
            raise HTTPException(status_code=404, detail="Subscription not found")
        return {"deleted": True, "subscription_id": subscription_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete subscription")

@router.get("/events")
async def get_events(
    start: str = Query(..., description="Start date in ISO format"),
    end: str = Query(..., description="End date in ISO format"),
    calendar_ids: Optional[str] = Query(None, description="Comma-separated calendar IDs"),
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
    end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))
    max_span_days = 18 * 31
    if end_dt - start_dt > timedelta(days=max_span_days):
        end_dt = start_dt + timedelta(days=max_span_days)
    
    calendars_result = supabase.table("connected_calendars").select("*").eq("user_id", str(user.id)).eq("selected", True).execute()
    calendars = calendars_result.data or []

    subs = []
    try:
        subs_result = supabase.table("calendar_url_subscriptions").select("id,url,name,color,enabled").eq("user_id", str(user.id)).eq("enabled", True).execute()
        subs = subs_result.data or []
    except Exception as e:
        pass
    
    if not calendars and not subs:
        return {"events": [], "coverage": {"has_before": False, "has_after": False}, "calendars": [], "last_synced_at": {}}
    
    requested_ids = None
    if calendar_ids:
        requested_ids = set([c for c in calendar_ids.split(',') if c])
        calendars = [c for c in calendars if c['id'] in requested_ids]
        subs = [s for s in subs if f"ics:{s.get('id')}" in requested_ids]
    
    events = []
    coverage = {"has_before": False, "has_after": False}
    last_synced_at = {}
    
    cal_id_list = [c['id'] for c in calendars]
    calendar_map = {c['id']: c for c in calendars}
    
    sync_states = {}
    if cal_id_list:
        sync_states_result = supabase.table("event_sync_state").select("*").eq("user_id", str(user.id)).in_("calendar_id", cal_id_list).execute()
        sync_states = {s['calendar_id']: s for s in (sync_states_result.data or [])}
    
    for calendar_id, sync_state in sync_states.items():
        cal = calendar_map.get(calendar_id)
        if not cal:
            continue
        google_calendar_id = cal['provider_calendar_id']
        backfill_before = sync_state.get('backfill_before_ts')
        backfill_after = sync_state.get('backfill_after_ts')
        last_synced_at[google_calendar_id] = sync_state.get('last_delta_sync_at') or sync_state.get('last_full_sync_at')
        
        if backfill_before and start_dt < datetime.fromisoformat(backfill_before.replace('Z', '+00:00')):
            coverage["has_before"] = True
        if backfill_after and end_dt > datetime.fromisoformat(backfill_after.replace('Z', '+00:00')):
            coverage["has_after"] = True
    
    columns = [
        "id",
        "calendar_id",
        "external_id",
        "status",
        "summary",
        "description",
        "location",
        "conference_data",
        "hangout_link",
        "start_ts",
        "end_ts",
        "is_all_day",
        "transparency",
        "visibility",
        "recurrence_rule",
        "recurring_event_id",
        "organizer_email",
        "attendees",
        "extended_props",
        "last_modified_at",
    ]
    select_clause = ",".join(columns)
    all_events = []
    page_size = 500
    page_offset = 0
    max_pages = 20
    if cal_id_list:
        while True:
            page = (
                supabase.table("events")
                .select(select_clause)
                .eq("user_id", str(user.id))
                .in_("calendar_id", cal_id_list)
                .lte("start_ts", end_dt.isoformat())
                .gte("end_ts", start_dt.isoformat())
                .is_("deleted_at", None)
                .order("start_ts")
                .range(page_offset, page_offset + page_size - 1)
                .execute()
            )
            rows = page.data or []
            all_events.extend(rows)
            if len(rows) < page_size or max_pages <= 1:
                break
            max_pages -= 1
            page_offset += page_size
    
    for event in all_events:
        is_all_day = bool(event.get("is_all_day"))
        start_ts_str = event["start_ts"]
        end_ts_str = event["end_ts"]
        if is_all_day:
            start_dt_parsed = datetime.fromisoformat(start_ts_str.replace('Z', '+00:00'))
            end_dt_parsed = start_dt_parsed + timedelta(days=1)
            end_ts_str = end_dt_parsed.isoformat()
        events.append({
            "id": event["external_id"],
            "summary": event["summary"],
            "description": event["description"],
            "location": event["location"],
            "start": {"dateTime": start_ts_str if not is_all_day else None, "date": start_ts_str[:10] if is_all_day else None},
            "end": {"dateTime": end_ts_str if not is_all_day else None, "date": end_ts_str[:10] if is_all_day else None},
            "isAllDay": is_all_day,
            "conferenceData": event["conference_data"],
            "hangoutLink": event["hangout_link"],
            "recurrence": [event["recurrence_rule"]] if event.get("recurrence_rule") else None,
            "recurringEventId": event.get("recurring_event_id"),
            "status": event["status"],
            "organizer": {"email": event["organizer_email"]} if event["organizer_email"] else None,
            "attendees": event["attendees"],
            "extendedProperties": event["extended_props"],
            "updated": event["last_modified_at"],
            "calendar_id": event["calendar_id"]
        })

    for sub in subs or []:
        sub_id = sub.get("id")
        url = _normalize_subscription_url(sub.get("url"))
        if not sub_id or not url:
            continue
        ics_calendar_id = f"ics:{sub_id}"
        ics_events = await _fetch_ics_events(url, start_dt, end_dt, ics_calendar_id)
        events.extend(ics_events)
    
    return {"events": events, "coverage": coverage, "calendars": calendars, "last_synced_at": last_synced_at}

@router.post("/events")
async def create_event(
    request: Request,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    try:
        body = await request.json()
    except ClientDisconnect:
        raise HTTPException(status_code=400, detail="Client disconnected")
    google_calendar_id = body.get("calendar_id", "primary")
    account_email = body.get("account_email")
    event_data = body.get("event_data")
    send_notifications = body.get("send_notifications", False)
    
    if not event_data:
        raise HTTPException(status_code=400, detail="Missing event_data")
    
    calendar = None

    if isinstance(account_email, str) and account_email.strip():
        account_email = account_email.strip()
        account_email = account_email.lower()

    if google_calendar_id == "primary":
        calendar_query = supabase.table("connected_calendars").select("*").eq("user_id", str(user.id))
        if account_email:
            calendar_query = calendar_query.eq("provider_calendar_id", account_email)
        else:
            calendar_query = calendar_query.eq("provider_calendar_id", user.email)

        calendar_result = calendar_query.execute()
        if not calendar_result.data:
            calendar_result = supabase.table("connected_calendars").select("*").eq("user_id", str(user.id)).limit(1).execute()
        calendar = calendar_result.data[0] if calendar_result and calendar_result.data else None
        if calendar:
            google_calendar_id = calendar["provider_calendar_id"]
    else:
        calendar_result = supabase.table("connected_calendars").select("*").eq("user_id", str(user.id)).eq("provider_calendar_id", google_calendar_id).execute()
        if not calendar_result.data:
            calendar_result = supabase.table("connected_calendars").select("*").eq("user_id", str(user.id)).eq("id", google_calendar_id).execute()
        calendar = calendar_result.data[0] if calendar_result and calendar_result.data else None
        if calendar:
            google_calendar_id = calendar["provider_calendar_id"]
    
    if not calendar:
        raise HTTPException(status_code=404, detail=f"Calendar not found for: {google_calendar_id}")

    calendar_id = calendar["id"]
    
    service = GoogleCalendarService(str(user.id), supabase, calendar.get("external_account_id"))
    google_event = service.create_event(google_calendar_id, event_data, send_notifications)
    
    sync_service = CalendarSyncService(str(user.id), calendar.get("external_account_id") or user.email, supabase)
    sync_service.save_event(google_event, calendar["id"])
    
    recurrence = google_event.get("recurrence") or []
    if recurrence:
        def _parse_boundary(boundary):
            if not isinstance(boundary, dict):
                return None
            raw = boundary.get("dateTime") or boundary.get("date")
            if not raw:
                return None
            try:
                dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            except Exception:
                return None
            if boundary.get("date") and dt.tzinfo is None:
                dt = datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)

        start_dt = _parse_boundary(google_event.get("start")) or datetime.now(timezone.utc)
        end_dt = _parse_boundary(google_event.get("end")) or start_dt + timedelta(days=1)

        sync_start = start_dt - timedelta(days=7)
        sync_end = end_dt + timedelta(days=365)
        def _background_sync():
            try:
                sync_service.sync_date_range(calendar["id"], google_calendar_id, sync_start, sync_end)
            except Exception as e:
                pass
        threading.Thread(target=_background_sync, daemon=True).start()

    google_event["calendar_id"] = calendar_id
    return {"event": google_event}

@router.put("/events/{event_id}")
async def update_event(
    event_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    body = await request.json()
    calendar_id = body.get("calendar_id", "primary")
    event_data = body.get("event_data")
    event_data = _normalize_event_location(event_data)
    send_notifications = body.get("send_notifications", False)
    recurring_edit_scope = event_data.pop("recurringEditScope", None) if event_data else None
    
    if not event_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing event_data")
    
    target_calendar = None
    google_calendar_id = calendar_id
    effective_external_account_id = None

    event_organizer_email = None
    event_stored_calendar_id = None
    event_row = (
        supabase.table("events")
        .select("organizer_email,calendar_id")
        .eq("user_id", str(user.id))
        .eq("external_id", event_id)
        .limit(1)
        .execute()
    )
    if event_row and event_row.data:
        event_organizer_email = event_row.data[0].get("organizer_email")
        event_stored_calendar_id = event_row.data[0].get("calendar_id")

    if event_stored_calendar_id:
        cal_result = (
            supabase.table("connected_calendars")
            .select("id,external_account_id,provider_calendar_id")
            .eq("user_id", str(user.id))
            .eq("id", event_stored_calendar_id)
            .limit(1)
            .execute()
        )
        if cal_result.data:
            target_calendar = cal_result.data[0]
            effective_external_account_id = target_calendar.get("external_account_id")
            google_calendar_id = target_calendar.get("provider_calendar_id") or "primary"

    if not effective_external_account_id and event_organizer_email:
        cal_result = (
            supabase.table("connected_calendars")
            .select("id,external_account_id,provider_calendar_id")
            .eq("user_id", str(user.id))
            .eq("provider_calendar_id", event_organizer_email.lower())
            .limit(1)
            .execute()
        )
        if cal_result.data:
            target_calendar = cal_result.data[0]
            effective_external_account_id = target_calendar.get("external_account_id")
            google_calendar_id = target_calendar.get("provider_calendar_id") or "primary"

    if not effective_external_account_id:
        calendar_result = (
            supabase.table("connected_calendars")
            .select("*")
            .eq("user_id", str(user.id))
            .eq("id", calendar_id)
            .limit(1)
            .execute()
        )
        target_calendar = (calendar_result.data or [None])[0] if calendar_result and calendar_result.data else None
        effective_external_account_id = (target_calendar or {}).get("external_account_id")
        if target_calendar:
            google_calendar_id = target_calendar.get("provider_calendar_id") or google_calendar_id

    if not effective_external_account_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to resolve owning Google account for this event")

    service = GoogleCalendarService(str(user.id), supabase, effective_external_account_id)
    updated_event = service.update_event(event_id, google_calendar_id, event_data, send_notifications, recurring_edit_scope)

    if target_calendar:
        sync_service = CalendarSyncService(str(user.id), effective_external_account_id or user.email, supabase)
        try:
            sync_service.save_event(updated_event, target_calendar["id"])
        except Exception as e:
            pass
    
    return {"event": updated_event}

@router.patch("/events/{event_id}")
async def patch_event(
    event_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    body = await request.json()
    calendar_id = body.get("calendar_id", "primary")
    event_data = body.get("event_data")
    event_data = _normalize_event_location(event_data)

    if not event_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing event_data")

    target_calendar = None
    google_calendar_id = calendar_id
    effective_external_account_id = None

    event_organizer_email = None
    event_stored_calendar_id = None
    event_row = (
        supabase.table("events")
        .select("organizer_email,calendar_id")
        .eq("user_id", str(user.id))
        .eq("external_id", event_id)
        .limit(1)
        .execute()
    )
    if event_row and event_row.data:
        event_organizer_email = event_row.data[0].get("organizer_email")
        event_stored_calendar_id = event_row.data[0].get("calendar_id")

    if event_stored_calendar_id:
        cal_result = (
            supabase.table("connected_calendars")
            .select("id,external_account_id,provider_calendar_id")
            .eq("user_id", str(user.id))
            .eq("id", event_stored_calendar_id)
            .limit(1)
            .execute()
        )
        if cal_result.data:
            target_calendar = cal_result.data[0]
            effective_external_account_id = target_calendar.get("external_account_id")
            google_calendar_id = target_calendar.get("provider_calendar_id") or "primary"

    if not effective_external_account_id and event_organizer_email:
        cal_result = (
            supabase.table("connected_calendars")
            .select("id,external_account_id,provider_calendar_id")
            .eq("user_id", str(user.id))
            .eq("provider_calendar_id", event_organizer_email.lower())
            .limit(1)
            .execute()
        )
        if cal_result.data:
            target_calendar = cal_result.data[0]
            effective_external_account_id = target_calendar.get("external_account_id")
            google_calendar_id = target_calendar.get("provider_calendar_id") or "primary"

    if not effective_external_account_id:
        calendar_result = (
            supabase.table("connected_calendars")
            .select("*")
            .eq("user_id", str(user.id))
            .eq("id", calendar_id)
            .limit(1)
            .execute()
        )
        target_calendar = (calendar_result.data or [None])[0] if calendar_result and calendar_result.data else None
        effective_external_account_id = (target_calendar or {}).get("external_account_id")
        if target_calendar:
            google_calendar_id = target_calendar.get("provider_calendar_id") or google_calendar_id

    if not effective_external_account_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to resolve owning Google account for this event")

    service = GoogleCalendarService(str(user.id), supabase, effective_external_account_id)
    patched_event = service.patch_event(event_id, google_calendar_id, event_data)

    if target_calendar:
        sync_service = CalendarSyncService(str(user.id), target_calendar.get("external_account_id") or user.email, supabase)
        try:
            sync_service.save_event(patched_event, target_calendar["id"])
        except Exception as e:
            pass

    return {"event": patched_event}

@router.delete("/events/{event_id}")
async def delete_event(
    event_id: str,
    calendar_id: str = Query("primary"),
    account_email: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    event_result = supabase.table("events").select("id, calendar_id, organizer_email").eq("user_id", str(user.id)).eq("external_id", event_id).execute()
    internal_event_id = event_result.data[0]["id"] if event_result.data else None
    internal_calendar_id = event_result.data[0]["calendar_id"] if event_result.data else None
    event_organizer_email = event_result.data[0].get("organizer_email") if event_result.data else None

    google_calendar_id = calendar_id
    external_account_id = None

    if internal_calendar_id:
        cal_result = supabase.table("connected_calendars").select("provider_calendar_id, external_account_id").eq("id", internal_calendar_id).execute()
        if cal_result.data:
            google_calendar_id = cal_result.data[0].get("provider_calendar_id")
            external_account_id = cal_result.data[0].get("external_account_id")

    if not external_account_id and event_organizer_email:
        cal_result = (
            supabase.table("connected_calendars")
            .select("id,external_account_id,provider_calendar_id")
            .eq("user_id", str(user.id))
            .eq("provider_calendar_id", event_organizer_email.lower())
            .limit(1)
            .execute()
        )
        if cal_result.data:
            external_account_id = cal_result.data[0].get("external_account_id")
            google_calendar_id = cal_result.data[0].get("provider_calendar_id") or "primary"

    service = GoogleCalendarService(str(user.id), supabase, external_account_id)
    try:
        service.delete_event(event_id, google_calendar_id)
    except Exception as e:
        pass

    all_event_ids = []
    if internal_event_id:
        all_event_ids.append(internal_event_id)
    
    occurrence_rows = (
        supabase.table("events")
        .select("id")
        .eq("user_id", str(user.id))
        .eq("recurring_event_id", event_id)
        .execute()
    )
    for row in occurrence_rows.data or []:
        if row.get("id"):
            all_event_ids.append(row["id"])
    
    
    for eid in all_event_ids:
        supabase.table("event_instances").delete().eq("event_id", eid).execute()
    
    supabase.table("events").delete().eq("user_id", str(user.id)).eq("external_id", event_id).execute()
    supabase.table("events").delete().eq("user_id", str(user.id)).eq("recurring_event_id", event_id).execute()

    try:
        linked_todo_ids = set()
        if internal_event_id:
            link_rows = supabase.table("todo_event_links").select("todo_id").eq("user_id", str(user.id)).eq("event_id", str(internal_event_id)).execute()
            for row in link_rows.data or []:
                if row.get("todo_id"):
                    linked_todo_ids.add(str(row["todo_id"]))
        link_rows_google = supabase.table("todo_event_links").select("todo_id").eq("user_id", str(user.id)).eq("google_event_id", str(event_id)).execute()
        for row in link_rows_google.data or []:
            if row.get("todo_id"):
                linked_todo_ids.add(str(row["todo_id"]))
        if linked_todo_ids:
            todo_ids_list = list(linked_todo_ids)
            supabase.table("todo_event_links").delete().eq("user_id", str(user.id)).in_("todo_id", todo_ids_list).execute()
            supabase.table("todos").update({
                "scheduled_date": None,
                "scheduled_at": None,
                "scheduled_end": None,
                "scheduled_is_all_day": False,
                "google_event_id": None,
                "date": None
            }).eq("user_id", str(user.id)).in_("id", todo_ids_list).execute()
    except Exception as cleanup_error:
        pass
    
    return {"message": "Event deleted successfully"}

@router.post("/events/{event_id}/respond")
async def respond_to_event(
    event_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    body = await request.json()
    response_status = body.get("response_status")
    calendar_id = body.get("calendar_id", "primary")

    if not isinstance(response_status, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing response_status"
        )

    normalized = response_status.lower()
    if normalized not in {"accepted", "declined", "tentative"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid response_status"
        )

    target_calendar = None
    google_calendar_id = calendar_id
    if calendar_id == "primary":
        calendar_result = supabase.table("connected_calendars").select("*").eq("user_id", str(user.id)).eq("provider_calendar_id", user.email).execute()
        if not calendar_result.data:
            calendar_result = supabase.table("connected_calendars").select("*").eq("user_id", str(user.id)).limit(1).execute()
        target_calendar = calendar_result.data[0] if calendar_result and calendar_result.data else None
        if target_calendar:
            google_calendar_id = target_calendar.get("provider_calendar_id")
    else:
        calendar_result = supabase.table("connected_calendars").select("*").eq("user_id", str(user.id)).eq("id", calendar_id).execute()
        if not calendar_result.data:
            calendar_result = supabase.table("connected_calendars").select("*").eq("user_id", str(user.id)).eq("provider_calendar_id", calendar_id).execute()
        target_calendar = calendar_result.data[0] if calendar_result and calendar_result.data else None
        if target_calendar:
            google_calendar_id = target_calendar.get("provider_calendar_id")

    service = GoogleCalendarService(str(user.id), supabase, (target_calendar or {}).get("external_account_id"))
    updated_event = service.respond_to_event(event_id, google_calendar_id, normalized, user.email)

    return {"event": updated_event}

@router.post("/sync")
async def sync_calendar(
    request: Request,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    try:
        body = await request.json()
    except Exception:
        body = {}
    
    initial_backfill = body.get("initial_backfill", False)
    force_full = body.get("force_full", False)
    foreground = bool(body.get("foreground", False))
    
    def _run_sync():
        import time
        from db.supabase_client import get_supabase_client
        bg_supabase = get_supabase_client()

        accounts_result = (
            bg_supabase.table("calendar_accounts")
            .select("external_account_id")
            .eq("user_id", str(user.id))
            .eq("provider", "google")
            .execute()
        )
        accounts = accounts_result.data or []

        if not accounts:
            return

        for account in accounts:
            external_account_id = account.get("external_account_id")
            if not external_account_id:
                continue

            try:
                sync_service = CalendarSyncService(str(user.id), external_account_id, bg_supabase)
                calendars = sync_service.google_service.list_calendars()

                if not calendars:
                    continue

                for calendar in calendars:
                    google_calendar_id = calendar.get("id")

                    calendar_id = None
                    for attempt in range(3):
                        try:
                            calendar_id = sync_service.get_calendar_id(calendar)
                            break
                        except HttpError as e:
                            if attempt < 2 and "disconnected" in str(e).lower():
                                time.sleep(1)
                                continue
                            raise

                    if not calendar_id:
                        continue

                    if initial_backfill or force_full:
                        try:
                            sync_service.backfill_calendar()
                        except Exception as e:
                            pass
                        continue

                    try:
                        result = sync_service.delta_sync(calendar_id, google_calendar_id)
                    except Exception as e:
                        pass
            except Exception as e:
                pass
    
    if foreground:
        _run_sync()
        return {"status": "completed", "message": "Sync completed"}

    threading.Thread(target=_run_sync, daemon=True).start()
    return {"status": "started", "message": "Sync started in background"}

@router.post("/add-account")
async def add_account(
    request: Request,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    body = await request.json()
    access_token = body.get("access_token")
    refresh_token = body.get("refresh_token")
    expires_at = body.get("expires_at")
    scopes = body.get("scopes")
    external_account_id = body.get("external_account_id")
    account_email = body.get("account_email")
    
    if not all([access_token, refresh_token, expires_at, external_account_id]):
        raise HTTPException(status_code=400, detail="Missing required fields")
    
    if scopes:
        if isinstance(scopes, str):
            scopes = [s.strip() for s in scopes.split(',') if s.strip()]
        elif not isinstance(scopes, list):
            scopes = [str(scopes)]
    
    payload = {
        "user_id": str(user.id),
        "provider": "google",
        "external_account_id": external_account_id,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": expires_at,
        "scopes": scopes
    }
    if isinstance(account_email, str) and account_email.strip():
        payload["account_email"] = account_email.strip()

    supabase.table("calendar_accounts").upsert(payload, on_conflict="user_id,provider,external_account_id").execute()

    if not payload.get("account_email"):
        try:
            svc = GoogleCalendarService(str(user.id), supabase, external_account_id)
            calendars = svc.list_calendars()
            primary_email = None
            for cal in calendars or []:
                if cal.get("primary") is True and isinstance(cal.get("id"), str) and "@" in cal.get("id"):
                    primary_email = cal.get("id")
                    break
            if primary_email:
                supabase.table("calendar_accounts").update({"account_email": primary_email}).eq("user_id", str(user.id)).eq("provider", "google").eq("external_account_id", external_account_id).execute()
        except Exception as e:
            pass
    
    try:
        svc = GoogleCalendarService(str(user.id), supabase, external_account_id)
        calendars = svc.list_calendars()
        sync_service = CalendarSyncService(str(user.id), external_account_id, supabase)
        for cal in calendars or []:
            try:
                sync_service.get_calendar_id(cal)
            except Exception as e:
                pass
    except Exception as e:
        pass

    def _background_backfill():
        from db.supabase_client import get_supabase_client
        bg_supabase = get_supabase_client()
        try:
            sync_service = CalendarSyncService(str(user.id), external_account_id, bg_supabase)
            try:
                states = (
                    bg_supabase.table("event_sync_state")
                    .select("backfill_before_ts,backfill_after_ts")
                    .eq("user_id", str(user.id))
                    .execute()
                )
                before_list = [s.get("backfill_before_ts") for s in (states.data or []) if s.get("backfill_before_ts")]
                after_list = [s.get("backfill_after_ts") for s in (states.data or []) if s.get("backfill_after_ts")]
                before_ts = min(before_list) if before_list else None
                after_ts = max(after_list) if after_list else None
            except Exception as e:
                before_ts = None
                after_ts = None

            sync_service.backfill_calendar(before_ts, after_ts)
        except Exception as e:
            raise HTTPException(status_code=500, detail="Initial backfill failed")
    
    threading.Thread(target=_background_backfill, daemon=True).start()
    
    return JSONResponse(
        status_code=200,
        content={"message": "Account added successfully", "syncing": True, "external_account_id": external_account_id}
    )

@router.get("/sync-status")
async def get_sync_status(
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    sync_states_result = supabase.table("event_sync_state").select("*").eq("user_id", str(user.id)).execute()
    sync_states = sync_states_result.data or []
    
    status_list = []
    combined_state = {}
    
    for sync_state in sync_states:
        calendar_result = supabase.table("connected_calendars").select("*").eq("id", sync_state["calendar_id"]).maybe_single().execute()
        calendar = calendar_result.data if calendar_result else None
        
        if calendar:
            status_list.append({
                "calendar_id": calendar["provider_calendar_id"],
                "calendar_name": calendar["summary"],
                "last_full_sync_at": sync_state.get("last_full_sync_at"),
                "last_delta_sync_at": sync_state.get("last_delta_sync_at"),
                "backfill_before_ts": sync_state.get("backfill_before_ts"),
                "backfill_after_ts": sync_state.get("backfill_after_ts"),
                "is_syncing": sync_state.get("is_syncing", False),
                "sync_error": sync_state.get("sync_error")
            })
            
            if sync_state.get("backfill_before_ts"):
                if not combined_state.get("backfill_before_ts") or sync_state["backfill_before_ts"] < combined_state["backfill_before_ts"]:
                    combined_state["backfill_before_ts"] = sync_state["backfill_before_ts"]
            if sync_state.get("backfill_after_ts"):
                if not combined_state.get("backfill_after_ts") or sync_state["backfill_after_ts"] > combined_state["backfill_after_ts"]:
                    combined_state["backfill_after_ts"] = sync_state["backfill_after_ts"]
    
    return {
        "sync_status": status_list,
        "sync_state": combined_state
    }

@router.get("/event-user-state")
async def get_event_user_state(
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    states_result = supabase.table("event_user_state").select("*").eq("user_id", str(user.id)).execute()
    states = states_result.data or []
    if not states:
        return {"states": []}
    
    event_ids = [s["event_id"] for s in states if s.get("event_id")]
    external_map = {}
    if event_ids:
        events_result = (
            supabase.table("events")
            .select("id, external_id")
            .in_("id", event_ids)
            .execute()
        )
        for row in events_result.data or []:
            external_map[row["id"]] = row.get("external_id")
    
    normalized = []
    for state in states:
        ext_id = external_map.get(state["event_id"])
        if not ext_id:
            continue
        normalized.append({
            "event_id": ext_id,
            "is_checked_off": state.get("is_checked_off", False),
            "time_overrides": state.get("time_overrides")
        })
    return {"states": normalized}

@router.post("/event-user-state")
async def update_event_user_state(
    request: Request,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    try:
        body = await request.json()
    except ClientDisconnect:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Client disconnected")
    event_id = body.get("event_id")
    is_checked_off = body.get("is_checked_off", False)
    time_overrides = body.get("time_overrides")
    
    if not event_id:
        raise HTTPException(status_code=400, detail="event_id required")


    event_lookup = (
        supabase.table("events")
        .select("id")
        .eq("user_id", str(user.id))
        .eq("external_id", event_id)
        .limit(1)
        .execute()
    )
    target_event_id = event_lookup.data[0]["id"] if event_lookup.data else None
    
    if not target_event_id:
        raise HTTPException(status_code=404, detail="Event not found for user")
    
    payload = {
        "user_id": str(user.id),
        "event_id": target_event_id,
        "is_checked_off": is_checked_off
    }
    if time_overrides is not None:
        payload["time_overrides"] = time_overrides
    
    try:
        supabase.table("event_user_state").upsert(payload, on_conflict="user_id,event_id").execute()
    except APIError as e:
        if getattr(e, "code", "") != "204":
            raise
    state_res = supabase.table("event_user_state").select("*").eq("user_id", str(user.id)).eq("event_id", target_event_id).execute()
    state_row = state_res.data[0] if state_res and getattr(state_res, "data", None) else None
    return {"state": state_row or payload}

@router.post("/event-user-state/batch")
async def batch_update_event_user_state(
    request: Request,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    try:
        body = await request.json()
    except ClientDisconnect:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Client disconnected")
    
    updates = body.get("updates", [])
    if not updates:
        return {"updated": 0}
    
    event_ids = [u.get("event_id") for u in updates if u.get("event_id")]
    if not event_ids:
        return {"updated": 0}
    
    event_lookup = (
        supabase.table("events")
        .select("id, external_id")
        .eq("user_id", str(user.id))
        .in_("external_id", event_ids)
        .execute()
    )
    external_to_internal = {e["external_id"]: e["id"] for e in (event_lookup.data or [])}
    
    payloads = []
    for update in updates:
        external_id = update.get("event_id")
        internal_id = external_to_internal.get(external_id)
        if not internal_id:
            continue
        
        payload = {
            "user_id": str(user.id),
            "event_id": internal_id,
            "is_checked_off": update.get("is_checked_off", False)
        }
        time_overrides = update.get("time_overrides")
        if time_overrides is not None:
            payload["time_overrides"] = time_overrides
        payloads.append(payload)
    
    if not payloads:
        return {"updated": 0}
    
    try:
        supabase.table("event_user_state").upsert(payloads, on_conflict="user_id,event_id").execute()
    except APIError as e:
        if getattr(e, "code", "") != "204":
            raise
    
    return {"updated": len(payloads)}

@router.get("/todo-event-links")
async def get_todo_event_links(
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    result = supabase.table("todo_event_links").select("*").eq("user_id", str(user.id)).execute()
    return {"links": result.data or []}

@router.post("/todo-event-links")
async def update_todo_event_link(
    request: Request,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    try:
        body = await request.json()
    except ClientDisconnect:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Client disconnected during request")
    todo_id = body.get("todo_id")
    event_id = body.get("event_id")
    google_event_id = body.get("google_event_id")
    
    if not todo_id:
        raise HTTPException(status_code=400, detail="todo_id required")
    
    payload = {
        "user_id": str(user.id),
        "todo_id": str(todo_id) 
    }
    if event_id and _is_uuid(event_id):
        payload["event_id"] = str(event_id)
    if google_event_id:
        payload["google_event_id"] = str(google_event_id or event_id)
    elif event_id and not _is_uuid(event_id):
        payload["google_event_id"] = str(event_id)
    
    try:
        result = supabase.table("todo_event_links").upsert(payload, on_conflict="user_id,todo_id").execute()
        return {"link": result.data[0] if result.data else None}
    except Exception as e:
        error_msg = str(e)
        if "invalid input syntax for type uuid" in error_msg and not _is_uuid(todo_id):
            return {"link": None, "skipped": True, "reason": "non-uuid todo_id"}
        raise

@router.delete("/todo-event-links/{todo_id}")
async def delete_todo_event_link(
    todo_id: str,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    if not _is_uuid(todo_id):
        return {"message": "Link deleted successfully", "skipped": True, "reason": "non-uuid todo_id"}

    try:
        supabase.table("todo_event_links").delete().eq("user_id", str(user.id)).eq("todo_id", todo_id).execute()
    except Exception as e:
        error_msg = str(e)
        if "invalid input syntax for type uuid" in error_msg:
            return {"message": "Link deleted successfully", "skipped": True, "reason": "invalid-uuid todo_id"}
        raise
    return {"message": "Link deleted successfully"}
