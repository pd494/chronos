import { useCallback, useRef } from 'react'
import { startOfDay, endOfDay, startOfMonth, endOfMonth, addMonths, addDays } from 'date-fns'
import { calendarApi } from '../../lib/api'
import { describeRecurrence } from '../../lib/recurrence'
import {
  INITIAL_PAST_MONTHS, INITIAL_FUTURE_MONTHS, MAX_FETCH_SEGMENT_MONTHS,
  ENSURE_RANGE_COOLDOWN_MS, FETCH_GOOGLE_EVENTS_COOLDOWN_MS, RECENT_EVENT_SYNC_TTL_MS
} from './constants'
import { saveEventsToCache } from './useStorage'
import {
  enumerateMonths, groupContiguousMonths, buildBufferedRange as buildBufferedRangeUtil,
  parseCalendarBoundary, coerceDate, transformApiEventToInternal
} from './utils'

const getAuthenticatedAccountEmails = () => {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem('chronos:authenticated-accounts')
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((acct) => (typeof acct?.email === 'string' ? acct.email.trim().toLowerCase() : ''))
      .filter(Boolean)
  } catch (_) {
    return []
  }
}

export const useEventFetcher = ({
  user, selectedCalendars, eventState, snapshotHelpers, todoLinkHelpers, applyEventTimeOverrides
}) => {
  const {
    setEvents, setLoading, setIsRevalidating, setInitialLoading, loadedRangeRef, prefetchedRangesRef,
    activeForegroundRequestsRef, activeBackgroundRequestsRef, hasLoadedInitialRef, todoToEventRef,
    eventToTodoRef, loadedMonthsRef, inFlightMonthsRef, eventsByDayRef, eventIdsRef,
    suppressedEventIdsRef, suppressedTodoIdsRef, pendingSyncEventIdsRef, optimisticEventCacheRef
  } = eventState

  const { extendLoadedRange, indexEventByDays } = snapshotHelpers
  const { unlinkEvent } = todoLinkHelpers

  const lastEnsureRangeRef = useRef({ start: null, end: null })
  const ensureRangeCooldownRef = useRef(0)
  const lastFetchGoogleEventsRef = useRef({ start: null, end: null, time: 0 })

  const buildBufferedRange = useCallback(
    (start, end, pastMonths = INITIAL_PAST_MONTHS, futureMonths = INITIAL_FUTURE_MONTHS) =>
      buildBufferedRangeUtil(start, end, pastMonths, futureMonths), []
  )

  const processSegment = useCallback(async (mStart, mEnd, background = false) => {
    const toDateFromMonth = (m, endOf = false) => {
      const yy = parseInt(m.split('-')[0], 10)
      const mm = parseInt(m.split('-')[1], 10) - 1
      if (!endOf) return new Date(yy, mm, 1)
      const d = new Date(yy, mm + 1, 0)
      d.setHours(23, 59, 59, 999)
      return d
    }

    const segStart = startOfDay(toDateFromMonth(mStart, false))
    const segEnd = endOfDay(toDateFromMonth(mEnd, true))
    const viewerEmail = typeof user?.email === 'string' ? user.email.toLowerCase() : null
    const viewerEmails = getAuthenticatedAccountEmails()

    const response = await calendarApi.getEvents(segStart.toISOString(), segEnd.toISOString())

    const providerToInternal = new Map()
    const calendarColorMap = new Map()
    const idMapGlobal = {};
    (response.calendars || []).forEach(cal => {
      if (cal.provider_calendar_id && cal.id) providerToInternal.set(cal.provider_calendar_id, cal.id)
      if (cal.id && cal.color) calendarColorMap.set(cal.id, cal.color)
      if (cal.provider_calendar_id && cal.color) calendarColorMap.set(cal.provider_calendar_id, cal.color)
      if (cal.provider_calendar_id && cal.id) {
        idMapGlobal[cal.provider_calendar_id] = cal.id
        idMapGlobal[cal.id] = cal.id
      }
    })
    const globalColors = typeof window !== 'undefined' && window.chronosCalendarColors ? window.chronosCalendarColors : {}
    if (typeof window !== 'undefined') {
      window.chronosCalendarIdMap = { ...(window.chronosCalendarIdMap || {}), ...idMapGlobal }
      try { window.localStorage.setItem('chronos:calendar-id-map', JSON.stringify(window.chronosCalendarIdMap)) } catch (_) { }
    }
    const allowedCalendarIds = (() => {
      if (!selectedCalendars || selectedCalendars.length === 0) return null
      const translated = selectedCalendars
        .flatMap(id => [id, providerToInternal.get(id) || null])
        .filter(Boolean)
      if (!translated.length) return null
      const set = new Set(translated)
      set.add('primary')
      return set
    })()


    const seriesInfo = new Map()
    for (const event of response.events) {
      if (Array.isArray(event.recurrence) && event.recurrence.length) {
        const rule = event.recurrence[0]
        const startBoundary = parseCalendarBoundary(event.start) || parseCalendarBoundary(event.originalStartTime) || new Date()
        const { state, summary } = describeRecurrence(rule, startBoundary)
        seriesInfo.set(event.id, { rule, summary, meta: state })
      }
    }

    const googleEvents = response.events
      .map(event => transformApiEventToInternal(event, { seriesInfo, viewerEmail, viewerEmails, applyOverrides: applyEventTimeOverrides }))
      .map(ev => {
        if (!ev) return ev
        const calColor = calendarColorMap.get(ev.calendar_id) || globalColors[ev.calendar_id]
        if (calColor && (!ev.color || ev.color === 'blue')) return { ...ev, color: calColor }
        return ev
      })
      .filter(ev => {
        if (!ev) return false
        if (suppressedEventIdsRef.current.has(ev.id)) return false
        if (ev.todoId && suppressedTodoIdsRef.current.has(ev.todoId)) return false
        if (!allowedCalendarIds || !allowedCalendarIds.size) return true
        if (!ev.calendar_id) return true
        return allowedCalendarIds.has(ev.calendar_id)
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
    const preservedPendingSyncEvents = []
    const now = Date.now()
    const allowDeletions = !background

    setEvents(prev => {
      const next = []
      prev.forEach(ev => {
        const evStartRaw = ev.start instanceof Date ? ev.start : new Date(ev.start)
        const evStart = coerceDate(evStartRaw)
        const evTime = evStart?.getTime()
        if (evStart && !Number.isNaN(evTime) && evTime >= segmentStartMs && evTime <= segmentEndMs) {
          const replacement = incomingById.get(ev.id)
          if (replacement) {
            pendingSyncEventIdsRef.current.delete(ev.id)
            optimisticEventCacheRef.current.delete(ev.id)
            const merged = { ...ev, ...replacement, clientKey: ev.clientKey || replacement.clientKey || replacement.id, isPendingSync: false }
            next.push(merged)
            updatedEvents.push(merged)
            incomingById.delete(ev.id)
          } else {
            const pendingTimestamp = pendingSyncEventIdsRef.current.get(ev.id)
            let isPendingSync = Boolean(ev.isPendingSync)
            if (typeof pendingTimestamp === 'number') {
              if (now - pendingTimestamp > RECENT_EVENT_SYNC_TTL_MS) pendingSyncEventIdsRef.current.delete(ev.id)
              else isPendingSync = true
            }
            if (ev.isOptimistic || isPendingSync) {
              const carry = isPendingSync && !ev.isPendingSync ? { ...ev, isPendingSync: true } : ev
              next.push(carry)
              if (isPendingSync) preservedPendingSyncEvents.push(carry)
            } else if (allowDeletions && ev.isGoogleEvent) {
              eventIdsRef.current.delete(ev.id)
              pendingSyncEventIdsRef.current.delete(ev.id)
              unlinkEvent(ev.id)
              for (const [key, arr] of eventsByDayRef.current.entries()) {
                const filtered = arr.filter(item => item.id !== ev.id)
                if (filtered.length !== arr.length) eventsByDayRef.current.set(key, filtered)
              }
            } else next.push(ev)
          }
        } else next.push(ev)
      })

      incomingById.forEach(ev => {
        pendingSyncEventIdsRef.current.delete(ev.id)
        const normalized = { ...ev, clientKey: ev.clientKey || ev.id, isPendingSync: false }
        newEvents.push(normalized)
        next.push(normalized)
      })

      const existingIds = new Set(next.map(event => event.id))
      const existingTodoIds = new Set(next.map(event => event.todoId || event.todo_id).filter(Boolean).map(String))

      optimisticEventCacheRef.current.forEach(optEvent => {
        const optTodoId = optEvent.todoId || optEvent.todo_id
        // Only add if ID is new AND todoId is not already present (meaning not resolved yet)
        if (!existingIds.has(optEvent.id) &&
          (!optTodoId || !existingTodoIds.has(String(optTodoId)))) {
          existingIds.add(optEvent.id)
          next.unshift(optEvent)
          reinsertedOptimisticEvents.push(optEvent)
        }
      })

      return next
    }, { skipDayIndexRebuild: true })

    const toReindex = [...updatedEvents, ...newEvents, ...reinsertedOptimisticEvents, ...preservedPendingSyncEvents]

    const stillPendingIds = new Set(preservedPendingSyncEvents.map(ev => ev.id))
    if (toReindex.length) {
      for (const ev of toReindex) {
        eventIdsRef.current.add(ev.id)
        if (!stillPendingIds.has(ev.id)) {
          pendingSyncEventIdsRef.current.delete(ev.id)
        }
        for (const [key, arr] of eventsByDayRef.current.entries()) {
          const updatedArr = arr.map(item => item.id === ev.id ? ev : item)
          const hadEvent = arr.some(item => item.id === ev.id)
          if (hadEvent) eventsByDayRef.current.set(key, updatedArr)
        }
        indexEventByDays(ev)
      }
    }

    const segMonths = enumerateMonths(segStart, segEnd)
    for (const m of segMonths) loadedMonthsRef.current.add(m)
    extendLoadedRange(segStart, segEnd)
  }, [user, selectedCalendars, extendLoadedRange, applyEventTimeOverrides, unlinkEvent])

  const fetchEventsForRange = useCallback(async (startDate, endDate, background = false, forceReload = false) => {
    if (!user) return
    if (!(startDate instanceof Date) || !(endDate instanceof Date)) return

    const rangeStart = startOfDay(startDate)
    const rangeEnd = endOfDay(endDate)
    if (rangeEnd <= rangeStart) return

    if (!forceReload && loadedRangeRef.current && loadedRangeRef.current.start <= rangeStart && loadedRangeRef.current.end >= rangeEnd) return

    const allMonths = enumerateMonths(rangeStart, rangeEnd)
    const missingMonths = []
    for (const m of allMonths) {
      if (!forceReload && loadedMonthsRef.current.has(m)) continue
      if (inFlightMonthsRef.current.has(m)) continue
      missingMonths.push(m)
    }
    if (missingMonths.length === 0) return

    const baseSegments = groupContiguousMonths(missingMonths)
    const segments = []
    const toDateFromMonthKey = (m) => {
      const yy = parseInt(m.split('-')[0], 10)
      const mm = parseInt(m.split('-')[1], 10) - 1
      return new Date(yy, mm, 1)
    }
    for (const [segStartKey, segEndKey] of baseSegments) {
      const segMonths = enumerateMonths(toDateFromMonthKey(segStartKey), toDateFromMonthKey(segEndKey))
      for (let i = 0; i < segMonths.length; i += MAX_FETCH_SEGMENT_MONTHS) {
        const slice = segMonths.slice(i, i + MAX_FETCH_SEGMENT_MONTHS)
        if (!slice.length) continue
        segments.push([slice[0], slice[slice.length - 1]])
      }
    }

    for (const m of missingMonths) inFlightMonthsRef.current.add(m)

    try {
      if (!background) { activeForegroundRequestsRef.current += 1; setLoading(true) }
      else { activeBackgroundRequestsRef.current += 1; setIsRevalidating(true) }

      const concurrency = 1
      let index = 0
      const runners = Array.from({ length: Math.min(concurrency, segments.length) }, async () => {
        while (index < segments.length) {
          const myIndex = index++
          try {
            await processSegment(segments[myIndex][0], segments[myIndex][1], background)
          } catch (_) { }
        }
      })
      await Promise.all(runners)

      if (!hasLoadedInitialRef.current) { hasLoadedInitialRef.current = true; setInitialLoading(false) }

      setTimeout(() => {
        setEvents(currentEvents => { saveEventsToCache(user?.id, currentEvents); return currentEvents })
      }, 100)
    } catch (error) {
      console.error('Failed to fetch events for range:', error)
      if (!hasLoadedInitialRef.current) setInitialLoading(false)
      throw error
    } finally {
      for (const m of missingMonths) inFlightMonthsRef.current.delete(m)
      if (!background) {
        activeForegroundRequestsRef.current = Math.max(0, activeForegroundRequestsRef.current - 1)
        if (activeForegroundRequestsRef.current === 0) setLoading(false)
      } else {
        activeBackgroundRequestsRef.current = Math.max(0, activeBackgroundRequestsRef.current - 1)
        if (activeBackgroundRequestsRef.current === 0) setIsRevalidating(false)
      }
    }
  }, [user, processSegment])

  const prefetchRange = useCallback((start, end) => {
    if (!(start instanceof Date) || !(end instanceof Date)) return
    const rangeStart = startOfDay(start)
    const rangeEnd = endOfDay(end)
    if (rangeEnd <= rangeStart) return
    if (loadedRangeRef.current && loadedRangeRef.current.start <= rangeStart && loadedRangeRef.current.end >= rangeEnd) return
    const key = `${rangeStart.getTime()}_${rangeEnd.getTime()}`
    if (prefetchedRangesRef.current.has(key)) return
    const months = enumerateMonths(rangeStart, rangeEnd)
    const hasInFlightMonths = months.some(m => inFlightMonthsRef.current.has(m))
    if (hasInFlightMonths) return
    prefetchedRangesRef.current.add(key)
    fetchEventsForRange(rangeStart, rangeEnd, true).catch(() => prefetchedRangesRef.current.delete(key))
  }, [fetchEventsForRange])

  const ensureRangeLoaded = useCallback(async (visibleStart, visibleEnd, background = false, force = false) => {
    if (!(visibleStart instanceof Date) || !(visibleEnd instanceof Date)) return
    const visibleRange = { start: startOfDay(visibleStart), end: endOfDay(visibleEnd) }
    const now = Date.now()
    const rangeKey = `${visibleRange.start.getTime()}_${visibleRange.end.getTime()}`
    const lastKey = `${lastEnsureRangeRef.current.start}_${lastEnsureRangeRef.current.end}`
    if (!force && rangeKey === lastKey && (now - ensureRangeCooldownRef.current) < ENSURE_RANGE_COOLDOWN_MS) return

    const targetRange = buildBufferedRange(visibleStart, visibleEnd)
    if (!targetRange) return

    if (!loadedRangeRef.current || force) loadedRangeRef.current = null
    let currentRange = loadedRangeRef.current
    if (!currentRange) {
      await fetchEventsForRange(targetRange.start, targetRange.end, background, true)
      currentRange = loadedRangeRef.current
      lastEnsureRangeRef.current = { start: visibleRange.start.getTime(), end: visibleRange.end.getTime() }
      ensureRangeCooldownRef.current = now
    }
    if (!currentRange) return

    if (targetRange.start < currentRange.start) {
      const fetchEnd = addDays(currentRange.start, -1)
      if (fetchEnd > targetRange.start) {
        await fetchEventsForRange(targetRange.start, fetchEnd, background)
        currentRange = loadedRangeRef.current
      }
    }
    if (targetRange.end > currentRange.end) {
      const fetchStart = addDays(currentRange.end, 1)
      if (targetRange.end > fetchStart) await fetchEventsForRange(fetchStart, targetRange.end, background)
    }
  }, [buildBufferedRange, fetchEventsForRange])

  const fetchGoogleEvents = useCallback(async (getVisibleRange, currentDate, view, background = false, reset = false, forceRefresh = false) => {
    const { start, end } = getVisibleRange(currentDate, view)
    const rangeKey = `${start.getTime()}_${end.getTime()}`
    const now = Date.now()

    if (!reset && !forceRefresh && hasLoadedInitialRef.current && background) {
      const lastKey = `${lastFetchGoogleEventsRef.current.start}_${lastFetchGoogleEventsRef.current.end}`
      if (rangeKey === lastKey && (now - lastFetchGoogleEventsRef.current.time) < FETCH_GOOGLE_EVENTS_COOLDOWN_MS) return
    }

    if (!reset && !forceRefresh && hasLoadedInitialRef.current) return

    if (reset) {
      eventState.resetForRefresh()
      try { const snapshotKey = `chronos:snap:${user?.id || ''}:${start.getTime()}_${end.getTime()}`; window.sessionStorage.removeItem(snapshotKey) } catch (_) { }
    }

    const isInitialLoad = !hasLoadedInitialRef.current
    const initialPastMonths = 2
    const initialFutureMonths = 2
    const initialStart = startOfMonth(addMonths(currentDate, -initialPastMonths))
    initialStart.setHours(0, 0, 0, 0)
    const initialEnd = endOfMonth(addMonths(currentDate, initialFutureMonths))
    initialEnd.setHours(23, 59, 59, 999)

    try {
      if (isInitialLoad) {
        await fetchEventsForRange(initialStart, initialEnd, background, true)
        loadedRangeRef.current = { start: initialStart, end: initialEnd }
        hasLoadedInitialRef.current = true
        setInitialLoading(false)
      } else if (reset) {
        const bufferStart = new Date(start); bufferStart.setMonth(bufferStart.getMonth() - 2)
        const bufferEnd = new Date(end); bufferEnd.setMonth(bufferEnd.getMonth() + 2)
        await fetchEventsForRange(bufferStart, bufferEnd, background, true)
        hasLoadedInitialRef.current = true
        setInitialLoading(false)
      } else if (forceRefresh) {
        const currentRange = loadedRangeRef.current
        if (currentRange) await fetchEventsForRange(currentRange.start, currentRange.end, true, true)
      } else await ensureRangeLoaded(start, end, background, reset)

      lastFetchGoogleEventsRef.current = { start: start.getTime(), end: end.getTime(), time: now }

      if (typeof window !== 'undefined') {
        const todoIds = Array.from(todoToEventRef.current.keys())
        window.dispatchEvent(new CustomEvent('calendarTodoEventsSynced', { detail: { todoIds } }))
      }
    } catch (error) { if (!background) console.error('Failed to load calendar events:', error) }
  }, [fetchEventsForRange, ensureRangeLoaded, user?.id])

  const refreshEvents = useCallback(async (getVisibleRange, currentDate, view) => {
    if (!user || !user.has_google_credentials) return
    setIsRevalidating(true)
    try { await calendarApi.syncCalendarForeground() }
    catch (_) { try { await calendarApi.syncCalendar() } catch (_) { } }
    await fetchGoogleEvents(getVisibleRange, currentDate, view, false, true)
    setIsRevalidating(false)
  }, [user, fetchGoogleEvents])

  return { fetchEventsForRange, prefetchRange, ensureRangeLoaded, fetchGoogleEvents, refreshEvents, buildBufferedRange }
}
