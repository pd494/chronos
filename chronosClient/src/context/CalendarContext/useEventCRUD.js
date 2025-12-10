import { useCallback } from 'react'
import { startOfDay } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'
import { calendarApi, todosApi } from '../../lib/api'
import { describeRecurrence } from '../../lib/recurrence'
import { addEventToCache, removeEventFromCache, clearEventsCache } from './cache'
import {
  parseCalendarBoundary, resolveIsAllDay, coerceDate, safeJsonParse, safeToISOString,
  resolveEventMeetingLocation, normalizeResponseStatus, eventBehavesLikeAllDay, dispatchBounceEvent
} from './utils'

export const useEventCRUD = ({
  user,
  eventState,
  snapshotHelpers,
  overrideHelpers,
  todoLinkHelpers,
  fetchHelpers,
  getVisibleRange,
  currentDate,
  view
}) => {
  const {
    events, setEvents, eventsRefValue, setSelectedEvent, eventsByDayRef, eventIdsRef,
    pendingSyncEventIdsRef, suppressedEventIdsRef, suppressedTodoIdsRef,
    optimisticEventCacheRef, todoToEventRef, eventToTodoRef, bumpEventsByDayVersion
  } = eventState

  const {
    indexEventByDays, saveSnapshotsForAllViews, removeEventFromAllSnapshots, removeTodoFromAllSnapshots,
    clearAllSnapshots, addOptimisticRecurrenceInstances, clearOptimisticRecurrenceInstances, revertEventState, dateKey
  } = snapshotHelpers

  const { recordEventOverride, clearOverrideIfSynced, eventOverridesRef } = overrideHelpers
  const { unlinkEvent } = todoLinkHelpers
  const { fetchEventsForRange } = fetchHelpers

  const migrateOptimisticRecurrenceParentId = (oldId, newId) => {
    if (!oldId || !newId || oldId === newId) return
    const existing = eventState.optimisticRecurrenceMapRef.current.get(oldId)
    if (existing) {
      eventState.optimisticRecurrenceMapRef.current.delete(oldId)
      eventState.optimisticRecurrenceMapRef.current.set(newId, existing)
    }
  }

  const emitTodoScheduleUpdate = (todoId, start, end, isAllDay) => {
    if (!todoId) return
    window.dispatchEvent(new CustomEvent('todoScheduleUpdated', {
      detail: { todoId, start: start ? safeToISOString(start) : null, end: end ? safeToISOString(end) : null, isAllDay: Boolean(isAllDay) }
    }))
  }

  const triggerEventBounce = useCallback((eventId) => dispatchBounceEvent(eventId), [])

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
    return filtered.sort((a, b) => {
      const weight = (event) => event.isOptimistic ? -2 : event.isPendingSync ? -1 : 0
      const weightDiff = weight(a) - weight(b)
      if (weightDiff !== 0) return weightDiff
      const aIsAllDay = eventBehavesLikeAllDay(a)
      const bIsAllDay = eventBehavesLikeAllDay(b)
      if (aIsAllDay !== bIsAllDay) return aIsAllDay ? -1 : 1
      const aStart = coerceDate(a.start)?.getTime() ?? 0
      const bStart = coerceDate(b.start)?.getTime() ?? 0
      if (aStart !== bStart) return aStart - bStart
      return (a.title || '').localeCompare(b.title || '')
    })
  }, [dateKey])

  const createEvent = useCallback(async (eventData) => {
    let start = coerceDate(eventData.start)
    let end = coerceDate(eventData.end)
    if (!start) start = new Date()
    if (!end || end <= start) end = new Date(start.getTime() + 30 * 60 * 1000)
    const isAllDay = typeof eventData.isAllDay === 'boolean' ? eventData.isAllDay : false
    const recurrenceArray = Array.isArray(eventData.recurrence) && eventData.recurrence.length
      ? eventData.recurrence : (eventData.recurrenceRule ? [eventData.recurrenceRule] : undefined)
    const targetCalendarId = eventData.calendar_id || eventData.calendarId || 'primary'

    const processedData = {
      ...eventData, start, end, color: eventData.color || 'blue', reminders: eventData.reminders || null,
      isAllDay, transparency: eventData.transparency === 'transparent' ? 'transparent' : 'opaque',
      visibility: eventData.visibility || 'public', calendar_id: targetCalendarId
    }
    if (recurrenceArray) processedData.recurrence = recurrenceArray
    else delete processedData.recurrence
    if (eventData.recurrenceRule) processedData.recurrenceRule = eventData.recurrenceRule
    if (eventData.recurrenceSummary) processedData.recurrenceSummary = eventData.recurrenceSummary
    if (eventData.recurrenceMeta) processedData.recurrenceMeta = eventData.recurrenceMeta
    else if (recurrenceArray && recurrenceArray.length) {
      const { state, summary } = describeRecurrence(recurrenceArray[0], start)
      processedData.recurrenceMeta = state
      if (!processedData.recurrenceSummary) processedData.recurrenceSummary = summary
    }

    const clientKey = uuidv4()
    const newEvent = {
      id: clientKey, clientKey, ...processedData, organizerEmail: user?.email || null,
      viewerResponseStatus: 'accepted', viewerIsOrganizer: true, viewerIsAttendee: false,
      inviteCanRespond: false, isInvitePending: false, isOptimistic: true,
      transparency: processedData.transparency, visibility: processedData.visibility
    }

    optimisticEventCacheRef.current.set(newEvent.id, newEvent)
    eventIdsRef.current.add(newEvent.id)
    indexEventByDays(newEvent)
    setEvents(prev => [...prev, newEvent], { skipDayIndexRebuild: true })
    addEventToCache(user?.id, { ...newEvent, isGoogleEvent: true }).catch(() => { })
    saveSnapshotsForAllViews(newEvent)

    if (processedData.recurrenceMeta?.enabled) {
      const rangeOverride = eventState.loadedRangeRef.current
        ? { start: eventState.loadedRangeRef.current.start, end: eventState.loadedRangeRef.current.end } : null
      addOptimisticRecurrenceInstances(newEvent, processedData.recurrenceMeta, rangeOverride)
    }

    try {
      const calendarId = processedData.calendar_id || 'primary'
      const sendNotifications = processedData.sendNotifications || false
      const response = await calendarApi.createEvent(processedData, calendarId, sendNotifications)
      const created = response?.event || response

      const createdStart = coerceDate(created?.start?.dateTime || created?.start?.date || created?.start) || start
      const createdEndRaw = coerceDate(created?.end?.dateTime || created?.end?.date || created?.end)
      const createdEnd = createdEndRaw && createdEndRaw > createdStart ? createdEndRaw : new Date(createdStart.getTime() + 30 * 60 * 1000)
      const createdColor = created?.extendedProperties?.private?.categoryColor || created?.color || processedData.color || 'blue'

      const normalizedEvent = {
        id: created?.id || newEvent.id, clientKey: newEvent.clientKey || newEvent.id,
        title: created?.summary || created?.title || processedData.title || 'New Event',
        description: created?.description || processedData.description || null,
        start: createdStart, end: createdEnd, color: createdColor,
        isAllDay: resolveIsAllDay(created?.start, created) || processedData.isAllDay,
        calendar_id: created?.organizer?.email || created?.calendar_id || calendarId, isOptimistic: false,
        location: resolveEventMeetingLocation(created, processedData.location), participants: processedData.participants,
        todoId: processedData.todoId || processedData.todo_id || undefined,
        reminders: created?.reminders || processedData.reminders || null,
        recurrenceRule: Array.isArray(created?.recurrence) && created.recurrence.length ? created.recurrence[0] : processedData.recurrenceRule || null,
        recurrenceSummary: created?.extendedProperties?.private?.recurrenceSummary || processedData.recurrenceSummary || null,
        recurrenceMeta: safeJsonParse(created?.extendedProperties?.private?.recurrenceMeta, processedData.recurrenceMeta || null),
        recurringEventId: created?.recurringEventId || null, organizerEmail: created?.organizer?.email || user?.email || null,
        viewerResponseStatus: 'accepted', viewerIsOrganizer: true, viewerIsAttendee: false,
        inviteCanRespond: false, isInvitePending: false,
        transparency: created?.transparency || processedData.transparency || 'opaque',
        visibility: created?.visibility || processedData.visibility || 'public'
      }

      optimisticEventCacheRef.current.delete(newEvent.id)
      migrateOptimisticRecurrenceParentId(newEvent.id, normalizedEvent.id)

      // If optimistic ID is missing from refs (due to race condition), log warning but DO NOT suppress the real event.
      // Suppression causes the "disappearing event" bug.
      if (!eventIdsRef.current.has(newEvent.id)) {
        console.warn('[Calendar] Optimistic ID missing during creation completion - proceeding to avoid zombie state', newEvent.id)
      }

      pendingSyncEventIdsRef.current.set(normalizedEvent.id, Date.now())
      const normalizedWithPending = { ...normalizedEvent, isPendingSync: true }
      eventIdsRef.current.delete(newEvent.id)
      eventIdsRef.current.add(normalizedEvent.id)

      // Atomically replace optimistic event with normalized event in eventsByDayRef
      // to prevent flicker caused by a gap between removal and re-addition.
      // We iterate all keys because the event might exist in multiple days.
      for (const [key, arr] of eventsByDayRef.current.entries()) {
        const updated = arr.map(event => event.id === newEvent.id ? normalizedWithPending : event)
        const hasOldEvent = arr.some(event => event.id === newEvent.id)
        if (hasOldEvent) eventsByDayRef.current.set(key, updated)
      }

      // Also index in case the event spans additional days not covered by the optimistic version
      indexEventByDays(normalizedWithPending)

      setEvents(prev => {
        const result = []
        let found = false
        for (const event of prev) {
          if (event.id === newEvent.id) { result.push(normalizedWithPending); found = true }
          else result.push(event)
        }
        if (!found) result.push(normalizedWithPending)
        return result
      }, { skipDayIndexRebuild: true })

      removeEventFromAllSnapshots(newEvent.id)
      saveSnapshotsForAllViews(normalizedWithPending)
      removeEventFromCache(newEvent.id).catch(() => { })
      addEventToCache(user?.id, { ...normalizedWithPending, isGoogleEvent: true }).catch(() => { })

      const resolvedServerStart = parseCalendarBoundary(created?.start) || coerceDate(created?.start) || start
      const resolvedServerEnd = parseCalendarBoundary(created?.end) || coerceDate(created?.end) || end
      clearOverrideIfSynced(normalizedEvent.id, resolvedServerStart, resolvedServerEnd)

      const hasRecurrence = processedData.recurrenceMeta?.enabled ||
        (Array.isArray(processedData.recurrence) && processedData.recurrence.length > 0) ||
        (processedData.recurrenceRule && processedData.recurrenceRule.trim().length > 0)
      if (hasRecurrence) {
        try {
          const { start: visibleStart, end: visibleEnd } = getVisibleRange(currentDate, view)
          if (visibleStart && visibleEnd) {
            fetchEventsForRange(visibleStart, visibleEnd, true, true)
              .then(() => clearOptimisticRecurrenceInstances(normalizedEvent.id)).catch(() => { })
          }
        } catch (_) { }
      } else clearOptimisticRecurrenceInstances(normalizedEvent.id)

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
  }, [user, indexEventByDays, saveSnapshotsForAllViews, removeEventFromAllSnapshots, getVisibleRange, currentDate, view, fetchEventsForRange, addOptimisticRecurrenceInstances, clearOptimisticRecurrenceInstances, clearOverrideIfSynced])

  const updateEvent = useCallback(async (id, updatedData = {}) => {
    const isOptimistic = typeof id === 'string' && id.startsWith('temp-')
    const existingEvent = events.find(e => e.id === id)
    const previousEventSnapshot = existingEvent
      ? { ...existingEvent, start: coerceDate(existingEvent.start) || new Date(), end: coerceDate(existingEvent.end) || new Date() } : null

    const { recurringEditScope, ...incomingData } = updatedData || {}
    const linkedTodoId = eventToTodoRef.current.get(String(id)) || null

    const resolveSeriesId = (ev) => ev?.recurringEventId || ev?.parentRecurrenceId || ev?.id || null
    const targetSeriesId = resolveSeriesId(existingEvent)
    const applySeriesScope = recurringEditScope === 'all' || recurringEditScope === 'future'

    let start = coerceDate(incomingData.start)
    let end = coerceDate(incomingData.end)
    if (!start) start = coerceDate(existingEvent?.start) || new Date()
    if (!end || end <= start) end = new Date(start.getTime() + 30 * 60 * 1000)
    const isAllDay = typeof updatedData.isAllDay === 'boolean' ? updatedData.isAllDay : undefined

    const processedData = {
      ...incomingData, start, end, color: updatedData.color ?? existingEvent?.color ?? 'blue',
      reminders: updatedData.reminders ?? existingEvent?.reminders ?? null
    }
    if (typeof isAllDay === 'boolean') processedData.isAllDay = isAllDay

    const recurrenceArray = Array.isArray(updatedData.recurrence) && updatedData.recurrence.length
      ? updatedData.recurrence : (updatedData.recurrenceRule ? [updatedData.recurrenceRule] : undefined)
    if (recurrenceArray) processedData.recurrence = recurrenceArray
    else if ('recurrence' in processedData) delete processedData.recurrence
    if ('recurrenceRule' in updatedData) {
      processedData.recurrenceRule = updatedData.recurrenceRule
      if (!updatedData.recurrenceRule) delete processedData.recurrence
    }
    if ('recurrenceSummary' in updatedData) processedData.recurrenceSummary = updatedData.recurrenceSummary
    if ('recurrenceMeta' in updatedData) processedData.recurrenceMeta = updatedData.recurrenceMeta
    processedData.transparency = updatedData.transparency === 'transparent' ? 'transparent' : 'opaque'
    processedData.visibility = updatedData.visibility || 'public'

    const recurrenceMeta = processedData.recurrenceMeta
    clearOptimisticRecurrenceInstances(id)
    if (recurrenceMeta?.enabled) {
      const parentSnapshot = { ...(existingEvent || {}), ...processedData, id }
      const rangeOverride = eventState.loadedRangeRef.current
        ? { start: eventState.loadedRangeRef.current.start, end: eventState.loadedRangeRef.current.end } : null
      addOptimisticRecurrenceInstances(parentSnapshot, recurrenceMeta, rangeOverride)
    }

    const existingStart = coerceDate(existingEvent?.start)
    const existingEnd = coerceDate(existingEvent?.end)
    const startsSame = existingStart && Math.abs(existingStart.getTime() - start.getTime()) < 60 * 1000
    const endsSame = existingEnd && Math.abs(existingEnd.getTime() - end.getTime()) < 60 * 1000
    const hasOverride = eventOverridesRef.current.has(id)
    if (!(startsSame && endsSame && !hasOverride)) recordEventOverride(id, start, end)

    const updateForSeries = { ...processedData }
    delete updateForSeries.start
    delete updateForSeries.end

    const seriesUpdates = []
    setEvents(prev => prev.map(event => {
      let sameSeries = applySeriesScope && targetSeriesId && resolveSeriesId(event) === targetSeriesId
      if (sameSeries && recurringEditScope === 'future') {
        const evStart = coerceDate(event.start)
        if (!evStart || evStart < start) sameSeries = false
      }
      const isTarget = String(event.id) === String(id)
      if (!sameSeries && !isTarget) return event
      const merged = isTarget ? { ...event, ...processedData } : { ...event, ...updateForSeries }
      seriesUpdates.push(merged)
      return merged
    }), { skipDayIndexRebuild: true })
    setSelectedEvent(prev => (!prev || prev.id !== id) ? prev : { ...prev, ...processedData, start, end })
    if (linkedTodoId) emitTodoScheduleUpdate(linkedTodoId, start, end, processedData.isAllDay ?? existingEvent?.isAllDay)

    const idsToReindex = new Set(seriesUpdates.map(ev => ev.id))
    for (const [key, arr] of eventsByDayRef.current.entries()) {
      const next = arr.filter(e => !idsToReindex.has(e.id))
      if (next.length !== arr.length) eventsByDayRef.current.set(key, next)
    }
    seriesUpdates.forEach(ev => indexEventByDays(ev))
    seriesUpdates.forEach(ev => saveSnapshotsForAllViews(ev))

    if (isOptimistic) return

    try {
      const calendarId = existingEvent?.calendar_id || 'primary'
      const sendNotifications = processedData.sendNotifications || false
      const payloadForBackend = recurringEditScope ? { ...processedData, recurringEditScope } : processedData
      const response = await calendarApi.updateEvent(id, payloadForBackend, calendarId, sendNotifications)
      const serverEvent = response?.event || response
      if (serverEvent) {
        const resolvedLocation = resolveEventMeetingLocation(serverEvent, processedData.location)
        const resolvedTransparency = serverEvent?.transparency || processedData.transparency
        const resolvedVisibility = serverEvent?.visibility || processedData.visibility
        const resolvedDescription = serverEvent?.description !== undefined ? serverEvent.description : (processedData.description || null)
        const resolvedColor = serverEvent?.extendedProperties?.private?.categoryColor || serverEvent?.color || processedData.color || existingEvent?.color || 'blue'
        const resolvedReminders = serverEvent?.reminders || processedData.reminders || existingEvent?.reminders || null
        setEvents(prev => prev.map(evt => evt.id === id
          ? { ...evt, location: resolvedLocation, transparency: resolvedTransparency, visibility: resolvedVisibility, description: resolvedDescription, color: resolvedColor, reminders: resolvedReminders }
          : evt), { skipDayIndexRebuild: true })
        setSelectedEvent(prev => (!prev || prev.id !== id) ? prev
          : { ...prev, location: resolvedLocation, transparency: resolvedTransparency, visibility: resolvedVisibility, description: resolvedDescription, color: resolvedColor, reminders: resolvedReminders })
      }
      const hasRecurrenceUpdate = processedData.recurrenceMeta?.enabled ||
        (Array.isArray(processedData.recurrence) && processedData.recurrence.length > 0) ||
        (processedData.recurrenceRule && processedData.recurrenceRule.trim().length > 0)
      if (hasRecurrenceUpdate) {
        try {
          const { start: visibleStart, end: visibleEnd } = getVisibleRange(currentDate, view)
          if (visibleStart && visibleEnd) {
            fetchEventsForRange(visibleStart, visibleEnd, true, true)
              .then(() => clearOptimisticRecurrenceInstances(id)).catch(() => { })
          }
        } catch (_) { }
      } else clearOptimisticRecurrenceInstances(id)
      if (linkedTodoId) emitTodoScheduleUpdate(linkedTodoId, start, end, processedData.isAllDay ?? existingEvent?.isAllDay)
    } catch (error) {
      console.error('Failed to update event:', error)
      const message = typeof error?.message === 'string' ? error.message : ''
      const forbidden = /forbiddenForNonOrganizer/i.test(message) || /Shared properties can only be changed/i.test(message)
      if (previousEventSnapshot) {
        revertEventState(previousEventSnapshot)
        if (forbidden) dispatchBounceEvent(previousEventSnapshot.id)
      }
      clearOptimisticRecurrenceInstances(id)
    }
  }, [events, indexEventByDays, saveSnapshotsForAllViews, revertEventState, getVisibleRange, currentDate, view, fetchEventsForRange, addOptimisticRecurrenceInstances, clearOptimisticRecurrenceInstances, recordEventOverride, user?.id])

  const deleteEvent = useCallback(async (event) => {
    const eventObject = (event && typeof event === 'object') ? event : null
    if (!eventObject) { console.warn('deleteEvent: event object required', event); return }
    const rawId = eventObject.id || (typeof event === 'string' ? event : null)
    if (!rawId) return

    const calendarId = eventObject.calendar_id || eventObject.calendarId || 'primary'
    const deleteScope = eventObject.deleteScope
    const deleteSeries = deleteScope === 'series' || deleteScope === 'all' || deleteScope === 'future' || Boolean(eventObject.deleteSeries)
    const isOptimistic = Boolean(eventObject.isOptimistic) || (typeof rawId === 'string' && rawId.startsWith('temp-'))
    const directTodoId = eventObject.todoId || eventObject.todo_id || eventObject.extendedProperties?.private?.todoId
    const linkedTodoId = eventToTodoRef.current.get(String(rawId)) || (directTodoId ? String(directTodoId) : null)
    const linkedEventIdForTodo = linkedTodoId ? todoToEventRef.current.get(String(linkedTodoId)) : null

    clearEventsCache().catch(() => { })
    clearAllSnapshots()

    const idsToRemove = new Set()
    if (rawId) idsToRemove.add(String(rawId))
    if (linkedEventIdForTodo) idsToRemove.add(String(linkedEventIdForTodo))
    const todoKey = linkedTodoId ? String(linkedTodoId) : (directTodoId ? String(directTodoId) : null)
    if (todoKey) {
      const activeEvents = eventsRefValue.current || events
      activeEvents.forEach((ev) => {
        const evTodoKey = ev?.todoId || ev?.todo_id || ev?.extendedProperties?.private?.todoId
        if (todoKey && String(evTodoKey) === todoKey) idsToRemove.add(String(ev.id))
      })
    }
    let snapshotsToRestore = []

    if (deleteSeries && rawId) {
      const seriesId = eventObject.recurringEventId || eventObject.parentRecurrenceId || rawId
      if (!seriesId) { console.warn('deleteEvent: unable to resolve series id for', rawId); return }
      clearOptimisticRecurrenceInstances(seriesId)
      const eventsToDelete = []
      const removalIds = new Set()
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { message: 'Deleted event' } }))

      setEvents(prev => {
        const matches = prev.filter(ev => ev.id === seriesId || ev.recurringEventId === seriesId || ev.parentRecurrenceId === seriesId)
        if (!matches.length) { console.warn('No events found to delete for series:', seriesId); return prev }
        matches.forEach(ev => { eventsToDelete.push(ev); removalIds.add(ev.id) })
        snapshotsToRestore = matches.map(ev => ({ ...ev, start: coerceDate(ev.start) || new Date(), end: coerceDate(ev.end) || new Date() }))
        removalIds.forEach(id => { eventIdsRef.current.delete(id); pendingSyncEventIdsRef.current.delete(id); unlinkEvent(id); removeEventFromAllSnapshots(id) })
        for (const [key, arr] of eventsByDayRef.current.entries()) {
          const next = arr.filter(e => !removalIds.has(e.id))
          if (next.length !== arr.length) eventsByDayRef.current.set(key, next)
        }
        removalIds.forEach(id => suppressedEventIdsRef.current.add(id))
        if (todoKey) {
          removalIds.forEach(id => eventToTodoRef.current.delete(String(id)))
          todoToEventRef.current.delete(todoKey)
          calendarApi.deleteTodoEventLink(todoKey).catch(() => { })
          window.dispatchEvent(new CustomEvent('todoScheduleUpdated', { detail: { todoId: todoKey, start: null, end: null, isAllDay: false } }))
        }
        return prev.filter(ev => !removalIds.has(ev.id))
      }, { skipDayIndexRebuild: true })

      // Force UI re-render after series deletion
      bumpEventsByDayVersion()

      if (!eventsToDelete.length) {
        if (!isOptimistic && seriesId) {
          try { await calendarApi.deleteEvent(seriesId, calendarId); if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('eventDeleted')) }
          catch (error) { const message = typeof error?.message === 'string' ? error.message : ''; if (!/not found/i.test(message) && !/deleted/i.test(message) && !/Resource has been deleted/i.test(message)) console.error('Failed to delete event series:', error) }
        }
        return
      }

      if (!isOptimistic && seriesId) {
        try {
          await calendarApi.deleteEvent(seriesId, calendarId)
          try { const { start: visibleStart, end: visibleEnd } = getVisibleRange(currentDate, view); if (visibleStart && visibleEnd) fetchEventsForRange(visibleStart, visibleEnd, true, true).catch(() => { }) } catch (_) { }
        } catch (error) {
          const message = typeof error?.message === 'string' ? error.message : ''
          if (!/not found/i.test(message) && !/deleted/i.test(message) && !/Resource has been deleted/i.test(message)) {
            console.error('Failed to delete event series:', error)
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { message: "Error couldn't delete" } }))
            setEvents(prevEvents => [...prevEvents, ...snapshotsToRestore], { skipDayIndexRebuild: true })
            snapshotsToRestore.forEach(snapshot => { eventIdsRef.current.add(snapshot.id); indexEventByDays(snapshot); saveSnapshotsForAllViews(snapshot); suppressedEventIdsRef.current.delete(snapshot.id) })
          }
        }
      }
      return
    }

    const snapshot = { ...eventObject, start: coerceDate(eventObject.start) || new Date(), end: coerceDate(eventObject.end) || new Date() }
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { message: 'Deleted Event' } }))
    snapshotsToRestore = [snapshot]
    idsToRemove.add(rawId)
    if (linkedEventIdForTodo && linkedEventIdForTodo !== String(rawId)) idsToRemove.add(linkedEventIdForTodo)
    setEvents(prev => prev.filter(e => !idsToRemove.has(String(e.id)) && !(todoKey && String(e.todoId) === String(todoKey))), { skipDayIndexRebuild: true })

    idsToRemove.forEach(id => { eventIdsRef.current.delete(id); pendingSyncEventIdsRef.current.delete(id); unlinkEvent(id); removeEventFromAllSnapshots(id); removeEventFromCache(id).catch(() => { }) })
    if (todoKey) {
      idsToRemove.forEach(id => eventToTodoRef.current.delete(String(id)))
      todoToEventRef.current.delete(todoKey)
      calendarApi.deleteTodoEventLink(todoKey).catch(() => { })
      emitTodoScheduleUpdate(todoKey, null, null, false)
      suppressedTodoIdsRef.current.add(todoKey)
      removeTodoFromAllSnapshots(todoKey)
      const isTempId = typeof todoKey === 'string' && todoKey.startsWith('temp-')
      if (!isTempId) todosApi.updateTodo(todoKey, { scheduled_date: null, scheduled_at: null, scheduled_end: null, scheduled_is_all_day: false, google_event_id: null, date: null }).catch(() => { })
    }

    for (const [key, arr] of eventsByDayRef.current.entries()) {
      const next = arr.filter(e => !idsToRemove.has(String(e.id)) && !(todoKey && String(e.todoId) === String(todoKey)))
      if (next.length !== arr.length) eventsByDayRef.current.set(key, next)
    }
    idsToRemove.forEach(id => suppressedEventIdsRef.current.add(id))

    // Force UI re-render after single event deletion
    bumpEventsByDayVersion()

    try { if (!isOptimistic) await calendarApi.deleteEvent(rawId, calendarId) }
    catch (error) {
      const message = typeof error?.message === 'string' ? error.message : ''
      if (/not found/i.test(message) || /deleted/i.test(message) || /Resource has been deleted/i.test(message)) return
      console.error('Failed to delete event:', error)
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { message: "Error couldn't delete" } }))
      setEvents(prev => [...prev, ...snapshotsToRestore], { skipDayIndexRebuild: true })
      snapshotsToRestore.forEach(s => { eventIdsRef.current.add(s.id); indexEventByDays(s); saveSnapshotsForAllViews(s); suppressedEventIdsRef.current.delete(s.id) })
      if (linkedTodoId && snapshotsToRestore.length) {
        const rollback = snapshotsToRestore[0]
        emitTodoScheduleUpdate(linkedTodoId, rollback.start ? new Date(rollback.start) : null, rollback.end ? new Date(rollback.end) : null, rollback.isAllDay || false)
      }
    }
  }, [unlinkEvent, indexEventByDays, removeEventFromAllSnapshots, saveSnapshotsForAllViews, clearOptimisticRecurrenceInstances, getVisibleRange, currentDate, view, fetchEventsForRange, clearAllSnapshots, removeTodoFromAllSnapshots, bumpEventsByDayVersion])

  const respondToInvite = useCallback(async (eventId, responseStatus) => {
    if (!eventId || !responseStatus) return
    const normalized = normalizeResponseStatus(responseStatus)
    if (!normalized || !['accepted', 'declined', 'tentative'].includes(normalized)) return
    const existingEvent = eventsRefValue.current.find(ev => ev.id === eventId)
    if (!existingEvent) return

    const previousSnapshot = { ...existingEvent }
    const updatedEvent = { ...existingEvent, viewerResponseStatus: normalized, isInvitePending: normalized === 'needsAction' }

    const syncDayIndexWithEvent = (eventToSync) => {
      for (const [key, arr] of eventsByDayRef.current.entries()) {
        let changed = false
        const replaced = arr.map(item => { if (item.id !== eventToSync.id) return item; changed = true; return eventToSync })
        if (changed) eventsByDayRef.current.set(key, replaced)
      }
      saveSnapshotsForAllViews(eventToSync)
    }

    setEvents(prev => prev.map(ev => (ev.id === eventId ? updatedEvent : ev)), { skipDayIndexRebuild: true })
    syncDayIndexWithEvent(updatedEvent)
    setSelectedEvent(prev => (!prev || prev.id !== eventId) ? prev : { ...prev, viewerResponseStatus: normalized, isInvitePending: normalized === 'needsAction' })

    try {
      const effectiveCalendarId = updatedEvent.calendar_id || 'primary'
      await calendarApi.respondToInvite(eventId, normalized, effectiveCalendarId)
    } catch (error) {
      console.error('Failed to respond to invite:', error)
      setEvents(prev => prev.map(ev => (ev.id === eventId ? previousSnapshot : ev)), { skipDayIndexRebuild: true })
      syncDayIndexWithEvent(previousSnapshot)
      setSelectedEvent(prev => (!prev || prev.id !== eventId) ? prev : { ...prev, viewerResponseStatus: previousSnapshot.viewerResponseStatus, isInvitePending: previousSnapshot.viewerResponseStatus === 'needsAction' })
      throw error
    }
  }, [saveSnapshotsForAllViews])

  return { getEventsForDate, createEvent, updateEvent, deleteEvent, respondToInvite, triggerEventBounce }
}
