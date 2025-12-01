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
import time
from postgrest.exceptions import APIError
from fastapi.responses import JSONResponse
from datetime import datetime, timezone, timedelta
from uuid import UUID
from starlette.requests import ClientDisconnect

logger = logging.getLogger(__name__)

def _retry_supabase(fn, retries=3, delay=0.5):
    """Retry a supabase operation on transient connection errors."""
    last_error = None
    for attempt in range(retries):
        try:
            return fn()
        except Exception as e:
            last_error = e
            error_str = str(e).lower()
            if "disconnected" in error_str or "connection" in error_str:
                if attempt < retries - 1:
                    logger.warning(f"Supabase retry {attempt + 1}/{retries}: {e}")
                    time.sleep(delay)
                    continue
            raise
    raise last_error

router = APIRouter(prefix="/calendar", tags=["Calendar"])


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
        
        # Ensure scopes is an array
        if scopes:
            if isinstance(scopes, str):
                scopes = [s.strip() for s in scopes.split(',') if s.strip()]
            elif not isinstance(scopes, list):
                scopes = [str(scopes)]
        
            
        provider_account_id = user.email
        
        payload = {
            "user_id": str(user.id),
            "provider": "google",
            "provider_account_id": provider_account_id,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": expires_at,
            "scopes": scopes
        }
        
        
        result = supabase.table("calendar_accounts").upsert(payload, on_conflict="user_id,provider,provider_account_id").execute()
        
        sync_service = CalendarSyncService(str(user.id), provider_account_id, supabase)
        calendars = sync_service.google_service.list_calendars()
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
        error_dict = e.__dict__ if hasattr(e, '__dict__') else {}
        logger.error(f"Error saving credentials: {error_dict}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.get("/calendars")
async def get_calendars(user: User = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    service = GoogleCalendarService(str(user.id), supabase)
    calendars = service.list_calendars()
    return {"calendars": calendars}

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
    
    calendars_result = _retry_supabase(
        lambda: supabase.table("calendar_list").select("*").eq("user_id", str(user.id)).eq("selected", True).execute()
    )
    calendars = calendars_result.data or []
    
    if not calendars:
        return {"events": [], "coverage": {"has_before": False, "has_after": False}, "calendars": [], "last_synced_at": {}}
    
    if calendar_ids:
        cal_ids = calendar_ids.split(',')
        calendars = [c for c in calendars if c['id'] in cal_ids]
    
    events = []
    coverage = {"has_before": False, "has_after": False}
    last_synced_at = {}
    
    cal_id_list = [c['id'] for c in calendars]
    calendar_map = {c['id']: c for c in calendars}
    
    sync_states_result = _retry_supabase(
        lambda: supabase.table("event_sync_state").select("*").eq("user_id", str(user.id)).in_("calendar_id", cal_id_list).execute()
    )
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
    
    # Paginate to avoid huge payloads and limit columns to essentials
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
    while True:
        current_offset = page_offset  # capture for lambda
        page = _retry_supabase(
            lambda: supabase.table("events")
            .select(select_clause)
            .eq("user_id", str(user.id))
            .in_("calendar_id", cal_id_list)
            .gte("start_ts", start_dt.isoformat())
            .lte("start_ts", end_dt.isoformat())
            .is_("deleted_at", None)
            .order("start_ts")
            .range(current_offset, current_offset + page_size - 1)
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
            try:
                start_dt_parsed = datetime.fromisoformat(start_ts_str.replace('Z', '+00:00'))
                end_dt_parsed = start_dt_parsed + timedelta(days=1)
                end_ts_str = end_dt_parsed.isoformat()
            except Exception:
                pass
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
    event_data = body.get("event_data")
    send_notifications = body.get("send_notifications", False)
    
    if not event_data:
        raise HTTPException(status_code=400, detail="Missing event_data")
    
    calendar = None
    if google_calendar_id == "primary":
        calendar_result = supabase.table("calendar_list").select("*").eq("user_id", str(user.id)).eq("provider_calendar_id", user.email).execute()
        if not calendar_result.data:
            calendar_result = supabase.table("calendar_list").select("*").eq("user_id", str(user.id)).limit(1).execute()
        calendar = calendar_result.data[0] if calendar_result and calendar_result.data else None
        if calendar:
            google_calendar_id = calendar["provider_calendar_id"]
    else:
        calendar_result = supabase.table("calendar_list").select("*").eq("user_id", str(user.id)).eq("provider_calendar_id", google_calendar_id).execute()
        if not calendar_result.data:
            calendar_result = supabase.table("calendar_list").select("*").eq("user_id", str(user.id)).eq("id", google_calendar_id).execute()
        calendar = calendar_result.data[0] if calendar_result and calendar_result.data else None
        if calendar:
            google_calendar_id = calendar["provider_calendar_id"]
    
    if not calendar:
        raise HTTPException(status_code=404, detail=f"Calendar not found for: {google_calendar_id}")
    
    calendar_id = calendar["id"]
    
    # Create event in Google first to get the external ID
    service = GoogleCalendarService(str(user.id), supabase)
    google_event = service.create_event(google_calendar_id, event_data, send_notifications)
    
    # Now save to our database
    sync_service = CalendarSyncService(str(user.id), user.email, supabase)
    db_event = sync_service.save_event(google_event, calendar["id"])
    
    # For recurring events, sync a 1-year window in the background so instances appear without blocking creation
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

        # Sync a generous future window so the UI immediately sees the whole series
        sync_start = start_dt - timedelta(days=7)
        sync_end = end_dt + timedelta(days=365)
        def _background_sync():
            try:
                sync_service.sync_date_range(calendar["id"], google_calendar_id, sync_start, sync_end)
            except Exception as e:
                logger.warning(f"Recurring event sync refresh failed for {google_calendar_id}: {e}")
        threading.Thread(target=_background_sync, daemon=True).start()
    
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
    
    # Resolve calendar record so we can persist the update locally
    target_calendar = None
    google_calendar_id = calendar_id
    if calendar_id == "primary":
        calendar_result = supabase.table("calendar_list").select("*").eq("user_id", str(user.id)).eq("provider_calendar_id", user.email).execute()
        if not calendar_result.data:
            calendar_result = supabase.table("calendar_list").select("*").eq("user_id", str(user.id)).limit(1).execute()
        target_calendar = calendar_result.data[0] if calendar_result and calendar_result.data else None
        if target_calendar:
            google_calendar_id = target_calendar["provider_calendar_id"]
    else:
        calendar_result = supabase.table("calendar_list").select("*").eq("user_id", str(user.id)).eq("provider_calendar_id", calendar_id).execute()
        if not calendar_result.data:
            calendar_result = supabase.table("calendar_list").select("*").eq("user_id", str(user.id)).eq("id", calendar_id).execute()
        target_calendar = calendar_result.data[0] if calendar_result and calendar_result.data else None
        if target_calendar:
            google_calendar_id = target_calendar["provider_calendar_id"]

    service = GoogleCalendarService(str(user.id), supabase)
    updated_event = service.update_event(event_id, google_calendar_id, event_data, send_notifications, recurring_edit_scope)

    # Persist the updated event to Supabase immediately
    if target_calendar:
        sync_service = CalendarSyncService(str(user.id), user.email, supabase)
        try:
            sync_service.save_event(updated_event, target_calendar["id"])
        except Exception as e:
            logger.warning(f"Failed to persist updated event {event_id}: {e}")
    
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

    # Resolve calendar for persistence
    target_calendar = None
    google_calendar_id = calendar_id
    if calendar_id == "primary":
        calendar_result = supabase.table("calendar_list").select("*").eq("user_id", str(user.id)).eq("provider_calendar_id", user.email).execute()
        if not calendar_result.data:
            calendar_result = supabase.table("calendar_list").select("*").eq("user_id", str(user.id)).limit(1).execute()
        target_calendar = calendar_result.data[0] if calendar_result and calendar_result.data else None
        if target_calendar:
            google_calendar_id = target_calendar["provider_calendar_id"]
    else:
        calendar_result = supabase.table("calendar_list").select("*").eq("user_id", str(user.id)).eq("provider_calendar_id", calendar_id).execute()
        if not calendar_result.data:
            calendar_result = supabase.table("calendar_list").select("*").eq("user_id", str(user.id)).eq("id", calendar_id).execute()
        target_calendar = calendar_result.data[0] if calendar_result and calendar_result.data else None
        if target_calendar:
            google_calendar_id = target_calendar["provider_calendar_id"]

    service = GoogleCalendarService(str(user.id), supabase)
    patched_event = service.patch_event(event_id, google_calendar_id, event_data)

    if target_calendar:
        sync_service = CalendarSyncService(str(user.id), user.email, supabase)
        try:
            sync_service.save_event(patched_event, target_calendar["id"])
        except Exception as e:
            logger.warning(f"Failed to persist patched event {event_id}: {e}")

    return {"event": patched_event}

@router.delete("/events/{event_id}")
async def delete_event(
    event_id: str,
    calendar_id: str = Query("primary"),
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    logger.info(f"Deleting event {event_id} for user {user.id}")
    event_result = supabase.table("events").select("id, calendar_id").eq("user_id", str(user.id)).eq("external_id", event_id).execute()
    internal_event_id = event_result.data[0]["id"] if event_result.data else None
    internal_calendar_id = event_result.data[0]["calendar_id"] if event_result.data else None
    logger.info(f"Found internal event: {internal_event_id}, calendar: {internal_calendar_id}")
    
    google_calendar_id = calendar_id
    if internal_calendar_id:
        cal_result = supabase.table("calendar_list").select("provider_calendar_id").eq("id", internal_calendar_id).execute()
        if cal_result.data:
            google_calendar_id = cal_result.data[0]["provider_calendar_id"]
    
    service = GoogleCalendarService(str(user.id), supabase)
    try:
        service.delete_event(event_id, google_calendar_id)
    except Exception as e:
        logger.warning(f"Google delete failed for {event_id}: {e}")
    
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
    
    logger.info(f"Found {len(all_event_ids)} events to delete instances for: {all_event_ids}")
    
    for eid in all_event_ids:
        try:
            supabase.table("event_instances").delete().eq("event_id", eid).execute()
        except Exception:
            pass
    
    supabase.table("events").delete().eq("user_id", str(user.id)).eq("external_id", event_id).execute()
    supabase.table("events").delete().eq("user_id", str(user.id)).eq("recurring_event_id", event_id).execute()

    # Clear any todo links and scheduled metadata tied to this event
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
            # Clear all scheduling metadata, including legacy date, so deleted events never reappear as grey chips
            supabase.table("todos").update({
                "scheduled_date": None,
                "scheduled_at": None,
                "scheduled_end": None,
                "scheduled_is_all_day": False,
                "google_event_id": None,
                "date": None
            }).eq("user_id", str(user.id)).in_("id", todo_ids_list).execute()
    except Exception as cleanup_error:
        logger.warning(f"Failed to clean todo links for event {event_id}: {cleanup_error}")
    
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

    service = GoogleCalendarService(str(user.id), supabase)
    updated_event = service.respond_to_event(event_id, calendar_id, normalized, user.email)

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
    
    provider_account_id = body.get("provider_account_id", user.email)
    initial_backfill = body.get("initial_backfill", False)
    force_full = body.get("force_full", False)
    
    # Run sync in background to avoid blocking the request
    def _background_sync():
        import time
        # Create fresh supabase client for background task to avoid connection issues
        from db.supabase_client import get_supabase_client
        bg_supabase = get_supabase_client()
        
        try:
            sync_service = CalendarSyncService(str(user.id), provider_account_id, bg_supabase)
            calendars = sync_service.google_service.list_calendars()
            
            if not calendars:
                logger.warning(f"No calendars found for user {user.id}")
                return
            
            for calendar in calendars:
                google_calendar_id = calendar.get("id")
                
                # Skip holiday/readonly calendars that often cause issues
                access_role = calendar.get("accessRole", "")
                if access_role == "reader" or "#holiday@" in google_calendar_id:
                    logger.debug(f"Skipping read-only calendar: {google_calendar_id}")
                    continue
                
                # Retry logic for transient connection errors
                for attempt in range(3):
                    try:
                        calendar_id = sync_service.get_calendar_id(calendar)
                        break
                    except Exception as e:
                        if attempt < 2 and "disconnected" in str(e).lower():
                            logger.warning(f"Retry {attempt + 1} for get_calendar_id {google_calendar_id}")
                            time.sleep(1)
                            continue
                        logger.error(f"Failed to get calendar_id for {google_calendar_id}: {e}")
                        calendar_id = None
                        break
                
                if not calendar_id:
                    continue

                if initial_backfill or force_full:
                    try:
                        sync_service.backfill_calendar()
                        logger.info(f"Full backfill completed for {google_calendar_id}")
                    except Exception as e:
                        logger.error(f"Full backfill failed for {google_calendar_id}: {e}")
                    continue

                try:
                    result = sync_service.delta_sync(calendar_id, google_calendar_id)
                    logger.info(f"Delta sync completed for {google_calendar_id}: {result.get('events_synced', 0)} events")
                except Exception as e:
                    logger.error(f"Delta sync failed for {google_calendar_id}: {e}")
        except Exception as e:
            logger.error(f"Background sync failed for user {user.id}: {e}")
    
    # Use daemon thread so it won't block server reload/shutdown
    threading.Thread(target=_background_sync, daemon=True).start()
    
    # Return immediately - sync runs in background
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
    provider_account_id = body.get("provider_account_id")
    
    if not all([access_token, refresh_token, expires_at, provider_account_id]):
        raise HTTPException(status_code=400, detail="Missing required fields")
    
    if scopes:
        if isinstance(scopes, str):
            scopes = [s.strip() for s in scopes.split(',') if s.strip()]
        elif not isinstance(scopes, list):
            scopes = [str(scopes)]
    
    payload = {
        "user_id": str(user.id),
        "provider": "google",
        "provider_account_id": provider_account_id,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": expires_at,
        "scopes": scopes
    }
    
    
    result = supabase.table("calendar_accounts").upsert(payload, on_conflict="user_id,provider,provider_account_id").execute()
    
    sync_service = CalendarSyncService(str(user.id), provider_account_id, supabase)
    
    return JSONResponse(
        status_code=200,
        content={"message": "Account added successfully", "syncing": True}
    )

@router.get("/sync-status")
async def get_sync_status(
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    # Get all sync states for user
    sync_states_result = supabase.table("event_sync_state").select("*").eq("user_id", str(user.id)).execute()
    sync_states = sync_states_result.data or []
    
    # Get calendar info for each sync state
    status_list = []
    combined_state = {}
    
    for sync_state in sync_states:
        calendar_result = supabase.table("calendar_list").select("*").eq("id", sync_state["calendar_id"]).maybe_single().execute()
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
            
            # Build combined state from all calendars
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
    event_id = body.get("event_id")  # may be external_id from client
    is_checked_off = body.get("is_checked_off", False)
    time_overrides = body.get("time_overrides")
    
    if not event_id:
        raise HTTPException(status_code=400, detail="event_id required")


    try:
        event_lookup = (
            supabase.table("events")
            .select("id")
            .eq("user_id", str(user.id))
            .eq("external_id", event_id)
            .limit(1)
            .execute()
        )
        target_event_id = event_lookup.data[0]["id"] if event_lookup.data else None
    except Exception:
        target_event_id = None
    
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
    """Batch update multiple event user states in a single request."""
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
    
    try:
        event_lookup = (
            supabase.table("events")
            .select("id, external_id")
            .eq("user_id", str(user.id))
            .in_("external_id", event_ids)
            .execute()
        )
        external_to_internal = {e["external_id"]: e["id"] for e in (event_lookup.data or [])}
    except Exception:
        external_to_internal = {}
    
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
        # Client bailed mid-request; surface clean 400 instead of bubbling an error
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Client disconnected during request")
    todo_id = body.get("todo_id")
    event_id = body.get("event_id")
    google_event_id = body.get("google_event_id")
    
    if not todo_id:
        raise HTTPException(status_code=400, detail="todo_id required")

    def _is_uuid(value: str) -> bool:
        try:
            from uuid import UUID
            UUID(str(value))
            return True
        except Exception:
            return False
    
    payload = {
        "user_id": str(user.id),
        "todo_id": str(todo_id)  # Ensure string type
    }
    # Only persist event_id if it's a UUID (internal events table); otherwise use google_event_id
    if event_id and _is_uuid(event_id):
        payload["event_id"] = str(event_id)
    if google_event_id:
        payload["google_event_id"] = str(google_event_id or event_id)
    elif event_id and not _is_uuid(event_id):
        # Treat non-UUID event ids as Google ids to avoid DB UUID cast errors
        payload["google_event_id"] = str(event_id)
    
    try:
        result = _retry_supabase(
            lambda: supabase.table("todo_event_links").upsert(payload, on_conflict="user_id,todo_id").execute()
        )
        return {"link": result.data[0] if result.data else None}
    except Exception as e:
        error_msg = str(e)
        if "invalid input syntax for type uuid" in error_msg:
            # Silently skip linking for non-UUID todo IDs (legacy data)
            logger.warning(f"Skipping todo-event link for non-UUID todo_id: {todo_id}")
            return {"link": None, "skipped": True, "reason": "non-uuid todo_id"}
        raise

@router.delete("/todo-event-links/{todo_id}")
async def delete_todo_event_link(
    todo_id: str,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    # Ignore non-UUID todo IDs (e.g. optimistic temp- ids) to avoid DB cast errors
    def _is_uuid(value: str) -> bool:
        try:
            UUID(str(value))
            return True
        except Exception:
            return False

    if not _is_uuid(todo_id):
        logger.warning(f"Skipping delete todo-event link for non-UUID todo_id: {todo_id}")
        return {"message": "Link deleted successfully", "skipped": True, "reason": "non-uuid todo_id"}

    try:
        supabase.table("todo_event_links").delete().eq("user_id", str(user.id)).eq("todo_id", todo_id).execute()
    except Exception as e:
        error_msg = str(e)
        if "invalid input syntax for type uuid" in error_msg:
            logger.warning(f"Failed to delete todo-event link for non-UUID todo_id {todo_id}: {e}")
            return {"message": "Link deleted successfully", "skipped": True, "reason": "invalid-uuid todo_id"}
        raise
    return {"message": "Link deleted successfully"}
        
