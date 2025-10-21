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
  const inFlightRangesRef = useRef(new Set())
  const prefetchedRangesRef = useRef(new Set())
  const eventsByDayRef = useRef(new Map())
  const eventIdsRef = useRef(new Set())
  const activeForegroundRequestsRef = useRef(0)
  const activeBackgroundRequestsRef = useRef(0)
  const hasLoadedInitialRef = useRef(false)
  const idlePrefetchCancelRef = useRef(null)
  const cacheTTLRef = useRef(24 * 60 * 60 * 1000) // 24h TTL
  const calHashRef = useRef('all')
  const loadedMonthsRef = useRef(new Set())
  const inFlightMonthsRef = useRef(new Set())
  const snapshotSaveTimerRef = useRef(null)

  const snapshotKey = (start, end) => {
    const u = user?.id || 'anon'
    const cal = calHashRef.current
    const viewKey = view
    return `chronos:snap:v1:${u}:${cal}:${viewKey}:${start.toISOString()}:${end.toISOString()}`
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
          const e = {
            id: ev.id,
            title: ev.title || 'Untitled',
            start: new Date(ev.start),
            end: new Date(ev.end),
            color: ev.color || 'blue',
            isGoogleEvent: true,
            calendar_id: ev.calendar_id
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
  }, [currentDate, view, getVisibleRange, extendLoadedRange])

  useEffect(() => {
    if (typeof window === 'undefined') return
    hydrateFromSnapshot()
  }, [hydrateFromSnapshot])

  const fetchEventsForRange = useCallback(async (startDate, endDate, background = false, force = false) => {
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
                cachedEvents.push({
                  id: ev.id,
                  title: ev.title || ev.summary || 'Untitled',
                  start: new Date(ev.start),
                  end: new Date(ev.end),
                  color: ev.color || 'blue',
                  isGoogleEvent: true,
                  calendar_id: ev.calendar_id
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
        const googleEvents = response.events.map(event => ({
          id: event.id,
          title: event.summary || 'Untitled',
          start: new Date(event.start.dateTime || event.start.date),
          end: new Date(event.end.dateTime || event.end.date),
          color: 'blue',
          isGoogleEvent: true,
          calendar_id: event.calendar_id
        }))
        const newEvents = googleEvents.filter(e => !eventIdsRef.current.has(e.id))
        if (newEvents.length) {
          setEvents(prev => [...prev, ...newEvents])
          for (const ev of newEvents) {
            eventIdsRef.current.add(ev.id)
            indexEventByDays(ev)
          }

          // cache by month
          try {
            const byMonth = new Map()
            for (const ev of newEvents) {
              const m = cacheMonthKey(ev.start)
              const arr = byMonth.get(m) || []
              arr.push({
                id: ev.id,
                title: ev.title,
                start: ev.start.toISOString(),
                end: ev.end.toISOString(),
                color: ev.color,
                calendar_id: ev.calendar_id
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
  }, [selectedCalendars, extendLoadedRange])

  const dateKey = (d) => {
    const y = d.getFullYear()
    const m = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const indexEventByDays = (ev) => {
    let s = startOfDay(new Date(ev.start))
    let e = startOfDay(new Date(ev.end))
    // Handle end before start gracefully
    if (e < s) e = s
    for (let d = new Date(s); d <= e; d = addDays(d, 1)) {
      const key = dateKey(d)
      const arr = eventsByDayRef.current.get(key) || []
      if (!arr.some(item => item.id === ev.id)) {
        arr.push(ev)
        eventsByDayRef.current.set(key, arr)
      }
    }
  }

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
    if (prefetchedRangesRef.current.has(key) || inFlightRangesRef.current.has(key)) {
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
      inFlightRangesRef.current.clear()
      prefetchedRangesRef.current.clear()
      eventsByDayRef.current = new Map()
      eventIdsRef.current = new Set()
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
          list.push({
            id: ev.id,
            title: ev.title,
            start: (ev.start instanceof Date ? ev.start : new Date(ev.start)).toISOString(),
            end: (ev.end instanceof Date ? ev.end : new Date(ev.end)).toISOString(),
            color: ev.color,
            calendar_id: ev.calendar_id
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
    fetchGoogleEvents(false, true)
  }, [fetchGoogleEvents])

  useEffect(() => {
    fetchGoogleEvents(false)
  }, [currentDate, view, fetchGoogleEvents])

  useEffect(() => {
    fetchGoogleEvents(false, true)
  }, [selectedCalendars, fetchGoogleEvents])

  useEffect(() => {
    const handleFocus = () => fetchGoogleEvents(true)
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchGoogleEvents])

  useEffect(() => {
    // Refresh events every 30 minutes (1800000 ms)
    const interval = setInterval(() => fetchGoogleEvents(true), 1800000)
    return () => clearInterval(interval)
  }, [fetchGoogleEvents])

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
    return eventsByDayRef.current.get(key) || []
  }, [])

  const createEvent = useCallback((eventData) => {
    // Ensure dates are proper Date objects
    const processedData = {
      ...eventData,
      start: eventData.start instanceof Date ? eventData.start : new Date(eventData.start),
      end: eventData.end instanceof Date ? eventData.end : new Date(eventData.end),
      color: eventData.color || 'blue'
    };
    
    const newEvent = {
      id: uuidv4(),
      ...processedData
    }
    
    setEvents(prev => [...prev, newEvent]);
    eventIdsRef.current.add(newEvent.id)
    indexEventByDays(newEvent)
    
    return newEvent
  }, [])

  const updateEvent = useCallback((id, updatedData) => {
    // Ensure dates are proper Date objects
    const processedData = {
      ...updatedData,
      start: updatedData.start instanceof Date ? updatedData.start : new Date(updatedData.start),
      end: updatedData.end instanceof Date ? updatedData.end : new Date(updatedData.end)
    };
    
    setEvents(prev => 
      prev.map(event => 
        event.id === id ? { ...event, ...processedData } : event
      )
    );
    // Re-index the updated event
    const updated = { id, ...processedData }
    // Remove old entries for this id
    for (const [key, arr] of eventsByDayRef.current.entries()) {
      const next = arr.filter(e => e.id !== id)
      if (next.length !== arr.length) {
        eventsByDayRef.current.set(key, next)
      }
    }
    indexEventByDays(updated)
    
    // Force a re-render by updating the current date slightly
    setCurrentDate(current => {
      // Create a completely new date object that's guaranteed to trigger a re-render
      const newDate = new Date(current.getTime() + 1);
      setTimeout(() => {
        // Reset it back after forcing the re-render
        setCurrentDate(new Date(current.getTime()));
      }, 10);
      return newDate;
    });
  }, [])

  const deleteEvent = useCallback((id) => {
    setEvents(prev => prev.filter(event => event.id !== id))
    // Remove from id set and day index
    eventIdsRef.current.delete(id)
    for (const [key, arr] of eventsByDayRef.current.entries()) {
      const next = arr.filter(e => e.id !== id)
      if (next.length !== arr.length) {
        eventsByDayRef.current.set(key, next)
      }
    }
  }, [])

  const toggleEventComplete = useCallback((id) => {
    setEvents(prev => {
      const updatedEvents = prev.map(event => 
        event.id === id ? { ...event, completed: !event.completed } : event
      );
      
      // If the currently selected event is being toggled, update it
      if (selectedEvent && selectedEvent.id === id) {
        setSelectedEvent(prev => ({ ...prev, completed: !prev.completed }));
      }
      
      return updatedEvents;
    });
  }, [selectedEvent]);

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
        noAutoFocus: true // Add flag to prevent auto-focusing
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
        color: 'blue'
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
    toggleEventComplete,
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
