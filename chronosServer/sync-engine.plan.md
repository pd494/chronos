# Calendar Sync Engine Migration Plan

## Goals
- Remove reliance on browser localStorage/sessionStorage as source of truth; persist all calendar data in Supabase DB
- Build bidirectional sync between Google Calendar and database
- Enable infinite calendar navigation (no 3-month cap) with efficient DB reads
- Keep app snappy with optimistic updates and simple caching
- Initial backfill: 2 years past + 2 years future
- Sync strategy: On-demand (user refresh or manual sync button) — **no background/cron sync** for now; freshness depends on user activity

## Simplified Caching Strategy

**Single cache layer: In-memory React state only**
- Database is the single source of truth
- Client cache: Simple in-memory React state (events array in CalendarContext)
- **No IndexedDB**: Remove IndexedDB complexity entirely - just keep events in memory while app is open
- **On refresh**: Fetch fresh from DB (fast since DB is indexed and local)
- **Benefits**: Simple, no versioning/invalidation logic, no cache sync issues

## Current State Audit

### Local Storage Usage (to migrate)
- `EVENT_OVERRIDES_STORAGE_KEY` (`chronos:event-overrides`): Event time overrides stored in localStorage
- `CHECKED_EVENTS_STORAGE_KEY` (`chronos:checked-events`): Checked-off event IDs in localStorage
- `EVENT_TODO_LINKS_STORAGE_KEY` (`chronos:event-todo-links`): Event-to-todo mappings in localStorage
- `TASK_SNAPSHOT_PREFIX`: Task snapshots in sessionStorage/localStorage
- View preferences (`chronos:last-view`): Current view state (keep this - it's just UI preference)

### IndexedDB Usage (to remove)
- `chronos-cache` DB: Month-bucketed event cache (user + calendar hash + month)
- Currently used to avoid re-fetching from Google Calendar API
- **Decision**: Remove IndexedDB entirely - delete `cache.js` file and all references

### Current Architecture Issues
- Events fetched directly from Google Calendar API (`calendarApi.getEvents`)
- No database persistence of events
- Range fetching limited (3-month prefetch in MonthlyView.jsx)
- All event state (overrides, checked states, todo links) in localStorage
- No sync state tracking or delta sync capability

## Database Schema (Supabase)

### New Tables

#### `calendar_accounts`
- `id` (uuid PK)
- `user_id` (uuid FK → users, unique)
- `provider` (text, default 'google')
- `access_token` (text, encrypted)
- `refresh_token` (text, encrypted)
- **Store tokens encrypted/KMS-backed; lock table with strict RLS**
- `expires_at` (timestamptz)
- `scopes` (text[])
- `sync_enabled` (boolean, default true)
- `last_auth_error` (text, nullable)
- `created_at`, `updated_at` (timestamptz)

#### `calendar_list`
- `id` (uuid PK)
- `user_id` (uuid FK → users)
- `provider_calendar_id` (text) - Google calendar ID
- `summary` (text)
- `color` (text)
- `access_role` (text) - 'owner', 'reader', 'writer', etc.
- `selected` (boolean, default true)
- `etag` (text, nullable)
- `created_at`, `updated_at` (timestamptz)
- Unique: (user_id, provider_calendar_id)

#### `events`
- `id` (uuid PK)
- `user_id` (uuid FK → users)
- `calendar_id` (uuid FK → calendar_list)
- `external_id` (text) - Google event ID
- `etag` (text, nullable)
- `status` (text) - 'confirmed', 'tentative', 'cancelled'
- `summary` (text, nullable)
- `description` (text, nullable)
- `location` (text, nullable)
- `conference_data` (jsonb, nullable) - Serialized conferenceData payload
- `hangout_link` (text, nullable) - Direct Meet/Video link (fast lookup)
- `start_ts` (timestamptz)
- `end_ts` (timestamptz)
- `is_all_day` (boolean)
- `transparency` (text) - 'opaque', 'transparent'
- `visibility` (text) - 'default', 'public', 'private', 'confidential'
- `recurrence_rule` (text, nullable) - RRULE string
- `recurrence_meta` (jsonb, nullable) - Parsed recurrence metadata
- `organizer_email` (text, nullable)
- `attendees` (jsonb, nullable) - Array of attendee objects
- `extended_props` (jsonb, nullable) - Google extendedProperties
- `source` (text, default 'google') - 'google' or 'local'
- `last_synced_at` (timestamptz)
- `last_modified_at` (timestamptz)
- `deleted_at` (timestamptz, nullable) - Soft delete
- `created_at`, `updated_at` (timestamptz)
- **Indexes**:
  - `(user_id, calendar_id, start_ts)` - Range queries
  - `(user_id, start_ts)` - User-wide range queries
  - `(user_id, calendar_id, external_id)` unique - Google event deduplication
  - `(user_id, calendar_id, deleted_at)` partial - Active events only

#### `event_instances`
- `id` (uuid PK)
- `event_id` (uuid FK → events)
- `instance_start_ts` (timestamptz)
- `instance_end_ts` (timestamptz)
- `original_start_ts` (timestamptz, nullable) - For exceptions
- `overrides` (jsonb, nullable) - Instance-specific overrides
- `attendee_summary` (jsonb, nullable) - Instance-specific attendee responses
- `conference_data` (jsonb, nullable) - Instance-level conference data if overridden
- `hangout_link` (text, nullable) - Instance-level link if overridden
- `status` (text) - 'confirmed', 'cancelled', etc.
- `is_exception` (boolean) - True for recurring event exceptions
- `created_at`, `updated_at` (timestamptz)
- **Indexes**:
  - `(event_id, instance_start_ts)`
  - `(instance_start_ts)` - For range queries via join

#### `event_sync_state`
- `id` (uuid PK)
- `user_id` (uuid FK → users)
- `calendar_id` (uuid FK → calendar_list)
- `next_sync_token` (text, nullable) - Google syncToken for delta sync
- `last_full_sync_at` (timestamptz, nullable)
- `last_delta_sync_at` (timestamptz, nullable)
- `backfill_before_ts` (timestamptz, nullable) - Oldest synced event
- `backfill_after_ts` (timestamptz, nullable) - Newest synced event
- `sync_cursor` (text, nullable) - Page token for pagination
- `sync_error` (text, nullable) - Last sync error message
- `is_syncing` (boolean, default false) - Lock flag
- `created_at`, `updated_at` (timestamptz)
- Unique: (user_id, calendar_id)

#### `event_changes`
- `id` (uuid PK)
- `user_id` (uuid FK → users)
- `event_id` (uuid FK → events, nullable) - Null for creates
- `operation` (text) - 'create', 'update', 'delete', 'respond'
- `payload` (jsonb) - Operation-specific data
- `local_version` (integer) - Client-side version number
- `applied_at` (timestamptz)
- `upstream_status` (text) - 'pending', 'synced', 'failed'
- `upstream_error` (text, nullable)
- `retry_count` (integer, default 0)
- `created_at`, `updated_at` (timestamptz)
- **Index**: `(user_id, upstream_status, created_at)` - For retry queue

#### `event_user_state`
- `id` (uuid PK)
- `user_id` (uuid FK → users)
- `event_id` (uuid FK → events)
- `is_checked_off` (boolean, default false)
- `time_overrides` (jsonb, nullable) - User-specific time adjustments
- `created_at`, `updated_at` (timestamptz)
- Unique: (user_id, event_id)

#### `todo_event_links`
- `id` (uuid PK)
- `user_id` (uuid FK → users)
- `todo_id` (uuid FK → todos)
- `event_id` (uuid FK → events, nullable)
- `google_event_id` (text, nullable) - Cached Google ID for quick lookup
- `created_at`, `updated_at` (timestamptz)
- Unique: (user_id, todo_id)

## Sync Engine Architecture

### Initial Backfill Strategy
1. On first sync or calendar connection:
   - Fetch calendars from Google → populate `calendar_list`
   - For each selected calendar:
     - Calculate range: 2 years past to 2 years future from today
     - Fetch events in monthly chunks (to avoid Google API limits)
     - Store events in `events` table
     - Expand recurring events into `event_instances` table
     - Update `event_sync_state.backfill_before_ts` and `backfill_after_ts`
     - Capture `nextSyncToken` from final request → store in `event_sync_state`

2. On-demand expansion:
   - When user scrolls beyond `backfill_before_ts` or `backfill_after_ts`:
     - API detects missing coverage
     - Triggers background fetch for missing range
     - Extends backfill boundaries
   - When events are cancelled/deleted: soft-delete `events` row and prune matching `event_instances` to avoid orphaned instances

### Delta Sync Strategy
1. Use Google Calendar `syncToken` for incremental updates:
   - Start with stored `next_sync_token` from `event_sync_state`
   - Call Google Calendar API with `syncToken` parameter
   - Process returned events (create/update/delete)
   - Update `events` and `event_instances` tables
   - Store new `nextSyncToken` for next sync

2. Handle sync token expiration (410 error):
   - Fallback to a **full 2-year window resync** (or entire calendar if feasible) to avoid missing older deletions
   - Then resume delta sync with new token

3. Sync triggers:
   - Manual: User clicks sync button
   - On app refresh/reload
   - After user mutations (create/update/delete events)

### Recurring Events Handling
- Master events stored in `events` table with `recurrence_rule` and `recurrence_meta`
- Expanded instances stored in `event_instances` table
- Exceptions (modified instances) stored as `event_instances` with `is_exception=true`
- On sync: Regenerate instances only for the affected ranges (cap expansion to backfill/query window to avoid explosion)

## API Endpoints (Server)

### New/Modified Endpoints

#### `GET /calendar/bootstrap`
- Returns: Events for visible range, coverage metadata, selected calendars, sync freshness
- Query params: `start`, `end`, `calendar_ids` (optional)
- Response includes:
  - `events`: Array of events from DB
  - `coverage`: `{ has_before: boolean, has_after: boolean, backfill_before: iso, backfill_after: iso }`
  - `calendars`: Selected calendar list
  - `last_synced_at`: Per-calendar sync timestamps

#### `GET /calendar/events`
- Read events from DB (not Google)
- Query params: `start`, `end`, `calendar_ids` (optional), `include_instances` (boolean)
- Returns events with coverage metadata; if coverage is missing, enqueue range fetch/backfill
- Efficient range queries using indexes

#### `POST /calendar/events`
- Create event: Write to DB first, then sync to Google
- Returns optimistic event with `is_pending_sync: true`
- Logs to `event_changes` table

#### `PUT /calendar/events/{id}`
- Update event: Update DB, enqueue Google sync
- Returns updated event

#### `DELETE /calendar/events/{id}`
- Soft delete in DB, sync deletion to Google
- Returns success

#### `POST /calendar/sync`
- Trigger manual sync for current user
- Query params: `calendar_ids` (optional), `force_full` (boolean)
- Returns sync status and progress

#### `GET /calendar/changes`
- Change feed for incremental hydration
- Query params: `since` (cursor/timestamp)
- Returns small delta of changes since last check

#### `GET/POST /event-user-state`
- Read/write user-specific flags (checked off, overrides) for events

#### `GET/POST /todo-event-links`
- Manage todo ↔ event linkage without localStorage

#### `GET /calendar/sync-status`
- Returns sync state per calendar
- Includes: last sync time, coverage ranges, errors, in-progress status

## Client Changes

### CalendarContext.jsx Migration

1. **Replace data fetching**:
   - Remove direct `calendarApi.getEvents()` calls to Google
   - Use new `/calendar/bootstrap` and `/calendar/events` endpoints
   - Read from DB instead of Google Calendar API
   - Ensure responses include `conference_data`/`hangout_link` fields so existing UI keeps Meet links

2. **Remove localStorage dependencies**:
   - Migrate `EVENT_OVERRIDES_STORAGE_KEY` → `event_user_state.time_overrides` in DB
   - Migrate `CHECKED_EVENTS_STORAGE_KEY` → `event_user_state.is_checked_off` in DB
   - Migrate `EVENT_TODO_LINKS_STORAGE_KEY` → `todo_event_links` table in DB
   - Keep view preference (`chronos:last-view`) in localStorage (UI preference, not data)

3. **Simple in-memory cache**:
   - Remove all IndexedDB code and imports
   - Delete `cache.js` file entirely
   - Keep events in React state (already doing this)
   - On page refresh: fetch fresh from DB (fast with indexes)
   - No versioning, no invalidation logic needed

4. **Infinite navigation**:
   - Remove 3-month prefetch limit
   - Use coverage metadata to detect missing ranges
   - Trigger on-demand backfill when scrolling beyond coverage
   - Show loading indicator for ranges being fetched

5. **Optimistic updates**:
   - Show pending state for local mutations
   - Reconcile when sync completes
   - Handle conflicts (server data newer than local)

6. **Sync UI**:
   - Add sync button in header
   - Show sync status indicator (last synced time, in-progress, errors)
   - Display coverage info (e.g., "Events loaded until Dec 2026")
   - Make freshness expectations clear (manual sync only; no background job)

### TaskContext.jsx Migration

1. **Remove localStorage snapshots**:
   - Stop saving task snapshots to sessionStorage/localStorage
   - Use DB as source of truth
   - Keep in-memory cache only

2. **Category overrides**:
   - Persist category color/order preferences in DB
   - Add `user_category_preferences` table if needed

## Implementation Steps

### Phase 1: Database Schema
1. Create migration SQL for all new tables
2. Add indexes for performance
3. Migrate existing `google_credentials` → `calendar_accounts`
4. Decide if multiple calendar accounts per user are needed; if so, drop the unique constraint on `calendar_accounts.user_id` and key by provider+user
5. Set up RLS policies for all tables

### Phase 2: Sync Service (Server)
1. Create `CalendarSyncService` class:
   - Initial backfill logic (2 years past/future)
   - Delta sync with syncToken
   - Recurring event expansion
   - Error handling and retries
   - Outbound change processor: drain `event_changes` queue to Google with retry/backoff
2. Create background sync endpoint (`POST /calendar/sync`)
3. Integrate with existing `GoogleCalendarService`

### Phase 3: API Endpoints
1. Implement new DB-backed endpoints:
   - `GET /calendar/bootstrap`
   - `GET /calendar/events` (modified)
   - `GET /calendar/sync-status`
   - `GET /calendar/changes`
2. Modify mutation endpoints to write DB first
3. Add event change logging

### Phase 4: Client Migration
1. Update `CalendarContext.jsx`:
   - Replace Google API calls with DB endpoints
   - Migrate localStorage data to DB
   - Add coverage-aware fetching
   - **Remove all IndexedDB code** (delete `cache.js`, remove imports)
2. Update `TaskContext.jsx`:
   - Remove localStorage snapshots
   - Persist preferences in DB
3. Add sync UI components

### Phase 5: Data Migration
1. One-time migration script:
   - Run client-side during a user session to read localStorage data
   - Migrate to DB tables
   - Clear localStorage after migration
2. Initial backfill for existing users:
   - Trigger sync for all connected calendars
   - Backfill 2 years past/future

### Phase 6: Testing & Cleanup
1. Test infinite scroll in all directions
2. Test sync conflicts and resolution
3. Remove obsolete code:
   - Old Google Calendar direct fetch logic
   - Unused localStorage keys
   - **Delete `cache.js` file**
   - Remove all IndexedDB references

## Performance Optimizations

1. **Database indexes**: Ensure all range queries use indexes
2. **Query optimization**: Use windowed queries (month/quarter boundaries)
3. **Payload size**: Limit attendee arrays, trim descriptions in list views
4. **Lazy loading**: Load full event details only when modal opens
5. **Pagination**: For very large date ranges, paginate results

## Error Handling

1. **Sync failures**: Log to `event_sync_state.sync_error`, surface to user
2. **Google API errors**: Retry with exponential backoff
3. **Conflict resolution**: Compare timestamps, prefer server data, allow user override
4. **Network failures**: Show error state, queue mutations for retry on reconnect
5. **Sync locking**: Use transactional CAS or advisory locks around `event_sync_state.is_syncing` to avoid overlapping syncs

## Migration Checklist

- [ ] Create database schema (all tables + indexes)
- [ ] Migrate `google_credentials` → `calendar_accounts`
- [ ] Build `CalendarSyncService` with backfill + delta sync
- [ ] Implement new API endpoints
- [ ] Update client to use DB endpoints
- [ ] Migrate localStorage data to DB
- [ ] **Delete `cache.js` and remove all IndexedDB code**
- [ ] Add sync UI (button + status indicator)
- [ ] Test infinite scroll and coverage expansion
- [ ] Remove obsolete code
- [ ] Run initial backfill for existing users
