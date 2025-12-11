import { useState, useCallback, useEffect } from 'react'
import {
  startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, addDays, addMonths, addWeeks, format
} from 'date-fns'
import { getDateKey, coerceDate } from './utils'
import { parseRecurrenceRule, expandRecurrenceInstances } from '../../lib/recurrence'
import { useSnapshotStorage } from './useStorage'

const VIEW_STORAGE_KEY = 'chronos:last-view'

// Calendar navigation state
export const useCalendarState = () => {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setViewState] = useState(() => {
    if (typeof window === 'undefined') return 'month'
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
    return stored === 'day' || stored === 'week' || stored === 'month' ? stored : 'month'
  })
  const [headerDisplayDate, setHeaderDisplayDate] = useState(currentDate)

  const persistView = (next) => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(VIEW_STORAGE_KEY, next) } catch (_) { }
    }
  }

  const changeView = useCallback((newView) => {
    const next = (newView === 'day' || newView === 'week' || newView === 'month') ? newView : 'month'
    setViewState(next)
    persistView(next)
  }, [])

  const selectDate = useCallback((date) => {
    setCurrentDate(date)
    changeView('day')
  }, [changeView])

  useEffect(() => { persistView(view) }, [view])

  const navigateToToday = useCallback(() => setCurrentDate(new Date()), [])
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

  return {
    currentDate, setCurrentDate, view, changeView, setView: changeView,
    headerDisplayDate, setHeaderDisplayDate, navigateToToday, navigateToPrevious, navigateToNext, selectDate
  }
}

// Modal controls
export const useModalControls = ({ currentDate, view, headerDisplayDate, setSelectedEvent, setShowEventModal }) => {
  const openEventModal = useCallback((event = null, isNewEvent = false) => {
    if (isNewEvent && event) {
      const exactStartDate = new Date(event.start.getTime())
      const exactEndDate = new Date(event.end.getTime())
      setSelectedEvent(null)
      window.prefilledEventDates = {
        startDate: exactStartDate, endDate: exactEndDate, title: event.title || '',
        color: event.color || 'blue', isAllDay: event.isAllDay !== undefined ? event.isAllDay : false, fromDayClick: true
      }
    } else if (event) {
      setSelectedEvent(event)
      window.prefilledEventDates = null
    } else {
      const baseDate = startOfDay(currentDate || new Date())
      const startDate = new Date(baseDate)
      const endDate = addDays(new Date(baseDate), 1)
      setSelectedEvent(null)
      window.prefilledEventDates = { startDate, endDate, title: 'New Event', color: 'blue', isAllDay: true, fromEventButton: true }
    }
    setShowEventModal(true)
  }, [currentDate, setSelectedEvent, setShowEventModal])

  const closeEventModal = useCallback(() => { setSelectedEvent(null); setShowEventModal(false) }, [setSelectedEvent, setShowEventModal])

  const formatDateHeader = useCallback(() => {
    if (view === 'month') return format(headerDisplayDate, 'MMMM yyyy')
    if (view === 'week') return `${format(currentDate, 'MMMM yyyy')}`
    return format(currentDate, 'EEE MMMM d, yyyy')
  }, [currentDate, view, headerDisplayDate])

  return { openEventModal, closeEventModal, formatDateHeader }
}

