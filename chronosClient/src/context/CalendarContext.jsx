import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
  addMonths,
  addWeeks,
  addDays,
  subMonths,
  isSameDay,
  format,
  differenceInCalendarDays
} from 'date-fns'
import { v4 as uuidv4 } from 'uuid'
import { calendarApi } from '../lib/api'
import { describeRecurrence, expandRecurrenceInstances, parseRecurrenceRule } from '../lib/recurrence'
import { useAuth } from './AuthContext'

const CalendarContext = createContext(null)
const EVENT_BOUNCE_EVENT = 'chronos:event-bounce'
const EVENT_OVERRIDES_STORAGE_KEY = 'chronos:event-overrides'
const CHECKED_EVENTS_STORAGE_KEY = 'chronos:checked-events'
const EVENT_TODO_LINKS_STORAGE_KEY = 'chronos:event-todo-links'
const SNAPSHOT_VERSION = 3
const IDB_NAME = 'chronos-db'
const IDB_VERSION = 1
const IDB_STORE = 'events-cache'

// Open IndexedDB connection
const openDB = () => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB not available'))
      return
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' })
      }
    }
  })
}

// Save events to IndexedDB
const saveEventsToCache = async (userId, events) => {
  if (!userId) return
  try {
    const db = await openDB()
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    const cacheData = {
      id: 'events',
      userId,
      events: events.filter(e => e.isGoogleEvent).map(e => ({
        ...e,
        start: e.start instanceof Date ? e.start.toISOString() : e.start,
        end: e.end instanceof Date ? e.end.toISOString() : e.end
      })),
      cachedAt: Date.now()
    }
    store.put(cacheData)
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (e) {
    // IndexedDB unavailable
  }
}

// Load events from IndexedDB
const loadEventsFromCache = async (userId) => {
  if (!userId) return null
  try {
    const db = await openDB()
    const tx = db.transaction(IDB_STORE, 'readonly')
    const store = tx.objectStore(IDB_STORE)
    const request = store.get('events')
    const cacheData = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    if (!cacheData) return null
    // Only use cache if it's for the same user and less than 24 hours old
    if (cacheData.userId !== userId) return null
    if (Date.now() - cacheData.cachedAt > 24 * 60 * 60 * 1000) return null
    return cacheData.events.map(e => ({
      ...e,
      start: new Date(e.start),
      end: new Date(e.end)
    }))
  } catch (e) {
    return null
  }
}

// Add single event to IndexedDB cache
const addEventToCache = async (userId, newEvent) => {
  if (!userId || !newEvent) return
  try {
    const db = await openDB()
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    const request = store.get('events')
    const cacheData = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const events = cacheData?.events || []
    const eventToAdd = {
      ...newEvent,
      start: newEvent.start instanceof Date ? newEvent.start.toISOString() : newEvent.start,
      end: newEvent.end instanceof Date ? newEvent.end.toISOString() : newEvent.end
    }
    const existingIdx = events.findIndex(e => e.id === newEvent.id)
    if (existingIdx >= 0) {
      events[existingIdx] = eventToAdd
    } else {
      events.push(eventToAdd)
    }
    store.put({ id: 'events', userId, events, cachedAt: Date.now() })
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (e) {}
}

// Remove event from IndexedDB cache
const removeEventFromCache = async (eventId) => {
  if (!eventId) return
  try {
    const db = await openDB()
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    const request = store.get('events')
    const cacheData = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    if (!cacheData?.events) { db.close(); return }
    const events = cacheData.events.filter(e => e.id !== eventId)
    store.put({ ...cacheData, events, cachedAt: Date.now() })
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (e) {}
}

// Clear IndexedDB cache
const clearEventsCache = async () => {
  try {
    const db = await openDB()
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    store.delete('events')
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (e) {}
}

const dispatchBounceEvent = (eventId) => {
  if (typeof window === 'undefined' || !eventId) return
  window.dispatchEvent(new CustomEvent(EVENT_BOUNCE_EVENT, { detail: { eventId } }))
}

const INITIAL_PAST_MONTHS = 5
const INITIAL_FUTURE_MONTHS = 5
const EXPANSION_MONTHS = 2
const RECENT_EVENT_SYNC_TTL_MS = 60 * 1000

const parseCalendarBoundary = (boundary) => {
  if (!boundary) return null
  if (boundary instanceof Date) {
    return new Date(boundary.getTime())
  }
  if (typeof boundary === 'string') {
    const trimmed = boundary.trim()
    if (!trimmed) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number)
      return new Date(year, month - 1, day, 12, 0, 0, 0)
    }
    const parsed = new Date(trimmed)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  if (boundary?.dateTime) {
    return new Date(boundary.dateTime)
  }
  if (boundary?.date) {
    const [year, month, day] = boundary.date.split('-').map(Number)
    return new Date(year, month - 1, day, 12, 0, 0, 0)
  }
  return null
}

const resolveIsAllDay = (startBoundary, eventMeta) => {
  if (typeof eventMeta?.isAllDay === 'boolean') {
    return eventMeta.isAllDay
  }
  if (startBoundary && typeof startBoundary === 'object') {
    if ('dateTime' in startBoundary) return false
    if ('date' in startBoundary) return true
  }
  return false
}

const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime())

const coerceDate = (value) => {
  if (!value) return null
  if (value instanceof Date) {
    return isValidDate(value) ? new Date(value.getTime()) : null
  }
  const boundary = parseCalendarBoundary(value)
  if (boundary && !Number.isNaN(boundary.getTime())) {
    return boundary
  }
  const direct = new Date(value)
  return Number.isNaN(direct.getTime()) ? null : direct
}

const safeToISOString = (value) => {
  const date = coerceDate(value)
  return date ? date.toISOString() : null
}

const isMidnight = (date) => {
  if (!(date instanceof Date)) return false
  return (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  )
}

const eventBehavesLikeAllDay = (event) => {
  if (!event) return false
  if (event.isAllDay) return true
  const startDate = coerceDate(event.start)
  const endDate = coerceDate(event.end)
  if (!startDate || !endDate) return false
  const spansMultipleCalendarDays =
    differenceInCalendarDays(startOfDay(endDate), startOfDay(startDate)) >= 1
  if (!spansMultipleCalendarDays) return false
  return isMidnight(startDate) && isMidnight(endDate)
}

const safeJsonParse = (value, fallback = null) => {
  if (!value) return fallback
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value)
  } catch (_) {
    return fallback
  }
}

const resolveEventMeetingLocation = (apiEvent, fallback = '') => {
  if (!apiEvent) return fallback || ''
  
  // Priority order:
  // 1. conferenceData.hangoutLink (most reliable for Google Meet)
  // 2. Direct hangoutLink field (legacy support)
  // 3. conferenceData.entryPoints video URI
  // 4. location field (fallback)
  const conferenceHangout = apiEvent?.conferenceData?.hangoutLink
  if (conferenceHangout) return conferenceHangout
  
  const directHangout = apiEvent?.hangoutLink
  if (directHangout) return directHangout
  
  const entryPoints = Array.isArray(apiEvent?.conferenceData?.entryPoints)
    ? apiEvent.conferenceData.entryPoints
    : []
  const preferredEntryPoint = entryPoints.find(ep => ep?.entryPointType === 'video' && ep?.uri)
  if (preferredEntryPoint?.uri) return preferredEntryPoint.uri
  
  return apiEvent?.location || fallback || ''
}

const normalizeResponseStatus = (value) => {
  if (!value) return null
  const lower = String(value).toLowerCase()
  return lower === 'needsaction' ? 'needsAction' : lower
}


