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
  format
} from 'date-fns'
import { v4 as uuidv4 } from 'uuid'
import { calendarApi } from '../lib/api'
import { describeRecurrence, expandRecurrenceInstances } from '../lib/recurrence'
import { useAuth } from './AuthContext'
import { monthKey as cacheMonthKey, getMonths as cacheGetMonths, putMonth as cachePutMonth, pruneOlderThan } from '../lib/cache'

const CalendarContext = createContext()
const EVENT_BOUNCE_EVENT = 'chronos:event-bounce'

const dispatchBounceEvent = (eventId) => {
  if (typeof window === 'undefined' || !eventId) return
  window.dispatchEvent(new CustomEvent(EVENT_BOUNCE_EVENT, { detail: { eventId } }))
}

const INITIAL_PAST_MONTHS = 3
const INITIAL_FUTURE_MONTHS = 3
const EXPANSION_MONTHS = 2
const IDLE_PREFETCH_EXTRA_MONTHS = 12
const RECENT_EVENT_SYNC_TTL_MS = 60 * 1000 // allow a short grace period for new events to appear in remote fetches

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

const normalizeResponseStatus = (value) => {
  if (!value) return null
  const lower = String(value).toLowerCase()
  return lower === 'needsaction' ? 'needsAction' : lower
}