// Calendar grid helpers
const useCalendarGrid = ({ eventsByDayRef, suppressedEventIdsRef, suppressedTodoIdsRef, loadedRangeRef }) => {
  const extendLoadedRange = useCallback((start, end) => {
    if (!(start instanceof Date) || !(end instanceof Date)) return
    const normalizedStart = startOfDay(start)
    const normalizedEnd = endOfDay(end)
    if (normalizedEnd <= normalizedStart) return
    if (!loadedRangeRef.current) { loadedRangeRef.current = { start: normalizedStart, end: normalizedEnd }; return }
    const currentRange = loadedRangeRef.current
    const nextStart = currentRange.start && currentRange.start < normalizedStart ? currentRange.start : normalizedStart
    const nextEnd = currentRange.end && currentRange.end > normalizedEnd ? currentRange.end : normalizedEnd
    loadedRangeRef.current = { start: nextStart, end: nextEnd }
  }, [])

  const getDaysInMonth = useCallback((date) => eachDayOfInterval({ start: startOfWeek(startOfMonth(date)), end: endOfWeek(endOfMonth(date)) }), [])
  const getDaysInWeek = useCallback((date) => eachDayOfInterval({ start: startOfWeek(date), end: endOfWeek(date) }), [])
  const getVisibleRange = useCallback((date, activeView) => {
    if (activeView === 'day') return { start: startOfDay(date), end: endOfDay(date) }
    if (activeView === 'week') return { start: startOfWeek(date), end: endOfWeek(date) }
    return { start: startOfMonth(date), end: endOfMonth(date) }
  }, [])

  const dateKey = useCallback(getDateKey, [])

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
      if (ev.isAllDay) last = addDays(last, -1)
      if (last < cursor) last = cursor
      for (let day = new Date(cursor); day <= last; day = addDays(day, 1)) {
        const key = dateKey(day)
        const arr = next.get(key) || []
        arr.push(ev)
        next.set(key, arr)
      }
    }
    next.forEach((arr, key) => {
      arr.sort((a, b) => {
        const weight = (event) => event.isOptimistic ? -2 : event.isPendingSync ? -1 : 0
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
  }, [dateKey, eventsByDayRef, suppressedEventIdsRef, suppressedTodoIdsRef])

  const indexEventByDays = useCallback((ev) => {
    const startValue = coerceDate(ev.start)
    const endValue = coerceDate(ev.end)
    if (!startValue || !endValue) return
    let s = startOfDay(new Date(startValue))
    let e = startOfDay(new Date(endValue))
    if (ev.isAllDay) e = addDays(e, -1)
    if (e < s) e = s
    for (let d = new Date(s); d <= e; d = addDays(d, 1)) {
      const key = dateKey(d)
      const arr = eventsByDayRef.current.get(key) || []
      if (!arr.some(item => item.id === ev.id)) {
        if (ev.isOptimistic) arr.unshift(ev)
        else arr.push(ev)
        eventsByDayRef.current.set(key, arr)
      }
    }
  }, [dateKey, eventsByDayRef])

  return { extendLoadedRange, getDaysInMonth, getDaysInWeek, getVisibleRange, dateKey, rebuildEventsByDayIndex, indexEventByDays }
}

// Snapshots and recurrence management
export const useSnapshots = ({
  currentDate, view, user, eventsByDayRef, suppressedEventIdsRef, suppressedTodoIdsRef,
  optimisticRecurrenceMapRef, eventIdsRef, pendingSyncEventIdsRef, setEvents, loadedRangeRef
}) => {
  const {
    extendLoadedRange, getDaysInMonth, getDaysInWeek, getVisibleRange, dateKey, rebuildEventsByDayIndex, indexEventByDays
  } = useCalendarGrid({ eventsByDayRef, suppressedEventIdsRef, suppressedTodoIdsRef, loadedRangeRef })

  const {
    snapshotKey, clearAllSnapshots, removeEventFromAllSnapshots, removeTodoFromAllSnapshots, saveSnapshotsForAllViews
  } = useSnapshotStorage({ user, view, currentDate, getVisibleRange })

  const clearOptimisticRecurrenceInstances = useCallback((parentId) => {
    if (!parentId) return
    const ids = optimisticRecurrenceMapRef.current.get(parentId)
    if (!ids || !ids.length) return
    optimisticRecurrenceMapRef.current.delete(parentId)
    setEvents(prev => prev.filter(event => !ids.includes(event.id)), { skipDayIndexRebuild: true })
    ids.forEach((id) => { eventIdsRef.current.delete(id); pendingSyncEventIdsRef.current.delete(id); removeEventFromAllSnapshots(id) })
    for (const [key, arr] of eventsByDayRef.current.entries()) {
      const filtered = arr.filter(event => !ids.includes(event.id))
      if (filtered.length !== arr.length) eventsByDayRef.current.set(key, filtered)
    }
  }, [eventIdsRef, eventsByDayRef, optimisticRecurrenceMapRef, pendingSyncEventIdsRef, removeEventFromAllSnapshots, setEvents])

  const addOptimisticRecurrenceInstances = useCallback((parentEvent, recurrenceMetaInput, rangeOverride = null) => {
    if (!parentEvent) return
    let recurrenceMeta = recurrenceMetaInput
    if (!recurrenceMeta?.enabled && parentEvent.recurrenceRule) recurrenceMeta = parseRecurrenceRule(parentEvent.recurrenceRule, parentEvent.start)
    if (!recurrenceMeta?.enabled) return
    const targetRange = rangeOverride || getVisibleRange(currentDate, view)
    if (!targetRange?.start || !targetRange?.end) return
    const occurrences = expandRecurrenceInstances(parentEvent, recurrenceMeta, targetRange.start, targetRange.end, 400)
    if (!occurrences.length) return
    const baseStart = coerceDate(parentEvent.start)
    if (!baseStart) return
    const clones = []
    occurrences.forEach((occurrence) => {
      if (Math.abs(occurrence.start.getTime() - baseStart.getTime()) < 60000) return
      const cloneId = `temp-rec-${parentEvent.id}-${occurrence.start.getTime()}`
      clones.push({
        ...parentEvent, id: cloneId, clientKey: cloneId, start: occurrence.start, end: occurrence.end,
        isOptimisticRecurrence: true, isOptimistic: true, parentRecurrenceId: parentEvent.id
      })
    })
    if (!clones.length) return
    const existing = optimisticRecurrenceMapRef.current.get(parentEvent.id) || []
    optimisticRecurrenceMapRef.current.set(parentEvent.id, [...existing, ...clones.map(clone => clone.id)])
    setEvents(prev => [...prev, ...clones], { skipDayIndexRebuild: true })
    clones.forEach((clone) => { eventIdsRef.current.add(clone.id); indexEventByDays(clone); saveSnapshotsForAllViews(clone) })
  }, [currentDate, view, optimisticRecurrenceMapRef, setEvents, eventIdsRef, indexEventByDays, saveSnapshotsForAllViews, getVisibleRange])

  const revertEventState = useCallback((snapshot) => {
    if (!snapshot?.id) return
    pendingSyncEventIdsRef.current.delete(snapshot.id)
    setEvents(prev => prev.map(event => event.id === snapshot.id ? { ...snapshot } : event), { skipDayIndexRebuild: true })
    for (const [key, arr] of eventsByDayRef.current.entries()) {
      const filtered = arr.filter(event => event.id !== snapshot.id)
      if (filtered.length !== arr.length) eventsByDayRef.current.set(key, filtered)
    }
    indexEventByDays(snapshot)
    saveSnapshotsForAllViews(snapshot)
  }, [eventsByDayRef, indexEventByDays, pendingSyncEventIdsRef, saveSnapshotsForAllViews, setEvents])

  return {
    extendLoadedRange, getDaysInMonth, getDaysInWeek, getVisibleRange, dateKey, snapshotKey,
    clearAllSnapshots, saveSnapshotsForAllViews, removeEventFromAllSnapshots, removeTodoFromAllSnapshots,
    rebuildEventsByDayIndex, indexEventByDays, clearOptimisticRecurrenceInstances, addOptimisticRecurrenceInstances, revertEventState
  }
}
