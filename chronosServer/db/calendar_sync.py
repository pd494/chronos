# chronosServer/db/calendar_sync.py

import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Optional, Dict, Any
from uuid import UUID
from supabase import Client
from fastapi import HTTPException, status
from dateutil.rrule import rrulestr
from db.google_credentials import GoogleCalendarService

logger = logging.getLogger(__name__)

class CalendarSyncService:
    def __init__(self, user_id: str, provider_account_id: str, supabase: Client):
        self.user_id = user_id
        self.provider_account_id = provider_account_id
        self.supabase = supabase
        self.google_service = GoogleCalendarService(user_id, supabase, provider_account_id)
    
    def get_calendar_id(self, google_calendar: Dict[str, Any]) -> UUID:
        google_calendar_id = google_calendar.get("id")
        result = (
            self.supabase.table("calendar_list")
            .select("id")
            .eq("user_id", self.user_id)
            .eq("provider_calendar_id", google_calendar_id)
            .execute()
        )
        
        if result.data:
            calendar_id = UUID(result.data[0]["id"])
            update_data = {
                "summary": google_calendar.get("summary"),
                "color": google_calendar.get("backgroundColor", "#4285f4"),
                "access_role": google_calendar.get("accessRole"),
                "etag": google_calendar.get("etag"),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            self.supabase.table("calendar_list").update(update_data).eq("id", str(calendar_id)).execute()
            return calendar_id
        
        new_calendar = {
            "user_id": self.user_id,
            "provider_calendar_id": google_calendar_id,
            "summary": google_calendar.get("summary", ""),
            "color": google_calendar.get("backgroundColor", "#4285f4"),
            "access_role": google_calendar.get("accessRole", "reader"),
            "selected": True,
            "etag": google_calendar.get("etag")
        }
        result = (
            self.supabase.table("calendar_list")
            .insert(new_calendar)
            .execute()
        )
        return UUID(result.data[0]["id"])
    
    def _parse_event_boundaries(self, google_event: Dict[str, Any]) -> Dict[str, Any]:
        start_data = google_event.get("start", {}) or {}
        end_data = google_event.get("end", {}) or {}
        is_all_day = "date" in start_data

        def _parse_dt(value: Optional[str], tz: Optional[str]) -> Optional[datetime]:
            if not value or not isinstance(value, str):
                return None
            normalized = value.replace("Z", "+00:00")
            try:
                dt = datetime.fromisoformat(normalized)
            except ValueError:
                return None
            # Apply explicit time zone if provided and dt is naive
            if tz:
                try:
                    dt = dt.replace(tzinfo=ZoneInfo(tz))
                except Exception:
                    pass
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)

        if is_all_day:
            raw_start = start_data.get("date")
            start_ts = _parse_dt(raw_start, None)
            if not start_ts:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid all-day start date")
            raw_end = end_data.get("date")
            end_ts = _parse_dt(raw_end, None) if raw_end else None
            end_ts = end_ts or (start_ts + timedelta(days=1))
        else:
            tzid = start_data.get("timeZone") or end_data.get("timeZone")
            start_ts = _parse_dt(start_data.get("dateTime"), tzid)
            end_ts = _parse_dt(end_data.get("dateTime"), tzid)
            if not start_ts or not end_ts:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid event start/end time")

        return {"start_ts": start_ts, "end_ts": end_ts, "is_all_day": is_all_day}

    def normalize_event(self, google_event: Dict[str, Any], calendar_id: UUID) -> Dict[str, Any]:
        conference_data = google_event.get("conferenceData")
        hangout_link = None
        if conference_data:
            hangout_link = conference_data.get("hangoutLink")
            if not hangout_link:
                entry_points = conference_data.get("entryPoints", [])
                for entry in entry_points:
                    if entry.get("entryPointType") == "video" and entry.get("uri"):
                        hangout_link = entry["uri"]
                        break
        
        boundaries = self._parse_event_boundaries(google_event)
        
        recurrence = google_event.get("recurrence", [])
        recurrence_rule = recurrence[0] if recurrence else None
        organizer = google_event.get("organizer", {})
        organizer_email = organizer.get("email") if isinstance(organizer, dict) else None
        recurring_event_id = google_event.get("recurringEventId")
        
        return {
            "user_id": self.user_id,
            "calendar_id": str(calendar_id),
            "external_id": google_event.get("id"),
            "etag": google_event.get("etag"),
            "status": google_event.get("status", "confirmed"),
            "summary": google_event.get("summary"),
            "description": google_event.get("description"),
            "location": google_event.get("location"),
            "conference_data": conference_data,
            "hangout_link": hangout_link,
            "start_ts": boundaries["start_ts"].isoformat(),
            "end_ts": boundaries["end_ts"].isoformat(),
            "is_all_day": boundaries["is_all_day"],
            "transparency": google_event.get("transparency", "opaque"),
            "visibility": google_event.get("visibility", "default"),
            "recurrence_rule": recurrence_rule,
            "recurring_event_id": recurring_event_id,
            "organizer_email": organizer_email,
            "attendees": google_event.get("attendees", []),
            "extended_props": google_event.get("extendedProperties", {}),
            "source": "google",
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
            "last_modified_at": google_event.get("updated", datetime.now(timezone.utc).isoformat())
        }
    
    def save_event(self, google_event: Dict[str, Any], calendar_id: UUID):
        if google_event.get("status", "").lower() == "cancelled":
            return None
        db_event = self.normalize_event(google_event, calendar_id)
        result = (
            self.supabase.table("events")
            .upsert(db_event, on_conflict="user_id,calendar_id,external_id")
            .execute()
        )
        saved_event = result.data[0] if result.data else None
        
        if saved_event and db_event.get('recurrence_rule'):
            self._expand_recurring_event(saved_event, calendar_id)
        
        return saved_event
    
    def _expand_recurring_event(self, event: Dict[str, Any], calendar_id: UUID):
        recurrence_rule = event.get('recurrence_rule')
        if not recurrence_rule:
            return
        
        try:
            rule = rrulestr(recurrence_rule, dtstart=datetime.fromisoformat(event['start_ts'].replace('Z', '+00:00')))
            
            now = datetime.now(timezone.utc)
            # Expand recurring instances across a wide window so
            # long-running series are visible far in the past/future.
            expansion_start = now - timedelta(days=20 * 365)
            expansion_end = now + timedelta(days=20 * 365)
            
            instances = []
            for instance_start in rule.between(expansion_start, expansion_end):
                original_start = datetime.fromisoformat(event['start_ts'].replace('Z', '+00:00'))
                original_end = datetime.fromisoformat(event['end_ts'].replace('Z', '+00:00'))
                duration = original_end - original_start
                instance_end = instance_start + duration
                
                instances.append({
                    "event_id": str(event['id']),
                    "instance_start_ts": instance_start.isoformat(),
                    "instance_end_ts": instance_end.isoformat(),
                    "original_start_ts": instance_start.isoformat(),
                    "status": event.get('status', 'confirmed'),
                    "is_exception": False
                })
            
            if len(instances) > 200:
                instances = instances[:200]
                logger.warning(f"Limited recurring event {event['id']} to 200 instances")
            
            self.supabase.table("event_instances").delete().eq("event_id", str(event['id'])).execute()
            
            if instances:
                batch_size = 50
                for i in range(0, len(instances), batch_size):
                    batch = instances[i:i + batch_size]
                    self.supabase.table("event_instances").insert(batch).execute()
                    
        except Exception as e:
            logger.error(f"Failed to expand recurring event {event['id']}: {e}")
    
    def sync_state(self, calendar_id: UUID, **updates) -> Dict[str, Any]:
        defaults = {
            "user_id": self.user_id,
            "calendar_id": str(calendar_id),
            "is_syncing": False,
        }
        
        if not updates:
            res = (
                self.supabase.table("event_sync_state")
            .select("*")
            .eq("user_id", self.user_id)
            .eq("calendar_id", str(calendar_id))
            .maybe_single()
            .execute())
            return res.data or defaults
        
        payload = {**defaults, **updates}
        self.supabase.table("event_sync_state").upsert(
            payload,
            on_conflict="user_id,calendar_id"
        ).execute()
        
        res = (
            self.supabase.table("event_sync_state")
            .select("*")
            .eq("user_id", self.user_id)
            .eq("calendar_id", str(calendar_id))
            .maybe_single()
            .execute()
        )
        return res.data or payload
    
    def sync_date_range(self, calendar_id: UUID, google_calendar_id: str, start_date: datetime, end_date: datetime) -> Optional[str]:
        """
        Sync events for a specific date range (month-by-month).
        Returns the syncToken from the last request.
        """
        current = start_date
        next_sync_token = None
        
        while current < end_date:
            if current.month == 12:
                month_end = datetime(current.year + 1, 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
            else:
                month_end = datetime(current.year, current.month + 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
            month_end = min(month_end, end_date)
            
            try:
                events_result = self.google_service._execute_with_retry(
                    lambda svc: self.google_service._append_conference_data_version(
                        svc.events().list(
                            calendarId=google_calendar_id,
                            timeMin=current.isoformat(),
                            timeMax=month_end.isoformat(),
                            singleEvents=True,
                            orderBy='startTime'
                        )
                    ).execute(),
                    f"fetch events for calendar {google_calendar_id} month {current.strftime('%Y-%m')}"
                )
                
                events = events_result.get('items', [])
                next_page_token = events_result.get('nextPageToken')
                next_sync_token = events_result.get('nextSyncToken')
                
                while next_page_token:
                    page_result = self.google_service._execute_with_retry(
                        lambda svc: self.google_service._append_conference_data_version(
                            svc.events().list(
                                calendarId=google_calendar_id,
                                timeMin=current.isoformat(),
                                timeMax=month_end.isoformat(),
                                singleEvents=True,
                                orderBy='startTime',
                                pageToken=next_page_token
                            )
                        ).execute(),
                        f"fetch events page for calendar {google_calendar_id}"
                    )
                    events.extend(page_result.get('items', []))
                    next_page_token = page_result.get('nextPageToken')
                    if not next_page_token:
                        next_sync_token = page_result.get('nextSyncToken')
                
                for event in events:
                    self.save_event(event, calendar_id)
                    
            except Exception as e:
                logger.warning(f"Error syncing month {current.strftime('%Y-%m')} for calendar {google_calendar_id}: {e}")
                # Continue with next month even if this one fails
            
            if current.month == 12:
                current = datetime(current.year + 1, 1, 1, tzinfo=timezone.utc)
            else:
                current = datetime(current.year, current.month + 1, 1, tzinfo=timezone.utc)
        
        return next_sync_token
    
    def delta_sync(self, calendar_id: UUID, google_calendar_id: str) -> Dict[str, Any]:
        """
        Perform incremental sync using updatedMin parameter.
        Fetches events modified since last sync.
        Returns dict with sync results.
        """
        sync_state = self.sync_state(calendar_id)
        last_sync = sync_state.get('last_delta_sync_at') or sync_state.get('last_full_sync_at')
        
        # Default to last 5 minutes if no last sync time
        if last_sync:
            try:
                updated_min = datetime.fromisoformat(last_sync.replace('Z', '+00:00'))
            except:
                updated_min = datetime.now(timezone.utc) - timedelta(minutes=5)
        else:
            updated_min = datetime.now(timezone.utc) - timedelta(minutes=5)
        
        try:
            logger.info(f"Delta sync for {google_calendar_id} - fetching events updated since {updated_min.isoformat()}")
            
            events_result = self.google_service._execute_with_retry(
                lambda svc: svc.events().list(
                    calendarId=google_calendar_id,
                    updatedMin=updated_min.isoformat(),
                    maxResults=500,
                    singleEvents=True,  # expand instances so cancelled occurrences are returned
                    showDeleted=True
                ).execute(),
                f"delta sync for {google_calendar_id}"
            )
            
            events = events_result.get('items', [])
            next_page_token = events_result.get('nextPageToken')
            
            # Handle pagination (unlikely for delta sync but just in case)
            while next_page_token:
                page_result = self.google_service._execute_with_retry(
                    lambda svc: svc.events().list(
                        calendarId=google_calendar_id,
                        updatedMin=updated_min.isoformat(),
                        pageToken=next_page_token,
                        maxResults=500,
                        singleEvents=True,
                        showDeleted=True
                    ).execute(),
                    f"delta sync page for {google_calendar_id}"
                )
                events.extend(page_result.get('items', []))
                next_page_token = page_result.get('nextPageToken')
            
            logger.info(f"Delta sync got {len(events)} updated events")
            
            for event in events:
                if event.get('status') == 'cancelled':
                    # Soft delete cancelled events and prune instances, including series occurrences
                    external_id = event.get('id')
                    self.supabase.table("events").update({
                        "deleted_at": datetime.now(timezone.utc).isoformat(),
                        "status": "cancelled"
                    }).eq("user_id", self.user_id).eq("external_id", external_id).execute()
                    self.supabase.table("events").update({
                        "deleted_at": datetime.now(timezone.utc).isoformat(),
                        "status": "cancelled"
                    }).eq("user_id", self.user_id).eq("recurring_event_id", external_id).execute()
                    try:
                        # prune instances for master and any occurrences tied to the master
                        internal_ids = []
                        internal_master = (
                            self.supabase.table("events")
                            .select("id")
                            .eq("user_id", self.user_id)
                            .eq("external_id", external_id)
                            .maybe_single()
                            .execute()
                        )
                        if internal_master and internal_master.data:
                            internal_ids.append(internal_master.data.get("id"))
                        linked_rows = (
                            self.supabase.table("events")
                            .select("id")
                            .eq("user_id", self.user_id)
                            .eq("recurring_event_id", external_id)
                            .execute()
                        )
                        for row in linked_rows.data or []:
                            if row.get("id"):
                                internal_ids.append(row["id"])
                        for iid in internal_ids:
                            self.supabase.table("event_instances").delete().eq("event_id", iid).execute()
                    except Exception as e:
                        logger.warning(f"Failed pruning instances for cancelled event {external_id}: {e}")
                else:
                    self.save_event(event, calendar_id)
            
            # Update last delta sync time
            self.sync_state(
                calendar_id,
                last_delta_sync_at=datetime.now(timezone.utc).isoformat()
            )
            
            return {"status": "completed", "events_synced": len(events)}
            
        except Exception as e:
            logger.error(f"Delta sync failed for {google_calendar_id}: {e}")
            return {"status": "error", "events_synced": 0, "error": str(e)}
    
    def backfill_calendar(self):
        calendars = self.google_service.list_calendars()
        
        if not calendars:
            raise HTTPException(status_code=404, detail="No calendars found")
        
        for calendar in calendars:
            google_calendar_id = calendar.get("id")
            calendar_id = self.get_calendar_id(calendar)
            
            now = datetime.now(timezone.utc)
            # Backfill a generous window so holiday calendars and
            # recurring events are available far from “today”.
            backfill_start = now - timedelta(days=20 * 365)
            backfill_end = now + timedelta(days=20 * 365)
            
            next_sync_token = self.sync_date_range(calendar_id, google_calendar_id, backfill_start, backfill_end)
            
            self.sync_state(
                calendar_id,
                next_sync_token=next_sync_token,
                backfill_before_ts=backfill_start.isoformat(),
                backfill_after_ts=backfill_end.isoformat(),
                last_full_sync_at=datetime.now(timezone.utc).isoformat()
            )
        
