import {
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  differenceInCalendarDays
} from 'date-fns';

import { EVENT_BOUNCE_EVENT } from './constants';

export const dispatchBounceEvent = (eventId) => {
  if (typeof window === 'undefined' || !eventId) return;
  window.dispatchEvent(new CustomEvent(EVENT_BOUNCE_EVENT, { detail: { eventId } }));
};

export const parseCalendarBoundary = (boundary) => {
  if (!boundary) return null;
  if (boundary instanceof Date) {
    return new Date(boundary.getTime());
  }
  if (typeof boundary === 'string') {
    const trimmed = boundary.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number);
      return new Date(year, month - 1, day, 12, 0, 0, 0);
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (boundary?.dateTime) {
    return new Date(boundary.dateTime);
  }
  if (boundary?.date) {
    const [year, month, day] = boundary.date.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  return null;
};

export const resolveIsAllDay = (startBoundary, eventMeta) => {
  if (typeof eventMeta?.isAllDay === 'boolean') {
    return eventMeta.isAllDay;
  }
  if (startBoundary && typeof startBoundary === 'object') {
    if ('dateTime' in startBoundary) return false;
    if ('date' in startBoundary) return true;
  }
  return false;
};

export const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

export const coerceDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return isValidDate(value) ? new Date(value.getTime()) : null;
  }
  const boundary = parseCalendarBoundary(value);
  if (boundary && !Number.isNaN(boundary.getTime())) {
    return boundary;
  }
  const direct = new Date(value);
  return Number.isNaN(direct.getTime()) ? null : direct;
};

export const safeToISOString = (value) => {
  const date = coerceDate(value);
  return date ? date.toISOString() : null;
};

export const isMidnight = (date) => {
  if (!(date instanceof Date)) return false;
  return (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  );
};

export const eventBehavesLikeAllDay = (event) => {
  if (!event) return false;
  if (event.isAllDay) return true;
  const startDate = coerceDate(event.start);
  const endDate = coerceDate(event.end);
  if (!startDate || !endDate) return false;
  const spansMultipleCalendarDays =
    differenceInCalendarDays(startOfDay(endDate), startOfDay(startDate)) >= 1;
  if (!spansMultipleCalendarDays) return false;
  return isMidnight(startDate) && isMidnight(endDate);
};

export const safeJsonParse = (value, fallback = null) => {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
};

export const resolveEventMeetingLocation = (apiEvent, fallback = '') => {
  if (!apiEvent) return fallback || '';
  
  const conferenceHangout = apiEvent?.conferenceData?.hangoutLink;
  if (conferenceHangout) return conferenceHangout;
  
  const directHangout = apiEvent?.hangoutLink;
  if (directHangout) return directHangout;
  
  const entryPoints = Array.isArray(apiEvent?.conferenceData?.entryPoints)
    ? apiEvent.conferenceData.entryPoints
    : [];
  const preferredEntryPoint = entryPoints.find(ep => ep?.entryPointType === 'video' && ep?.uri);
  if (preferredEntryPoint?.uri) return preferredEntryPoint.uri;
  
  return apiEvent?.location || fallback || '';
};

export const normalizeResponseStatus = (value) => {
  if (!value) return null;
  const lower = String(value).toLowerCase();
  return lower === 'needsaction' ? 'needsAction' : lower;
};

