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
import { useAuth } from './AuthContext'
import { monthKey as cacheMonthKey, getMonths as cacheGetMonths, putMonth as cachePutMonth, pruneOlderThan } from '../lib/cache'

const CalendarContext = createContext()

const INITIAL_PAST_MONTHS = 3
const INITIAL_FUTURE_MONTHS = 3
const EXPANSION_MONTHS = 2
const IDLE_PREFETCH_EXTRA_MONTHS = 12

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


export const CalendarProvider = ({ children }) => {
  const { user } = useAuth()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState('month')
  const [headerDisplayDate, setHeaderDisplayDate] = useState(currentDate)
  const [events, setEvents] = useState([])
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
  const idlePrefetchCancelRef = useRef(null)
  const cacheTTLRef = useRef(24 * 60 * 60 * 1000) // 24h TTL
  const calHashRef = useRef('all')
  const loadedMonthsRef = useRef(new Set())
  const inFlightMonthsRef = useRef(new Set())
  const snapshotSaveTimerRef = useRef(null)

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

  const snapshotKey = (start, end) => {
    const u = user?.id || 'anon'
    const cal = calHashRef.current
    const viewKey = view
    const startIso = safeToISOString(start) || 'invalid'
    const endIso = safeToISOString(end) || 'invalid'
    return `chronos:snap:v1:${u}:${cal}:${viewKey}:${startIso}:${endIso}`
  }

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

          const e = {
            id: ev.id,
            title: ev.title || 'Untitled',
            start: new Date(ev.start),
            end: new Date(ev.end),
            color: ev.color || 'blue',
            isGoogleEvent: true,
            calendar_id: ev.calendar_id,
            todoId: todoId ? String(todoId) : undefined
          }
          if (todoId) {
            linkTodoEvent(todoId, ev.id)
          }
          toAdd.push(e)
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

                cachedEvents.push({
                  id: ev.id,
                  title: ev.title || ev.summary || 'Untitled',
                  start: new Date(ev.start),
                  end: new Date(ev.end),
                  color: ev.color || 'blue',
                  isGoogleEvent: true,
                  calendar_id: ev.calendar_id,
                  isAllDay: Boolean(ev.isAllDay),
                  todoId: todoId ? String(todoId) : undefined
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

            return {
              id: event.id,
              title: event.summary || 'Untitled',
              start,
              end,
              color: categoryColor || 'blue',
              isGoogleEvent: true,
              calendar_id: event.calendar_id,
              isAllDay,
              todoId: todoId ? String(todoId) : undefined
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

        setEvents(prev => {
          const next = []
          prev.forEach(ev => {
            const evStartRaw = ev.start instanceof Date ? ev.start : new Date(ev.start)
            const evStart = coerceDate(evStartRaw)
            const evTime = evStart.getTime()
            if (evStart && !Number.isNaN(evTime) && evTime >= segmentStartMs && evTime <= segmentEndMs) {
              const replacement = incomingById.get(ev.id)
              if (replacement) {
                next.push({ ...ev, ...replacement })
                updatedEvents.push(replacement)
                incomingById.delete(ev.id)
              } else if (ev.isOptimistic) {
                next.push(ev)
              } else {
                removedIds.push(ev.id)
              }
            } else {
              next.push(ev)
            }
          })

          incomingById.forEach(ev => {
            newEvents.push(ev)
            next.push(ev)
          })

          return next
        })

        if (removedIds.length) {
          for (const id of removedIds) {
            eventIdsRef.current.delete(id)
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
                todoId: ev.todoId
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

  const dateKey = (d) => {
    const y = d.getFullYear()
    const m = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${day}`
  }

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
  }, [])

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
  }, [currentDate, view, initialLoading, events])

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
          isAllDay,
          todoId: todoId ? String(todoId) : undefined
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
              if (newEvent.todoId) {
                linkTodoEvent(newEvent.todoId, newEvent.id)
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
              if (newEvent.todoId) {
                suppressedTodoIdsRef.current.delete(String(newEvent.todoId))
              }
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
            if (newEvent.todoId) {
              linkTodoEvent(newEvent.todoId, newEvent.id)
            }
            indexEventByDays(newEvent)
            suppressedEventIdsRef.current.delete(newEvent.id)
            if (newEvent.todoId) {
              suppressedTodoIdsRef.current.delete(String(newEvent.todoId))
            }
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

    return filtered
  }, [])

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

    const processedData = {
      ...eventData,
      start,
      end,
      color: eventData.color || 'blue',
      isAllDay
    }

    const newEvent = {
      id: uuidv4(),
      ...processedData,
      isOptimistic: true
    }

    setEvents(prev => [...prev, newEvent])
    eventIdsRef.current.add(newEvent.id)
    indexEventByDays(newEvent)
    
    try {
      const calendarId = processedData.calendar_id || processedData.calendarId || 'primary'
      const response = await calendarApi.createEvent(processedData, calendarId)
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
        todoId: processedData.todoId || processedData.todo_id || undefined
      }

      if (!eventIdsRef.current.has(newEvent.id)) {
        suppressedEventIdsRef.current.add(normalizedEvent.id)
        if (normalizedEvent.todoId) {
          suppressedTodoIdsRef.current.add(String(normalizedEvent.todoId))
        }
        calendarApi.deleteEvent(normalizedEvent.id, normalizedEvent.calendar_id || 'primary').catch(() => {})
        return normalizedEvent
      }

      setEvents(prev =>
        prev.map(event => event.id === newEvent.id ? normalizedEvent : event)
      )
      eventIdsRef.current.delete(newEvent.id)
      eventIdsRef.current.add(normalizedEvent.id)

      for (const [key, arr] of eventsByDayRef.current.entries()) {
        const filtered = arr.filter(event => event.id !== newEvent.id)
        if (filtered.length !== arr.length) {
          eventsByDayRef.current.set(key, filtered)
        }
      }
      indexEventByDays(normalizedEvent)

      return normalizedEvent
    } catch (error) {
      console.error('Failed to create event:', error)
      setEvents(prev => prev.filter(event => event.id !== newEvent.id))
      eventIdsRef.current.delete(newEvent.id)
      for (const [key, arr] of eventsByDayRef.current.entries()) {
        const filtered = arr.filter(event => event.id !== newEvent.id)
        eventsByDayRef.current.set(key, filtered)
      }
      throw error
    }
  }, [indexEventByDays])

  const updateEvent = useCallback(async (id, updatedData) => {
    // Ensure dates are proper Date objects
    let start = coerceDate(updatedData.start)
    let end = coerceDate(updatedData.end)

    if (!start) {
      const existing = events.find(e => e.id === id)
      start = coerceDate(existing?.start) || new Date()
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
    
    // Re-render happens from setEvents; avoid date jank that triggers heavy reloads
    // Call backend API to persist changes
    try {
      // Find existing event to get its calendar id
      const existing = events.find(e => e.id === id)
      const calendarId = existing?.calendar_id || 'primary'
      await calendarApi.updateEvent(id, processedData, calendarId)
    } catch (error) {
      console.error('Failed to update event:', error);
      // Could revert optimistic update here if needed
    }
  }, [indexEventByDays, events])

  const deleteEvent = useCallback(async (event) => {
    if (!event || !event.id) return

    const eventId = event.id
    const calendarId = event.calendar_id || 'primary'
    const isOptimistic = Boolean(event.isOptimistic) || (typeof eventId === 'string' && eventId.startsWith('temp-'))
    const snapshot = {
      ...event,
      start: coerceDate(event.start) || new Date(),
      end: coerceDate(event.end) || new Date()
    }

    setEvents(prev => prev.filter(e => e.id !== eventId))
    eventIdsRef.current.delete(eventId)
    unlinkEvent(eventId)
    for (const [key, arr] of eventsByDayRef.current.entries()) {
      const next = arr.filter(e => e.id !== eventId)
      if (next.length !== arr.length) {
        eventsByDayRef.current.set(key, next)
      }
    }

    // Track locally deleted IDs/todos to prevent stale rehydration
    suppressedEventIdsRef.current.add(eventId)
    if (snapshot.todoId) {
      suppressedTodoIdsRef.current.add(String(snapshot.todoId))
    }

    try {
      if (!isOptimistic) {
        await calendarApi.deleteEvent(eventId, calendarId)
        suppressedEventIdsRef.current.delete(eventId)
      }
    } catch (error) {
      const message = typeof error?.message === 'string' ? error.message : ''
      // If the event was already gone remotely, treat as success
      if (/not found/i.test(message) || /failed to delete event/i.test(message)) {
        suppressedEventIdsRef.current.add(eventId)
        return
      }

      console.error('Failed to delete event:', error)
      setEvents(prev => [...prev, snapshot])
      eventIdsRef.current.add(eventId)
      if (snapshot.todoId) {
        linkTodoEvent(snapshot.todoId, eventId)
      }
      indexEventByDays(snapshot)
      suppressedEventIdsRef.current.delete(eventId)
      if (snapshot.todoId) {
        suppressedTodoIdsRef.current.delete(String(snapshot.todoId))
      }
    }
  }, [unlinkEvent, linkTodoEvent, indexEventByDays])

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
      
      // Create a default new event starting at the current hour, lasting 1 hour
      const now = new Date();
      const startDate = new Date(now);
      startDate.setMinutes(0, 0, 0); // Round to the current hour
      
      const endDate = new Date(startDate);
      endDate.setHours(startDate.getHours() + 1); // 1 hour duration
      
      // Create default prefilled event
      window.prefilledEventDates = {
        startDate,
        endDate,
        title: 'New Event',
        color: 'blue',
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
    selectDate,
    getEventsForDate,
    createEvent,
    updateEvent,
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
