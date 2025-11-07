from fastapi import APIRouter, HTTPException, Request, Depends, status, Query
from db.supabase_client import get_supabase_client
from db.auth_dependency import get_current_user
from db.google_credentials import GoogleCalendarService
from supabase import Client
from models.user import User
from typing import Optional
import logging
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/calendar", tags=["Calendar"])

@router.post("/credentials")
async def save_credentials(request: Request, user: User = Depends(get_current_user), supabase: Client = Depends(get_supabase_client)):
    try:
        body = await request.json()
        access_token = body.get("access_token")
        refresh_token = body.get("refresh_token")
        expires_at = body.get("expires_at")
        
        if not access_token or not refresh_token or not expires_at:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing tokens")
        
        supabase.table("google_credentials").upsert({
            "user_id": str(user.id),
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": expires_at
        }).execute()
        
        return JSONResponse(status_code=status.HTTP_200_OK, content={"message": "Credentials saved successfully"})
    except Exception as e:
        logger.error(f"Error saving credentials: {str(e)}")
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
    service = GoogleCalendarService(str(user.id), supabase)
    
    cal_ids = calendar_ids.split(',') if calendar_ids else None
    
    events = service.fetch_events(start, end, cal_ids)
    return {"events": events}

@router.post("/events")
async def create_event(
    request: Request,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    body = await request.json()
    calendar_id = body.get("calendar_id", "primary")
    event_data = body.get("event_data")
    send_notifications = body.get("send_notifications", False)
    
    if not event_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing event_data")
    
    service = GoogleCalendarService(str(user.id), supabase)
    created_event = service.create_event(calendar_id, event_data, send_notifications)
    
    return {"event": created_event}

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
    send_notifications = body.get("send_notifications", False)
    
    if not event_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing event_data")
    
    service = GoogleCalendarService(str(user.id), supabase)
    updated_event = service.update_event(event_id, calendar_id, event_data, send_notifications)
    
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

    if not event_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing event_data")

    service = GoogleCalendarService(str(user.id), supabase)
    patched_event = service.patch_event(event_id, calendar_id, event_data)

    return {"event": patched_event}

@router.delete("/events/{event_id}")
async def delete_event(
    event_id: str,
    calendar_id: str = Query("primary"),
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    service = GoogleCalendarService(str(user.id), supabase)
    service.delete_event(event_id, calendar_id)
    
    return {"message": "Event deleted successfully"}
        
