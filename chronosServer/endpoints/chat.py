from fastapi import APIRouter, Request, Depends, HTTPException
from db.cerebras_client import get_async_cerebras_client, get_cerebras_client
from db.supabase_client import get_supabase_client
from db.auth_dependency import get_current_user
from cerebras.cloud.sdk import AsyncCerebras, Cerebras
from supabase import Client
from models.todo import Todo
from models.user import User
from models.tools import CreateEventTool, UpdateEventTool, DeleteEventTool, ListEventTool
from config import settings
from db.google_credentials import GoogleCalendarService
from db.calendar_sync import CalendarSyncService
from datetime import datetime, timezone, timedelta
import json
import asyncio
import logging
import re
import time

router = APIRouter(prefix="/chat", tags=["Chat"])
logger = logging.getLogger(__name__)
logger.setLevel(logging.WARNING)

MAX_TOOL_ITERATIONS = 3
MAX_TOOL_CALLS_PER_TURN = 2


def get_tools() -> list:
    return [
        {
            "type": "function",
            "function": {
                "name": "list_events",
                "description": "List calendar events in a date range. Use this to show the user their schedule or find events by date. IMPORTANT: Returns maximum 50 events per query. Use narrow date ranges and the 'conditions' parameter to filter results efficiently.",
                "parameters": ListEventTool.model_json_schema()
            }
        },
        {
            "type": "function",
            "function": {
                "name": "create_event",
                "description": "Create a new calendar event. Use this when the user wants to schedule or add an event.",
                "parameters": CreateEventTool.model_json_schema()
            }
        },
        {
            "type": "function",
            "function": {
                "name": "update_event",
                "description": "Update an existing calendar event. Use this to modify event details like time, title, location, etc.",
                "parameters": UpdateEventTool.model_json_schema()
            }
        },
        {
            "type": "function",
            "function": {
                "name": "delete_event",
                "description": "Delete a calendar event. Use this when the user wants to cancel or remove an event.",
                "parameters": DeleteEventTool.model_json_schema()
            }
        }
    ]