export const enumerateMonths = (start, end) => {
  const months = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endCursor = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= endCursor) {
    months.push(`${cursor.getFullYear()}-${(cursor.getMonth() + 1).toString().padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
};

export const groupContiguousMonths = (months) => {
  if (!months.length) return [];
  const parts = [];
  let runStart = months[0];
  let prev = months[0];
  const y = (m) => parseInt(m.split('-')[0], 10);
  const n = (m) => parseInt(m.split('-')[1], 10);
  const nextOf = (m) => {
    const yy = y(m); const mm = n(m);
    const d = new Date(yy, mm - 1, 1);
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  };
  for (let i = 1; i < months.length; i++) {
    const cur = months[i];
    if (cur !== nextOf(prev)) {
      parts.push([runStart, prev]);
      runStart = cur;
    }
    prev = cur;
  }
  parts.push([runStart, prev]);
  return parts;
};

export const getDateKey = (d) => {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const buildBufferedRange = (start, end, pastMonths, futureMonths) => {
  if (!(start instanceof Date) || !(end instanceof Date)) {
    return null;
  }
  const bufferedStart = startOfDay(startOfMonth(subMonths(start, pastMonths)));
  const bufferedEnd = endOfDay(endOfMonth(addMonths(end, futureMonths)));
  return { start: bufferedStart, end: bufferedEnd };
};

export const transformApiEventToInternal = (event, options = {}) => {
  const { seriesInfo, viewerEmail, viewerEmails, applyOverrides } = options
  if (event.status && event.status.toLowerCase() === 'cancelled') return null
  
  const isAllDay = resolveIsAllDay(event.start, event)
  const start = parseCalendarBoundary(event.start) || new Date(event.start.dateTime || event.start.date)
  const end = parseCalendarBoundary(event.end) || new Date(event.end.dateTime || event.end.date)
  const privateExtendedProps = { ...(event.extendedProperties?.private || {}) }
  const categoryColor = privateExtendedProps.categoryColor
  const todoId = privateExtendedProps.todoId
  
  const masterInfo = event.recurringEventId && seriesInfo ? seriesInfo.get(event.recurringEventId) : null
  const ownInfo = seriesInfo?.get(event.id)
  const recurrenceRule = ownInfo?.rule || masterInfo?.rule || 
    (Array.isArray(event.recurrence) && event.recurrence.length ? event.recurrence[0] : null) || 
    privateExtendedProps.recurrenceRule
  const recurrenceMeta = ownInfo?.meta || masterInfo?.meta || 
    (privateExtendedProps.recurrenceMeta ? safeJsonParse(privateExtendedProps.recurrenceMeta) : null)
  const recurrenceSummary = ownInfo?.summary || masterInfo?.summary || privateExtendedProps.recurrenceSummary || null

  const attendeesList = Array.isArray(event.attendees) ? event.attendees : []
  const participants = attendeesList.map(a => a.email).filter(Boolean)
  const attendees = attendeesList.map(attendee => {
    if (!attendee || typeof attendee !== 'object') return null
    return { ...attendee, responseStatus: normalizeResponseStatus(attendee?.responseStatus) }
  }).filter(Boolean)
  
  const viewerEmailSet = (() => {
    const set = new Set()
    if (typeof viewerEmail === 'string' && viewerEmail.trim()) set.add(viewerEmail.trim().toLowerCase())
    if (Array.isArray(viewerEmails)) {
      viewerEmails.forEach((email) => {
        if (typeof email === 'string' && email.trim()) set.add(email.trim().toLowerCase())
      })
    }
    return set
  })()

  const viewerAttendee = attendeesList.find(attendee => {
    if (attendee?.self) return true
    if (!attendee?.email) return false
    return viewerEmailSet.size > 0 && viewerEmailSet.has(attendee.email.toLowerCase())
  })
  const viewerResponseStatus = normalizeResponseStatus(viewerAttendee?.responseStatus)
  const viewerIsOrganizer = Boolean(
    viewerEmailSet.size > 0 &&
    event.organizer?.email &&
    viewerEmailSet.has(event.organizer.email.toLowerCase())
  )
  const viewerIsAttendee = Boolean(viewerAttendee)
  const inviteCanRespond = viewerIsAttendee && !viewerIsOrganizer
  const isInvitePending = viewerResponseStatus === 'needsAction'
  const transparency = event.transparency === 'transparent' ? 'transparent' : 'opaque'
  const visibility = event.visibility || 'default'
  const reminders = event.reminders ? {
    ...event.reminders,
    overrides: Array.isArray(event.reminders.overrides) ? event.reminders.overrides.map(o => ({ ...o })) : undefined
  } : null

  const transformed = {
    id: event.id,
    clientKey: event.id,
    title: event.summary || 'Untitled',
    description: event.description || null,
    start,
    end,
    color: categoryColor || 'blue',
    isGoogleEvent: true,
    calendar_id: event.calendar_id,
    isAllDay,
    location: resolveEventMeetingLocation(event, event.location || ''),
    participants,
    attendees,
    todoId: todoId ? String(todoId) : undefined,
    recurrenceRule: recurrenceRule || null,
    recurrenceSummary,
    recurrenceMeta,
    recurringEventId: event.recurringEventId || null,
    originalStartTime: event.originalStartTime?.dateTime || event.originalStartTime?.date || null,
    organizerEmail: event.organizer?.email || null,
    viewerResponseStatus,
    viewerIsOrganizer,
    viewerIsAttendee,
    inviteCanRespond,
    isInvitePending,
    transparency,
    visibility,
    reminders
  }

  return applyOverrides ? applyOverrides(transformed) : transformed
}