export const CalendarProvider = ({ children }) => {
  const { user } = useAuth()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState('month')
  const [headerDisplayDate, setHeaderDisplayDate] = useState(currentDate)
  const [events, setEvents] = useState([])
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
  const eventIdsRef = useRef(new Set())
  const activeForegroundRequestsRef = useRef(0)
  const activeBackgroundRequestsRef = useRef(0)
  const hasLoadedInitialRef = useRef(false)
  const todoToEventRef = useRef(new Map())
  const eventToTodoRef = useRef(new Map())
  const suppressedEventIdsRef = useRef(new Set())
  const suppressedTodoIdsRef = useRef(new Set())
  const pendingSyncEventIdsRef = useRef(new Map())
  const optimisticRecurrenceMapRef = useRef(new Map())
  const idlePrefetchCancelRef = useRef(null)
  const cacheTTLRef = useRef(24 * 60 * 60 * 1000) // 24h TTL
  const calHashRef = useRef('all')
  const loadedMonthsRef = useRef(new Set())
  const inFlightMonthsRef = useRef(new Set())
  const snapshotSaveTimerRef = useRef(null)

  useEffect(() => {
    eventsRefValue.current = events
  }, [events])

  const linkTodoEvent = useCallback((todoId, eventId) => {
    if (!todoId || !eventId) return
    const todoKey = String(todoId)
    const eventKey = String(eventId)
    todoToEventRef.current.set(todoKey, eventKey)
    eventToTodoRef.current.set(eventKey, todoKey)
  }, [])

  const unlinkEvent = useCallback((eventId) => {
    if (!eventId) return
    const eventKey = String(eventId)
    const todoKey = eventToTodoRef.current.get(eventKey)
    if (todoKey) {
      eventToTodoRef.current.delete(eventKey)
      todoToEventRef.current.delete(todoKey)
    }
  }, [])

  const snapshotKey = useCallback((start, end, viewType = view) => {
    const u = user?.id || 'anon'
    const cal = calHashRef.current
    const viewKey = viewType
    const startIso = safeToISOString(start) || 'invalid'
    const endIso = safeToISOString(end) || 'invalid'
    return `chronos:snap:v1:${u}:${cal}:${viewKey}:${startIso}:${endIso}`
  }, [user?.id, view])

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
      calHashRef.current = norm
    } else {
      calHashRef.current = 'all'
    }
  }, [selectedCalendars])

  // prune cache occasionally
  useEffect(() => {
    pruneOlderThan(cacheTTLRef.current).catch(() => {})
  }, [])



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
      start: startOfWeek(startOfMonth(date)),
      end: endOfWeek(endOfMonth(date))
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
                window.sessionStorage.setItem(key, JSON.stringify({ events: filtered }))
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
        const parsed = existing ? JSON.parse(existing) : { events: [] }
        let list = parsed.events || []
        
        // Add new event if not already in snapshot
        if (!list.some(x => x.id === newEvent.id)) {
          const startIso = safeToISOString(newEvent.start)
          const endIso = safeToISOString(newEvent.end)
          if (startIso && endIso) {
            list.push({
              id: newEvent.id,
              title: newEvent.title,
              start: startIso,
              end: endIso,
              color: newEvent.color,
              calendar_id: newEvent.calendar_id,
              location: newEvent.location || '',
              participants: newEvent.participants || [],
              todoId: newEvent.todoId,
              isOptimistic: newEvent.isOptimistic,
              isAllDay: newEvent.isAllDay,
              isPendingSync: Boolean(newEvent.isPendingSync)
            })
            window.sessionStorage.setItem(key, JSON.stringify({ events: list }))
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

  const hydrateFromSnapshot = useCallback(() => {
    try {
      if (typeof window === 'undefined') return false
      const { start, end } = getVisibleRange(currentDate, view)
      const key = snapshotKey(start, end)
      const raw = window.sessionStorage.getItem(key)
      if (!raw) return false
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed?.events)) return false

      const toAdd = []
      for (const ev of parsed.events) {
        if (!eventIdsRef.current.has(ev.id)) {
          const todoId = ev.todoId || ev.todo_id

          const isPendingSync = Boolean(ev.isPendingSync)

          const e = {
            id: ev.id,
            title: ev.title || 'Untitled',
            start: new Date(ev.start),
            end: new Date(ev.end),
            color: ev.color || 'blue',
            isGoogleEvent: !ev.isOptimistic,
            isOptimistic: ev.isOptimistic || false,
            isAllDay: ev.isAllDay || false,
            calendar_id: ev.calendar_id,
            location: ev.location || '',
            participants: ev.participants || [],
            todoId: todoId ? String(todoId) : undefined,
            isPendingSync
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
        setEvents(prev => [...prev, ...toAdd])
        setTimeout(() => {
          for (const e of toAdd) {
            eventIdsRef.current.add(e.id)
            indexEventByDays(e)
          }
        }, 0)
        extendLoadedRange(start, end)
        hasLoadedInitialRef.current = true
        setInitialLoading(false)
        return true
      }
    } catch (_) {}
    return false
  }, [currentDate, view, getVisibleRange, extendLoadedRange, linkTodoEvent])

  useEffect(() => {
    if (typeof window === 'undefined') return
    hydrateFromSnapshot()
  }, [hydrateFromSnapshot])

  const fetchEventsForRange = useCallback(async (startDate, endDate, background = false, force = false) => {
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
      !force &&
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
      if (!force && loadedMonthsRef.current.has(m)) continue
      if (inFlightMonthsRef.current.has(m)) continue
      missingMonths.push(m)
    }
    if (missingMonths.length === 0) {
      return
    }
    const segments = groupContiguousMonths(missingMonths)
    // Mark months as in-flight
    for (const m of missingMonths) inFlightMonthsRef.current.add(m)

    try {
      const viewerEmail = typeof user?.email === 'string'
        ? user.email.toLowerCase()
        : null

      // 1) Try to hydrate from cache immediately
      const ukey = user?.id || 'anon'
      const calHash = calHashRef.current
      const months = []
      const cursor = new Date(rangeStart)
      cursor.setDate(1)
      while (cursor <= rangeEnd) {
        months.push(cacheMonthKey(cursor))
        cursor.setMonth(cursor.getMonth() + 1)
      }
      let hadCached = false
      try {
        const cached = await cacheGetMonths({ user: ukey, calHash, months })
        if (cached.size) {
          const cachedEvents = []
          cached.forEach((row) => {
            // row.events are serialized minimal events with iso strings
            for (const ev of row.events || []) {
              if (!eventIdsRef.current.has(ev.id)) {
                const todoId = ev.todoId || ev.todo_id

                const cachedViewerResponse = normalizeResponseStatus(ev.viewerResponseStatus)
                cachedEvents.push({
                  id: ev.id,
                  title: ev.title || ev.summary || 'Untitled',
                  start: new Date(ev.start),
                  end: new Date(ev.end),
                  color: ev.color || 'blue',
                  isGoogleEvent: true,
                  calendar_id: ev.calendar_id,
                  isAllDay: Boolean(ev.isAllDay),
                  location: ev.location || '',
                  participants: ev.participants || [],
                  todoId: todoId ? String(todoId) : undefined,
                  recurrenceRule: ev.recurrenceRule || null,
                  recurrenceSummary: ev.recurrenceSummary || null,
                  recurrenceMeta: ev.recurrenceMeta || null,
                  recurringEventId: ev.recurringEventId || null,
                  viewerResponseStatus: cachedViewerResponse,
                  viewerIsOrganizer: Boolean(ev.viewerIsOrganizer),
                  viewerIsAttendee: Boolean(ev.viewerIsAttendee),
                  inviteCanRespond: Boolean(ev.inviteCanRespond),
                  isInvitePending: cachedViewerResponse === 'needsAction'
                })
              }
            }
          })
          if (cachedEvents.length) {
            hadCached = true
            setEvents((prev) => {
              const merged = [...prev]
              for (const ev of cachedEvents) {
                if (!eventIdsRef.current.has(ev.id)) {
                  merged.push(ev)
                  eventIdsRef.current.add(ev.id)
                  if (ev.todoId) {
                    linkTodoEvent(ev.todoId, ev.id)
                  }
                  indexEventByDays(ev)
                }
              }
              return merged
            })
            extendLoadedRange(rangeStart, rangeEnd)
            if (!hasLoadedInitialRef.current) {
              hasLoadedInitialRef.current = true
              setInitialLoading(false)
            }
          }
        }
      } catch (_) {}

      // 2) Proceed with network fetch
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

            return {
              id: event.id,
              title: event.summary || 'Untitled',
              start,
              end,
              color: categoryColor || 'blue',
              isGoogleEvent: true,
              calendar_id: event.calendar_id,
              isAllDay,
              location: event.location || '',
              participants,
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
              isInvitePending
            }
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
        googleEvents.forEach(ev => incomingById.set(ev.id, ev))
        const updatedEvents = []
        const newEvents = []
        const removedIds = []
        const now = Date.now()

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
                const merged = { ...ev, ...replacement, isPendingSync: false }
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
                } else {
                  removedIds.push(ev.id)
                }
              }
            } else {
              next.push(ev)
            }
          })

          incomingById.forEach(ev => {
            pendingSyncEventIdsRef.current.delete(ev.id)
            const normalized = { ...ev, isPendingSync: false }
            newEvents.push(normalized)
            next.push(normalized)
          })

          return next
        })

        if (removedIds.length) {
          for (const id of removedIds) {
            eventIdsRef.current.delete(id)
            pendingSyncEventIdsRef.current.delete(id)
            unlinkEvent(id)
            for (const [key, arr] of eventsByDayRef.current.entries()) {
              const filtered = arr.filter(ev => ev.id !== id)
              if (filtered.length !== arr.length) {
                eventsByDayRef.current.set(key, filtered)
              }
            }
          }
        }

        const toReindex = [...updatedEvents, ...newEvents]
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

          try {
            const byMonth = new Map()
            for (const ev of toReindex) {
              const normalizedStart = coerceDate(ev.start)
              const normalizedEnd = coerceDate(ev.end)
              if (!normalizedStart || !normalizedEnd) {
                continue
              }
              const m = cacheMonthKey(normalizedStart)
              const arr = byMonth.get(m) || []
              const startIso = safeToISOString(normalizedStart)
              const endIso = safeToISOString(normalizedEnd)
              if (!startIso || !endIso) {
                continue
              }
              arr.push({
                id: ev.id,
                title: ev.title,
                start: startIso,
                end: endIso,
                color: ev.color,
                calendar_id: ev.calendar_id,
                isAllDay: ev.isAllDay,
                todoId: ev.todoId,
                recurrenceRule: ev.recurrenceRule || null,
                recurrenceSummary: ev.recurrenceSummary || null,
                recurrenceMeta: ev.recurrenceMeta || null,
                recurringEventId: ev.recurringEventId || null,
                viewerResponseStatus: ev.viewerResponseStatus || null,
                viewerIsOrganizer: Boolean(ev.viewerIsOrganizer),
                viewerIsAttendee: Boolean(ev.viewerIsAttendee),
                inviteCanRespond: Boolean(ev.inviteCanRespond),
                isInvitePending: typeof ev.isInvitePending === 'boolean'
                  ? ev.isInvitePending
                  : normalizeResponseStatus(ev.viewerResponseStatus) === 'needsAction'
              })
              byMonth.set(m, arr)
            }
            const tasks = []
            byMonth.forEach((arr, m) => {
              tasks.push(
                cachePutMonth({ user: ukey, calHash, month: m, events: arr, updated: Date.now() })
              )
            })
            Promise.allSettled(tasks).catch(() => {})
          } catch (_) {}
        }

        // mark months as loaded
        const segMonths = enumerateMonths(segStart, segEnd)
        for (const m of segMonths) loadedMonthsRef.current.add(m)
        extendLoadedRange(segStart, segEnd)
      }

      // run with small concurrency
      const concurrency = 2
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
  }, [user, selectedCalendars, extendLoadedRange, linkTodoEvent])

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
    setEvents(prev => prev.filter(event => !ids.includes(event.id)))
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

  const addOptimisticRecurrenceInstances = useCallback((parentEvent, recurrenceMeta) => {
    if (!parentEvent || !recurrenceMeta?.enabled) return
    const visibleRange = getVisibleRange(currentDate, view)
    if (!visibleRange?.start || !visibleRange?.end) return
    const occurrences = expandRecurrenceInstances(parentEvent, recurrenceMeta, visibleRange.start, visibleRange.end, 400)
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
    setEvents(prev => [...prev, ...clones])
    clones.forEach((clone) => {
      eventIdsRef.current.add(clone.id)
      indexEventByDays(clone)
      saveSnapshotsForAllViews(clone)
    })
  }, [currentDate, view, getVisibleRange, indexEventByDays, saveSnapshotsForAllViews])

  const revertEventState = useCallback((snapshot) => {
    if (!snapshot?.id) return

    setEvents(prev => prev.map(event => event.id === snapshot.id ? { ...snapshot } : event))

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
    rebuildEventsByDayIndex(events)
  }, [events, rebuildEventsByDayIndex])

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

    const bufferedStart = startOfDay(
      startOfWeek(
        startOfMonth(subMonths(start, pastMonths))
      )
    )

    const bufferedEnd = endOfDay(
      endOfWeek(
        endOfMonth(addMonths(end, futureMonths))
      )
    )

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

    if (
      loadedRangeRef.current &&
      loadedRangeRef.current.start <= rangeStart &&
      loadedRangeRef.current.end >= rangeEnd
    ) {
      return
    }

    const key = `${rangeStart.getTime()}_${rangeEnd.getTime()}`
    if (prefetchedRangesRef.current.has(key)) {
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

  const ensureRangeLoaded = useCallback(async (visibleStart, visibleEnd, background = false, force = false) => {
    if (!(visibleStart instanceof Date) || !(visibleEnd instanceof Date)) {
      return
    }

    const visibleRange = {
      start: startOfDay(visibleStart),
      end: endOfDay(visibleEnd)
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

    prefetchAdjacentRanges(targetRange)
  }, [buildBufferedRange, fetchEventsForRange, prefetchAdjacentRanges])

  const fetchGoogleEvents = useCallback(async (background = false, reset = false) => {
    const { start, end } = getVisibleRange(currentDate, view)

    if (reset) {
      loadedRangeRef.current = null
      prefetchedRangesRef.current.clear()
      eventsByDayRef.current = new Map()
      eventIdsRef.current = new Set()
      pendingSyncEventIdsRef.current = new Map()
      todoToEventRef.current = new Map()
      eventToTodoRef.current = new Map()
      activeForegroundRequestsRef.current = 0
      activeBackgroundRequestsRef.current = 0
      hasLoadedInitialRef.current = false
      setInitialLoading(true)
      setLoading(false)
      setIsRevalidating(false)
      setEvents(prev => prev.filter(event => !event.isGoogleEvent))
    }

    try {
      await ensureRangeLoaded(start, end, background, reset)
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
    ensureRangeLoaded
  ])

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
            start: startIso,
            end: endIso,
            color: ev.color,
            calendar_id: ev.calendar_id,
            todoId: ev.todoId
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

  const refreshEvents = useCallback(() => {
    if (!user) return
    fetchGoogleEvents(false, true)
  }, [user, fetchGoogleEvents])

  useEffect(() => {
    if (!user) return
    // Use background fetch when only view changes (no date change)
    // This makes view switching feel instant while still loading any missing data
    fetchGoogleEvents(true)
  }, [user, currentDate, view, fetchGoogleEvents])

  useEffect(() => {
    if (!user) return
    fetchGoogleEvents(false, true)
  }, [user, selectedCalendars, fetchGoogleEvents])

  useEffect(() => {
    if (!user) return
    const handleFocus = () => fetchGoogleEvents(true)
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [user, fetchGoogleEvents])

  useEffect(() => {
    if (!user) return
    // Refresh events every 30 minutes (1800000 ms)
    const interval = setInterval(() => fetchGoogleEvents(true), 1800000)
    return () => clearInterval(interval)
  }, [user, fetchGoogleEvents])

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
          isAllDay
          // Don't store todoId - each event is independent
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
              unlinkEvent(replaceId)
              
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
          })
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
            setEvents(prev => [...prev, newEvent])
            eventIdsRef.current.add(newEvent.id)
            indexEventByDays(newEvent)
            suppressedEventIdsRef.current.delete(newEvent.id)
          }
        }
      }
      
      // Only refresh in background for real events (not optimistic)
      if (!isOptimistic) {
        setTimeout(() => fetchGoogleEvents(true), 500)
      }
    }
    
    const handleTodoConversionFailed = (e) => {
      const eventId = e.detail?.eventId
      if (eventId) {
        // Remove the optimistic event
        setEvents(prev => prev.filter(ev => ev.id !== eventId))
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
  }, [fetchGoogleEvents, linkTodoEvent, unlinkEvent])

  useEffect(() => {
    if (initialLoading) {
      if (idlePrefetchCancelRef.current) {
        idlePrefetchCancelRef.current()
        idlePrefetchCancelRef.current = null
      }
      return
    }

    if (typeof window === 'undefined') {
      return
    }

    const scheduleIdlePrefetch = () => {
      const runPrefetch = () => {
        idlePrefetchCancelRef.current = null
        const { start, end } = getVisibleRange(currentDate, view)
        const baseTarget = buildBufferedRange(start, end)
        const extended = buildBufferedRange(
          start,
          end,
          INITIAL_PAST_MONTHS + IDLE_PREFETCH_EXTRA_MONTHS,
          INITIAL_FUTURE_MONTHS + IDLE_PREFETCH_EXTRA_MONTHS
        )
        if (extended) {
          prefetchRange(extended.start, extended.end)
        }
        if (baseTarget) {
          prefetchAdjacentRanges(baseTarget)
        }
      }

      if ('requestIdleCallback' in window) {
        const id = window.requestIdleCallback(runPrefetch, { timeout: 2000 })
        idlePrefetchCancelRef.current = () => window.cancelIdleCallback(id)
      } else {
        const timeout = window.setTimeout(runPrefetch, 600)
        idlePrefetchCancelRef.current = () => window.clearTimeout(timeout)
      }
    }

    scheduleIdlePrefetch()

    return () => {
      if (idlePrefetchCancelRef.current) {
        idlePrefetchCancelRef.current()
        idlePrefetchCancelRef.current = null
      }
    }
  }, [
    initialLoading,
    currentDate,
    view,
    getVisibleRange,
    buildBufferedRange,
    prefetchRange,
    prefetchAdjacentRanges
  ])

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

  const changeView = useCallback((newView) => {
    setView(newView)
  }, [])

  const selectDate = useCallback((date) => {
    setCurrentDate(date)
    setView('day')
  }, [])

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

    // Sort by time: earliest events first
    return filtered.sort((a, b) => {
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

    const processedData = {
      ...eventData,
      start,
      end,
      color: eventData.color || 'blue',
      isAllDay
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
    }

    const newEvent = {
      id: uuidv4(),
      ...processedData,
      organizerEmail: user?.email || null,
      viewerResponseStatus: 'accepted',
      viewerIsOrganizer: true,
      viewerIsAttendee: false,
      inviteCanRespond: false,
      isInvitePending: false,
      isOptimistic: true
    }

    setEvents(prev => [...prev, newEvent])
    eventIdsRef.current.add(newEvent.id)
    indexEventByDays(newEvent)
    
    // Force immediate snapshot save for all views
    saveSnapshotsForAllViews(newEvent)
    if (processedData.recurrenceMeta?.enabled) {
      addOptimisticRecurrenceInstances(newEvent, processedData.recurrenceMeta)
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
        title: created?.summary || created?.title || processedData.title || 'New Event',
        start: createdStart,
        end: createdEnd,
        color: createdColor,
        isAllDay: resolveIsAllDay(created?.start, created) || processedData.isAllDay,
        calendar_id: created?.organizer?.email || created?.calendar_id || calendarId,
        isOptimistic: false,
        location: created?.location || processedData.location,
        participants: processedData.participants,
        todoId: processedData.todoId || processedData.todo_id || undefined,
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
        isInvitePending: false
      }

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

      setEvents(prev =>
        prev.map(event => event.id === newEvent.id ? normalizedWithPending : event)
      )
      eventIdsRef.current.delete(newEvent.id)
      eventIdsRef.current.add(normalizedEvent.id)

      for (const [key, arr] of eventsByDayRef.current.entries()) {
        const filtered = arr.filter(event => event.id !== newEvent.id)
        if (filtered.length !== arr.length) {
          eventsByDayRef.current.set(key, filtered)
        }
      }
      indexEventByDays(normalizedWithPending)
      
      // Remove optimistic event from all snapshots and add real event
      removeEventFromAllSnapshots(newEvent.id)
      saveSnapshotsForAllViews(normalizedWithPending)

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
      setEvents(prev => prev.filter(event => event.id !== newEvent.id))
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

  const updateEvent = useCallback(async (id, updatedData) => {
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
    
    // Ensure dates are proper Date objects
    let start = coerceDate(updatedData.start)
    let end = coerceDate(updatedData.end)

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
      ...updatedData,
      start,
      end
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

    const recurrenceMeta = processedData.recurrenceMeta
    clearOptimisticRecurrenceInstances(id)
    if (recurrenceMeta?.enabled) {
      const parentSnapshot = {
        ...(existingEvent || {}),
        ...processedData,
        id
      }
      addOptimisticRecurrenceInstances(parentSnapshot, recurrenceMeta)
    }

    // Optimistically update local state
    setEvents(prev => 
      prev.map(event => {
        if (event.id !== id) return event
        return {
          ...event,
          ...processedData
        }
      })
    );
    // Re-index the updated event
    const updated = {
      id,
      ...processedData
    }
    // Remove old entries for this id
    for (const [key, arr] of eventsByDayRef.current.entries()) {
      const next = arr.filter(e => e.id !== id)
      if (next.length !== arr.length) {
        eventsByDayRef.current.set(key, next)
      }
    }
    indexEventByDays(updated)
    
    // Update snapshots for all views
    const fullEvent = events.find(e => e.id === id)
    if (fullEvent) {
      saveSnapshotsForAllViews({ ...fullEvent, ...processedData })
    }
    
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
      const backendEventId = existingEvent?.recurringEventId || id
      await calendarApi.updateEvent(backendEventId, processedData, calendarId, sendNotifications)
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
    clearOptimisticRecurrenceInstances
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

    setEvents(prev => prev.map(ev => (ev.id === eventId ? updatedEvent : ev)))
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
      setEvents(prev => prev.map(ev => (ev.id === eventId ? previousSnapshot : ev)))
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
    const deleteSeries = eventObject.deleteScope === 'series' || Boolean(eventObject.deleteSeries)
    const isOptimistic = Boolean(eventObject.isOptimistic) || (typeof rawId === 'string' && rawId.startsWith('temp-'))

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

        return prev.filter(ev => !removalIds.has(ev.id))
      })

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
            setEvents(prevEvents => [...prevEvents, ...snapshotsToRestore])
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
      setEvents(prev => prev.filter(e => e.id !== rawId))
    }

    idsToRemove.forEach(id => {
      eventIdsRef.current.delete(id)
      pendingSyncEventIdsRef.current.delete(id)
      unlinkEvent(id)
      removeEventFromAllSnapshots(id)
    })

    for (const [key, arr] of eventsByDayRef.current.entries()) {
      const next = arr.filter(e => !idsToRemove.has(e.id))
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
      setEvents(prev => [...prev, ...snapshotsToRestore])
      snapshotsToRestore.forEach(snapshot => {
        eventIdsRef.current.add(snapshot.id)
        indexEventByDays(snapshot)
        saveSnapshotsForAllViews(snapshot)
        suppressedEventIdsRef.current.delete(snapshot.id)
      })
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
    fetchEventsForRange
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