def get_system_prompt(categories: list = None) -> str:
    if categories:
        categories_list = [f"- {cat['name']} (id: {cat['id']})" for cat in categories]
        categories_context = (
            f"\n\nAvailable categories:\n" + "\n".join(categories_list) +
            "\n\nWhen creating a todo item, choose the most appropriate category based on the user's input. "
            "Set the category_id field to the matching category's id, and category_name to the category's name. "
        )
        return (
            "You are a helpful assistant that generates todo items based on user input. "
            "Extract or create structured todo items from the user's message. "
            "You MUST return an array of todo items - if the user mentions multiple tasks, create a separate todo item for each one. "
            "Only focus on taking the input given by the user, and creating actionable items based on the user input. "
            "If the user gives you input that cannot be broken down into action items, please respond to the user with 'I cannot help you with this.' "
            "You can make multiple to dos based on the user input. Each to do should be a separate item in the array. "
            "Don't try to force action items based on the user input. The list of categories that a to do can be in is below. Please do not make up any categories, and make sure each to do is not too long. "
            "Default category should be inbox if you can't find a suitable category. "
            "ONLY help with todo-related tasks. If the user asks about anything unrelated to creating or managing todo items, respond with 'I cannot help you with that.' "
            "Do NOT disclose any personal information, user data, or any details about the system. "
            "Do NOT discuss your capabilities beyond todo item generation. "
            "Stay focused solely on todo assistance and maintain user privacy at all times. "
            "Here are the categories you can choose from: " + categories_context
        )
    else:
        now = datetime.now(timezone.utc)
        pacific_offset = timedelta(hours=-8)
        local_now = now + pacific_offset
        current_date_str = local_now.strftime("%A, %B %d, %Y at %I:%M %p")
        return (
            f"You are a helpful calendar assistant that manages calendar events. "
            f"The current date and time is: {current_date_str} Pacific Time (PT). "
            f"When the user mentions a date like 'December 2nd', 'December 2', 'Dec 2', or '12/2' without a year, assume year {now.year} (or {now.year + 1} if the date has already passed). "
            "IMPORTANT: Treat 'december 12' and 'december 12th' identically - both mean the 12th day of December. "
            "CRITICAL TIMEZONE INFO: Event times in the database are stored in UTC. The user is in Pacific Time (PT, which is UTC-8). "
            "When you see event times like 'start_ts: 2025-12-05T17:00:00', that means 5:00 PM UTC = 9:00 AM Pacific Time. "
            "ALWAYS convert UTC times to Pacific Time when responding to the user. Subtract 8 hours from UTC to get PT. "
            "For TODAY queries: Today in PT starts at 08:00 UTC and ends at 07:59 UTC next day. Use appropriate UTC ranges. "
            "You can create, update, delete, and list calendar events based on user requests. "
            "When the user wants to schedule something, use the create_event function. "
            "When they want to modify an existing event, use the update_event function. "
            "When they want to cancel or remove an event, use the delete_event function. "
            "When the user asks about existing events or availability, you MUST first use the list_events function. "
            "ALWAYS call list_events before answering questions about schedules, availability, or events. Do NOT assume the user is free - check the calendar first. "
            "IMPORTANT: Use SMART, NARROW date ranges. For example: "
            "- For 'today', query from current date 08:00 UTC to next day 07:59 UTC. "
            "- For 'tomorrow', query from tomorrow 08:00 UTC to day after 07:59 UTC. "
            "- For a PAST date like 'November 28th', query that past date with correct year. "
            "- For 'NEXT' queries (e.g., 'next meeting'), ONLY search FUTURE events starting from NOW. "
            "FORMATTING: For schedule overviews (e.g., 'what did my day look like'), use a numbered list format with EACH ITEM ON A NEW LINE. Include a brief one-sentence summary of each event if available. For single event lookups, use simple prose. You may use **bold** for event names. Do NOT use markdown tables. "
            "Respond in well-written, precise, and succinct sentences. Always display times in Pacific Time (PT) to the user. "
            "ONLY help with calendar and scheduling-related tasks. If the user asks about anything unrelated to their calendar or scheduling, respond with 'I cannot help you with that.' "
        )


def list_events(args: dict, user: User, supabase: Client) -> dict:
    try:
        params = ListEventTool(**args)
        start = datetime.fromisoformat(params.start_date.replace('Z', '+00:00'))
        end = datetime.fromisoformat(params.end_date.replace('Z', '+00:00'))

        calendar_ids = None
        if params.calendar_ids:
            calendar_ids = list(params.calendar_ids)
        else:
            calendars_result = (
                supabase.table("connected_calendars")
                .select("id")
                .eq("user_id", str(user.id))
                .eq("selected", True)
                .execute()
            )
            calendar_ids = [c.get("id") for c in (calendars_result.data or []) if c.get("id")]

        # Query for events that OVERLAP with the requested date range
        # An event overlaps if: event.start_ts < query.end AND event.end_ts > query.start
        # This captures all-day events and events that span across the query range
        query = supabase.table("events").select(
            "external_id, summary, description, location, start_ts, end_ts, is_all_day, calendar_id"
        ).eq("user_id", str(user.id)).lt("start_ts", end.isoformat()).gt("end_ts", start.isoformat()).is_("deleted_at", None)

        if calendar_ids:
            query = query.in_("calendar_id", calendar_ids)

        if params.conditions:
            text = params.conditions
            if isinstance(text, dict):
                text = " ".join(str(v) for v in text.values() if v is not None)
            text = str(text).strip()
            if text:
                text = re.sub(r"[\?\.!,:;]+$", "", text).strip()
                text = re.sub(r"\b(due|deadline|due\s+date)\b$", "", text, flags=re.IGNORECASE).strip()
                keywords = text.split() if text else []
                
                if keywords:
                    conditions = []
                    for kw in keywords:
                        conditions.append(f"summary.ilike.%{kw}%")
                        conditions.append(f"description.ilike.%{kw}%")
                    query = query.or_(",".join(conditions))
                elif text:
                    query = query.or_(
                        f"summary.ilike.%{text}%,description.ilike.%{text}%"
                    )

        _q_t0 = time.perf_counter()
        data = query.order("start_ts").execute().data or []
        _q_dt = time.perf_counter() - _q_t0
        logger.warning(f"[PERF] tool=list_events supabase_execute_time={_q_dt:.3f}s")

        compact = [
            {
                "external_id": e.get("external_id"),
                "summary": e.get("summary"),
                "description": e.get("description"),
                "start_ts": e.get("start_ts"),
                "end_ts": e.get("end_ts"),
                "is_all_day": e.get("is_all_day"),
                "location": e.get("location"),
                "calendar_id": e.get("calendar_id"),
                "attendees": e.get("attendees"),
                "color": e.get("color"),
            }
            for e in data
        ]

        return {"events": compact, "count": len(compact)}
    except Exception as e:
        return {"error": str(e)}


