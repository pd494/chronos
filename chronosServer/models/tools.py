from pydantic import BaseModel, Field
from typing import Optional, List, Literal


class CreateEventTool(BaseModel):
    title: str = Field(..., description="The title of the event")
    start: str = Field(..., description="ISO 8601 start time (e.g. '2024-03-20T15:00:00Z' or '2024-03-20' for all-day)")
    end: str = Field(..., description="ISO 8601 end time (e.g. '2024-03-20T16:00:00Z' or '2024-03-21' for all-day)")
    
    is_all_day: Optional[bool] = Field(False, description="Set to true for all-day events (start/end should be date-only format)")
    
    description: Optional[str] = Field(None, description="The description of the event")
    location: Optional[str] = Field(None, description="The location of the event")
    participants: Optional[List[str]] = Field(None, description="The attendees of the event")
    calendar_id: Optional[str] = Field("primary", description="The calendar id of the event (defaults to 'primary')")
    reminders: Optional[str] = Field(None, description="Reminder settings (as JSON string, e.g. '{\"useDefault\": false, \"overrides\": [{\"method\": \"popup\", \"minutes\": 15}]}')")
    
    transparency: Optional[Literal["opaque", "transparent"]] = Field("opaque", description="'opaque' (busy) or 'transparent' (free) for availability")
    
    visibility: Optional[Literal["default", "public", "private"]] = Field("public", description="Event visibility: 'default', 'public', or 'private'")
    
    recurrence_rule: Optional[str] = Field(None, description="RRULE string for recurring events (e.g. 'RRULE:FREQ=DAILY;COUNT=5' or 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR')")
    timezone: Optional[str] = Field(None, description="IANA timezone (e.g. 'America/New_York'). If not provided, uses user's default timezone")

class UpdateEventTool(BaseModel):
    event_id: str = Field(..., description="The unique ID of the event to update")
    title: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    is_all_day: Optional[bool] = None
    description: Optional[str] = None
    location: Optional[str] = None
    participants: Optional[List[str]] = None
    reminders: Optional[str] = None
    transparency: Optional[Literal["opaque", "transparent"]] = None
    visibility: Optional[Literal["default", "public", "private"]] = None
    recurrence_rule: Optional[str] = None
    timezone: Optional[str] = None
    
    recurring_edit_scope: Optional[Literal["single", "future", "all"]] = Field(
        None, 
        description="For recurring events: 'single' (this instance only), 'future' (this and future), or 'all' (entire series)"
    )

class DeleteEventTool(BaseModel):
    event_id: str = Field(..., description="The unique ID of the event to delete")
    calendar_id: Optional[str] = Field("primary", description="The calendar ID containing the event (defaults to 'primary')")
    
class ListEventTool(BaseModel):
    start_date: str = Field(..., description="ISO 8601 start time for the start of the search range")
    end_date: str = Field(..., description="ISO 8601 end time for the end of the search range")
    calendar_ids: Optional[List[str]] = Field(None, description="Optional list of specific calendar IDs to search (if not provided, searches all calendars)")
    conditions: Optional[str] = Field(None, description="Optional conditions to filter events by title, description, location, participants, etc.")