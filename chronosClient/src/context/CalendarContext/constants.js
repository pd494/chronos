export const EVENT_BOUNCE_EVENT = 'chronos:event-bounce';
export const EVENT_OVERRIDES_STORAGE_KEY = 'chronos:event-overrides';
export const CHECKED_EVENTS_STORAGE_KEY = 'chronos:checked-events';
export const EVENT_TODO_LINKS_STORAGE_KEY = 'chronos:event-todo-links';

export const SNAPSHOT_VERSION = 3;

export const IDB_NAME = 'chronos-db';
export const IDB_VERSION = 1;
export const IDB_STORE = 'events-cache';

// How far around the visible range we proactively load from the DB.
export const INITIAL_PAST_MONTHS = 24;
export const INITIAL_FUTURE_MONTHS = 24;
export const EXPANSION_MONTHS = 2;
export const RECENT_EVENT_SYNC_TTL_MS = 60 * 1000;
export const MAX_FETCH_SEGMENT_MONTHS = 18;
export const ENSURE_RANGE_COOLDOWN_MS = 10000; // 10 seconds cooldown
export const FETCH_GOOGLE_EVENTS_COOLDOWN_MS = 5000; // 5 seconds cooldown