def create_event(args: dict, user: User, supabase: Client) -> dict:
    try:
        params = CreateEventTool(**args)
        target = params.calendar_id or "primary"

        query = supabase.table("connected_calendars").select("id, external_account_id, provider_calendar_id").eq("user_id", str(user.id))
        if target == "primary":
            query = query.eq("provider_calendar_id", user.email)
        else:
            query = query.eq("id", target)

        calendar = query.execute().data
        account = calendar[0].get("external_account_id") if calendar else None
        provider = calendar[0].get("provider_calendar_id") if calendar else target

        payload = {
            "summary": params.title,
            "description": params.description,
            "location": params.location,
            "transparency": params.transparency,
            "visibility": params.visibility,
            "attendees": [{"email": e} for e in (params.participants or [])],
            "recurrence": [params.recurrence_rule] if params.recurrence_rule else None
        }

        if params.reminders:
            try:
                payload["reminders"] = json.loads(params.reminders)
            except Exception:
                pass

        if params.is_all_day:
            payload["start"] = {"date": params.start[:10]}
            payload["end"] = {"date": params.end[:10]}
        else:
            zone = params.timezone or "UTC"
            payload["start"] = {"dateTime": params.start, "timeZone": zone}
            payload["end"] = {"dateTime": params.end, "timeZone": zone}

        service = GoogleCalendarService(str(user.id), supabase, account)
        event = service.create_event(provider, payload)

        syncer = CalendarSyncService(str(user.id), account or user.email, supabase)
        syncer.save_event(event, calendar[0]["id"] if calendar else "primary")

        return {"event": event, "message": "Event created"}
    except Exception as e:
        return {"error": str(e)}


def update_event(args: dict, user: User, supabase: Client) -> dict:
    try:
        params = UpdateEventTool(**args)
        rows = supabase.table("events").select("calendar_id").eq("user_id", str(user.id)).eq("external_id", params.event_id).limit(1).execute().data
        if not rows:
            return {"error": "Event not found"}

        cid = rows[0].get("calendar_id")
        calendar = supabase.table("connected_calendars").select("external_account_id, provider_calendar_id").eq("id", cid).execute().data
        if not calendar:
            return {"error": "Calendar not found"}

        account = calendar[0].get("external_account_id")
        provider = calendar[0].get("provider_calendar_id") or "primary"

        updates = {}
        if params.title:
            updates["summary"] = params.title
        if params.description:
            updates["description"] = params.description
        if params.location:
            updates["location"] = params.location
        if params.transparency:
            updates["transparency"] = params.transparency
        if params.visibility:
            updates["visibility"] = params.visibility
        if params.participants:
            updates["attendees"] = [{"email": e} for e in params.participants]
        if params.recurrence_rule:
            updates["recurrence"] = [params.recurrence_rule]
        if params.reminders:
            try:
                updates["reminders"] = json.loads(params.reminders)
            except Exception:
                pass
        
        if params.start or params.end:
            zone = params.timezone or "UTC"
            if params.start:
                updates["start"] = {"date": params.start[:10]} if params.is_all_day else {"dateTime": params.start, "timeZone": zone}
            if params.end:
                updates["end"] = {"date": params.end[:10]} if params.is_all_day else {"dateTime": params.end, "timeZone": zone}

        service = GoogleCalendarService(str(user.id), supabase, account)
        event = service.update_event(params.event_id, provider, updates, recurring_edit_scope=params.recurring_edit_scope)

        syncer = CalendarSyncService(str(user.id), account or user.email, supabase)
        syncer.save_event(event, cid)

        return {"event": event, "message": "Event updated"}
    except Exception as e:
        return {"error": str(e)}


