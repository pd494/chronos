import { useState, useCallback, useEffect, useRef } from 'react'
import { CHECKED_EVENTS_STORAGE_KEY } from './constants'

export const useEventState = () => {
  const [events, setEventsState] = useState([])
  const eventsRefValue = useRef(events)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showEventModal, setShowEventModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isRevalidating, setIsRevalidating] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [selectedCalendars, setSelectedCalendars] = useState(null)

  // Version counter to force UI re-renders when eventsByDayRef is modified
  const [eventsByDayVersion, setEventsByDayVersion] = useState(0)
  const bumpEventsByDayVersion = useCallback(() => setEventsByDayVersion(v => v + 1), [])

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

  const getInitialSuppressedEventIds = () => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = window.sessionStorage.getItem('chronos:suppressed-event-ids')
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch (_) { return new Set() }
  }
  const getInitialSuppressedTodoIds = () => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = window.sessionStorage.getItem('chronos:suppressed-todo-ids')
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch (_) { return new Set() }
  }
  const suppressedEventIdsRef = useRef(getInitialSuppressedEventIds())
  const suppressedTodoIdsRef = useRef(getInitialSuppressedTodoIds())

  const pendingSyncEventIdsRef = useRef(new Map())
  const optimisticRecurrenceMapRef = useRef(new Map())
  const optimisticEventCacheRef = useRef(new Map())
  const loadedMonthsRef = useRef(new Set())
  const inFlightMonthsRef = useRef(new Set())
  const hasBootstrappedRef = useRef(false)

  const [checkedOffEventIds, setCheckedOffEventIds] = useState(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = window.localStorage.getItem(CHECKED_EVENTS_STORAGE_KEY)
      const parsed = JSON.parse(raw || '[]')
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter(id => typeof id === 'string' || typeof id === 'number'))
      }
    } catch (_) { }
    return new Set()
  })

  const setEvents = useCallback((updater, options = {}) => {
    if (options?.skipDayIndexRebuild) {
      skipNextDayIndexRebuildRef.current = true
    }
    setEventsState(updater)
  }, [])

  useEffect(() => {
    eventsRefValue.current = events
  }, [events])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(CHECKED_EVENTS_STORAGE_KEY, JSON.stringify(Array.from(checkedOffEventIds)))
    } catch (_) { }
  }, [checkedOffEventIds])

  useEffect(() => {
    const ids = new Set()
    for (const ev of events) {
      if (ev && ev.id) {
        ids.add(ev.id)
      }
    }
    eventIdsRef.current = ids
  }, [events])

  const persistSuppressedIds = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem('chronos:suppressed-event-ids', JSON.stringify([...suppressedEventIdsRef.current]))
      window.sessionStorage.setItem('chronos:suppressed-todo-ids', JSON.stringify([...suppressedTodoIdsRef.current]))
    } catch (_) { }
  }, [])

  useEffect(() => {
    const handleDeleted = () => persistSuppressedIds()
    window.addEventListener('eventDeleted', handleDeleted)
    return () => window.removeEventListener('eventDeleted', handleDeleted)
  }, [persistSuppressedIds])

  const resetState = useCallback(() => {
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
  }, [setEvents])

  const resetForRefresh = useCallback(() => {
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
  }, [setEvents])

  return {
    events,
    setEvents,
    eventsRefValue,
    selectedEvent,
    setSelectedEvent,
    showEventModal,
    setShowEventModal,
    loading,
    setLoading,
    isRevalidating,
    setIsRevalidating,
    initialLoading,
    setInitialLoading,
    selectedCalendars,
    setSelectedCalendars,
    checkedOffEventIds,
    setCheckedOffEventIds,

    loadedRangeRef,
    prefetchedRangesRef,
    eventsByDayRef,
    eventsByDayVersion,
    bumpEventsByDayVersion,
    skipNextDayIndexRebuildRef,
    eventIdsRef,
    activeForegroundRequestsRef,
    activeBackgroundRequestsRef,
    hasLoadedInitialRef,
    todoToEventRef,
    eventToTodoRef,
    suppressedEventIdsRef,
    suppressedTodoIdsRef,
    pendingSyncEventIdsRef,
    optimisticRecurrenceMapRef,
    optimisticEventCacheRef,
    loadedMonthsRef,
    inFlightMonthsRef,
    hasBootstrappedRef,

    resetState,
    resetForRefresh
  }
}
