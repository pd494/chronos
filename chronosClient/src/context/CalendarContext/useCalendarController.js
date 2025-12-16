import { useCallback, useEffect, useRef } from 'react'
import { calendarApi } from '../../lib/api'
import { useAuth } from '../AuthContext'
import { useSettings } from '../SettingsContext'
import { useCalendarState, useModalControls, useSnapshots } from './useCalendarHelpers'
import { useEventState } from './useEventState'
import { useEventOverrides } from './useEventOverrides'
import { useEventFetcher } from './useEventFetcher'
import { useEventCRUD } from './useEventCRUD'
import { useTodoIntegration } from './useTodoIntegration'
import { useBootstrap } from './useBootstrap'
import { safeToISOString } from './utils'

export const useCalendarController = () => {
  const { user, loading: authLoading } = useAuth()
  const { settings } = useSettings()
  const calendarState = useCalendarState()
  const { currentDate, view, headerDisplayDate, setHeaderDisplayDate, navigateToToday, navigateToPrevious, navigateToNext, changeView, selectDate } = calendarState

  const eventState = useEventState()
  const {
    events, setEvents, selectedEvent, setSelectedEvent, showEventModal, setShowEventModal,
    loading, isRevalidating, setIsRevalidating, initialLoading, setInitialLoading,
    selectedCalendars, setSelectedCalendars, checkedOffEventIds, setCheckedOffEventIds,
    eventsByDayRef, eventIdsRef, pendingSyncEventIdsRef, suppressedEventIdsRef, suppressedTodoIdsRef,
    optimisticRecurrenceMapRef, hasLoadedInitialRef, todoToEventRef, eventToTodoRef, bumpEventsByDayVersion
  } = eventState

  const { openEventModal, closeEventModal, formatDateHeader } = useModalControls({
    currentDate, view, headerDisplayDate, setSelectedEvent, setShowEventModal
  })

  const snapshotHelpers = useSnapshots({
    currentDate, view, user, eventsByDayRef, suppressedEventIdsRef, suppressedTodoIdsRef,
    optimisticRecurrenceMapRef, eventIdsRef, pendingSyncEventIdsRef, setEvents,
    loadedRangeRef: eventState.loadedRangeRef
  })

  const { getDaysInMonth, getDaysInWeek, getVisibleRange, dateKey, snapshotKey, saveSnapshotsForAllViews } = snapshotHelpers

  const todoLinkHelpers = useTodoIntegration({
    user, eventState, snapshotHelpers, checkedOffEventIds, setCheckedOffEventIds
  })

  const { isEventChecked, setEventCheckedState } = todoLinkHelpers

  const overrideHelpers = useEventOverrides({ user })
  const { eventOverridesRef, applyEventTimeOverrides, clearAllEventOverrides } = overrideHelpers

  const fetchHelpers = useEventFetcher({
    user, selectedCalendars, eventState, snapshotHelpers, todoLinkHelpers, applyEventTimeOverrides
  })

  const { fetchEventsForRange, fetchGoogleEvents, refreshEvents } = fetchHelpers

  const fetchGoogleEventsRef = useRef(null)
  fetchGoogleEventsRef.current = (bg, reset, force) => fetchGoogleEvents(getVisibleRange, currentDate, view, bg, reset, force)

  const crudHelpers = useEventCRUD({
    user, eventState, snapshotHelpers, overrideHelpers: { ...overrideHelpers, eventOverridesRef },
    todoLinkHelpers, fetchHelpers, getVisibleRange, currentDate, view, settings
  })

  const { getEventsForDate, createEvent, updateEvent, deleteEvent, respondToInvite } = crudHelpers

  const { snapshotSaveTimerRef } = useBootstrap({
    user, authLoading, eventState, snapshotHelpers, overrideHelpers, todoLinkHelpers, fetchGoogleEventsRef, selectedCalendars
  })

  const toggleEventChecked = useCallback(async (eventId) => {
    if (!eventId) return
    const isChecked = isEventChecked(eventId)
    const newCheckedState = !isChecked
    setCheckedOffEventIds(prev => {
      const next = new Set(prev)
      if (next.has(eventId)) next.delete(eventId)
      else next.add(eventId)
      return next
    })
    try {
      await calendarApi.updateEventUserState(eventId, newCheckedState)
    } catch (error) {
      console.error('Failed to update event checked state:', error)
      setCheckedOffEventIds(prev => {
        const next = new Set(prev)
        if (newCheckedState) next.delete(eventId)
        else next.add(eventId)
        return next
      })
    }
  }, [isEventChecked])

  // Snapshot save effect
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (initialLoading) return
    const { start, end } = getVisibleRange(currentDate, view)
    const max = 1200
    const list = []
    const cursor = new Date(start)
    while (cursor <= end && list.length < max) {
      const key = dateKey(cursor)
      const dayEvents = eventsByDayRef.current.get(key) || []
      for (const ev of dayEvents) {
        // Skip optimistic events - they shouldn't be persisted to snapshot
        if (ev.isOptimistic) continue
        if (!list.some(x => x.id === ev.id)) {
          // Also check for duplicate todoId - skip if we already have an event for this todo
          const evTodoId = ev.todoId || ev.todo_id
          if (evTodoId && list.some(x => (x.todoId || x.todo_id) === evTodoId)) continue

          const startIso = safeToISOString(ev.start)
          const endIso = safeToISOString(ev.end)
          if (!startIso || !endIso) continue
          list.push({
            id: ev.id, title: ev.title, description: ev.description || null,
            start: startIso, end: endIso, color: ev.color, calendar_id: ev.calendar_id,
            todoId: ev.todoId, isAllDay: Boolean(ev.isAllDay), location: ev.location || '',
            participants: ev.participants || [], attendees: ev.attendees || [],
            isOptimistic: false, isPendingSync: Boolean(ev.isPendingSync),
            organizerEmail: ev.organizerEmail || null, viewerIsOrganizer: Boolean(ev.viewerIsOrganizer),
            viewerIsAttendee: Boolean(ev.viewerIsAttendee), viewerResponseStatus: ev.viewerResponseStatus || null
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
      } catch (_) { }
    }, 200)
  }, [currentDate, view, initialLoading, events, getVisibleRange, dateKey, snapshotKey])

  const lastFetchParamsRef = useRef({ date: null, view: null })
  useEffect(() => {
    if (!user || !user.has_google_credentials) return
    if (!hasLoadedInitialRef.current) return
    const currentDateKey = currentDate?.getTime()
    const lastDateKey = lastFetchParamsRef.current.date
    const lastView = lastFetchParamsRef.current.view
    if (currentDateKey === lastDateKey && view === lastView) return
    lastFetchParamsRef.current = { date: currentDateKey, view }
    fetchGoogleEventsRef.current(false)
  }, [user?.id, currentDate, view])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleEventsRefreshNeeded = () => {
      if (!user || !user.has_google_credentials) return
      fetchGoogleEventsRef.current(false, true, true)
    }
    window.addEventListener('eventsRefreshNeeded', handleEventsRefreshNeeded)
    return () => window.removeEventListener('eventsRefreshNeeded', handleEventsRefreshNeeded)
  }, [user])

  useEffect(() => {
    if (!user || !user.has_google_credentials) return
    if (!hasLoadedInitialRef.current) return
    if (!selectedCalendars || selectedCalendars.length === 0) return

    // Skip rebuild if the skip flag is set (e.g., during optimistic updates)
    if (eventState.skipNextDayIndexRebuildRef.current) {
      eventState.skipNextDayIndexRebuildRef.current = false
      return
    }

    if (pendingSyncEventIdsRef.current.size > 0) {
      return
    }

    // Skip rebuild while a todo is being dragged - prevents events from disappearing
    if (typeof document !== 'undefined' && document.body.classList.contains('task-dragging')) {
      return
    }

    let idMap = {}
    if (typeof window !== 'undefined') {
      idMap = window.chronosCalendarIdMap || {}
      if (!Object.keys(idMap).length) {
        try {
          const raw = window.localStorage.getItem('chronos:calendar-id-map')
          if (raw) idMap = JSON.parse(raw) || {}
        } catch (_) { }
      }
    }

    const allowed = new Set()
    // Always include 'primary' since todo-created events use this as their calendar_id
    allowed.add('primary')
    selectedCalendars.forEach(id => {
      if (!id) return
      allowed.add(id)
      if (idMap[id]) allowed.add(idMap[id])
    })

    const rebuildDayIndex = () => {
      eventsByDayRef.current.clear()
      events.forEach(ev => {
        if (!ev.calendar_id || allowed.has(ev.calendar_id)) {
          const start = new Date(ev.start)
          const end = new Date(ev.end)
          let cursor = new Date(start)
          cursor.setHours(0, 0, 0, 0)
          const endDay = new Date(end)
          endDay.setHours(0, 0, 0, 0)
          if (ev.isAllDay && endDay > cursor) endDay.setDate(endDay.getDate() - 1)
          while (cursor <= endDay) {
            const key = dateKey(cursor)
            const arr = eventsByDayRef.current.get(key) || []
            arr.push(ev)
            eventsByDayRef.current.set(key, arr)
            cursor.setDate(cursor.getDate() + 1)
          }
        }
      })
    }
    rebuildDayIndex()

    // Force UI re-render after calendar toggle
    bumpEventsByDayVersion()
  }, [selectedCalendars, events, user?.id, hasLoadedInitialRef.current, dateKey, bumpEventsByDayVersion])

  // Fallback loading timeout
  useEffect(() => {
    if (!initialLoading) return
    const timer = setTimeout(() => setInitialLoading(false), 800)
    return () => clearTimeout(timer)
  }, [initialLoading])

  const handleRefreshEvents = useCallback(async () => {
    await refreshEvents(getVisibleRange, currentDate, view)
  }, [refreshEvents, getVisibleRange, currentDate, view])

  return {
    currentDate, view, events, selectedEvent, showEventModal, headerDisplayDate,
    loading, isRevalidating, initialLoading, selectedCalendars,
    getDaysInMonth, getDaysInWeek, navigateToToday, navigateToPrevious, navigateToNext,
    changeView, setView: changeView, selectDate, getEventsForDate, createEvent, updateEvent,
    respondToInvite, deleteEvent, openEventModal, closeEventModal, formatDateHeader,
    setHeaderDisplayDate, refreshEvents: handleRefreshEvents, setSelectedCalendars,
    fetchEventsForRange, isEventChecked, toggleEventChecked, clearAllEventOverrides
  }
}
