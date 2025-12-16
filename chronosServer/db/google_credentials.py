import logging
import socket
from datetime import datetime, timedelta, timezone
from typing import Optional
from supabase import Client
from fastapi import HTTPException, status
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.auth.transport.requests import Request as GoogleRequest
from config import settings

socket.setdefaulttimeout(30)

logger = logging.getLogger(__name__)
SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.events.readonly",
    "https://www.googleapis.com/auth/calendar.readonly",
]


def _parse_iso_datetime(value: str):
    if not value:
        return None
    try:
        normalized = value.replace('Z', '+00:00')
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        else:
            parsed = parsed.astimezone(timezone.utc)
        return parsed
    except ValueError:
        return None


def _as_naive_utc(value: datetime | None):
    if not value:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _isoformat_utc(value: datetime | None):
    if not value:
        return None
    aware = value
    if aware.tzinfo is None:
        aware = aware.replace(tzinfo=timezone.utc)
    else:
        aware = aware.astimezone(timezone.utc)
    output = aware.isoformat()
    return output.replace('+00:00', 'Z')


def _resolve_event_meeting_location(event: dict, fallback: str = '') -> str:
    if not event:
        return fallback or ''
    
    conference = event.get('conferenceData') or {}
    conference_hangout = conference.get('hangoutLink')
    if conference_hangout:
        return conference_hangout.strip()
    
    direct_hangout = event.get('hangoutLink')
    if direct_hangout:
        return direct_hangout.strip()
    
    entry_points = conference.get('entryPoints') or []
    for entry in entry_points:
        if entry.get('entryPointType') == 'video' and entry.get('uri'):
            return entry['uri'].strip()
    
    location = (event.get('location') or '').strip()
    return location or fallback or ''


