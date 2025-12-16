from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class UserSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")

    timezone: str | None = None
    use_device_timezone: bool = True
    week_start_day: int = Field(default=0, ge=0, le=6)
    default_view: str = "month"
    show_week_numbers: bool = False
    week_numbering: str = "locale"
    hide_weekends: bool = False
    use_24_hour_time: bool = False

    working_days: list[int] = Field(default_factory=lambda: [1, 2, 3, 4, 5])
    working_hours_start_time: str = "09:00"
    working_hours_end_time: str = "17:00"
    time_grid_start_hour: int = Field(default=6, ge=0, le=23)
    time_grid_end_hour: int = Field(default=22, ge=0, le=23)

    default_calendar_id: str = "primary"
    default_calendar_account_email: str | None = None

    default_new_event_is_all_day: bool = True
    default_event_start_time: str = "09:00"
    default_event_duration: int = Field(default=60, ge=30, le=360)
    default_event_color: str = "blue"
    default_event_title: str = ""
    default_event_is_private: bool = False
    default_event_show_as_busy: bool = True
    default_event_location: str | None = None
    default_add_google_meet: bool = False

    default_alert_minutes: int = Field(default=10, ge=0, le=10080)
    default_alert_minutes_list: list[int] = Field(default_factory=lambda: [10])
    hide_past_deleted_declined_events: bool = True
    show_completed_tasks: bool = True


class UserSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    timezone: str | None = None
    use_device_timezone: bool | None = None
    week_start_day: int | None = Field(default=None, ge=0, le=6)
    default_view: str | None = None
    show_week_numbers: bool | None = None
    week_numbering: str | None = None
    hide_weekends: bool | None = None
    use_24_hour_time: bool | None = None

    working_days: list[int] | None = None
    working_hours_start_time: str | None = None
    working_hours_end_time: str | None = None
    time_grid_start_hour: int | None = Field(default=None, ge=0, le=23)
    time_grid_end_hour: int | None = Field(default=None, ge=0, le=23)

    default_calendar_id: str | None = None
    default_calendar_account_email: str | None = None

    default_new_event_is_all_day: bool | None = None
    default_event_start_time: str | None = None
    default_event_duration: int | None = Field(default=None, ge=30, le=360)
    default_event_color: str | None = None
    default_event_title: str | None = None
    default_event_is_private: bool | None = None
    default_event_show_as_busy: bool | None = None
    default_event_location: str | None = None
    default_add_google_meet: bool | None = None

    default_alert_minutes: int | None = Field(default=None, ge=0, le=10080)
    default_alert_minutes_list: list[int] | None = None
    hide_past_deleted_declined_events: bool | None = None
    show_completed_tasks: bool | None = None
