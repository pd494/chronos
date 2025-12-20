import { useEffect, useRef, useCallback } from 'react'
import { calendarApi } from '../../lib/api'
import { SNAPSHOT_VERSION } from './constants'
import { loadEventsFromCache, clearEventsCache, removeOptimisticEventsFromCache } from './useStorage'
import { safeToISOString } from './utils'

export const useBootstrap = ({
  user,
  authLoading,
  eventState,
  snapshotHelpers,
  overrideHelpers,
  todoLinkHelpers,
  fetchGoogleEventsRef,
  selectedCalendars
}) => {
  const {
    events,
    setEvents,
    setInitialLoading,
    setCheckedOffEventIds,
    eventsByDayRef,
    eventIdsRef,
    pendingSyncEventIdsRef,
    hasLoadedInitialRef,
    hasBootstrappedRef,
    loadedMonthsRef,
    inFlightMonthsRef,
    skipNextDayIndexRebuildRef,
    optimisticEventCacheRef
  } = eventState

  const {
    getVisibleRange,
    dateKey,
    snapshotKey,
    clearAllSnapshots,
    rebuildEventsByDayIndex,
    indexEventByDays,
    extendLoadedRange
  } = snapshotHelpers

  const {
    lastSyncTimestampRef,
    hydrateEventUserState,
    migrateLocalStorageToDB,
    checkAndRunBackfill,
    enablePersist,
    disablePersist,
    clearAllEventOverrides
  } = overrideHelpers

  const { hydrateEventTodoLinks, persistEventTodoLinks, linkTodoEvent } = todoLinkHelpers

  const snapshotSaveTimerRef = useRef(null)

  const filterBySelectedCalendars = useCallback((list) => {
    if (!Array.isArray(list)) return []
    if (!selectedCalendars || selectedCalendars.length === 0) return list
    return list.filter(ev => {
      if (!ev) return false
      if (!ev.calendar_id) return true
      return selectedCalendars.includes(ev.calendar_id)
    })
  }, [selectedCalendars])

  const hydrateFromSnapshot = useCallback((options = {}) => {
    const skipLoadedFlag = Boolean(options?.skipLoadedFlag)
    try {
      if (typeof window === 'undefined') return false
      if (!user?.id) return false
      const { start, end } = getVisibleRange(new Date(), 'month')
      const key = snapshotKey(start, end)
      const raw = window.sessionStorage.getItem(key)
      if (!raw) return false
      const parsed = JSON.parse(raw)
      if (parsed?.version !== SNAPSHOT_VERSION) {
        window.sessionStorage.removeItem(key)
        return false
      }
      if (!Array.isArray(parsed?.events)) return false

      let toAdd = []
      for (const ev of parsed.events) {
        if (!eventIdsRef.current.has(ev.id)) {
          const todoId = ev.todoId || ev.todo_id
          const isPendingSync = Boolean(ev.isPendingSync)
          const e = {
            id: ev.id,
            clientKey: ev.clientKey || ev.id,
            title: ev.title || 'Untitled',
            description: ev.description || null,
            start: new Date(ev.start),
            end: new Date(ev.end),
            color: ev.color || 'blue',
            isGoogleEvent: !ev.isOptimistic,
            isOptimistic: ev.isOptimistic || false,
            isAllDay: ev.isAllDay || false,
            calendar_id: ev.calendar_id,
            location: ev.location || '',
            participants: ev.participants || [],
            attendees: ev.attendees || [],
            todoId: todoId ? String(todoId) : undefined,
            isPendingSync,
            transparency: ev.transparency || 'opaque',
            visibility: ev.visibility || 'default',
            organizerEmail: ev.organizerEmail || null,
            viewerIsOrganizer: Boolean(ev.viewerIsOrganizer),
            viewerIsAttendee: Boolean(ev.viewerIsAttendee),
            viewerResponseStatus: ev.viewerResponseStatus || null
          }
          if (todoId) linkTodoEvent(todoId, ev.id, { persist: false })
          toAdd.push(e)
          if (isPendingSync) pendingSyncEventIdsRef.current.set(ev.id, Date.now())
        }
      }
      toAdd = filterBySelectedCalendars(toAdd)
      if (toAdd.length) {
        setEvents(prev => [...prev, ...toAdd], { skipDayIndexRebuild: true })
        setTimeout(() => {
          for (const e of toAdd) {
            eventIdsRef.current.add(e.id)
            indexEventByDays(e)
          }
        }, 0)
        extendLoadedRange(start, end)
        if (!skipLoadedFlag) {
          hasLoadedInitialRef.current = true
          setInitialLoading(false)
        }
        return true
      }
    } catch (_) { }
    return false
  }, [getVisibleRange, extendLoadedRange, linkTodoEvent, snapshotKey, user?.id])

  useEffect(() => {
    if (authLoading) return
    if (user) return
    eventState.resetState()
    persistEventTodoLinks()
  }, [authLoading, user, persistEventTodoLinks])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (!user?.id) return undefined

    const handleGoogleAccountAdded = async () => {
      try {
        clearAllSnapshots()
        await clearEventsCache()
      } catch (_) { }

      try {
        eventState.resetForRefresh()
        loadedMonthsRef.current.clear()
        hasLoadedInitialRef.current = false
        setInitialLoading(true)
      } catch (_) { }

      try {
        await calendarApi.syncCalendar()
      } catch (_) { }

      try {
        await fetchGoogleEventsRef.current(false, true, true)
      } catch (_) { }
    }

    window.addEventListener('chronos:google-account-added', handleGoogleAccountAdded)
    return () => {
      window.removeEventListener('chronos:google-account-added', handleGoogleAccountAdded)
    }
  }, [user?.id, clearAllSnapshots, eventState, loadedMonthsRef, hasLoadedInitialRef, setInitialLoading])

  useEffect(() => {
    if (!Array.isArray(events) || events.length === 0) {
      rebuildEventsByDayIndex([])
      skipNextDayIndexRebuildRef.current = false
      return
    }
    const seenIds = new Set()
    const seenTodoIds = new Map() // todoId -> event (prefer non-optimistic)
    const deduped = []
    let hadDuplicates = false

    for (const ev of events) {
      if (!ev || !ev.id) continue

      // Check for duplicate event IDs
      if (seenIds.has(ev.id)) { hadDuplicates = true; continue }

      // Check for duplicate todoIds (optimistic vs resolved)
      const todoId = ev.todoId || ev.todo_id
      if (todoId) {
        const existing = seenTodoIds.get(String(todoId))
        if (existing) {
          hadDuplicates = true
          // Keep the non-optimistic (resolved) version
          if (ev.isOptimistic && !existing.isOptimistic) {
            // Current is optimistic, existing is resolved - skip current
            continue
          } else if (!ev.isOptimistic && existing.isOptimistic) {
            // Current is resolved, existing is optimistic - replace existing
            const idx = deduped.findIndex(e => e.id === existing.id)
            if (idx >= 0) {
              seenIds.delete(existing.id)
              deduped.splice(idx, 1)
            }
          } else {
            // Both same type, skip current as duplicate
            continue
          }
        }
        seenTodoIds.set(String(todoId), ev)
      }

      seenIds.add(ev.id)
      deduped.push(ev)
    }
    if (hadDuplicates) {
      skipNextDayIndexRebuildRef.current = false
      setEvents(deduped)
      return
    }
    if (skipNextDayIndexRebuildRef.current) {
      skipNextDayIndexRebuildRef.current = false
      return
    }

    const eventsWithOptimistic = [...deduped]
    const existingIds = new Set(deduped.map(ev => ev.id))
    const existingTodoIds = new Set(deduped.map(ev => ev.todoId || ev.todo_id).filter(Boolean).map(String))

    optimisticEventCacheRef.current.forEach(optEvent => {
      const optTodoId = optEvent.todoId || optEvent.todo_id
      // Only add if ID is new AND todoId is not already present (meaning not resolved yet)
      if (!existingIds.has(optEvent.id) && (!optTodoId || !existingTodoIds.has(String(optTodoId)))) {
        eventsWithOptimistic.push(optEvent)
      }
    })

    rebuildEventsByDayIndex(eventsWithOptimistic)
  }, [events, rebuildEventsByDayIndex, setEvents])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      hasBootstrappedRef.current = false
      disablePersist()
      clearEventsCache()
      return
    }
    if (!user.has_google_credentials) {
      disablePersist()
      return
    }
    if (hasBootstrappedRef.current) return
    hasBootstrappedRef.current = true

    const bootstrap = async () => {
      const cacheVersionKey = 'chronos:cache-version'
      const storedVersion = localStorage.getItem(cacheVersionKey)
      if (storedVersion !== String(SNAPSHOT_VERSION)) {
        await clearEventsCache()
        clearAllSnapshots()
        localStorage.setItem(cacheVersionKey, String(SNAPSHOT_VERSION))
      }

      await removeOptimisticEventsFromCache(user.id)
      clearAllSnapshots()

      let cachedEvents = await loadEventsFromCache(user.id)
      cachedEvents = filterBySelectedCalendars(cachedEvents)
      if (cachedEvents && cachedEvents.length > 0) {
        setEvents(cachedEvents)
        for (const e of cachedEvents) {
          eventIdsRef.current.add(e.id)
          indexEventByDays(e)
          const todoId = e.todoId || e.todo_id
          if (todoId) linkTodoEvent(todoId, e.id, { persist: false })
        }
        hasLoadedInitialRef.current = true
        setInitialLoading(false)
      }

      hydrateFromSnapshot()
      loadedMonthsRef.current.clear()
      inFlightMonthsRef.current.clear()
      hasLoadedInitialRef.current = false
      await fetchGoogleEventsRef.current(true, false)

      await hydrateEventUserState(setCheckedOffEventIds)
      await hydrateEventTodoLinks()
      enablePersist()
      migrateLocalStorageToDB()
      checkAndRunBackfill()

      const nowTs = Date.now()
      lastSyncTimestampRef.current = nowTs
      if (typeof window !== 'undefined') {
        const syncKey = 'chronos:last-sync-ts'
        window.sessionStorage.setItem(syncKey, String(nowTs))
      }
      calendarApi.syncCalendar().catch(() => { })
      fetchGoogleEventsRef.current(true, false, true).catch(() => { })
    }
    bootstrap()
  }, [authLoading, user?.id, user?.has_google_credentials, hydrateFromSnapshot, migrateLocalStorageToDB, checkAndRunBackfill, hydrateEventUserState, hydrateEventTodoLinks, indexEventByDays])

  // Expose debug helper on window
  if (typeof window !== 'undefined') {
    window.chronosClearEventOverrides = clearAllEventOverrides
  }

  return { hydrateFromSnapshot, snapshotSaveTimerRef, clearAllEventOverrides }
}