def delete_event(args: dict, user: User, supabase: Client) -> dict:
    try:
        params = DeleteEventTool(**args)
        rows = supabase.table("events").select("calendar_id").eq("user_id", str(user.id)).eq("external_id", params.event_id).limit(1).execute().data
        if not rows:
            return {"error": "Event not found"}

        cid = rows[0].get("calendar_id")
        calendar = supabase.table("connected_calendars").select("external_account_id, provider_calendar_id").eq("id", cid).execute().data
        if not calendar:
            return {"error": "Calendar not found"}

        account = calendar[0].get("external_account_id")
        provider = calendar[0].get("provider_calendar_id") or "primary"

        service = GoogleCalendarService(str(user.id), supabase, account)
        service.delete_event(params.event_id, provider)

        supabase.table("events").delete().eq("user_id", str(user.id)).eq("external_id", params.event_id).execute()

        return {"message": "Event deleted", "event_id": params.event_id}
    except Exception as e:
        return {"error": str(e)}


@router.post("/todo-suggestions")
async def get_todo_suggestions(
    request: Request,
    cerebras_client: AsyncCerebras = Depends(get_async_cerebras_client),
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
):
    body = await request.json()
    user_prompt = body.get("content", "")
    res = await asyncio.to_thread(lambda: supabase.table("categories").select("*").eq("user_id", str(user.id)).execute())
    categories = res.data or []

    schema = {
        "type": "array",
        "items": Todo.model_json_schema(),
        "minItems": 1
    }
    system_prompt = get_system_prompt(categories)
    try:
        completion = await cerebras_client.chat.completions.create(
            model=settings.CEREBRAS_MODEL,
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "todos_array", "schema": schema}
            }
        )
        content = completion.choices[0].message.content
        if content is None:
            raise HTTPException(status_code=500, detail="Failed to generate todo suggestions")
        return content
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in todo suggestions: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate todo suggestions")

def is_schedule_overview_query(prompt: str) -> dict | None:
    """
    Detect if the query is asking for a schedule overview (day/week/month).
    Returns a dict with date range info if matched, None otherwise.
    """
    low = prompt.lower().strip()
    now = datetime.now(timezone.utc)
    
    # Patterns for schedule overview queries
    # "describe my day today", "what's on my calendar today", "what do I have today", etc.
    today_patterns = [
        r"\b(?:describe|show|list|what(?:'s| is| do i have| was| did))?\b.*\b(?:today|day today)\b",
        r"\btoday(?:'s)?\s+(?:schedule|calendar|events?|day)\b",
        r"\bwhat(?:'s| is) on (?:my )?(?:calendar|schedule) today\b",
    ]
    
    for pattern in today_patterns:
        if re.search(pattern, low):
            # Today in PT: starts at 08:00 UTC, ends at 07:59:59 UTC next day
            start = now.replace(hour=8, minute=0, second=0, microsecond=0)
            if now.hour < 8:  # Before 8 AM UTC means still "yesterday" in PT
                start = start - timedelta(days=1)
            end = start + timedelta(days=1) - timedelta(seconds=1)
            return {"type": "today", "start": start, "end": end}
    
    # Patterns for specific date queries: "what was my day like on november 28th", "describe december 5th"
    month_names = {
        'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
        'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
        'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
    }
    
    # Pattern: "what was my day like on november 28th" or "describe my day on december 5"
    date_pattern = r"\b(?:what(?:'s| is| was| did)|describe|show|how did)\b.*\b(?:day|schedule|calendar)\b.*\b(?:on|like on|for)?\s*(?:on\s+)?(" + "|".join(month_names.keys()) + r")\s+(\d{1,2})(?:st|nd|rd|th)?\b"
    date_match = re.search(date_pattern, low)
    
    if date_match:
        month_name = date_match.group(1)
        day = int(date_match.group(2))
        month = month_names.get(month_name, 1)
        year = now.year if month <= now.month else now.year  # Assume current or past year
        
        # Create date range for that day in PT (08:00 UTC to 07:59 UTC next day)
        try:
            target_date = datetime(year, month, day, 8, 0, 0, tzinfo=timezone.utc)
            start = target_date
            end = start + timedelta(days=1) - timedelta(seconds=1)
            return {"type": f"{month_name.capitalize()} {day}", "start": start, "end": end}
        except ValueError:
            pass  # Invalid date, fall through to tool loop
    
    return None

