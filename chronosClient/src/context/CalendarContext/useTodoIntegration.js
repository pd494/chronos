import { useEffect, useCallback, useRef } from 'react'
import { startOfDay, addDays, format } from 'date-fns'
import { calendarApi } from '../../lib/api'
import { addEventToCache, removeEventFromCache } from './cache'
import { resolveIsAllDay, coerceDate } from './utils'

export const useTodoIntegration = ({
  user,
  eventState,
  snapshotHelpers,
  checkedOffEventIds,
  setCheckedOffEventIds
}) => {
  const {
    events, setEvents, eventsRefValue, eventsByDayRef, eventIdsRef,
    todoToEventRef, eventToTodoRef, suppressedEventIdsRef, suppressedTodoIdsRef,
    optimisticEventCacheRef
  } = eventState

  const { indexEventByDays, removeTodoFromAllSnapshots, rebuildEventsByDayIndex } = snapshotHelpers

  const pendingLinkUpdatesRef = useRef(new Map())
  const linkUpdateTimerRef = useRef(null)

  const hydrateEventTodoLinks = useCallback(async () => {
    try {
      const response = await calendarApi.getTodoEventLinks()
      const links = response.links || []
      const eventToTodo = new Map()
      const todoToEvent = new Map()
      links.forEach(link => {
        if (!link) return
        const todoKey = link.todo_id ? String(link.todo_id) : null
        const eventId = link.event_id ? String(link.event_id) : null
        const googleEventId = link.google_event_id ? String(link.google_event_id) : null
        const primaryEventId = eventId || googleEventId
        if (todoKey && primaryEventId) todoToEvent.set(todoKey, primaryEventId)
        if (eventId) eventToTodo.set(eventId, todoKey)
        if (googleEventId) eventToTodo.set(googleEventId, todoKey)
      })
      eventToTodoRef.current = eventToTodo
      todoToEventRef.current = todoToEvent
    } catch (error) { console.error('Failed to load todo event links:', error) }
  }, [eventToTodoRef, todoToEventRef])

  const persistEventTodoLinks = useCallback((todoId, eventId, googleEventId) => {
    if (!todoId || !eventId) return
    const key = `${todoId}-${eventId}`
    pendingLinkUpdatesRef.current.set(key, { todoId, eventId, googleEventId })
    if (linkUpdateTimerRef.current) clearTimeout(linkUpdateTimerRef.current)
    linkUpdateTimerRef.current = setTimeout(() => {
      const pending = Array.from(pendingLinkUpdatesRef.current.values())
      pendingLinkUpdatesRef.current.clear()
      pending.forEach(({ todoId: tid, eventId: eid, googleEventId: gid }) => {
        calendarApi.updateTodoEventLink(tid, eid, gid).catch(error => console.error('Failed to persist todo event link:', error))
      })
    }, 500)
  }, [])

  const isEventChecked = useCallback((eventId) => {
    if (eventId === null || eventId === undefined) return false
    return checkedOffEventIds.has(eventId)
  }, [checkedOffEventIds])

  const setEventCheckedState = useCallback((eventId, checked) => {
    if (!eventId) return
    setCheckedOffEventIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(eventId)
      else next.delete(eventId)
      return next
    })
    calendarApi.updateEventUserState(eventId, checked).catch(error => {
      console.error('Failed to update event checked state from todo:', error)
      setCheckedOffEventIds(prev => {
        const next = new Set(prev)
        if (checked) next.delete(eventId)
        else next.add(eventId)
        return next
      })
    })
  }, [setCheckedOffEventIds])

  const linkTodoEvent = useCallback((todoId, eventId) => {
    if (!todoId || !eventId) return
    const todoKey = String(todoId)
    const eventKey = String(eventId)
    if (todoToEventRef.current.get(todoKey) === eventKey) return
    todoToEventRef.current.set(todoKey, eventKey)
    eventToTodoRef.current.set(eventKey, todoKey)
    persistEventTodoLinks(todoId, eventId)
  }, [eventToTodoRef, persistEventTodoLinks, todoToEventRef])

  const unlinkEvent = useCallback((eventId) => {
    if (!eventId) return
    const eventKey = String(eventId)
    const todoKey = eventToTodoRef.current.get(eventKey)
    if (todoKey) {
      eventToTodoRef.current.delete(eventKey)
      todoToEventRef.current.delete(todoKey)
      calendarApi.deleteTodoEventLink(todoKey).catch(error => console.error('Failed to delete todo event link:', error))
    }
  }, [eventToTodoRef, todoToEventRef])

  const unlinkTodo = useCallback((todoId, eventId = null) => {
    if (!todoId) return
    const todoKey = String(todoId)
    const eventKey = eventId ? String(eventId) : todoToEventRef.current.get(todoKey)
    todoToEventRef.current.delete(todoKey)
    if (eventKey) eventToTodoRef.current.delete(eventKey)
    calendarApi.deleteTodoEventLink(todoKey).catch(error => console.error('Failed to delete todo event link:', error))
  }, [eventToTodoRef, todoToEventRef])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleTodoDeleted = async (e) => {
      const todoId = e.detail?.todoId
      if (!todoId) return
      const todoKey = String(todoId)
      suppressedTodoIdsRef.current.add(todoKey)
      removeTodoFromAllSnapshots(todoId)
      const linkedEventId = todoToEventRef.current.get(todoKey)
      const activeEvents = eventsRefValue.current || events
      let linkedEvent = linkedEventId ? activeEvents.find(ev => String(ev.id) === String(linkedEventId)) : null
      if (!linkedEvent) linkedEvent = activeEvents.find(ev => String(ev.todoId) === todoKey)
      const resolvedEventId = linkedEvent?.id || (linkedEventId ? String(linkedEventId) : null)
      if (resolvedEventId) suppressedEventIdsRef.current.add(resolvedEventId)
      unlinkTodo(todoId)
      setEvents(prev => prev.filter(ev => String(ev.todoId) !== todoKey && String(ev.id) !== resolvedEventId), { skipDayIndexRebuild: true })
      for (const [key, arr] of eventsByDayRef.current.entries()) {
        const next = arr.filter(ev => String(ev.todoId) !== todoKey && String(ev.id) !== resolvedEventId)
        eventsByDayRef.current.set(key, next)
      }
      if (resolvedEventId) removeEventFromCache(resolvedEventId).catch(() => { })
      if (resolvedEventId) {
        try { const calId = linkedEvent?.calendar_id || 'primary'; await calendarApi.deleteEvent(resolvedEventId, calId) }
        catch (error) { console.error('Failed to delete linked calendar event:', error) }
      }
    }
    const handleTodoCompletionChanged = (e) => {
      const detail = e.detail || {}
      const todoId = detail.todoId
      if (!todoId) return
      const linkedEventId = todoToEventRef.current.get(String(todoId))
      if (!linkedEventId) return
      const completed = Boolean(detail.completed)
      setEventCheckedState(linkedEventId, completed)
    }
    window.addEventListener('todoCompletionChanged', handleTodoCompletionChanged)
    window.addEventListener('todoDeleted', handleTodoDeleted)
    return () => {
      window.removeEventListener('todoCompletionChanged', handleTodoCompletionChanged)
      window.removeEventListener('todoDeleted', handleTodoDeleted)
    }
  }, [setEventCheckedState, events, unlinkTodo, removeTodoFromAllSnapshots])

  useEffect(() => {
    const handleTodoConverted = (e) => {
      const eventData = e.detail?.eventData
      const isOptimistic = e.detail?.isOptimistic
      const todoId = e.detail?.todoId || eventData?.todoId
      const todoKey = todoId ? String(todoId) : null
      if (eventData) {
        const isAllDay = typeof eventData.isAllDay === 'boolean' ? eventData.isAllDay : resolveIsAllDay(eventData.start, eventData)
        const startBoundary = eventData.start?.dateTime || eventData.start?.date || eventData.start
        const endBoundary = eventData.end?.dateTime || eventData.end?.date || eventData.end
        const startBound = coerceDate(startBoundary)
        const endBound = coerceDate(endBoundary)
        if (!startBound) return
        const safeEndBound = (() => {
          if (!endBound || endBound <= startBound) {
            if (isAllDay) return addDays(startOfDay(startBound), 1)
            return new Date(startBound.getTime() + 30 * 60 * 1000)
          }
          return endBound
        })()
        const newEvent = {
          id: eventData.id, title: eventData.title || eventData.summary || '', start: startBound, end: safeEndBound,
          color: eventData.color || 'blue', isGoogleEvent: true, calendar_id: eventData.calendar_id || 'primary',
          isOptimistic: isOptimistic || false, isAllDay, todoId: todoId ? String(todoId) : undefined,
          todo_id: todoId ? String(todoId) : undefined,
          transparency: eventData.transparency === 'transparent' ? 'transparent' : 'opaque',
          visibility: eventData.visibility || 'public', _freshDrop: isOptimistic ? true : Boolean(eventData._freshDrop)
        }
        if (todoKey) suppressedTodoIdsRef.current.delete(todoKey)
        if (todoKey || newEvent.id) {
          for (const [key, arr] of eventsByDayRef.current.entries()) {
            const filtered = arr.filter(ev => {
              const evTodo = ev.todoId || ev.todo_id
              const matchTodo = todoKey && String(evTodo) === todoKey
              const matchId = newEvent.id && ev.id === newEvent.id
              return !(matchTodo || matchId)
            })
            if (filtered.length !== arr.length) eventsByDayRef.current.set(key, filtered)
          }
        }
        const startDay = startOfDay(startBound)
        const endDay = startOfDay(safeEndBound)
        let cursor = startDay
        while (cursor < endDay || cursor.getTime() === startDay.getTime()) {
          const dayKey = format(cursor, 'yyyy-MM-dd')
          const existing = eventsByDayRef.current.get(dayKey) || []
          const filtered = existing.filter(ev => {
            const evTodo = ev.todoId || ev.todo_id
            return !(todoKey && String(evTodo) === todoKey) && ev.id !== newEvent.id
          })
          filtered.push(newEvent)
          eventsByDayRef.current.set(dayKey, filtered)
          cursor = addDays(cursor, 1)
        }
        eventIdsRef.current.add(newEvent.id)

        // Track optimistic events in the cache so they persist across view switches
        if (isOptimistic && newEvent.id) {
          optimisticEventCacheRef.current.set(newEvent.id, newEvent)
        }

        if (!isOptimistic && todoKey && newEvent.id) linkTodoEvent(todoKey, newEvent.id)
        if (!isOptimistic) {
          // Remove any optimistic events for this todo from the cache
          // The optimistic event has a temp ID like "temp-todo-123-...", not the resolved Google ID
          // So we need to find it by todoId
          for (const [cachedId, cachedEvent] of optimisticEventCacheRef.current.entries()) {
            const cachedTodoId = cachedEvent.todoId || cachedEvent.todo_id
            if (todoKey && String(cachedTodoId) === todoKey) {
              optimisticEventCacheRef.current.delete(cachedId)
              eventIdsRef.current.delete(cachedId)
            }
          }
          const cacheEvent = { ...newEvent }
          delete cacheEvent._freshDrop
          addEventToCache(user?.id, cacheEvent).catch(() => { })
        }
        setEvents(prev => {
          const next = []
          const removedIds = new Set()
          prev.forEach(ev => {
            const evTodo = ev.todoId || ev.todo_id
            const matchTodo = todoKey && String(evTodo) === todoKey
            const matchId = ev.id === newEvent.id
            if (matchTodo || matchId) { removedIds.add(ev.id); return }
            next.push(ev)
          })
          next.push(newEvent)
          removedIds.forEach(id => eventIdsRef.current.delete(id))
          return next
        }, { skipDayIndexRebuild: true })
        if (newEvent.id) {
          setTimeout(() => {
            setEvents(prev => {
              let changed = false
              const updated = prev.map(ev => {
                if (ev.id === newEvent.id && ev._freshDrop) { changed = true; return { ...ev, _freshDrop: false } }
                return ev
              })
              return changed ? updated : prev
            }, { skipDayIndexRebuild: true })
          }, 800)
        }
      }
    }
    const handleTodoConversionFailed = (e) => {
      const eventId = e.detail?.eventId
      if (eventId) {
        setEvents(prev => prev.filter(ev => ev.id !== eventId), { skipDayIndexRebuild: true })
        eventIdsRef.current.delete(eventId)
        unlinkEvent(eventId)
        for (const [key, arr] of eventsByDayRef.current.entries()) {
          const filtered = arr.filter(ev => ev.id !== eventId)
          if (filtered.length !== arr.length) eventsByDayRef.current.set(key, filtered)
        }
      }
    }
    window.addEventListener('todoConvertedToEvent', handleTodoConverted)
    window.addEventListener('todoConversionFailed', handleTodoConversionFailed)
    return () => {
      window.removeEventListener('todoConvertedToEvent', handleTodoConverted)
      window.removeEventListener('todoConversionFailed', handleTodoConversionFailed)
    }
  }, [linkTodoEvent, unlinkEvent, rebuildEventsByDayIndex, user?.id])

  return {
    hydrateEventTodoLinks, persistEventTodoLinks, isEventChecked, setEventCheckedState,
    linkTodoEvent, unlinkEvent, unlinkTodo
  }
}