export const CalendarProvider = ({ children }) => {
  const { user, loading: authLoading } = useAuth()
  const [currentDate, setCurrentDate] = useState(new Date())
  const VIEW_STORAGE_KEY = 'chronos:last-view'
  const [view, setView] = useState(() => {
    if (typeof window === 'undefined') return 'month'
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
    return stored === 'day' || stored === 'week' || stored === 'month' ? stored : 'month'
  })
  const [headerDisplayDate, setHeaderDisplayDate] = useState(currentDate)
  const [events, setEventsState] = useState([])
  const eventsRefValue = useRef(events)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showEventModal, setShowEventModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isRevalidating, setIsRevalidating] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [selectedCalendars, setSelectedCalendars] = useState(null)
  const loadedRangeRef = useRef(null)
  const prefetchedRangesRef = useRef(new Set())
  const eventsByDayRef = useRef(new Map())
  const skipNextDayIndexRebuildRef = useRef(false)
  const eventIdsRef = useRef(new Set())
  const activeForegroundRequestsRef = useRef(0)
  const activeBackgroundRequestsRef = useRef(0)
  const hasLoadedInitialRef = useRef(false)
  const todoToEventRef = useRef(new Map())
  const eventToTodoRef = useRef(new Map())
  const suppressedEventIdsRef = useRef(new Set())
  const suppressedTodoIdsRef = useRef(new Set())
  const pendingSyncEventIdsRef = useRef(new Map())
  const eventOverridesRef = useRef(new Map())
  const dirtyOverrideIdsRef = useRef(new Set())
  const persistTimerRef = useRef(null)
  const hasMigratedLegacyRef = useRef(false)
  const suppressUserStatePersistRef = useRef(true)
  const lastSyncTimestampRef = useRef(0)
  const [checkedOffEventIds, setCheckedOffEventIds] = useState(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = window.localStorage.getItem(CHECKED_EVENTS_STORAGE_KEY)
      const parsed = JSON.parse(raw || '[]')
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter(id => typeof id === 'string' || typeof id === 'number'))
      }
    } catch (_) {}
    return new Set()
  })
  const optimisticRecurrenceMapRef = useRef(new Map())
  const optimisticEventCacheRef = useRef(new Map())
  const loadedMonthsRef = useRef(new Set())
  const inFlightMonthsRef = useRef(new Set())
  const snapshotSaveTimerRef = useRef(null)
  const hasBootstrappedRef = useRef(false)

  const checkAndRunBackfill = useCallback(async () => {
    if (!user?.has_google_credentials) return
    
    try {
      const response = await calendarApi.getSyncStatus()
      const syncState = response.sync_state || {}
      
      // If no backfill timestamps exist, this user needs initial backfill
      if (!syncState.backfill_before_ts && !syncState.backfill_after_ts) {
        console.log('Initial backfill needed for existing user')
        // Fire and forget - backfill runs in background on server
        calendarApi.triggerBackfill(true)
          .then(() => console.log('Backfill triggered'))
          .catch(error => console.error('Initial backfill failed:', error))
      }
    } catch (error) {
      console.error('Failed to check sync status:', error)
    }
  }, [user?.has_google_credentials])

  const hydrateEventUserState = useCallback(async () => {
    try {
      const response = await calendarApi.getEventUserState()
      const states = response.states || []
      
      // Load checked off events
      const checkedIds = states
        .filter(state => state.is_checked_off)
        .map(state => state.event_id)
      setCheckedOffEventIds(new Set(checkedIds))
      
      // Load event overrides
      const overrides = new Map()
      states.forEach(state => {
        if (state.time_overrides) {
          overrides.set(state.event_id, state.time_overrides)
        }
      })
      eventOverridesRef.current = overrides
    } catch (error) {
      console.error('Failed to load event user state:', error)
    }
  }, [])

  const persistEventOverrides = useCallback(() => {
    if (suppressUserStatePersistRef.current) return
    const dirtyIds = Array.from(dirtyOverrideIdsRef.current)
    if (!dirtyIds.length) return
    dirtyOverrideIdsRef.current.clear()
    
    // Batch all updates into a single request
    const updates = dirtyIds.map((eventId) => ({
      eventId,
      overrides: eventOverridesRef.current.get(eventId) || null
    }))
    
    // Single batch API call instead of multiple individual calls
    calendarApi.batchUpdateEventUserState(updates).catch(error => {
      console.error('Failed to persist event overrides:', error)
    })
  }, [])

  const queuePersistEventOverrides = useCallback(() => {
    if (suppressUserStatePersistRef.current) return
    if (persistTimerRef.current) return
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null
      persistEventOverrides()
    }, 400)
  }, [persistEventOverrides])

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
      suppressUserStatePersistRef.current = true
    }
  }, [])

  const migrateLocalStorageToDB = useCallback(async () => {
    if (typeof window === 'undefined') return
    if (hasMigratedLegacyRef.current) return
    const migrationKey = 'chronos:migration:event-state'
    if (window.localStorage.getItem(migrationKey)) {
      hasMigratedLegacyRef.current = true
      return
    }
    
    try {
      // Migrate checked events
      const checkedEventsRaw = window.localStorage.getItem('chronos:checked-events')
      if (checkedEventsRaw) {
        const checkedEvents = JSON.parse(checkedEventsRaw)
        if (Array.isArray(checkedEvents)) {
          const promises = checkedEvents.map(eventId =>
            calendarApi.updateEventUserState(eventId, true)
          )
          await Promise.all(promises)
          window.localStorage.removeItem('chronos:checked-events')
        }
      }
      
      // Migrate event overrides
      const overridesRaw = window.localStorage.getItem('chronos:event-overrides')
      if (overridesRaw) {
        const overrides = JSON.parse(overridesRaw)
        if (Array.isArray(overrides)) {
          const promises = overrides.map(([eventId, timeOverrides]) =>
            calendarApi.updateEventUserState(eventId, false, timeOverrides)
          )
          await Promise.all(promises)
          window.localStorage.removeItem('chronos:event-overrides')
        }
      }
      
      // Migrate todo-event links
      const linksRaw = window.localStorage.getItem('chronos:event-todo-links')
      if (linksRaw) {
        const links = JSON.parse(linksRaw)
        if (Array.isArray(links)) {
          const promises = links.map(([todoId, eventId]) =>
            calendarApi.updateTodoEventLink(todoId, eventId, eventId)
          )
          await Promise.all(promises)
          window.localStorage.removeItem('chronos:event-todo-links')
        }
      }
      
    } catch (error) {
      console.error('Failed to migrate localStorage data:', error)
    } finally {
      try {
        window.localStorage.setItem(migrationKey, '1')
      } catch (_) {}
      hasMigratedLegacyRef.current = true
    }
  }, [])

  const hydrateEventTodoLinks = useCallback(async () => {
    try {
      const response = await calendarApi.getTodoEventLinks()
      const links = response.links || []
      
      const map = new Map()
      const reverse = new Map()
      
      links.forEach(link => {
        if (link.event_id) {
          map.set(link.todo_id, link.event_id)
        }
        if (link.google_event_id) {
          reverse.set(link.todo_id, link.google_event_id)
        }
      })
      
      eventToTodoRef.current = map
      todoToEventRef.current = reverse
    } catch (error) {
      console.error('Failed to load todo event links:', error)
    }
  }, [])

  const persistEventTodoLinks = useCallback((todoId, eventId, googleEventId) => {
    if (todoId && eventId) {
      calendarApi.updateTodoEventLink(todoId, eventId, googleEventId)
        .catch(error => {
          console.error('Failed to persist todo event link:', error)
        })
    }
  }, [])

  const isEventChecked = useCallback((eventId) => {
    if (eventId === null || eventId === undefined) return false
    return checkedOffEventIds.has(eventId)
  }, [checkedOffEventIds])

  const setEventCheckedState = useCallback((eventId, checked) => {
    if (!eventId) return
    setCheckedOffEventIds(prev => {
      const next = new Set(prev)
      if (checked) {
        next.add(eventId)
      } else {
        next.delete(eventId)
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(CHECKED_EVENTS_STORAGE_KEY, JSON.stringify(Array.from(checkedOffEventIds)))
    } catch (_) {}
  }, [checkedOffEventIds])

  const unlinkTodo = useCallback((todoId, eventId = null) => {
    if (!todoId) return
    const todoKey = String(todoId)
    const eventKey = eventId ? String(eventId) : todoToEventRef.current.get(todoKey)
    todoToEventRef.current.delete(todoKey)
    if (eventKey) {
      eventToTodoRef.current.delete(eventKey)
    }
    calendarApi.deleteTodoEventLink(todoKey)
      .catch(error => {
        console.error('Failed to delete todo event link:', error)
      })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleTodoDeleted = async (e) => {
      const todoId = e.detail?.todoId
      if (!todoId) return
      const todoKey = String(todoId)
      suppressedTodoIdsRef.current.add(todoKey)
      removeTodoFromAllSnapshots(todoId)
      
      // Get the linked event ID before unlinking
      const linkedEventId = todoToEventRef.current.get(todoKey)
      const linkedEvent = linkedEventId ? events.find(ev => ev.id === linkedEventId) : null
      
      unlinkTodo(todoId)
      
      // Remove any linked events immediately from local state
      setEvents(prev => prev.filter(ev => String(ev.todoId) !== todoKey), { skipDayIndexRebuild: true })
      for (const [key, arr] of eventsByDayRef.current.entries()) {
        const next = arr.filter(ev => String(ev.todoId) !== todoKey)
        eventsByDayRef.current.set(key, next)
      }
      
      // Also delete the linked Google Calendar event from the backend
      if (linkedEventId && linkedEvent) {
        try {
          const calendarId = linkedEvent.calendar_id || 'primary'
          await calendarApi.deleteEvent(linkedEventId, calendarId)
        } catch (error) {
          console.error('Failed to delete linked calendar event:', error)
        }
      }
    }
    const handler = (e) => {
      const detail = e.detail || {}
      const todoId = detail.todoId
      if (!todoId) return
      const linkedEventId = todoToEventRef.current.get(String(todoId))
      if (!linkedEventId) return
      const completed = Boolean(detail.completed)
      setEventCheckedState(linkedEventId, completed)
    }
    window.addEventListener('todoCompletionChanged', handler)
    window.addEventListener('todoDeleted', handleTodoDeleted)
    return () => {
      window.removeEventListener('todoCompletionChanged', handler)
      window.removeEventListener('todoDeleted', handleTodoDeleted)
    }
  }, [setEventCheckedState, events, unlinkTodo])

  const toggleEventChecked = useCallback(async (eventId) => {
    if (!eventId) return
    
    const isChecked = isEventChecked(eventId)
    const newCheckedState = !isChecked
    
    // Update local state immediately for UI responsiveness
    setCheckedOffEventIds(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) {
        next.delete(eventId)
      } else {
        next.add(eventId)
      }
      return next
    })
    
    // Persist to API
    try {
      await calendarApi.updateEventUserState(eventId, newCheckedState)
    } catch (error) {
      console.error('Failed to update event checked state:', error)
      // Revert on error
      setCheckedOffEventIds(prev => {
        const next = new Set(prev)
        if (newCheckedState) {
          next.delete(eventId)
        } else {
          next.add(eventId)
        }
        return next
      })
    }
  }, [isEventChecked])

  const removeEventOverride = useCallback((eventId) => {
    if (!eventId) return
    if (eventOverridesRef.current.delete(eventId)) {
      dirtyOverrideIdsRef.current.add(eventId)
      queuePersistEventOverrides()
    }
  }, [queuePersistEventOverrides])

  const recordEventOverride = useCallback((eventId, startDate, endDate) => {
    if (!eventId || !(startDate instanceof Date) || !(endDate instanceof Date)) return
    const nextOverride = {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      updatedAt: Date.now()
    }
    const prev = eventOverridesRef.current.get(eventId)
    if (
      prev &&
      prev.start === nextOverride.start &&
      prev.end === nextOverride.end
    ) {
      return
    }
    eventOverridesRef.current.set(eventId, nextOverride)
    dirtyOverrideIdsRef.current.add(eventId)
    queuePersistEventOverrides()
  }, [queuePersistEventOverrides])

  const clearOverrideIfSynced = useCallback((eventId, startDate, endDate) => {
    if (!eventId) return
    const override = eventOverridesRef.current.get(eventId)
    if (!override) return
    const overrideStart = coerceDate(override.start)
    const overrideEnd = coerceDate(override.end)
    const resolvedStart = coerceDate(startDate)
    const resolvedEnd = coerceDate(endDate)
    if (
      overrideStart &&
      overrideEnd &&
      resolvedStart &&
      resolvedEnd &&
      Math.abs(resolvedStart.getTime() - overrideStart.getTime()) < 60 * 1000 &&
      Math.abs(resolvedEnd.getTime() - overrideEnd.getTime()) < 60 * 1000
    ) {
      removeEventOverride(eventId)
    }
  }, [removeEventOverride])

  const applyEventTimeOverrides = useCallback((eventObject) => {
    if (!eventObject || !eventObject.id) return eventObject
    const override = eventOverridesRef.current.get(eventObject.id)
    if (!override) return eventObject
    const overrideStart = coerceDate(override.start)
    const overrideEnd = coerceDate(override.end)
    if (!overrideStart || !overrideEnd) {
      removeEventOverride(eventObject.id)
      return eventObject
    }
    const eventStart = coerceDate(eventObject.start)
    const eventEnd = coerceDate(eventObject.end)
    if (
      eventStart &&
      eventEnd &&
      Math.abs(eventStart.getTime() - overrideStart.getTime()) < 60 * 1000 &&
      Math.abs(eventEnd.getTime() - overrideEnd.getTime()) < 60 * 1000
    ) {
      removeEventOverride(eventObject.id)
      return eventObject
    }
    return {
      ...eventObject,
      start: overrideStart,
      end: overrideEnd,
      hasLocalOverride: true
    }
  }, [removeEventOverride])

  const setEvents = useCallback((updater, options = {}) => {
    if (options?.skipDayIndexRebuild) {
      skipNextDayIndexRebuildRef.current = true
    }
    setEventsState(updater)
  }, [])

  useEffect(() => {
    eventsRefValue.current = events
  }, [events])

  const linkTodoEvent = useCallback((todoId, eventId) => {
    if (!todoId || !eventId) return
    const todoKey = String(todoId)
    const eventKey = String(eventId)
    todoToEventRef.current.set(todoKey, eventKey)
    eventToTodoRef.current.set(eventKey, todoKey)
    persistEventTodoLinks(todoId, eventId)
  }, [persistEventTodoLinks])

  const unlinkEvent = useCallback((eventId) => {
    if (!eventId) return
    const eventKey = String(eventId)
    const todoKey = eventToTodoRef.current.get(eventKey)
    if (todoKey) {
      eventToTodoRef.current.delete(eventKey)
      todoToEventRef.current.delete(todoKey)
      calendarApi.deleteTodoEventLink(todoKey)
        .catch(error => {
          console.error('Failed to delete todo event link:', error)
        })
    }
  }, [persistEventTodoLinks])

  const extendLoadedRange = useCallback((start, end) => {
    if (!(start instanceof Date) || !(end instanceof Date)) return
    const normalizedStart = startOfDay(start)
    const normalizedEnd = endOfDay(end)
    if (normalizedEnd <= normalizedStart) return

    if (!loadedRangeRef.current) {
      loadedRangeRef.current = {
        start: normalizedStart,
        end: normalizedEnd
      }
      return
    }

    const current = loadedRangeRef.current
    const nextStart = current.start && current.start < normalizedStart ? current.start : normalizedStart
    const nextEnd = current.end && current.end > normalizedEnd ? current.end : normalizedEnd
    loadedRangeRef.current = { start: nextStart, end: nextEnd }
  }, [])

  const enumerateMonths = (start, end) => {
    const months = []
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1)
    const endCursor = new Date(end.getFullYear(), end.getMonth(), 1)
    while (cursor <= endCursor) {
      months.push(`${cursor.getFullYear()}-${(cursor.getMonth() + 1).toString().padStart(2, '0')}`)
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return months
  }

  const groupContiguousMonths = (months) => {
    if (!months.length) return []
    const parts = []
    let runStart = months[0]
    let prev = months[0]
    const y = (m) => parseInt(m.split('-')[0], 10)
    const n = (m) => parseInt(m.split('-')[1], 10)
    const nextOf = (m) => {
      const yy = y(m); const mm = n(m)
      const d = new Date(yy, mm - 1, 1)
      d.setMonth(d.getMonth() + 1)
      return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`
    }
    for (let i = 1; i < months.length; i++) {
      const cur = months[i]
      if (cur !== nextOf(prev)) {
        parts.push([runStart, prev])
        runStart = cur
      }
      prev = cur
    }
    parts.push([runStart, prev])
    return parts
  }

  // compute calendar-set hash
  useEffect(() => {
    if (selectedCalendars && Array.isArray(selectedCalendars) && selectedCalendars.length) {
      const norm = [...selectedCalendars].sort().join(',')
      // No longer using cache, but keep this for API consistency
    } else {
      // No longer using cache, but keep this for API consistency
    }
  }, [selectedCalendars])



  const getDaysInMonth = useCallback((date) => {
    const start = startOfWeek(startOfMonth(date))
    const end = endOfWeek(endOfMonth(date))
    return eachDayOfInterval({ start, end })
  }, [])

  const getDaysInWeek = useCallback((date) => {
    const start = startOfWeek(date)
    const end = endOfWeek(date)
    return eachDayOfInterval({ start, end })
  }, [])

  const getVisibleRange = useCallback((date, activeView) => {
    if (activeView === 'day') {
      return {
        start: startOfDay(date),
        end: endOfDay(date)
      }
    }

    if (activeView === 'week') {
      return {
        start: startOfWeek(date),
        end: endOfWeek(date)
      }
    }

    return {
      start: startOfMonth(date),
      end: endOfMonth(date)
    }
  }, [])
  
  const removeEventFromAllSnapshots = useCallback((eventId) => {
    if (typeof window === 'undefined') return
    
    try {
      const keys = Object.keys(window.sessionStorage)
      keys.forEach(key => {
        if (key.startsWith('chronos:snap:')) {
          try {
            const raw = window.sessionStorage.getItem(key)
            const parsed = JSON.parse(raw)
            if (parsed?.events) {
              const filtered = parsed.events.filter(ev => ev.id !== eventId)
              if (filtered.length !== parsed.events.length) {
                window.sessionStorage.setItem(key, JSON.stringify({ version: SNAPSHOT_VERSION, events: filtered }))
              }
            }
          } catch (e) {
            // Ignore errors for individual keys
          }
        }
      })
    } catch (e) {
      // Ignore storage errors
    }
  }, [])

  const removeTodoFromAllSnapshots = useCallback((todoId) => {
    if (typeof window === 'undefined' || !todoId) return
    try {
      const keys = Object.keys(window.sessionStorage)
      keys.forEach(key => {
        if (!key.startsWith('chronos:snap:')) return
        const raw = window.sessionStorage.getItem(key)
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (parsed?.events) {
          const filtered = parsed.events.filter(ev => String(ev.todoId || ev.todo_id) !== String(todoId))
          if (filtered.length !== parsed.events.length) {
            window.sessionStorage.setItem(key, JSON.stringify({ version: SNAPSHOT_VERSION, events: filtered }))
          }
        }
      })
    } catch (_) {}
  }, [])
  
  const snapshotKey = useCallback((start, end, viewType = view) => {
    if (!user?.id || !start || !end) return null
    const ukey = user.id
    const viewKey = viewType
    const startIso = safeToISOString(start) || 'invalid'
    const endIso = safeToISOString(end) || 'invalid'
    return `chronos:snap:v${SNAPSHOT_VERSION}:${ukey}:${viewKey}:${startIso}:${endIso}`
  }, [user?.id, view])
  
  const clearAllSnapshots = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      const keysToRemove = []
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i)
        if (key && key.startsWith('chronos:snap:')) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => window.sessionStorage.removeItem(key))
    } catch (_) {}
  }, [])
  
  const saveSnapshotsForAllViews = useCallback((newEvent) => {
    if (typeof window === 'undefined') return
    
    const eventStart = coerceDate(newEvent.start)
    const eventEnd = coerceDate(newEvent.end)
    if (!eventStart || !eventEnd) return
    
    const views = ['month', 'week', 'day']
    
    views.forEach(viewType => {
      const range = getVisibleRange(currentDate, viewType)
      
      // Check if event is within this view's range
      const eventStartTime = eventStart.getTime()
      const eventEndTime = eventEnd.getTime()
      const rangeStartTime = range.start.getTime()
      const rangeEndTime = range.end.getTime()
      
      // Event must overlap with the range
      const isInRange = eventStartTime <= rangeEndTime && eventEndTime >= rangeStartTime
      
      if (!isInRange) return
      
      const key = snapshotKey(range.start, range.end, viewType)
      
      try {
        const existing = window.sessionStorage.getItem(key)
        const parsed = existing ? JSON.parse(existing) : { version: SNAPSHOT_VERSION, events: [] }
        let list = parsed.events || []
        
        // Add new event if not already in snapshot
        if (!list.some(x => x.id === newEvent.id)) {
          const startIso = safeToISOString(newEvent.start)
          const endIso = safeToISOString(newEvent.end)
          if (startIso && endIso) {
            list.push({
              id: newEvent.id,
              clientKey: newEvent.clientKey || newEvent.id,
              title: newEvent.title,
              description: newEvent.description || null,
              start: startIso,
              end: endIso,
              color: newEvent.color,
              calendar_id: newEvent.calendar_id,
              location: newEvent.location || '',
              participants: newEvent.participants || [],
              attendees: newEvent.attendees || [],
              todoId: newEvent.todoId,
              isOptimistic: newEvent.isOptimistic,
              isAllDay: newEvent.isAllDay,
              isPendingSync: Boolean(newEvent.isPendingSync),
              transparency: newEvent.transparency || 'opaque',
              visibility: newEvent.visibility || 'default',
              organizerEmail: newEvent.organizerEmail || null,
              viewerIsOrganizer: Boolean(newEvent.viewerIsOrganizer),
              viewerIsAttendee: Boolean(newEvent.viewerIsAttendee),
              viewerResponseStatus: newEvent.viewerResponseStatus || null
            })
            window.sessionStorage.setItem(key, JSON.stringify({ version: SNAPSHOT_VERSION, events: list }))
          }
        }
      } catch (e) {
        // Ignore storage errors
      }
    })
  }, [currentDate, getVisibleRange])

  const triggerEventBounce = useCallback((eventId) => {
    dispatchBounceEvent(eventId)
  }, [])

  const migrateOptimisticRecurrenceParentId = (oldId, newId) => {
    if (!oldId || !newId || oldId === newId) return
    const existing = optimisticRecurrenceMapRef.current.get(oldId)
    if (existing) {
      optimisticRecurrenceMapRef.current.delete(oldId)
      optimisticRecurrenceMapRef.current.set(newId, existing)
    }
  }

  const hydrateFromSnapshot = useCallback((options = {}) => {
    const skipLoadedFlag = Boolean(options?.skipLoadedFlag)
    try {
      if (typeof window === 'undefined') return false
      if (!user?.id) return false
      const { start, end } = getVisibleRange(currentDate, view)
      const key = snapshotKey(start, end)
      const raw = window.sessionStorage.getItem(key)
      if (!raw) return false
      const parsed = JSON.parse(raw)
      if (parsed?.version !== SNAPSHOT_VERSION) {
        window.sessionStorage.removeItem(key)
        return false
      }
      if (!Array.isArray(parsed?.events)) return false

      const toAdd = []
      for (const ev of parsed.events) {
        if (!eventIdsRef.current.has(ev.id)) {
          const todoId = ev.todoId || ev.todo_id

          const isPendingSync = Boolean(ev.isPendingSync)

          const e = {
            id: ev.id,
            clientKey: ev.clientKey || ev.id,
            title: ev.title || 'Untitled',
            description: ev.description || null,
            start: new Date(ev.start),
            end: new Date(ev.end),
            color: ev.color || 'blue',
            isGoogleEvent: !ev.isOptimistic,
            isOptimistic: ev.isOptimistic || false,
            isAllDay: ev.isAllDay || false,
            calendar_id: ev.calendar_id,
            location: ev.location || '',
            participants: ev.participants || [],
            attendees: ev.attendees || [],
            todoId: todoId ? String(todoId) : undefined,
            isPendingSync,
            transparency: ev.transparency || 'opaque',
            visibility: ev.visibility || 'default',
            organizerEmail: ev.organizerEmail || null,
            viewerIsOrganizer: Boolean(ev.viewerIsOrganizer),
            viewerIsAttendee: Boolean(ev.viewerIsAttendee),
            viewerResponseStatus: ev.viewerResponseStatus || null
          }
          if (todoId) {
            linkTodoEvent(todoId, ev.id)
          }
          toAdd.push(e)
          if (isPendingSync) {
            pendingSyncEventIdsRef.current.set(ev.id, Date.now())
          }
        }
      }
      if (toAdd.length) {
        setEvents(prev => [...prev, ...toAdd], { skipDayIndexRebuild: true })
        setTimeout(() => {
          for (const e of toAdd) {
            eventIdsRef.current.add(e.id)
            indexEventByDays(e)
          }
        }, 0)
        extendLoadedRange(start, end)
        if (!skipLoadedFlag) {
          hasLoadedInitialRef.current = true
          setInitialLoading(false)
        }
        return true
      }
    } catch (_) {}
    return false
  }, [currentDate, view, getVisibleRange, extendLoadedRange, linkTodoEvent, snapshotKey, user?.id])

  useEffect(() => {
    if (authLoading) return
    if (user) return
    hasBootstrappedRef.current = false
    setEvents([], { skipDayIndexRebuild: true })
    eventsByDayRef.current = new Map()
    eventIdsRef.current = new Set()
    pendingSyncEventIdsRef.current = new Map()
    todoToEventRef.current = new Map()
    eventToTodoRef.current = new Map()
    suppressedEventIdsRef.current = new Set()
    suppressedTodoIdsRef.current = new Set()
    loadedMonthsRef.current = new Set()
    inFlightMonthsRef.current = new Set()
    loadedRangeRef.current = null
    prefetchedRangesRef.current = new Set()
    hasLoadedInitialRef.current = false
    setInitialLoading(true)
    optimisticEventCacheRef.current = new Map()
    persistEventTodoLinks()
  }, [authLoading, user, persistEventTodoLinks])

  const fetchEventsForRange = useCallback(async (startDate, endDate, background = false, forceReload = false) => {
    if (!user) {
      return
    }
    
    if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
      return
    }

    const rangeStart = startOfDay(startDate)
    const rangeEnd = endOfDay(endDate)

    if (rangeEnd <= rangeStart) {
      return
    }

    if (
      !forceReload &&
      loadedRangeRef.current &&
      loadedRangeRef.current.start <= rangeStart &&
      loadedRangeRef.current.end >= rangeEnd
    ) {
      return
    }

    // Compute month buckets and determine which are missing
    const allMonths = enumerateMonths(rangeStart, rangeEnd)
    const missingMonths = []
    for (const m of allMonths) {
      if (!forceReload && loadedMonthsRef.current.has(m)) continue
      if (inFlightMonthsRef.current.has(m)) continue
      missingMonths.push(m)
    }
    if (missingMonths.length === 0) {
      return
    }
    let segments = missingMonths.length
      ? [[missingMonths[0], missingMonths[missingMonths.length - 1]]]
      : []
    // Mark months as in-flight
    for (const m of missingMonths) inFlightMonthsRef.current.add(m)

    try {
      const viewerEmail = typeof user?.email === 'string'
        ? user.email.toLowerCase()
        : null

      // Fetch events directly from API - no more cache
      
      // Proceed with network fetch
      if (!background) {
        activeForegroundRequestsRef.current += 1
        setLoading(true)
      } else {
        activeBackgroundRequestsRef.current += 1
        setIsRevalidating(true)
      }

      // Fetch each contiguous month segment with limited concurrency
      const toDateFromMonth = (m, endOf = false) => {
        const yy = parseInt(m.split('-')[0], 10)
        const mm = parseInt(m.split('-')[1], 10) - 1
        if (!endOf) return new Date(yy, mm, 1)
        // end of month (last day 23:59:59.999)
        const d = new Date(yy, mm + 1, 0)
        d.setHours(23, 59, 59, 999)
        return d
      }

      const runSegment = async ([mStart, mEnd]) => {
        const segStart = startOfDay(toDateFromMonth(mStart, false))
        const segEnd = endOfDay(toDateFromMonth(mEnd, true))
        const response = await calendarApi.getEvents(
          segStart.toISOString(),
          segEnd.toISOString(),
          selectedCalendars
        )
        const seriesInfo = new Map()
        for (const event of response.events) {
          if (Array.isArray(event.recurrence) && event.recurrence.length) {
            const rule = event.recurrence[0]
            const startBoundary = parseCalendarBoundary(event.start) || parseCalendarBoundary(event.originalStartTime) || new Date()
            const { state, summary } = describeRecurrence(rule, startBoundary)
            seriesInfo.set(event.id, {
              rule,
              summary,
              meta: state
            })
          }
        }
        const googleEvents = response.events
          .map(event => {
            if (event.status && event.status.toLowerCase() === 'cancelled') {
              return null
            }
            const isAllDay = resolveIsAllDay(event.start, event)
            const start = parseCalendarBoundary(event.start) || new Date(event.start.dateTime || event.start.date)
            const end = parseCalendarBoundary(event.end) || new Date(event.end.dateTime || event.end.date)
            // Extract category color from extended properties if available
            const privateExtendedProps = { ...(event.extendedProperties?.private || {}) }
            const categoryColor = privateExtendedProps.categoryColor
            const todoId = privateExtendedProps.todoId
            const masterInfo = event.recurringEventId ? seriesInfo.get(event.recurringEventId) : null
            const ownInfo = seriesInfo.get(event.id)
            const recurrenceRule = ownInfo?.rule
              || masterInfo?.rule
              || (Array.isArray(event.recurrence) && event.recurrence.length ? event.recurrence[0] : null)
              || privateExtendedProps.recurrenceRule
            const recurrenceMeta = ownInfo?.meta
              || masterInfo?.meta
              || (privateExtendedProps.recurrenceMeta ? safeJsonParse(privateExtendedProps.recurrenceMeta) : null)
            const recurrenceSummary = ownInfo?.summary || masterInfo?.summary || privateExtendedProps.recurrenceSummary || null
            
            const attendeesList = Array.isArray(event.attendees)
              ? event.attendees
              : []
            // Extract participants from attendees
            const participants = attendeesList
              .map(a => a.email)
              .filter(Boolean)
            // Store full attendee objects for status info (normalize responseStatus)
            const attendees = (attendeesList || []).map(attendee => {
              if (!attendee || typeof attendee !== 'object') return null
              return {
                ...attendee,
                responseStatus: normalizeResponseStatus(attendee?.responseStatus)
              }
            }).filter(Boolean)
            const viewerAttendee = attendeesList.find((attendee) => {
              if (attendee?.self) return true
              if (!viewerEmail || !attendee?.email) return false
              return attendee.email.toLowerCase() === viewerEmail
            })
            const viewerResponseStatus = normalizeResponseStatus(viewerAttendee?.responseStatus)
            const viewerIsOrganizer = Boolean(
              viewerEmail &&
              event.organizer?.email &&
              event.organizer.email.toLowerCase() === viewerEmail
            )
            const viewerIsAttendee = Boolean(viewerAttendee)
            const inviteCanRespond = viewerIsAttendee && !viewerIsOrganizer
            const isInvitePending = viewerResponseStatus === 'needsAction'
            const transparency = event.transparency === 'transparent' ? 'transparent' : 'opaque'
            const visibility = event.visibility || 'default'
            const reminders = event.reminders
              ? {
                  ...event.reminders,
                  overrides: Array.isArray(event.reminders.overrides)
                    ? event.reminders.overrides.map((override) => ({ ...override }))
                    : undefined
                }
              : null

            return applyEventTimeOverrides({
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
            })
          })
          .filter(ev => {
            if (!ev) return false
            if (suppressedEventIdsRef.current.has(ev.id)) return false
            if (ev.todoId && suppressedTodoIdsRef.current.has(ev.todoId)) return false
            return true
          })
        const segmentStartMs = segStart.getTime()
        const segmentEndMs = segEnd.getTime()
        const incomingById = new Map()
        googleEvents.forEach(ev => {
          incomingById.set(ev.id, ev)
          if (ev.todoId) {
            const todoKey = String(ev.todoId)
            const eventKey = String(ev.id)
            todoToEventRef.current.set(todoKey, eventKey)
            eventToTodoRef.current.set(eventKey, todoKey)
          }
        })
        const updatedEvents = []
        const newEvents = []
        const reinsertedOptimisticEvents = []
        const now = Date.now()
        const allowDeletions = !background

        setEvents(prev => {
          const next = []
          prev.forEach(ev => {
            const evStartRaw = ev.start instanceof Date ? ev.start : new Date(ev.start)
            const evStart = coerceDate(evStartRaw)
            const evTime = evStart.getTime()
            if (evStart && !Number.isNaN(evTime) && evTime >= segmentStartMs && evTime <= segmentEndMs) {
              const replacement = incomingById.get(ev.id)
              if (replacement) {
                pendingSyncEventIdsRef.current.delete(ev.id)
                const merged = {
                  ...ev,
                  ...replacement,
                  clientKey: ev.clientKey || replacement.clientKey || replacement.id,
                  isPendingSync: false
                }
                next.push(merged)
                updatedEvents.push(merged)
                incomingById.delete(ev.id)
              } else {
                const pendingTimestamp = pendingSyncEventIdsRef.current.get(ev.id)
                let isPendingSync = Boolean(ev.isPendingSync)
                if (typeof pendingTimestamp === 'number') {
                  if (now - pendingTimestamp > RECENT_EVENT_SYNC_TTL_MS) {
                    pendingSyncEventIdsRef.current.delete(ev.id)
                  } else {
                    isPendingSync = true
                  }
                }
                if (ev.isOptimistic || isPendingSync) {
                  const carry = isPendingSync && !ev.isPendingSync ? { ...ev, isPendingSync: true } : ev
                  next.push(carry)
                } else if (allowDeletions && ev.isGoogleEvent) {
                  // For Google events in this time range that are not in the incoming data,
                  // they have likely been deleted, so remove them
                  eventIdsRef.current.delete(ev.id)
                  pendingSyncEventIdsRef.current.delete(ev.id)
                  unlinkEvent(ev.id)
                  removeEventFromAllSnapshots(ev.id)
                  for (const [key, arr] of eventsByDayRef.current.entries()) {
                    const filtered = arr.filter(item => item.id !== ev.id)
                    if (filtered.length !== arr.length) {
                      eventsByDayRef.current.set(key, filtered)
                    }
                  }
                  // Don't add to next - event is deleted
                } else {
                  // Do not aggressively remove existing events just
                  // because they are missing from this segment; keep them.
                  next.push(ev)
                }
              }
            } else {
              next.push(ev)
            }
          })

          incomingById.forEach(ev => {
            pendingSyncEventIdsRef.current.delete(ev.id)
            const normalized = {
              ...ev,
              clientKey: ev.clientKey || ev.id,
              isPendingSync: false
            }
            newEvents.push(normalized)
            next.push(normalized)
          })

          const existingIds = new Set(next.map(event => event.id))
          optimisticEventCacheRef.current.forEach((optEvent) => {
            if (!existingIds.has(optEvent.id)) {
              existingIds.add(optEvent.id)
              next.unshift(optEvent)
              reinsertedOptimisticEvents.push(optEvent)
            }
          })

          return next
        }, { skipDayIndexRebuild: true })

        const toReindex = [...updatedEvents, ...newEvents]
        if (reinsertedOptimisticEvents.length) {
          toReindex.push(...reinsertedOptimisticEvents)
        }
        if (toReindex.length) {
          for (const ev of toReindex) {
            eventIdsRef.current.add(ev.id)
            pendingSyncEventIdsRef.current.delete(ev.id)
            for (const [key, arr] of eventsByDayRef.current.entries()) {
              const filtered = arr.filter(item => item.id !== ev.id)
              if (filtered.length !== arr.length) {
                eventsByDayRef.current.set(key, filtered)
              }
            }
            if (ev.todoId) {
              linkTodoEvent(ev.todoId, ev.id)
            }
            indexEventByDays(ev)
          }

          // Caching removed - events are fetched fresh from DB
        }

        // mark months as loaded
        const segMonths = enumerateMonths(segStart, segEnd)
        for (const m of segMonths) loadedMonthsRef.current.add(m)
        extendLoadedRange(segStart, segEnd)
      }

      // run with small concurrency
      const concurrency = 1
      let index = 0
      const runners = Array.from({ length: Math.min(concurrency, segments.length) }, async () => {
        while (index < segments.length) {
          const myIndex = index++
          try {
            await runSegment(segments[myIndex])
          } catch (e) {
            // ignore; segments may retry later
          }
        }
      })
      await Promise.all(runners)

      if (!hasLoadedInitialRef.current) {
        hasLoadedInitialRef.current = true
        setInitialLoading(false)
      }
      
      // Save events to localStorage cache for instant load on next refresh
      // Use setTimeout to avoid blocking the UI
      setTimeout(() => {
        setEvents(currentEvents => {
          saveEventsToCache(user?.id, currentEvents)
          return currentEvents
        })
      }, 100)
    } catch (error) {
      console.error('Failed to fetch events for range:', error)
      if (!hasLoadedInitialRef.current) {
        setInitialLoading(false)
      }
      throw error
    } finally {
      // clear in-flight month flags
      for (const m of missingMonths) inFlightMonthsRef.current.delete(m)
      if (!background) {
        activeForegroundRequestsRef.current = Math.max(0, activeForegroundRequestsRef.current - 1)
        if (activeForegroundRequestsRef.current === 0) {
          setLoading(false)
        }
      } else {
        activeBackgroundRequestsRef.current = Math.max(0, activeBackgroundRequestsRef.current - 1)
        if (activeBackgroundRequestsRef.current === 0) {
          setIsRevalidating(false)
        }
      }
    }
  }, [user, selectedCalendars, extendLoadedRange, linkTodoEvent, applyEventTimeOverrides])

  const dateKey = useCallback((d) => {
    const y = d.getFullYear()
    const m = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${day}`
  }, [])

  const rebuildEventsByDayIndex = useCallback((eventList) => {
    const next = new Map()

    for (const ev of eventList) {
      if (!ev || !ev.id) continue
      if (suppressedEventIdsRef.current.has(ev.id)) continue
      const todoKey = ev.todoId ? String(ev.todoId) : null
      if (todoKey && suppressedTodoIdsRef.current.has(todoKey)) continue

      const startValue = coerceDate(ev.start)
      const endValue = coerceDate(ev.end)
      if (!startValue || !endValue) continue

      let cursor = startOfDay(new Date(startValue))
      let last = startOfDay(new Date(endValue))

      if (ev.isAllDay) {
        last = addDays(last, -1)
      }

      if (last < cursor) {
        last = cursor
      }

      for (let day = new Date(cursor); day <= last; day = addDays(day, 1)) {
        const key = dateKey(day)
        const arr = next.get(key) || []
        arr.push(ev)
        next.set(key, arr)
      }
    }

    next.forEach((arr, key) => {
      arr.sort((a, b) => {
        const weight = (event) => {
          if (event.isOptimistic) return -2
          if (event.isPendingSync) return -1
          return 0
        }
        const weightDiff = weight(a) - weight(b)
        if (weightDiff !== 0) return weightDiff

        const aStart = coerceDate(a.start)?.getTime() ?? 0
        const bStart = coerceDate(b.start)?.getTime() ?? 0
        if (aStart !== bStart) return aStart - bStart

        return (a.title || '').localeCompare(b.title || '')
      })
      next.set(key, arr)
    })

    eventsByDayRef.current = next
  }, [dateKey])

  const indexEventByDays = useCallback((ev) => {
    const startValue = coerceDate(ev.start)
    const endValue = coerceDate(ev.end)
    if (!startValue || !endValue) return

    let s = startOfDay(new Date(startValue))
    let e = startOfDay(new Date(endValue))

    if (ev.isAllDay) {
      e = addDays(e, -1)
    }

    if (e < s) e = s
    for (let d = new Date(s); d <= e; d = addDays(d, 1)) {
      const key = dateKey(d)
      const arr = eventsByDayRef.current.get(key) || []
      if (!arr.some(item => item.id === ev.id)) {
        // Place optimistic, just-created events at the front so they are visible
        if (ev.isOptimistic) {
          arr.unshift(ev)
        } else {
          arr.push(ev)
        }
        eventsByDayRef.current.set(key, arr)
      }
    }
  }, [dateKey])

  const clearOptimisticRecurrenceInstances = useCallback((parentId) => {
    if (!parentId) return
    const ids = optimisticRecurrenceMapRef.current.get(parentId)
    if (!ids || !ids.length) return
    optimisticRecurrenceMapRef.current.delete(parentId)
    setEvents(prev => prev.filter(event => !ids.includes(event.id)), { skipDayIndexRebuild: true })
    ids.forEach((id) => {
      eventIdsRef.current.delete(id)
      pendingSyncEventIdsRef.current.delete(id)
      removeEventFromAllSnapshots(id)
    })
    for (const [key, arr] of eventsByDayRef.current.entries()) {
      const filtered = arr.filter(event => !ids.includes(event.id))
      if (filtered.length !== arr.length) {
        eventsByDayRef.current.set(key, filtered)
      }
    }
  }, [removeEventFromAllSnapshots])

  const addOptimisticRecurrenceInstances = useCallback((parentEvent, recurrenceMetaInput, rangeOverride = null) => {
    if (!parentEvent) return
    let recurrenceMeta = recurrenceMetaInput
    if (!recurrenceMeta?.enabled && parentEvent.recurrenceRule) {
      recurrenceMeta = parseRecurrenceRule(parentEvent.recurrenceRule, parentEvent.start)
    }
    if (!recurrenceMeta?.enabled) return
    const targetRange = rangeOverride || getVisibleRange(currentDate, view)
    if (!targetRange?.start || !targetRange?.end) return
    const occurrences = expandRecurrenceInstances(
      parentEvent,
      recurrenceMeta,
      targetRange.start,
      targetRange.end,
      400
    )
    if (!occurrences.length) return
    const baseStart = coerceDate(parentEvent.start)
    if (!baseStart) return
    const clones = []
    occurrences.forEach((occurrence) => {
      if (Math.abs(occurrence.start.getTime() - baseStart.getTime()) < 60000) {
        return
      }
      const cloneId = `temp-rec-${parentEvent.id}-${occurrence.start.getTime()}`
      clones.push({
        ...parentEvent,
        id: cloneId,
        clientKey: cloneId,
        start: occurrence.start,
        end: occurrence.end,
        isOptimisticRecurrence: true,
        isOptimistic: true,
        parentRecurrenceId: parentEvent.id
      })
    })
    if (!clones.length) return
    const existing = optimisticRecurrenceMapRef.current.get(parentEvent.id) || []
    optimisticRecurrenceMapRef.current.set(parentEvent.id, [...existing, ...clones.map(clone => clone.id)])
    setEvents(prev => [...prev, ...clones], { skipDayIndexRebuild: true })
    clones.forEach((clone) => {
      eventIdsRef.current.add(clone.id)
      indexEventByDays(clone)
      saveSnapshotsForAllViews(clone)
    })
  }, [currentDate, view, getVisibleRange, indexEventByDays, saveSnapshotsForAllViews])

  const revertEventState = useCallback((snapshot) => {
    if (!snapshot?.id) return

    setEvents(prev => prev.map(event => event.id === snapshot.id ? { ...snapshot } : event), { skipDayIndexRebuild: true })

    for (const [key, arr] of eventsByDayRef.current.entries()) {
      const filtered = arr.filter(event => event.id !== snapshot.id)
      if (filtered.length !== arr.length) {
        eventsByDayRef.current.set(key, filtered)
      }
    }
    indexEventByDays(snapshot)
    saveSnapshotsForAllViews(snapshot)
  }, [indexEventByDays, saveSnapshotsForAllViews])

  useEffect(() => {
    if (!Array.isArray(events) || events.length === 0) {
      rebuildEventsByDayIndex([])
      skipNextDayIndexRebuildRef.current = false
      return
    }
    const seen = new Set()
    const deduped = []
    let hadDuplicates = false
    for (const ev of events) {
      if (!ev || !ev.id) continue
      if (seen.has(ev.id)) {
        hadDuplicates = true
        continue
      }
      seen.add(ev.id)
      deduped.push(ev)
    }
    if (hadDuplicates) {
      skipNextDayIndexRebuildRef.current = false
      setEvents(deduped)
      return
    }
    if (skipNextDayIndexRebuildRef.current) {
      skipNextDayIndexRebuildRef.current = false
      return
    }
    rebuildEventsByDayIndex(deduped)
  }, [events, rebuildEventsByDayIndex, setEvents])

  useEffect(() => {
    const ids = new Set()
    for (const ev of events) {
      if (ev && ev.id) {
        ids.add(ev.id)
      }
    }
    eventIdsRef.current = ids
  }, [events])

  const buildBufferedRange = useCallback((start, end, pastMonths = INITIAL_PAST_MONTHS, futureMonths = INITIAL_FUTURE_MONTHS) => {
    if (!(start instanceof Date) || !(end instanceof Date)) {
      return null
    }
    const bufferedStart = startOfDay(startOfMonth(subMonths(start, pastMonths)))
    const bufferedEnd = endOfDay(endOfMonth(addMonths(end, futureMonths)))
    return { start: bufferedStart, end: bufferedEnd }
  }, [])

  const prefetchRange = useCallback((start, end) => {
    if (!(start instanceof Date) || !(end instanceof Date)) {
      return
    }

    const rangeStart = startOfDay(start)
    const rangeEnd = endOfDay(end)

    if (rangeEnd <= rangeStart) {
      return
    }

    // Check if already loaded
    if (
      loadedRangeRef.current &&
      loadedRangeRef.current.start <= rangeStart &&
      loadedRangeRef.current.end >= rangeEnd
    ) {
      return
    }

    // Check if already prefetched or in-flight
    const key = `${rangeStart.getTime()}_${rangeEnd.getTime()}`
    if (prefetchedRangesRef.current.has(key)) {
      return
    }
    
    // Check if any months in this range are already in-flight
    const months = enumerateMonths(rangeStart, rangeEnd)
    const hasInFlightMonths = months.some(m => inFlightMonthsRef.current.has(m))
    if (hasInFlightMonths) {
      return
    }

    prefetchedRangesRef.current.add(key)
    fetchEventsForRange(rangeStart, rangeEnd, true)
      .catch(() => {
        prefetchedRangesRef.current.delete(key)
      })
  }, [fetchEventsForRange])

  const prefetchAdjacentRanges = useCallback((range) => {
    if (!range) return

    const extended = buildBufferedRange(
      range.start,
      range.end,
      INITIAL_PAST_MONTHS + EXPANSION_MONTHS,
      INITIAL_FUTURE_MONTHS + EXPANSION_MONTHS
    )

    if (!extended) return

    if (extended.start < range.start) {
      const pastEnd = addDays(range.start, -1)
      if (pastEnd > extended.start) {
        prefetchRange(extended.start, pastEnd)
      }
    }

    if (extended.end > range.end) {
      const futureStart = addDays(range.end, 1)
      if (extended.end > futureStart) {
        prefetchRange(futureStart, extended.end)
      }
    }
  }, [buildBufferedRange, prefetchRange])

  const lastEnsureRangeRef = useRef({ start: null, end: null })
  const ensureRangeCooldownRef = useRef(0)
  const ENSURE_RANGE_COOLDOWN_MS = 10000 // 10 seconds cooldown

  const ensureRangeLoaded = useCallback(async (visibleStart, visibleEnd, background = false, force = false) => {
    if (!(visibleStart instanceof Date) || !(visibleEnd instanceof Date)) {
      return
    }

    const visibleRange = {
      start: startOfDay(visibleStart),
      end: endOfDay(visibleEnd)
    }

    // Skip if same range was just loaded recently (unless forced)
    const now = Date.now()
    const rangeKey = `${visibleRange.start.getTime()}_${visibleRange.end.getTime()}`
    const lastKey = `${lastEnsureRangeRef.current.start}_${lastEnsureRangeRef.current.end}`
    
    if (!force && rangeKey === lastKey && (now - ensureRangeCooldownRef.current) < ENSURE_RANGE_COOLDOWN_MS) {
      return
    }

    const targetRange = buildBufferedRange(visibleStart, visibleEnd)
    if (!targetRange) return

    if (!loadedRangeRef.current || force) {
      loadedRangeRef.current = null
    }

    let currentRange = loadedRangeRef.current
    if (!currentRange) {
      await fetchEventsForRange(targetRange.start, targetRange.end, background, true)
      currentRange = loadedRangeRef.current
      lastEnsureRangeRef.current = { start: visibleRange.start.getTime(), end: visibleRange.end.getTime() }
      ensureRangeCooldownRef.current = now
    }

    if (!currentRange) {
      return
    }

    if (targetRange.start < currentRange.start) {
      const fetchEnd = addDays(currentRange.start, -1)
      if (fetchEnd > targetRange.start) {
        await fetchEventsForRange(targetRange.start, fetchEnd, background)
        currentRange = loadedRangeRef.current
      }
    }

    if (targetRange.end > currentRange.end) {
      const fetchStart = addDays(currentRange.end, 1)
      if (targetRange.end > fetchStart) {
        await fetchEventsForRange(fetchStart, targetRange.end, background)
        currentRange = loadedRangeRef.current
      }
    }

    // Disabled automatic prefetching - only fetch on user scroll/action
    // prefetchAdjacentRanges(targetRange)
  }, [buildBufferedRange, fetchEventsForRange, prefetchAdjacentRanges])

  const lastFetchGoogleEventsRef = useRef({ start: null, end: null, time: 0 })
  const FETCH_GOOGLE_EVENTS_COOLDOWN_MS = 5000 // 5 seconds cooldown

  const fetchGoogleEvents = useCallback(async (background = false, reset = false, forceRefresh = false) => {
    const { start, end } = getVisibleRange(currentDate, view)
    const rangeKey = `${start.getTime()}_${end.getTime()}`
    const now = Date.now()
    
    // Skip if same range was just fetched recently (unless reset, forceRefresh, or initial load)
    if (!reset && !forceRefresh && hasLoadedInitialRef.current && background) {
      const lastKey = `${lastFetchGoogleEventsRef.current.start}_${lastFetchGoogleEventsRef.current.end}`
      if (rangeKey === lastKey && (now - lastFetchGoogleEventsRef.current.time) < FETCH_GOOGLE_EVENTS_COOLDOWN_MS) {
        return
      }
    }

    // If we've already loaded once and not resetting/forcing, skip re-fetching
    if (!reset && !forceRefresh && hasLoadedInitialRef.current) {
      return
    }

    if (reset) {
      loadedRangeRef.current = null
      prefetchedRangesRef.current.clear()
      eventsByDayRef.current = new Map()
      eventIdsRef.current = new Set()
      pendingSyncEventIdsRef.current = new Map()
      todoToEventRef.current = new Map()
      eventToTodoRef.current = new Map()
      persistEventTodoLinks()
      activeForegroundRequestsRef.current = 0
      activeBackgroundRequestsRef.current = 0
      hasLoadedInitialRef.current = false
      setInitialLoading(true)
      setLoading(false)
      setIsRevalidating(false)
      setEvents(prev => prev.filter(event => !event.isGoogleEvent))
      try {
        const resetKey = snapshotKey(start, end)
        if (resetKey) {
          window.sessionStorage.removeItem(resetKey)
        }
      } catch (_) {}
    }

    const isInitialLoad = !hasLoadedInitialRef.current
    
    // On initial load, fetch a wide range (5 years back + 5 years forward) for instant scrolling
    const wideStart = startOfMonth(addMonths(currentDate, -3))
    wideStart.setHours(0, 0, 0, 0)
    
    const wideEnd = endOfMonth(addMonths(currentDate, 3))
    wideEnd.setHours(23, 59, 59, 999)

    try {
      if (isInitialLoad) {
        // Initial load: fetch wide range for smooth scrolling
        await fetchEventsForRange(wideStart, wideEnd, background, true)
        loadedRangeRef.current = { start: wideStart, end: wideEnd }
        hasLoadedInitialRef.current = true
        setInitialLoading(false)
      } else if (reset) {
        // Refresh: only re-fetch visible range + some buffer (fast!)
        const bufferStart = new Date(start)
        bufferStart.setMonth(bufferStart.getMonth() - 2)
        const bufferEnd = new Date(end)
        bufferEnd.setMonth(bufferEnd.getMonth() + 2)
        await fetchEventsForRange(bufferStart, bufferEnd, background, true)
        hasLoadedInitialRef.current = true
        setInitialLoading(false)
      } else if (forceRefresh) {
        // Background refresh after sync - just refresh the already loaded range
        const currentRange = loadedRangeRef.current
        if (currentRange) {
          await fetchEventsForRange(currentRange.start, currentRange.end, true, true)
        }
      } else {
        await ensureRangeLoaded(start, end, background, reset)
      }
      
      lastFetchGoogleEventsRef.current = { start: start.getTime(), end: end.getTime(), time: now }
      
      if (typeof window !== 'undefined') {
        const todoIds = Array.from(todoToEventRef.current.keys())
        window.dispatchEvent(new CustomEvent('calendarTodoEventsSynced', {
          detail: { todoIds }
        }))
      }
    } catch (error) {
      if (!background) {
        console.error('Failed to load calendar events:', error)
      }
    }
  }, [
    currentDate,
    view,
    getVisibleRange,
    ensureRangeLoaded,
    fetchEventsForRange,
    hydrateFromSnapshot,
    persistEventTodoLinks
  ])

  const fetchGoogleEventsRef = useRef(fetchGoogleEvents)
  useEffect(() => {
    fetchGoogleEventsRef.current = fetchGoogleEvents
  }, [fetchGoogleEvents])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      hasBootstrappedRef.current = false
      suppressUserStatePersistRef.current = true
      clearEventsCache()
      return
    }
    if (!user.has_google_credentials) {
      suppressUserStatePersistRef.current = true
      return
    }
    if (hasBootstrappedRef.current) return
    hasBootstrappedRef.current = true
    
    // Bootstrap: Load cache, sync with Google, then fetch fresh data
    const bootstrap = async () => {
      const cacheVersionKey = 'chronos:cache-version'
      const storedVersion = localStorage.getItem(cacheVersionKey)
      if (storedVersion !== String(SNAPSHOT_VERSION)) {
        await clearEventsCache()
        clearAllSnapshots()
        localStorage.setItem(cacheVersionKey, String(SNAPSHOT_VERSION))
      }
      
      const cachedEvents = await loadEventsFromCache(user.id)
      
      // Show cached events immediately for instant UX
      if (cachedEvents && cachedEvents.length > 0) {
        setEvents(cachedEvents)
        for (const e of cachedEvents) {
          eventIdsRef.current.add(e.id)
          indexEventByDays(e)
        }
        hasLoadedInitialRef.current = true
        setInitialLoading(false)
      }
      
      hydrateFromSnapshot()
      
      // Fetch events first for fast initial render
      loadedMonthsRef.current.clear()
      hasLoadedInitialRef.current = false
      await fetchGoogleEventsRef.current(true, false)
      
      // Then hydrate user state (checked off, overrides) AFTER events are loaded
      await hydrateEventUserState()
      await hydrateEventTodoLinks()
      
      // Now enable persist - only user actions after this point will trigger saves
      suppressUserStatePersistRef.current = false
      
      // Run migrations in background (non-blocking)
      migrateLocalStorageToDB()
      checkAndRunBackfill()
      
      // Sync with Google Calendar in background, then refresh
      const syncKey = 'chronos:last-sync-ts'
      let lastSync = lastSyncTimestampRef.current || 0
      if (!lastSync && typeof window !== 'undefined') {
        const raw = window.sessionStorage.getItem(syncKey)
        lastSync = raw ? Number(raw) || 0 : 0
      }
      const nowTs = Date.now()
      const shouldSync = nowTs - lastSync > 5 * 60 * 1000
      if (shouldSync) {
        lastSyncTimestampRef.current = nowTs
        if (typeof window !== 'undefined') {
          try { window.sessionStorage.setItem(syncKey, String(nowTs)) } catch (_) {}
        }
        calendarApi.syncCalendar()
          .then(() => {
            // Background refresh without reset - just update existing data
            // Use forceRefresh=true to bypass the "already loaded" check
            fetchGoogleEventsRef.current(true, false, true).catch(() => {})
          })
          .catch(() => {})
      }
    }
    bootstrap()
  }, [authLoading, user?.id, user?.has_google_credentials, hydrateFromSnapshot, migrateLocalStorageToDB, checkAndRunBackfill, hydrateEventUserState, hydrateEventTodoLinks, indexEventByDays])

  // Persist a tiny snapshot of the visible window in sessionStorage for instant rehydration
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (initialLoading) return
    const { start, end } = getVisibleRange(currentDate, view)
    const max = 1200 // cap snapshot size
    const list = []
    // Collect events within range; traverse day index for speed
    const cursor = new Date(start)
    while (cursor <= end && list.length < max) {
      const key = dateKey(cursor)
      const dayEvents = eventsByDayRef.current.get(key) || []
      for (const ev of dayEvents) {
        // ensure unique id in snapshot
        if (!list.some(x => x.id === ev.id)) {
          const startIso = safeToISOString(ev.start)
          const endIso = safeToISOString(ev.end)
          if (!startIso || !endIso) {
            continue
          }
          list.push({
            id: ev.id,
            title: ev.title,
            description: ev.description || null,
            start: startIso,
            end: endIso,
            color: ev.color,
            calendar_id: ev.calendar_id,
            todoId: ev.todoId,
            isAllDay: Boolean(ev.isAllDay),
            location: ev.location || '',
            participants: ev.participants || [],
            attendees: ev.attendees || [],
            isOptimistic: Boolean(ev.isOptimistic),
            isPendingSync: Boolean(ev.isPendingSync),
            organizerEmail: ev.organizerEmail || null,
            viewerIsOrganizer: Boolean(ev.viewerIsOrganizer),
            viewerIsAttendee: Boolean(ev.viewerIsAttendee),
            viewerResponseStatus: ev.viewerResponseStatus || null
          })
          if (list.length >= max) break
        }
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    if (snapshotSaveTimerRef.current) clearTimeout(snapshotSaveTimerRef.current)
    snapshotSaveTimerRef.current = setTimeout(() => {
      try {
        const key = snapshotKey(start, end)
        window.sessionStorage.setItem(key, JSON.stringify({ events: list }))
      } catch (_) {}
    }, 200) // debounce
  }, [currentDate, view, initialLoading, events, getVisibleRange, dateKey, snapshotKey])

  const refreshEvents = useCallback(async () => {
    if (!user || !user.has_google_credentials) return
    setIsRevalidating(true)
    try {
      // Wait for sync to complete before fetching
      await calendarApi.syncCalendar()
      console.log('Sync completed, fetching fresh events...')
    } catch (e) {
      console.log('Sync failed, fetching from DB anyway...')
    }
    // Force re-fetch with reset=true
    await fetchGoogleEventsRef.current(false, true)
    setIsRevalidating(false)
  }, [user])

  const lastFetchParamsRef = useRef({ date: null, view: null })
  
  useEffect(() => {
    if (!user || !user.has_google_credentials) return
    // Skip if bootstrap hasn't completed yet - bootstrap handles initial fetch
    if (!hasLoadedInitialRef.current) return
    
    const currentDateKey = currentDate?.getTime()
    const lastDateKey = lastFetchParamsRef.current.date
    const lastView = lastFetchParamsRef.current.view
    
    // Only fetch if date or view actually changed
    if (currentDateKey === lastDateKey && view === lastView) {
      return
    }
    
    lastFetchParamsRef.current = { date: currentDateKey, view }
    
    // Only fetch when user explicitly navigates (date/view change)
    // This is user-initiated, so fetch immediately
    fetchGoogleEventsRef.current(false)
  }, [user?.id, currentDate, view])

  // Persist a tiny snapshot of the visible window in sessionStorage for instant rehydration

  // Listen for todo conversion events and add event immediately (optimistic update)
  useEffect(() => {
    const handleTodoConverted = (e) => {
      const eventData = e.detail?.eventData
      const isOptimistic = e.detail?.isOptimistic
      const replaceId = e.detail?.replaceId
      const todoId = e.detail?.todoId || eventData?.todoId
     
      if (eventData) {
        // Create the event in the same format as Google Calendar events
        const isAllDay = resolveIsAllDay(eventData.start, eventData)
        const startBound = coerceDate(eventData.start?.dateTime || eventData.start)
        const endBound = coerceDate(eventData.end?.dateTime || eventData.end)
        if (!startBound) {
          return
        }
        const safeEndBound = endBound && endBound > startBound ? endBound : new Date(startBound.getTime() + 30 * 60 * 1000)
        const newEvent = {
          id: eventData.id,
          title: eventData.title || eventData.summary || 'Untitled',
          start: startBound,
          end: safeEndBound,
          color: eventData.color || 'blue',
          isGoogleEvent: true,
          calendar_id: eventData.calendar_id || 'primary',
          isOptimistic: isOptimistic || false,
          isAllDay,
          transparency: eventData.transparency === 'transparent' ? 'transparent' : 'opaque',
          visibility: eventData.visibility || 'public'
          // Don't store todoId - each event is independent
        }

        // If the optimistic event was already moved locally, carry that timing forward
        if (replaceId) {
          const existingEvent = eventsRefValue.current.find(ev => String(ev.id) === String(replaceId))
          const override = eventOverridesRef.current.get(String(replaceId))
          const existingStart = coerceDate(existingEvent?.start)
          const existingEnd = coerceDate(existingEvent?.end)
          if (existingStart && existingEnd) {
            newEvent.start = existingStart
            newEvent.end = existingEnd
          }
          if (override && newEvent.id) {
            eventOverridesRef.current.set(String(newEvent.id), { ...override })
            eventOverridesRef.current.delete(String(replaceId))
            queuePersistEventOverrides()
          }
        }

        if (todoId && isOptimistic) {
          suppressedTodoIdsRef.current.delete(String(todoId))
        }

        if (replaceId) {
          if (todoId && suppressedTodoIdsRef.current.has(String(todoId)) && !isOptimistic) {
            suppressedEventIdsRef.current.add(newEvent.id)
            const calendarIdForCleanup = newEvent.calendar_id || 'primary'
            calendarApi.deleteEvent(newEvent.id, calendarIdForCleanup).catch(() => {})
            return
          }
          if (suppressedEventIdsRef.current.has(replaceId)) {
            suppressedEventIdsRef.current.delete(replaceId)
            if (!isOptimistic) {
              const calendarIdForCleanup = newEvent.calendar_id || 'primary'
              suppressedEventIdsRef.current.add(newEvent.id)
              calendarApi.deleteEvent(newEvent.id, calendarIdForCleanup)
                .catch(() => {})
                .finally(() => suppressedEventIdsRef.current.delete(newEvent.id))
            }
            return
          }

          // Replace optimistic event with real one
          setEvents(prev => {
            const filtered = prev.filter(e => e.id !== replaceId)
            if (!eventIdsRef.current.has(newEvent.id)) {
              eventIdsRef.current.delete(replaceId)
              eventIdsRef.current.add(newEvent.id)
              if (todoId) {
                unlinkEvent(replaceId)
                linkTodoEvent(todoId, newEvent.id)
              } else {
                unlinkEvent(replaceId)
              }
              
              // Remove old event from day index
              for (const [key, arr] of eventsByDayRef.current.entries()) {
                const filteredArr = arr.filter(e => e.id !== replaceId)
                if (filteredArr.length !== arr.length) {
                  eventsByDayRef.current.set(key, filteredArr)
                }
              }
              
              indexEventByDays(newEvent)
              suppressedEventIdsRef.current.delete(newEvent.id)
              return [...filtered, newEvent]
            }
            return prev
          }, { skipDayIndexRebuild: true })
        } else {
          if (todoId && suppressedTodoIdsRef.current.has(String(todoId)) && !isOptimistic) {
            suppressedEventIdsRef.current.add(newEvent.id)
            const calendarIdForCleanup = newEvent.calendar_id || 'primary'
            calendarApi.deleteEvent(newEvent.id, calendarIdForCleanup).catch(() => {})
            return
          }
          if (suppressedEventIdsRef.current.has(newEvent.id)) {
            suppressedEventIdsRef.current.delete(newEvent.id)
            if (!isOptimistic) {
              const calendarIdForCleanup = newEvent.calendar_id || 'primary'
              suppressedEventIdsRef.current.add(newEvent.id)
              calendarApi.deleteEvent(newEvent.id, calendarIdForCleanup)
                .catch(() => {})
                .finally(() => suppressedEventIdsRef.current.delete(newEvent.id))
            }
            return
          }
          // Add new event (optimistic or real)
          if (!eventIdsRef.current.has(newEvent.id)) {
            setEvents(prev => [...prev, newEvent], { skipDayIndexRebuild: true })
            eventIdsRef.current.add(newEvent.id)
            if (todoId) {
              linkTodoEvent(todoId, newEvent.id)
            }
            indexEventByDays(newEvent)
            suppressedEventIdsRef.current.delete(newEvent.id)
          }
        }
      }
      
      // No automatic background refresh; rely on manual refresh or scroll.
    }
    
    const handleTodoConversionFailed = (e) => {
      const eventId = e.detail?.eventId
      if (eventId) {
        // Remove the optimistic event
        setEvents(prev => prev.filter(ev => ev.id !== eventId), { skipDayIndexRebuild: true })
        eventIdsRef.current.delete(eventId)
        unlinkEvent(eventId)
        
        // Remove from day index
        for (const [key, arr] of eventsByDayRef.current.entries()) {
          const filtered = arr.filter(ev => ev.id !== eventId)
          if (filtered.length !== arr.length) {
            eventsByDayRef.current.set(key, filtered)
          }
        }
      }
    }
    
    window.addEventListener('todoConvertedToEvent', handleTodoConverted)
    window.addEventListener('todoConversionFailed', handleTodoConversionFailed)
    return () => {
      window.removeEventListener('todoConvertedToEvent', handleTodoConverted)
      window.removeEventListener('todoConversionFailed', handleTodoConversionFailed)
    }
  }, [linkTodoEvent, unlinkEvent])

  // Disabled automatic idle prefetching - only fetch on user scroll/action
  // useEffect(() => {
  //   ... idle prefetch logic disabled ...
  // }, [])

  // Fallback: do not block the entire app on network; show the shell quickly
  useEffect(() => {
    if (!initialLoading) return
    const timer = setTimeout(() => {
      setInitialLoading(false)
    }, 800) // after 800ms, render UI even if events still loading
    return () => clearTimeout(timer)
  }, [initialLoading])

  const navigateToToday = useCallback(() => {
    setCurrentDate(new Date())
  }, [])

  const navigateToPrevious = useCallback(() => {
    setCurrentDate(date => {
      if (view === 'month') return addMonths(date, -1)
      if (view === 'week') return addWeeks(date, -1)
      return addDays(date, -1)
    })
  }, [view])

  const navigateToNext = useCallback(() => {
    setCurrentDate(date => {
      if (view === 'month') return addMonths(date, 1)
      if (view === 'week') return addWeeks(date, 1)
      return addDays(date, 1)
    })
  }, [view])

  const persistView = (next) => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(VIEW_STORAGE_KEY, next) } catch (_) {}
    }
  }

  const changeView = useCallback((newView) => {
    const next = (newView === 'day' || newView === 'week' || newView === 'month') ? newView : 'month'
    setView(next)
    persistView(next)
  }, [])

  const selectDate = useCallback((date) => {
    setCurrentDate(date)
    changeView('day')
  }, [])

  useEffect(() => {
    persistView(view)
  }, [view])

  const getEventsForDate = useCallback((date) => {
    const key = dateKey(startOfDay(date))
    const list = eventsByDayRef.current.get(key) || []
    if (!list.length) return list

    const filtered = list.filter(ev => {
      if (!ev || !ev.id) return false
      if (suppressedEventIdsRef.current.has(ev.id)) return false
      if (ev.todoId && suppressedTodoIdsRef.current.has(String(ev.todoId))) return false
      return true
    })

    // Sort by priority then time so month view stays chronological
    return filtered.sort((a, b) => {
      const weight = (event) => {
        if (event.isOptimistic) return -2
        if (event.isPendingSync) return -1
        return 0
      }
      const weightDiff = weight(a) - weight(b)
      if (weightDiff !== 0) return weightDiff

      const aIsAllDay = eventBehavesLikeAllDay(a)
      const bIsAllDay = eventBehavesLikeAllDay(b)
      if (aIsAllDay !== bIsAllDay) {
        return aIsAllDay ? -1 : 1
      }

      const aStart = coerceDate(a.start)?.getTime() ?? 0
      const bStart = coerceDate(b.start)?.getTime() ?? 0
      if (aStart !== bStart) return aStart - bStart

      return (a.title || '').localeCompare(b.title || '')
    })
  }, [dateKey])

  const createEvent = useCallback(async (eventData) => {
    // Ensure dates are proper Date objects
    let start = coerceDate(eventData.start)
    let end = coerceDate(eventData.end)

    if (!start) {
      start = new Date()
    }
    if (!end || end <= start) {
      end = new Date(start.getTime() + 30 * 60 * 1000)
    }
    const isAllDay =
      typeof eventData.isAllDay === 'boolean'
        ? eventData.isAllDay
        : false

    const recurrenceArray = Array.isArray(eventData.recurrence) && eventData.recurrence.length
      ? eventData.recurrence
      : (eventData.recurrenceRule ? [eventData.recurrenceRule] : undefined)

    const targetCalendarId = eventData.calendar_id || eventData.calendarId || 'primary'

    const processedData = {
      ...eventData,
      start,
      end,
      color: eventData.color || 'blue',
      reminders: eventData.reminders || null,
      isAllDay,
      transparency: eventData.transparency === 'transparent' ? 'transparent' : 'opaque',
      visibility: eventData.visibility || 'public',
      calendar_id: targetCalendarId
    }

    if (recurrenceArray) {
      processedData.recurrence = recurrenceArray
    } else {
      delete processedData.recurrence
    }
    if (eventData.recurrenceRule) {
      processedData.recurrenceRule = eventData.recurrenceRule
    }
    if (eventData.recurrenceSummary) {
      processedData.recurrenceSummary = eventData.recurrenceSummary
    }
    if (eventData.recurrenceMeta) {
      processedData.recurrenceMeta = eventData.recurrenceMeta
    } else if (recurrenceArray && recurrenceArray.length) {
      // Ensure we have meta/summary for optimistic expansion even if the caller didn't pass it
      const { state, summary } = describeRecurrence(recurrenceArray[0], start)
      processedData.recurrenceMeta = state
      if (!processedData.recurrenceSummary) {
        processedData.recurrenceSummary = summary
      }
    }

    const clientKey = uuidv4()
    const newEvent = {
      id: clientKey,
      clientKey,
      ...processedData,
      organizerEmail: user?.email || null,
      viewerResponseStatus: 'accepted',
      viewerIsOrganizer: true,
      viewerIsAttendee: false,
      inviteCanRespond: false,
      isInvitePending: false,
      isOptimistic: true,
      transparency: processedData.transparency,
      visibility: processedData.visibility
    }

    // Index and update refs BEFORE state update so UI sees it immediately
    optimisticEventCacheRef.current.set(newEvent.id, newEvent)
    eventIdsRef.current.add(newEvent.id)
    indexEventByDays(newEvent)
    
    // Now update state - React will re-render and event will already be in eventsByDayRef
    setEvents(prev => [...prev, newEvent], { skipDayIndexRebuild: true })
    
    // Save to IndexedDB cache immediately
    addEventToCache(user?.id, { ...newEvent, isGoogleEvent: true }).catch(() => {})
    
    // Force immediate snapshot save for all views
    saveSnapshotsForAllViews(newEvent)
    if (processedData.recurrenceMeta?.enabled) {
      const rangeOverride = loadedRangeRef.current
        ? { start: loadedRangeRef.current.start, end: loadedRangeRef.current.end }
        : null
      addOptimisticRecurrenceInstances(newEvent, processedData.recurrenceMeta, rangeOverride)
    }
    
    try {
      const calendarId = processedData.calendar_id || processedData.calendarId || 'primary'
      const sendNotifications = processedData.sendNotifications || false
      const response = await calendarApi.createEvent(processedData, calendarId, sendNotifications)
      const created = response?.event || response

      const createdStart = coerceDate(created?.start?.dateTime || created?.start?.date || created?.start) || start
      const createdEndRaw = coerceDate(created?.end?.dateTime || created?.end?.date || created?.end)
      const createdEnd = createdEndRaw && createdEndRaw > createdStart
        ? createdEndRaw
        : new Date(createdStart.getTime() + 30 * 60 * 1000)

      const createdColor =
        created?.extendedProperties?.private?.categoryColor ||
        created?.color ||
        processedData.color ||
        'blue'

      const normalizedEvent = {
        id: created?.id || newEvent.id,
        clientKey: newEvent.clientKey || newEvent.id,
        title: created?.summary || created?.title || processedData.title || 'New Event',
        description: created?.description || processedData.description || null,
        start: createdStart,
        end: createdEnd,
        color: createdColor,
        isAllDay: resolveIsAllDay(created?.start, created) || processedData.isAllDay,
        calendar_id: created?.organizer?.email || created?.calendar_id || calendarId,
        isOptimistic: false,
        location: resolveEventMeetingLocation(created, processedData.location),
        participants: processedData.participants,
        todoId: processedData.todoId || processedData.todo_id || undefined,
        reminders: created?.reminders || processedData.reminders || null,
        recurrenceRule: Array.isArray(created?.recurrence) && created.recurrence.length
          ? created.recurrence[0]
          : processedData.recurrenceRule || null,
        recurrenceSummary: created?.extendedProperties?.private?.recurrenceSummary
          || processedData.recurrenceSummary
          || null,
        recurrenceMeta: safeJsonParse(
          created?.extendedProperties?.private?.recurrenceMeta,
          processedData.recurrenceMeta || null
        ),
        recurringEventId: created?.recurringEventId || null,
        organizerEmail: created?.organizer?.email || user?.email || null,
        viewerResponseStatus: 'accepted',
        viewerIsOrganizer: true,
        viewerIsAttendee: false,
        inviteCanRespond: false,
        isInvitePending: false,
        transparency: created?.transparency || processedData.transparency || 'opaque',
        visibility: created?.visibility || processedData.visibility || 'public'
      }

      optimisticEventCacheRef.current.delete(newEvent.id)
      migrateOptimisticRecurrenceParentId(newEvent.id, normalizedEvent.id)

      if (!eventIdsRef.current.has(newEvent.id)) {
        suppressedEventIdsRef.current.add(normalizedEvent.id)
        if (normalizedEvent.todoId) {
          suppressedTodoIdsRef.current.add(String(normalizedEvent.todoId))
        }
        calendarApi.deleteEvent(normalizedEvent.id, normalizedEvent.calendar_id || 'primary').catch(() => {})
        return normalizedEvent
      }

      pendingSyncEventIdsRef.current.set(normalizedEvent.id, Date.now())
      const normalizedWithPending = { ...normalizedEvent, isPendingSync: true }

      // Update all refs BEFORE state update - this makes the transition atomic from React's perspective
      eventIdsRef.current.delete(newEvent.id)
      eventIdsRef.current.add(normalizedEvent.id)

      // Remove old event from eventsByDayRef
      for (const [key, arr] of eventsByDayRef.current.entries()) {
        const newArr = arr.filter(event => event.id !== newEvent.id)
        if (newArr.length !== arr.length) {
          eventsByDayRef.current.set(key, newArr)
        }
      }
      
      // Index new event immediately BEFORE state update
      indexEventByDays(normalizedWithPending)

      // Single atomic state update - when React renders, refs are already updated
      setEvents(prev => {
        // Find and replace in one pass to minimize intermediate states
        const result = []
        let found = false
        for (const event of prev) {
          if (event.id === newEvent.id) {
            result.push(normalizedWithPending)
            found = true
          } else {
            result.push(event)
          }
        }
        // If not found (shouldn't happen), add it
        if (!found) {
          result.push(normalizedWithPending)
        }
        return result
      }, { skipDayIndexRebuild: true })
      
      // Remove optimistic event from all snapshots and add real event
      removeEventFromAllSnapshots(newEvent.id)
      saveSnapshotsForAllViews(normalizedWithPending)
      
      // Update IndexedDB cache with real event
      removeEventFromCache(newEvent.id).catch(() => {})
      addEventToCache(user?.id, { ...normalizedWithPending, isGoogleEvent: true }).catch(() => {})

      const resolvedServerStart =
        parseCalendarBoundary(created?.start) ||
        (created?.start?.dateTime ? new Date(created.start.dateTime) : null) ||
        coerceDate(created?.start) ||
        start
      const resolvedServerEnd =
        parseCalendarBoundary(created?.end) ||
        (created?.end?.dateTime ? new Date(created.end.dateTime) : null) ||
        coerceDate(created?.end) ||
        end
      clearOverrideIfSynced(normalizedEvent.id, resolvedServerStart, resolvedServerEnd)

      if (processedData.recurrence || processedData.recurrenceRule || processedData.recurrenceSummary) {
        try {
          const { start: visibleStart, end: visibleEnd } = getVisibleRange(currentDate, view)
          if (visibleStart && visibleEnd) {
            fetchEventsForRange(visibleStart, visibleEnd, true, true)
              .then(() => clearOptimisticRecurrenceInstances(normalizedEvent.id))
              .catch(() => {})
          }
        } catch (_) {}
      } else {
        clearOptimisticRecurrenceInstances(normalizedEvent.id)
      }

      return normalizedWithPending
    } catch (error) {
      console.error('Failed to create event:', error)
      optimisticEventCacheRef.current.delete(newEvent.id)
      setEvents(prev => prev.filter(event => event.id !== newEvent.id), { skipDayIndexRebuild: true })
      eventIdsRef.current.delete(newEvent.id)
      removeEventFromAllSnapshots(newEvent.id)
      for (const [key, arr] of eventsByDayRef.current.entries()) {
        const filtered = arr.filter(event => event.id !== newEvent.id)
        eventsByDayRef.current.set(key, filtered)
      }
      clearOptimisticRecurrenceInstances(newEvent.id)
      throw error
    }
  }, [
    indexEventByDays,
    saveSnapshotsForAllViews,
    removeEventFromAllSnapshots,
    getVisibleRange,
    currentDate,
    view,
    fetchEventsForRange,
    addOptimisticRecurrenceInstances,
    clearOptimisticRecurrenceInstances
  ])

  const updateEvent = useCallback(async (id, updatedData = {}) => {
    // Check if this is an optimistic event (temp ID)
    const isOptimistic = typeof id === 'string' && id.startsWith('temp-');
    const existingEvent = events.find(e => e.id === id)
    const previousEventSnapshot = existingEvent
      ? {
          ...existingEvent,
          start: coerceDate(existingEvent.start) || new Date(),
          end: coerceDate(existingEvent.end) || new Date()
        }
      : null
    
    const { recurringEditScope, ...incomingData } = updatedData || {}
    const linkedTodoId = eventToTodoRef.current.get(String(id)) || null

    const resolveSeriesId = (ev) => {
      if (!ev) return null
      return ev.recurringEventId || ev.parentRecurrenceId || ev.id || null
    }
    const targetSeriesId = resolveSeriesId(existingEvent)
    const applySeriesScope = recurringEditScope === 'all' || recurringEditScope === 'future'

    // Ensure dates are proper Date objects
    let start = coerceDate(incomingData.start)
    let end = coerceDate(incomingData.end)

    if (!start) {
      start = coerceDate(existingEvent?.start) || new Date()
    }
    if (!end || end <= start) {
      end = new Date(start.getTime() + 30 * 60 * 1000)
    }
    const isAllDay =
      typeof updatedData.isAllDay === 'boolean'
        ? updatedData.isAllDay
        : undefined

    const processedData = {
      ...incomingData,
      start,
      end,
      color: updatedData.color ?? existingEvent?.color ?? 'blue',
      reminders: updatedData.reminders ?? existingEvent?.reminders ?? null
    };
    if (typeof isAllDay === 'boolean') {
      processedData.isAllDay = isAllDay
    }
    const recurrenceArray = Array.isArray(updatedData.recurrence) && updatedData.recurrence.length
      ? updatedData.recurrence
      : (updatedData.recurrenceRule ? [updatedData.recurrenceRule] : undefined)
    if (recurrenceArray) {
      processedData.recurrence = recurrenceArray
    } else if ('recurrence' in processedData) {
      delete processedData.recurrence
    }
    if ('recurrenceRule' in updatedData) {
      processedData.recurrenceRule = updatedData.recurrenceRule
      if (!updatedData.recurrenceRule) {
        delete processedData.recurrence
      }
    }
    if ('recurrenceSummary' in updatedData) {
      processedData.recurrenceSummary = updatedData.recurrenceSummary
    }
    if ('recurrenceMeta' in updatedData) {
      processedData.recurrenceMeta = updatedData.recurrenceMeta
    }
    processedData.transparency = updatedData.transparency === 'transparent' ? 'transparent' : 'opaque'
    processedData.visibility = updatedData.visibility || 'public'

    const recurrenceMeta = processedData.recurrenceMeta
    clearOptimisticRecurrenceInstances(id)
    if (recurrenceMeta?.enabled) {
      const parentSnapshot = {
        ...(existingEvent || {}),
        ...processedData,
        id
      }
      const rangeOverride = loadedRangeRef.current
        ? { start: loadedRangeRef.current.start, end: loadedRangeRef.current.end }
        : null
      addOptimisticRecurrenceInstances(parentSnapshot, recurrenceMeta, rangeOverride)
    }

    const existingStart = coerceDate(existingEvent?.start)
    const existingEnd = coerceDate(existingEvent?.end)
    const startsSame = existingStart && Math.abs(existingStart.getTime() - start.getTime()) < 60 * 1000
    const endsSame = existingEnd && Math.abs(existingEnd.getTime() - end.getTime()) < 60 * 1000
    const hasOverride = eventOverridesRef.current.has(id)
    if (!(startsSame && endsSame && !hasOverride)) {
      recordEventOverride(id, start, end)
    }

    const emitTodoScheduleUpdate = (todoId, newStart, newEnd, allDayFlag) => {
      if (!todoId || !(newStart instanceof Date) || !(newEnd instanceof Date)) return
      window.dispatchEvent(new CustomEvent('todoScheduleUpdated', {
        detail: {
          todoId,
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
          isAllDay: Boolean(allDayFlag)
        }
      }))
    }

    const updateForSeries = { ...processedData }
    delete updateForSeries.start
    delete updateForSeries.end

    const seriesUpdates = []
    // Optimistically update local state
    setEvents(
      prev => prev.map(event => {
        let sameSeries = applySeriesScope && targetSeriesId && resolveSeriesId(event) === targetSeriesId
        if (sameSeries && recurringEditScope === 'future') {
          const evStart = coerceDate(event.start)
          if (!evStart || evStart < start) {
            sameSeries = false
          }
        }
        const isTarget = String(event.id) === String(id)
        if (!sameSeries && !isTarget) return event

        const merged = isTarget
          ? { ...event, ...processedData }
          : { ...event, ...updateForSeries }
        seriesUpdates.push(merged)
        return merged
      }),
      { skipDayIndexRebuild: true }
    );
    setSelectedEvent(prev => {
      if (!prev || prev.id !== id) return prev
      return { ...prev, ...processedData, start, end }
    })
    if (linkedTodoId) {
      emitTodoScheduleUpdate(linkedTodoId, start, end, processedData.isAllDay ?? existingEvent?.isAllDay)
    }

    const idsToReindex = new Set(seriesUpdates.map(ev => ev.id))
    // Remove old entries for affected ids
    for (const [key, arr] of eventsByDayRef.current.entries()) {
      const next = arr.filter(e => !idsToReindex.has(e.id))
      if (next.length !== arr.length) {
        eventsByDayRef.current.set(key, next)
      }
    }
    // Re-index updated events
    seriesUpdates.forEach(ev => indexEventByDays(ev))
    
    // Update snapshots for all views
    seriesUpdates.forEach(ev => saveSnapshotsForAllViews(ev))
    
    // Don't send optimistic events to backend - wait for them to be resolved first
    if (isOptimistic) {
      return;
    }
    
    // Re-render happens from setEvents; avoid date jank that triggers heavy reloads
    // Call backend API to persist changes
    try {
      // Find existing event to get its calendar id
      const calendarId = existingEvent?.calendar_id || 'primary'
      const sendNotifications = processedData.sendNotifications || false
      const payloadForBackend = recurringEditScope
        ? { ...processedData, recurringEditScope }
        : processedData
      const response = await calendarApi.updateEvent(id, payloadForBackend, calendarId, sendNotifications)
      const serverEvent = response?.event || response
      if (serverEvent) {
        const resolvedLocation = resolveEventMeetingLocation(serverEvent, processedData.location)
        const resolvedTransparency = serverEvent?.transparency || processedData.transparency
        const resolvedVisibility = serverEvent?.visibility || processedData.visibility
        // Cache description from server response or keep existing
        const resolvedDescription = serverEvent?.description !== undefined ? serverEvent.description : (processedData.description || null)
        const resolvedColor =
          serverEvent?.extendedProperties?.private?.categoryColor
          || serverEvent?.color
          || processedData.color
          || existingEvent?.color
          || 'blue'
        const resolvedReminders = serverEvent?.reminders || processedData.reminders || existingEvent?.reminders || null
        setEvents(prev => prev.map(evt => (
          evt.id === id
            ? {
                ...evt,
                location: resolvedLocation,
                transparency: resolvedTransparency,
                visibility: resolvedVisibility,
                description: resolvedDescription,
                color: resolvedColor,
                reminders: resolvedReminders
              }
            : evt
        )), { skipDayIndexRebuild: true })
        setSelectedEvent(prev => {
          if (!prev || prev.id !== id) return prev
          return {
            ...prev,
            location: resolvedLocation,
            transparency: resolvedTransparency,
            visibility: resolvedVisibility,
            description: resolvedDescription,
            color: resolvedColor,
            reminders: resolvedReminders
          }
        })
      }
      if ((recurringEditScope === 'future' || recurringEditScope === 'all') && user?.id) {
        // No longer using cache, no need to clear
      }
      if (processedData.recurrence || processedData.recurrenceRule || processedData.recurrenceSummary) {
        try {
          const { start: visibleStart, end: visibleEnd } = getVisibleRange(currentDate, view)
          if (visibleStart && visibleEnd) {
            fetchEventsForRange(visibleStart, visibleEnd, true, true)
              .then(() => clearOptimisticRecurrenceInstances(id))
              .catch(() => {})
          }
        } catch (_) {}
      } else {
        clearOptimisticRecurrenceInstances(id)
      }
      if (linkedTodoId) {
        emitTodoScheduleUpdate(linkedTodoId, start, end, processedData.isAllDay ?? existingEvent?.isAllDay)
      }
    } catch (error) {
      console.error('Failed to update event:', error);
      const message = typeof error?.message === 'string' ? error.message : ''
      const forbidden = /forbiddenForNonOrganizer/i.test(message) || /Shared properties can only be changed/i.test(message)
      if (previousEventSnapshot) {
        revertEventState(previousEventSnapshot)
        if (forbidden) {
          triggerEventBounce(previousEventSnapshot.id)
        }
      }
      clearOptimisticRecurrenceInstances(id)
    }
  }, [
    indexEventByDays,
    events,
    saveSnapshotsForAllViews,
    revertEventState,
    triggerEventBounce,
    getVisibleRange,
    currentDate,
    view,
    fetchEventsForRange,
    addOptimisticRecurrenceInstances,
    clearOptimisticRecurrenceInstances,
    recordEventOverride,
    clearOverrideIfSynced,
    user?.id
  ])

  const respondToInvite = useCallback(async (eventId, responseStatus) => {
    if (!eventId || !responseStatus) return
    const normalized = normalizeResponseStatus(responseStatus)
    if (!normalized) return
    if (!['accepted', 'declined', 'tentative'].includes(normalized)) {
      return
    }

    const existingEvent = eventsRefValue.current.find(ev => ev.id === eventId)
    if (!existingEvent) {
      return
    }

    const previousSnapshot = { ...existingEvent }
    const updatedEvent = {
      ...existingEvent,
      viewerResponseStatus: normalized,
      isInvitePending: normalized === 'needsAction'
    }

    const syncDayIndexWithEvent = (eventToSync) => {
      for (const [key, arr] of eventsByDayRef.current.entries()) {
        let changed = false
        const replaced = arr.map(item => {
          if (item.id !== eventToSync.id) return item
          changed = true
          return eventToSync
        })
        if (changed) {
          eventsByDayRef.current.set(key, replaced)
        }
      }
      saveSnapshotsForAllViews(eventToSync)
    }

    setEvents(prev => prev.map(ev => (ev.id === eventId ? updatedEvent : ev)), { skipDayIndexRebuild: true })
    syncDayIndexWithEvent(updatedEvent)

    setSelectedEvent(prev => {
      if (!prev || prev.id !== eventId) return prev
      return { ...prev, viewerResponseStatus: normalized, isInvitePending: normalized === 'needsAction' }
    })

    try {
      const effectiveCalendarId = updatedEvent.calendar_id || 'primary'
      await calendarApi.respondToInvite(eventId, normalized, effectiveCalendarId)
    } catch (error) {
      console.error('Failed to respond to invite:', error)
      setEvents(prev => prev.map(ev => (ev.id === eventId ? previousSnapshot : ev)), { skipDayIndexRebuild: true })
      syncDayIndexWithEvent(previousSnapshot)
      setSelectedEvent(prev => {
        if (!prev || prev.id !== eventId) return prev
        return {
          ...prev,
          viewerResponseStatus: previousSnapshot.viewerResponseStatus,
          isInvitePending: previousSnapshot.viewerResponseStatus === 'needsAction'
        }
      })
      throw error
    }
  }, [saveSnapshotsForAllViews])

  const deleteEvent = useCallback(async (event) => {
    const eventObject = (event && typeof event === 'object') ? event : null
    if (!eventObject) {
      console.warn('deleteEvent: event object required', event)
      return
    }

    const rawId = eventObject.id || (typeof event === 'string' ? event : null)
    if (!rawId) return

    const calendarId = eventObject.calendar_id || eventObject.calendarId || 'primary'
    const deleteScope = eventObject.deleteScope
    const deleteSeries = deleteScope === 'series' || deleteScope === 'all' || deleteScope === 'future' || Boolean(eventObject.deleteSeries)
    const isOptimistic = Boolean(eventObject.isOptimistic) || (typeof rawId === 'string' && rawId.startsWith('temp-'))
    const directTodoId = eventObject.todoId || eventObject.todo_id || eventObject.extendedProperties?.private?.todoId
    const linkedTodoId = eventToTodoRef.current.get(String(rawId)) || (directTodoId ? String(directTodoId) : null)
    const linkedEventIdForTodo = linkedTodoId ? todoToEventRef.current.get(String(linkedTodoId)) : null
    // Clear all caches to ensure deleted event doesn't reappear
    clearEventsCache().catch(() => {})
    clearAllSnapshots()

    const emitTodoScheduleUpdate = (todoId, start, end, isAllDay) => {
      if (!todoId) return
      window.dispatchEvent(new CustomEvent('todoScheduleUpdated', {
        detail: {
          todoId,
          start: start ? safeToISOString(start) : null,
          end: end ? safeToISOString(end) : null,
          isAllDay: Boolean(isAllDay)
        }
      }))
    }
    const idsToRemove = new Set()
    let snapshotsToRestore = []

    if (deleteSeries && rawId) {
      const seriesId = eventObject.recurringEventId || eventObject.parentRecurrenceId || rawId
      if (!seriesId) {
        console.warn('deleteEvent: unable to resolve series id for', rawId)
        return
      }

      clearOptimisticRecurrenceInstances(seriesId)
      const eventsToDelete = []
      const removalIds = new Set()

      // Show toast immediately (optimistic)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { message: 'Deleted event' } }))
      }

      setEvents(prev => {
        const matches = prev.filter(ev =>
          ev.id === seriesId ||
          ev.recurringEventId === seriesId ||
          ev.parentRecurrenceId === seriesId
        )

        if (!matches.length) {
          console.warn('No events found to delete for series:', seriesId)
          return prev
        }

        matches.forEach(ev => {
          eventsToDelete.push(ev)
          removalIds.add(ev.id)
        })

        snapshotsToRestore = matches.map(ev => ({
          ...ev,
          start: coerceDate(ev.start) || new Date(),
          end: coerceDate(ev.end) || new Date()
        }))

        removalIds.forEach(id => {
          eventIdsRef.current.delete(id)
          pendingSyncEventIdsRef.current.delete(id)
          unlinkEvent(id)
          removeEventFromAllSnapshots(id)
        })

        for (const [key, arr] of eventsByDayRef.current.entries()) {
          const next = arr.filter(e => !removalIds.has(e.id))
          if (next.length !== arr.length) {
            eventsByDayRef.current.set(key, next)
          }
        }

        removalIds.forEach(id => suppressedEventIdsRef.current.add(id))
        if (linkedTodoId) {
          removalIds.forEach(id => eventToTodoRef.current.delete(String(id)))
          todoToEventRef.current.delete(String(linkedTodoId))
          calendarApi.deleteTodoEventLink(String(linkedTodoId)).catch(() => {})
          window.dispatchEvent(new CustomEvent('todoScheduleUpdated', {
            detail: {
              todoId: linkedTodoId,
              start: null,
              end: null,
              isAllDay: false
            }
          }))
        }

        return prev.filter(ev => !removalIds.has(ev.id))
      }, { skipDayIndexRebuild: true })

      if (!eventsToDelete.length) {
        if (!isOptimistic && seriesId) {
          try {
            await calendarApi.deleteEvent(seriesId, calendarId)
            // Show toast notification
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('eventDeleted'))
            }
          } catch (error) {
            const message = typeof error?.message === 'string' ? error.message : ''
            if (!/not found/i.test(message) && !/deleted/i.test(message) && !/Resource has been deleted/i.test(message)) {
              console.error('Failed to delete event series:', error)
            }
          }
        }
        return
      }

      // Perform backend deletion of the series master only (Google removes all instances)
      if (!isOptimistic && seriesId) {
        try {
          await calendarApi.deleteEvent(seriesId, calendarId)
          try {
            const { start: visibleStart, end: visibleEnd } = getVisibleRange(currentDate, view)
            if (visibleStart && visibleEnd) {
              fetchEventsForRange(visibleStart, visibleEnd, true, true).catch(() => {})
            }
          } catch (_) {}
        } catch (error) {
          const message = typeof error?.message === 'string' ? error.message : ''
          if (!/not found/i.test(message) && !/deleted/i.test(message) && !/Resource has been deleted/i.test(message)) {
            console.error('Failed to delete event series:', error)
            // Show error toast
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { message: "Error couldn't delete" } }))
            }
            // Rollback on error
            setEvents(prevEvents => [...prevEvents, ...snapshotsToRestore], { skipDayIndexRebuild: true })
            snapshotsToRestore.forEach(snapshot => {
              eventIdsRef.current.add(snapshot.id)
              indexEventByDays(snapshot)
              saveSnapshotsForAllViews(snapshot)
              suppressedEventIdsRef.current.delete(snapshot.id)
            })
          }
        }
      }

      return
    } else {
      // Single event deletion
      const snapshot = {
        ...eventObject,
        start: coerceDate(eventObject.start) || new Date(),
        end: coerceDate(eventObject.end) || new Date()
      }
      // Show toast immediately (optimistic)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { message: 'Deleted event' } }))
      }

      snapshotsToRestore = [snapshot]
      idsToRemove.add(rawId)
      if (linkedEventIdForTodo && linkedEventIdForTodo !== String(rawId)) {
        idsToRemove.add(linkedEventIdForTodo)
      }
      setEvents(prev => prev.filter(e => !idsToRemove.has(e.id) && !(linkedTodoId && String(e.todoId) === String(linkedTodoId))), { skipDayIndexRebuild: true })
    }

    idsToRemove.forEach(id => {
      eventIdsRef.current.delete(id)
      pendingSyncEventIdsRef.current.delete(id)
      unlinkEvent(id)
      removeEventFromAllSnapshots(id)
      removeEventFromCache(id).catch(() => {})
    })
    if (linkedTodoId) {
      idsToRemove.forEach(id => eventToTodoRef.current.delete(String(id)))
      todoToEventRef.current.delete(String(linkedTodoId))
      calendarApi.deleteTodoEventLink(String(linkedTodoId)).catch(() => {})
      emitTodoScheduleUpdate(linkedTodoId, null, null, false)
      suppressedTodoIdsRef.current.add(String(linkedTodoId))
      removeTodoFromAllSnapshots(linkedTodoId)
    }

    for (const [key, arr] of eventsByDayRef.current.entries()) {
      const next = arr.filter(e => !idsToRemove.has(e.id) && !(linkedTodoId && String(e.todoId) === String(linkedTodoId)))
      if (next.length !== arr.length) {
        eventsByDayRef.current.set(key, next)
      }
    }

    idsToRemove.forEach(id => suppressedEventIdsRef.current.add(id))

    try {
      if (!isOptimistic) {
        await calendarApi.deleteEvent(rawId, calendarId)
      }
    } catch (error) {
      const message = typeof error?.message === 'string' ? error.message : ''
      if (/not found/i.test(message) || /deleted/i.test(message) || /Resource has been deleted/i.test(message)) {
        return
      }

      console.error('Failed to delete event:', error)
      // Show error toast
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { message: "Error couldn't delete" } }))
      }
      setEvents(prev => [...prev, ...snapshotsToRestore], { skipDayIndexRebuild: true })
      snapshotsToRestore.forEach(snapshot => {
        eventIdsRef.current.add(snapshot.id)
        indexEventByDays(snapshot)
        saveSnapshotsForAllViews(snapshot)
        suppressedEventIdsRef.current.delete(snapshot.id)
      })
      if (linkedTodoId && snapshotsToRestore.length) {
        const rollback = snapshotsToRestore[0]
        emitTodoScheduleUpdate(
          linkedTodoId,
          rollback.start ? new Date(rollback.start) : null,
          rollback.end ? new Date(rollback.end) : null,
          rollback.isAllDay || false
        )
      }
    }
  }, [
    unlinkEvent,
    indexEventByDays,
    removeEventFromAllSnapshots,
    saveSnapshotsForAllViews,
    clearOptimisticRecurrenceInstances,
    getVisibleRange,
    currentDate,
    view,
    fetchEventsForRange
  ])

  const openEventModal = useCallback((event = null, isNewEvent = false) => {
    // If this is a new drag-created event
    if (isNewEvent && event) {
      // Clone the date objects to avoid reference issues
      const exactStartDate = new Date(event.start.getTime());
      const exactEndDate = new Date(event.end.getTime());
      
      console.log('MODAL OPENING with drag event:', {
        start: exactStartDate.toLocaleString(),
        startHour: exactStartDate.getHours(),
        startMinute: exactStartDate.getMinutes(),
        end: exactEndDate.toLocaleString(),
        endHour: exactEndDate.getHours(),
        endMinute: exactEndDate.getMinutes()
      });
      
      // Set selected event to null since this is a new event
      setSelectedEvent(null);
      
      // Store exact times for the modal to use
      window.prefilledEventDates = {
        startDate: exactStartDate,
        endDate: exactEndDate,
        title: event.title || 'New Event',
        color: event.color || 'blue',
        isAllDay: event.isAllDay !== undefined ? event.isAllDay : false, // Preserve isAllDay from event, default to false for timed events
        fromDayClick: true // Flag to indicate this came from day/calendar interaction
      };
    } else if (event) {
      // Normal event editing
      setSelectedEvent(event);
      window.prefilledEventDates = null;
    } else {
      // Called from the + Event button in header with no event
      setSelectedEvent(null);
      
      // Default new events to an all-day block on the currently focused date
      const baseDate = startOfDay(currentDate || new Date());
      const startDate = new Date(baseDate);
      const endDate = addDays(new Date(baseDate), 1);
      
      // Create default prefilled event
      window.prefilledEventDates = {
        startDate,
        endDate,
        title: 'New Event',
        color: 'blue',
        isAllDay: true,
        fromEventButton: true // Flag to indicate this came from + Event button
      };
      
      console.log('Opening new event modal from button:', {
        start: startDate.toLocaleString(),
        end: endDate.toLocaleString()
      });
    }
    
    setShowEventModal(true);
  }, [])

  const closeEventModal = useCallback(() => {
    setSelectedEvent(null)
    setShowEventModal(false)
  }, [])

  const formatDateHeader = useCallback(() => {
    if (view === 'month') {
      // Use headerDisplayDate for month view header
      return format(headerDisplayDate, 'MMMM yyyy')
    }
    if (view === 'week') {
      const weekStart = startOfWeek(currentDate)
      const weekEnd = endOfWeek(currentDate)
      return `${format(currentDate, 'MMMM yyyy')}`
    }
    return format(currentDate, 'EEE MMMM d, yyyy')
  }, [currentDate, view, headerDisplayDate])

  const value = {
    currentDate,
    view,
    events,
    selectedEvent,
    showEventModal,
    headerDisplayDate,
    loading,
    isRevalidating,
    initialLoading,
    selectedCalendars,
    getDaysInMonth,
    getDaysInWeek,
    navigateToToday,
    navigateToPrevious,
    navigateToNext,
    changeView,
    setView: changeView, // Alias for backward compatibility
    selectDate,
    getEventsForDate,
    createEvent,
    updateEvent,
    respondToInvite,
    deleteEvent,
    openEventModal,
    closeEventModal,
    formatDateHeader,
    setHeaderDisplayDate,
    refreshEvents,
    setSelectedCalendars,
    fetchEventsForRange,
    isEventChecked,
    toggleEventChecked
  }

  return (
    <CalendarContext.Provider value={value}>
      {children}
    </CalendarContext.Provider>
  )
}

export const useCalendar = () => {
  const context = useContext(CalendarContext)
  if (!context) {
    throw new Error('useCalendar must be used within a CalendarProvider')
  }
  return context
}