def is_query_for_events(prompt: str) -> str | None:
    low = prompt.lower().strip()
    if any(x in low for x in ["create", "schedule", "add", "move", "delete", "update", "reschedule", "change"]):
        return None

    m_when = re.match(r"^(when\s+(?:is|was|did)\b|what\s+(?:time|day|date)\b)\s+(.*)$", low)
    if m_when is not None:
        subject = m_when.group(2) if m_when.lastindex and m_when.lastindex >= 2 else ""
        subject = re.sub(r"[^a-zA-Z0-9\s]", " ", subject)
        subject = re.sub(r"\s+", " ", subject).strip()
        if len(subject) >= 2:
            return subject

    m_lead = re.match(
        r"^(?:do\s+(?:i|we)\s+have\b|is\s+there\b|tell\s+me\b|remind\s+me\b|what\s*(?:'s|\s+is)?\s+on\b|show\s+me\b|list\s+(?:my\s+)?(?:events|calendar)\b)\s*(.*)$",
        low,
    )
    if m_lead is not None:
        subject = m_lead.group(1) if m_lead.lastindex and m_lead.lastindex >= 1 else ""
        subject = re.sub(r"[^a-zA-Z0-9\s]", " ", subject)
        subject = re.sub(r"\s+", " ", subject).strip()
        if len(subject) >= 2:
            return subject
        return "schedule"

    m = re.search(
        r"""
        (?:(?:when\b|when\s+is\b|when\s+was\b)|what\s+(?:time|day|date)\b|do\s+(?:i|we)\s+have\b|is\s+there\b|tell\s+me\b|remind\s+me\b)
        .*?
        (?:meeting|appointment|event|call|interview|deadline|exam|test|class|flight|reservation|party|hangout)
        """,
        low,
        re.VERBOSE
    )

    if m is not None:
        try:
            match_text = m.group(0)
        except IndexError:
            match_text = str(m)
        subject = re.sub(r"[^a-zA-Z0-9\s]", " ", match_text)
        subject = re.sub(r"\s+", " ", subject).strip()
        if len(subject) >= 2:
            return subject
    return None

