import { useCallback, useEffect, useRef } from 'react'
import { calendarApi } from '../../lib/api'
import { useAuth } from '../AuthContext'
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
  const calendarState = useCalendarState()
  const { currentDate, view, headerDisplayDate, setHeaderDisplayDate, navigateToToday, navigateToPrevious, navigateToNext, changeView, selectDate } = calendarState

  const eventState = useEventState()
  const {
    events, setEvents, selectedEvent, setSelectedEvent, showEventModal, setShowEventModal,
    loading, isRevalidating, setIsRevalidating, initialLoading, setInitialLoading,
    selectedCalendars, setSelectedCalendars, checkedOffEventIds, setCheckedOffEventIds,
    eventsByDayRef, eventIdsRef, pendingSyncEventIdsRef, suppressedEventIdsRef, suppressedTodoIdsRef,
    optimisticRecurrenceMapRef, hasLoadedInitialRef, todoToEventRef, eventToTodoRef
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
  const { eventOverridesRef, applyEventTimeOverrides } = overrideHelpers

  const fetchHelpers = useEventFetcher({
    user, selectedCalendars, eventState, snapshotHelpers, todoLinkHelpers, applyEventTimeOverrides
  })

  const { fetchEventsForRange, fetchGoogleEvents, refreshEvents } = fetchHelpers

  const fetchGoogleEventsRef = useRef(null)
  fetchGoogleEventsRef.current = (bg, reset, force) => fetchGoogleEvents(getVisibleRange, currentDate, view, bg, reset, force)

  const crudHelpers = useEventCRUD({
    user, eventState, snapshotHelpers, overrideHelpers: { ...overrideHelpers, eventOverridesRef },
    todoLinkHelpers, fetchHelpers, getVisibleRange, currentDate, view
  })

  const { getEventsForDate, createEvent, updateEvent, deleteEvent, respondToInvite } = crudHelpers

  const { snapshotSaveTimerRef } = useBootstrap({
    user, authLoading, eventState, snapshotHelpers, overrideHelpers, todoLinkHelpers, fetchGoogleEventsRef
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
        if (!list.some(x => x.id === ev.id)) {
          const startIso = safeToISOString(ev.start)
          const endIso = safeToISOString(ev.end)
          if (!startIso || !endIso) continue
          list.push({
            id: ev.id, title: ev.title, description: ev.description || null,
            start: startIso, end: endIso, color: ev.color, calendar_id: ev.calendar_id,
            todoId: ev.todoId, isAllDay: Boolean(ev.isAllDay), location: ev.location || '',
            participants: ev.participants || [], attendees: ev.attendees || [],
            isOptimistic: Boolean(ev.isOptimistic), isPendingSync: Boolean(ev.isPendingSync),
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
      } catch (_) {}
    }, 200)
  }, [currentDate, view, initialLoading, events, getVisibleRange, dateKey, snapshotKey])

  // Navigation fetch effect
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
    fetchEventsForRange, isEventChecked, toggleEventChecked
  }
}
