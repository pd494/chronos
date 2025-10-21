import logging
from datetime import datetime, timedelta
from supabase import Client
from fastapi import HTTPException, status
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.auth.transport.requests import Request as GoogleRequest
from config import settings

logger = logging.getLogger(__name__)
SCOPES = ["https://www.googleapis.com/auth/calendar"]


class GoogleCalendarService:
    def __init__(self, user_id: str, supabase: Client):
        self.user_id = user_id
        self.supabase = supabase
        self.credentials = None
        self.service = None
    
    def get_credentials(self) -> Credentials:
        if self.credentials is None:
            try:
                result = (
                    self.supabase.table("google_credentials")
                    .select("*")
                    .eq("user_id", self.user_id)
                    .execute()
                )
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
            self.credentials = Credentials(
                token=record["access_token"],
                refresh_token=record["refresh_token"],
                token_uri="https://oauth2.googleapis.com/token",
                client_id=settings.GOOGLE_CLIENT_ID,
                client_secret=settings.GOOGLE_CLIENT_SECRET,
                scopes=SCOPES
            )
        return self.credentials
    
    def refresh_token_if_needed(self) -> None:
        creds = self.get_credentials()
        
        if creds.expired or (creds.expiry and creds.expiry <= datetime.utcnow() + timedelta(minutes=5)):
            creds.refresh(GoogleRequest())
            self.supabase.table("google_credentials").update({
                "access_token": creds.token,
                "expires_at": creds.expiry.isoformat() if creds.expiry else None
            }).eq("user_id", self.user_id).execute()
    
    def get_service(self):
        self.refresh_token_if_needed()
        if not self.service:
            self.service = build('calendar', 'v3', credentials=self.credentials)
        return self.service
    
    def list_calendars(self):
        try:
            service = self.get_service()
            calendar_list = service.calendarList().list().execute()
            return calendar_list.get('items', [])
        except HttpError as error:
            logger.error(f"Error listing calendars: {error}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to fetch calendars"
            )
    
    def fetch_events(self, time_min: str, time_max: str, calendar_ids: list = None):
        try:
            service = self.get_service()
            
            if not calendar_ids:
                calendar_ids = ['primary']
            
            all_events = []
            for calendar_id in calendar_ids:
                events_result = service.events().list(
                    calendarId=calendar_id,
                    timeMin=time_min,
                    timeMax=time_max,
                    singleEvents=True,
                    orderBy='startTime'
                ).execute()
                events = events_result.get('items', [])
                
                for event in events:
                    event['calendar_id'] = calendar_id
                
                all_events.extend(events)
            
            return all_events
        except HttpError as error:
            logger.error(f"Error fetching events: {error}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to fetch events"
            )
    
    def create_event(self, calendar_id: str, event_data: dict):
        try:
            service = self.get_service()
            created_event = service.events().insert(
                calendarId=calendar_id,
                body=event_data
            ).execute()
            return created_event
        except HttpError as error:
            logger.error(f"Error creating event: {error}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create event"
            )
    
    def update_event(self, event_id: str, calendar_id: str, event_data: dict):
        try:
            service = self.get_service()
            updated_event = service.events().update(
                calendarId=calendar_id,
                eventId=event_id,
                body=event_data
            ).execute()
            return updated_event
        except HttpError as error:
            logger.error(f"Error updating event: {error}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update event"
            )
    
    def delete_event(self, event_id: str, calendar_id: str):
        try:
            service = self.get_service()
            service.events().delete(
                calendarId=calendar_id,
                eventId=event_id
            ).execute()
        except HttpError as error:
            logger.error(f"Error deleting event: {error}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete event"
            )