@router.post("/calendar")
async def chat_calendar(
    request: Request,
    cerebras_client: AsyncCerebras = Depends(get_async_cerebras_client),
    supabase: Client = Depends(get_supabase_client),
    user: User = Depends(get_current_user)
):
    _req_t0 = time.perf_counter()
    _status = "unknown"
    _path = "unknown"

    async def _ensure_connected():
        if await request.is_disconnected():
            raise asyncio.CancelledError()

    try:
        body = await request.json()
        prompt = body.get("content", "")
        logger.warning(f"[CHAT] /chat/calendar called (prompt_len={len(prompt)})")

        await _ensure_connected()
        
        # Fast path for schedule overview queries (describe my day today, etc.)
        schedule_overview = is_schedule_overview_query(prompt)
        if schedule_overview:
            _path = "schedule_overview"
            logger.warning(f"[CHAT] path=schedule_overview type={schedule_overview['type']}")
            
            _sb_t0 = time.perf_counter()
            events_result = await asyncio.to_thread(
                list_events,
                {"start_date": schedule_overview["start"].isoformat(), "end_date": schedule_overview["end"].isoformat()},
                user,
                supabase
            )
            _sb_dt = time.perf_counter() - _sb_t0
            logger.warning(f"[PERF] Schedule overview query completed in {_sb_dt:.3f}s")
            
            events_list = events_result.get("events") if isinstance(events_result, dict) else []
            if not isinstance(events_list, list):
                events_list = []
            
            events_json = json.dumps({"events": events_list, "count": len(events_list)})
            answer_prompt = f"""The user asked: "{prompt}"

Here are ALL {len(events_list)} events for {schedule_overview['type']}:
{events_json}

IMPORTANT: You MUST list ALL {len(events_list)} events above, one per line.
Instructions:
- List EVERY event with a numbered format, EACH ON A NEW LINE
- Format: 1. **Event Name** - Time (e.g., 9:00 AM - 10:00 AM) - Brief description
- Convert all times from UTC to Pacific Time (subtract 8 hours)
- If no events, say the day is free
- Be concise."""
            
            _llm_t0 = time.perf_counter()
            resp = await cerebras_client.chat.completions.create(
                model=settings.CEREBRAS_MODEL,
                messages=[{"role": "user", "content": answer_prompt}]
            )
            _llm_dt = time.perf_counter() - _llm_t0
            logger.warning(f"[PERF] LLM response in {_llm_dt:.3f}s")
            _status = "ok"
            return {"message": resp.choices[0].message.content, "did_mutate": False, "matched_events": events_list}
        
        look_for_events = is_query_for_events(prompt)
        if look_for_events:
            _path = "look_for_events"
            logger.warning(f"[CHAT] path=look_for_events conditions={look_for_events!r}")

            await _ensure_connected()

            now = datetime.now(timezone.utc)
            start = (now - timedelta(days=90)).replace(hour=0, minute=0, second=0, microsecond=0)
            end = (now + timedelta(days=90)).replace(hour=23, minute=59, second=59, microsecond=999999)

            _sb_t0 = time.perf_counter()
            logger.warning("[PERF] Starting Supabase query...")
            events_result = await asyncio.to_thread(
                list_events,
                {"start_date": start.isoformat(), "end_date": end.isoformat(), "conditions": look_for_events},
                user,
                supabase
            )

            await _ensure_connected()
            _sb_dt = time.perf_counter() - _sb_t0
            logger.warning(f"[PERF] Supabase query completed in {_sb_dt:.3f}s")

            events_list = events_result.get("events") if isinstance(events_result, dict) else None
            if not isinstance(events_list, list):
                events_list = []
            events_list = events_list[:25]
            events_json = json.dumps({"events": events_list, "count": len(events_list)})
            answer_prompt = f"The user asked: \"{prompt}\"\n\nHere are the matching calendar events (trimmed):\n{events_json}\n\nAnswer the user's question based on these events. Be concise. IMPORTANT: Format all dates in natural language (e.g., 'December 12, 2025' not '2025-12-12'). For all-day events (is_all_day=true), only mention the start date, not the end date."
            
            logger.warning("[PERF] Starting Cerebras completion...")
            _llm_t0 = time.perf_counter()
            resp = await cerebras_client.chat.completions.create(
                model=settings.CEREBRAS_MODEL,
                messages=[{"role": "user", "content": answer_prompt}]
            )

            await _ensure_connected()
            _llm_dt = time.perf_counter() - _llm_t0
            logger.warning(f"[PERF] Cerebras completion completed in {_llm_dt:.3f}s")
            _status = "ok"
            return {"message": resp.choices[0].message.content, "did_mutate": False, "matched_events": events_list}
        
        _path = "tool_loop"
        logger.warning("[CHAT] path=tool_loop")
    
        tools = get_tools()
        system = get_system_prompt()

        messages = [{"role": "system", "content": system}, {"role": "user", "content": prompt}]
        functions = {
            "list_events": lambda args: list_events(args, user, supabase),
            "create_event": lambda args: create_event(args, user, supabase),
            "update_event": lambda args: update_event(args, user, supabase),
            "delete_event": lambda args: delete_event(args, user, supabase),
        }

        did_mutate = False
        found_events = []  # Track events from list_events calls for modal display

        for iteration in range(MAX_TOOL_ITERATIONS):
            _iter_t0 = time.perf_counter()
            _llm_t0 = time.perf_counter()

            await _ensure_connected()
            resp = await cerebras_client.chat.completions.create(
                model=settings.CEREBRAS_MODEL,
                messages=messages,
                tools=tools
            )

            await _ensure_connected()
            _llm_dt = time.perf_counter() - _llm_t0
            logger.warning(f"[PERF] iter={iteration} llm_time={_llm_dt:.3f}s")
            msg = resp.choices[0].message
            
            tool_calls = list(msg.tool_calls or [])[:MAX_TOOL_CALLS_PER_TURN]
            tool_names = [c.function.name for c in tool_calls]
            logger.warning(f"[PERF] iter={iteration} tool_calls={len(tool_calls)} names={tool_names}")
            
            if not tool_calls:
                _status = "ok"
                return {"message": msg.content, "did_mutate": did_mutate, "matched_events": found_events}

            for call in tool_calls:
                if call.function.name in ("create_event", "update_event", "delete_event"):
                    did_mutate = True

            messages.append(msg.model_dump())

            async def run_tool(call):
                nonlocal found_events
                name = call.function.name
                if name in functions:
                    _tool_t0 = time.perf_counter()
                    args = json.loads(call.function.arguments)
                    res = await asyncio.to_thread(functions[name], args)
                    _tool_dt = time.perf_counter() - _tool_t0
                    logger.warning(f"[PERF] iter={iteration} tool={name} time={_tool_dt:.3f}s")
                    
                    # Capture events from list_events for modal display
                    if name == "list_events" and isinstance(res, dict) and "events" in res:
                        found_events.extend(res.get("events", []))
                    
                    return {"role": "tool", "content": json.dumps(res), "tool_call_id": call.id}
                return {"role": "tool", "content": json.dumps({"error": f"Tool {name} not found"}), "tool_call_id": call.id}

            results = await asyncio.gather(*(run_tool(call) for call in tool_calls))
            messages.extend(results)

            await _ensure_connected()

            _iter_dt = time.perf_counter() - _iter_t0
            logger.warning(f"[PERF] iter={iteration} total_iter_time={_iter_dt:.3f}s")

        _final_llm_t0 = time.perf_counter()

        await _ensure_connected()
        final_resp = await cerebras_client.chat.completions.create(
            model=settings.CEREBRAS_MODEL,
            messages=messages
        )

        await _ensure_connected()
        _final_llm_dt = time.perf_counter() - _final_llm_t0
        logger.warning(f"[PERF] final_llm_time={_final_llm_dt:.3f}s")
        _status = "ok"
        return {"message": final_resp.choices[0].message.content, "did_mutate": did_mutate, "matched_events": found_events}
    except asyncio.CancelledError:
        _status = "cancelled"
        raise HTTPException(status_code=499, detail="Client cancelled request")
    except HTTPException:
        _status = "http_exception"
        raise
    except Exception as e:
        _status = "error"
        logger.error(f"Error in calendar chat: {e}")
        raise HTTPException(status_code=500, detail="Failed to process calendar chat request")
    finally:
        logger.warning(f"[PERF] /chat/calendar total time {(time.perf_counter() - _req_t0):.3f}s status={_status} path={_path}")