class GoogleCalendarService:
    def __init__(self, user_id: str, supabase: Client, external_account_id: Optional[str] = None):
        self.user_id = user_id
        self.supabase = supabase
        self.external_account_id = external_account_id
        self.credentials = None
        self.service = None
        self._resolved_account_id = None
    
    def _append_conference_data_version(self, request):
        if not request:
            return request
        uri = getattr(request, "uri", "")
        if not uri or "conferenceDataVersion=" in uri:
            return request
        separator = "&" if "?" in uri else "?"
        try:
            request.uri = f"{uri}{separator}conferenceDataVersion=1"
        except Exception as exc:
            logger.debug("Unable to append conferenceDataVersion: %s", exc)
        return request
    
    def _execute_with_retry(self, action, description: str, retries: int = 3):
        last_error = None
        for attempt in range(1, retries + 1):
            try:
                service = self.get_service()
                return action(service)
            except HttpError:
                raise
            except (socket.timeout, TimeoutError, OSError) as exc:
                last_error = exc
                logger.warning("Timeout during %s (attempt %s/%s): %s", description, attempt, retries, exc)
                self.service = None
                if attempt < retries:
                    import time
                    time.sleep(1)
            except Exception as exc:
                last_error = exc
                logger.warning("Transient error during %s (attempt %s/%s): %s", description, attempt, retries, exc)
                self.service = None
        logger.error("Failed %s after %s attempts: %s", description, retries, last_error)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Google Calendar temporarily unavailable. Please try again.")
    
    def get_credentials(self) -> Credentials:
        if self.credentials is None:
            try:
                query = (
                    self.supabase.table("calendar_accounts")
                    .select("*")
                    .eq("user_id", self.user_id)
                    .eq("provider", "google")
                )
                
                if self.external_account_id:
                    query = query.eq("external_account_id", self.external_account_id)
                
                result = query.execute()
            except Exception as e:
                error_msg = str(e)
                if "JWT expired" in error_msg or "PGRST303" in error_msg:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Session expired. Please refresh.",
                        headers={"X-Token-Expired": "true"}
                    )
                raise
            
            if not result.data:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Google credentials not found"
                )
            
            record = result.data[0]
            self._resolved_account_id = record.get("external_account_id")
            expiry_value = record.get("expires_at")
            parsed_expiry = _parse_iso_datetime(expiry_value)

            scopes = record.get("scopes", [])
            if isinstance(scopes, str):
                scopes = [scope.strip() for scope in scopes.split(',') if scope.strip()]
            if not scopes:
                scopes = SCOPES

            self.credentials = Credentials(
                token=record["access_token"],
                refresh_token=record["refresh_token"],
                token_uri="https://oauth2.googleapis.com/token",
                client_id=settings.GOOGLE_CLIENT_ID,
                client_secret=settings.GOOGLE_CLIENT_SECRET,
                scopes=scopes
            )
            if parsed_expiry:
                self.credentials.expiry = _as_naive_utc(parsed_expiry)
            else:
                self.credentials.expiry = _as_naive_utc(self.credentials.expiry)
        return self.credentials
    
    def refresh_token_if_needed(self) -> None:
        creds = self.get_credentials()

        now = datetime.utcnow()
        creds.expiry = _as_naive_utc(creds.expiry)
        needs_refresh = creds.expired
        expiry_value = creds.expiry
        if expiry_value:
            needs_refresh = needs_refresh or (expiry_value <= (now + timedelta(minutes=5)))
        elif not creds.valid:
            needs_refresh = True

        if needs_refresh:
            try:
                creds.refresh(GoogleRequest())
            except Exception as error:
                logger.error("Failed to refresh Google token: %s", error)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Google session expired. Please reconnect."
                )
            creds.expiry = _as_naive_utc(creds.expiry)
            
            update_query = (
                self.supabase.table("calendar_accounts")
                .update({
                    "access_token": creds.token,
                    "expires_at": _isoformat_utc(creds.expiry)
                })
                .eq("user_id", self.user_id)
                .eq("provider", "google")
            )
            
            account_id = self.external_account_id or self._resolved_account_id
            if account_id:
                update_query = update_query.eq("external_account_id", account_id)
            
            update_query.execute()
    
    def get_service(self):
        self.refresh_token_if_needed()
        if not self.service:
            self.service = build('calendar', 'v3', credentials=self.credentials)
        return self.service
    
    def list_calendars(self):
        try:
            service = self.get_service()
            calendar_list_response = service.calendarList().list().execute()
            return calendar_list_response.get('items', [])
        except HttpError as error:
            logger.error(f"Error listing calendars: {error}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to fetch calendars"
            )
    
    def fetch_events(self, time_min: str, time_max: str, calendar_ids: list = None):
        try:
            if not calendar_ids:
                calendar_ids = ['primary']

            all_events = []
            for calendar_id in calendar_ids:
                events_result = self._execute_with_retry(
                    lambda svc: self._append_conference_data_version(
                        svc.events().list(
                            calendarId=calendar_id,
                            timeMin=time_min,
                            timeMax=time_max,
                            singleEvents=True,
                            orderBy='startTime'
                        )
                    ).execute(),
                    f"fetch events for calendar {calendar_id}"
                )
                events = events_result.get('items', [])
                logger.debug(
                    "Fetched %s events from calendar %s (range %s - %s)",
                    len(events),
                    calendar_id,
                    time_min,
                    time_max
                )
                master_cache = {}
                to_fetch_master_ids = set()
                for event in events:
                    recurring_id = event.get('recurringEventId')
                    has_rule = bool(event.get('recurrence'))
                    private_props = event.get('extendedProperties', {}).get('private', {})
                    if recurring_id and not has_rule and not private_props.get('recurrenceRule'):
                        to_fetch_master_ids.add(recurring_id)

                for recurring_id in to_fetch_master_ids:
                    try:
                        master = self._execute_with_retry(
                            lambda svc, rid=recurring_id: self._append_conference_data_version(
                                svc.events().get(
                                    calendarId=calendar_id,
                                    eventId=rid
                                )
                            ).execute(),
                            f"fetch master event {recurring_id}",
                            retries=2
                        )
                        master_cache[recurring_id] = master
                    except HttpError as error:
                        if error.resp.status == 404:
                            logger.info(
                                "Master event %s not found (calendar %s), skipping enrichment",
                                recurring_id,
                                calendar_id
                            )
                            master_cache[recurring_id] = None
                            continue
                        logger.error(
                            "Failed to fetch master event %s from calendar %s: %s",
                            recurring_id,
                            calendar_id,
                            error
                        )
                        raise
                    except HTTPException:
                        master_cache[recurring_id] = None

                processed_events = []
                for event in events:
                    status_value = (event.get('status') or '').lower()
                    if status_value == 'cancelled':
                        logger.debug(
                            "Skipping cancelled event %s from calendar %s",
                            event.get('id'),
                            calendar_id
                        )
                        continue
                    event['calendar_id'] = calendar_id
                    recurring_id = event.get('recurringEventId')
                    master = master_cache.get(recurring_id)
                    if master:
                        if master.get('recurrence') and not event.get('recurrence'):
                            event['recurrence'] = master['recurrence']
                        master_private = master.get('extendedProperties', {}).get('private', {})
                        if master_private:
                            event.setdefault('extendedProperties', {}).setdefault('private', {}).update({
                                k: master_private[k]
                                for k in ['recurrenceRule', 'recurrenceSummary', 'recurrenceMeta']
                                if k in master_private
                            })
                    resolved_location = _resolve_event_meeting_location(event)
                    if resolved_location:
                        event['location'] = resolved_location

                    processed_events.append(event)

                all_events.extend(processed_events)

            return all_events
        except HttpError as error:
            logger.error(f"Error fetching events: {error}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to fetch events"
            )
        except HTTPException:
            raise
        except Exception as exc:
            logger.error(f"Unexpected error fetching events: {exc}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to fetch events"
            )
    
    def create_event(self, calendar_id: str, event_data: dict, send_notifications: bool = False):
        try:
            service = self.get_service()

            params = {
                "calendarId": calendar_id,
                "body": event_data,
                "sendUpdates": 'all' if send_notifications else 'none'
            }
            if event_data.get("conferenceData"):
                params["conferenceDataVersion"] = 1
            created_event = service.events().insert(**params).execute()
            return created_event
        except HttpError as error:
            error_details = error.error_details if hasattr(error, 'error_details') else str(error)
            logger.error(f"Error creating event: {error}, Details: {error_details}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create event: {error_details}"
            )
    
    def update_event(self, event_id: str, calendar_id: str, event_data: dict, send_notifications: bool = False, recurring_edit_scope: str = None):
        try:
            service = self.get_service()

            existing_event = None
            try:
                existing_event = service.events().get(calendarId=calendar_id, eventId=event_id).execute()
            except HttpError:
                existing_event = None

            organizer = (existing_event or {}).get('organizer')
            organizer_email = organizer.get('email') if isinstance(organizer, dict) else None
            organizer_email = organizer_email.lower() if organizer_email else None

            attendees = event_data.get('attendees')
            if organizer_email and isinstance(attendees, list):
                filtered = [
                    a for a in attendees
                    if isinstance(a, dict) and (a.get('email') or '').lower() != organizer_email
                ]
                event_data['attendees'] = filtered
            
            if recurring_edit_scope:
                original_event = existing_event or service.events().get(calendarId=calendar_id, eventId=event_id).execute()
                
                if recurring_edit_scope == 'single':
                    event_data.pop('recurrence', None)
                    event_data.pop('recurrenceRule', None)
                    event_data.pop('recurrenceMeta', None)
                    event_data.pop('recurrenceSummary', None)
                    priv = event_data.get('extendedProperties', {}).get('private', {})
                    if isinstance(priv, dict):
                        priv.pop('recurrenceRule', None)
                        priv.pop('recurrenceMeta', None)
                        priv.pop('recurrenceSummary', None)
                    
                elif recurring_edit_scope == 'future':
                    base_id = original_event.get('recurringEventId')
                    if base_id:
                        event_id = base_id
                        event_data.pop('start', None)
                        event_data.pop('end', None)
                    
                elif recurring_edit_scope == 'all':
                    if original_event.get('recurringEventId'):
                        event_id = original_event['recurringEventId']
            
            params = {
                "calendarId": calendar_id,
                "eventId": event_id,
                "body": event_data,
                "sendUpdates": 'all' if send_notifications else 'none'
            }
            if event_data.get("conferenceData"):
                params["conferenceDataVersion"] = 1
            updated_event = service.events().update(**params).execute()
            return updated_event
        except HttpError as error:
            logger.error(f"Error updating event: {error}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update event"
            )
    
    def respond_to_event(self, event_id: str, calendar_id: str, response_status: str, attendee_email: str):
        try:
            service = self.get_service()
            body = {
                "attendees": [
                    {
                        "email": attendee_email,
                        "responseStatus": response_status
                    }
                ]
            }
            patched_event = service.events().patch(
                calendarId=calendar_id,
                eventId=event_id,
                body=body,
                sendUpdates='all'
            ).execute()
            return patched_event
        except HttpError as error:
            logger.error(f"Error responding to event invite: {error}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update event response"
            )
    
    def delete_event(self, event_id: str, calendar_id: str):
        try:
            service = self.get_service()
            service.events().delete(
                calendarId=calendar_id,
                eventId=event_id
            ).execute()
        except HttpError as error:
            status_code = getattr(getattr(error, "resp", None), "status", None)
            try:
                status_code = int(status_code)
            except (TypeError, ValueError):
                status_code = None
            if status_code in (404, 410):
                logger.info("Event %s already removed from calendar %s", event_id, calendar_id)
                return
            logger.error(f"Error deleting event: {error}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete event"
            )
