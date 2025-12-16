from fastapi import APIRouter, HTTPException, Request, Depends, status
from db.supabase_client import get_supabase_client
from db.auth_dependency import get_current_user
from models.user import User
from models.settings import UserSettings, UserSettingsUpdate
from supabase import Client
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["Settings"])

DEFAULT_SETTINGS = {
    "timezone": None,
    "use_device_timezone": False,
    "week_start_day": 0,
    "default_view": "month",
    "show_week_numbers": False,
    "week_numbering": "locale",
    "hide_weekends": False,
    "use_24_hour_time": False,
    "working_days": [1, 2, 3, 4, 5],
    "working_hours_start_time": "09:00",
    "working_hours_end_time": "17:00",
    "time_grid_start_hour": 6,
    "time_grid_end_hour": 22,
    "default_calendar_id": "primary",
    "default_calendar_account_email": None,
    "default_new_event_is_all_day": True,
    "default_event_start_time": "09:00",
    "default_event_duration": 60,
    "default_event_color": "blue",
    "default_event_title": "",
    "default_event_is_private": False,
    "default_event_show_as_busy": True,
    "default_event_location": None,
    "default_add_google_meet": False,
    "default_alert_minutes": 10,
    "default_alert_minutes_list": [10],
    "hide_past_deleted_declined_events": True,
    "show_completed_tasks": True
}

def _strip_system_fields(payload: dict) -> dict:
    payload.pop("user_id", None)
    payload.pop("created_at", None)
    payload.pop("updated_at", None)
    return payload

@router.get("", response_model=UserSettings)
async def get_settings(
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    result = (
        supabase.table("user_settings")
        .select("*")
        .eq("user_id", str(user.id))
        .limit(1)
        .execute()
    )
    if result.data:
        settings_data = _strip_system_fields(result.data[0])
        return UserSettings(**settings_data)
    return UserSettings(**DEFAULT_SETTINGS)

@router.put("", response_model=UserSettings)
async def update_settings(
    request: Request,
    user: User = Depends(get_current_user),
    supabase: Client = Depends(get_supabase_client)
):
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")

    update_data = UserSettingsUpdate(**body)
    existing_result = (
        supabase.table("user_settings")
        .select("*")
        .eq("user_id", str(user.id))
        .limit(1)
        .execute()
    )

    update_payload = update_data.model_dump(exclude_unset=True)
    if not update_payload:
        if existing_result.data:
            settings_data = _strip_system_fields(existing_result.data[0])
            return UserSettings(**settings_data)
        return UserSettings(**DEFAULT_SETTINGS)

    update_payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    if existing_result.data:
        result = (
            supabase.table("user_settings")
            .update(update_payload)
            .eq("user_id", str(user.id))
            .execute()
        )
    else:
        create_payload = {**DEFAULT_SETTINGS, **update_payload}
        create_payload["user_id"] = str(user.id)
        create_payload["created_at"] = datetime.now(timezone.utc).isoformat()
        result = supabase.table("user_settings").insert(create_payload).execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update settings")

    settings_data = _strip_system_fields(result.data[0])
    return UserSettings(**settings_data)
