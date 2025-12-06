import { useEffect, useRef, useCallback } from 'react'
import { calendarApi } from '../../lib/api'
import { SNAPSHOT_VERSION } from './constants'
import { loadEventsFromCache, clearEventsCache } from './useStorage'
import { safeToISOString } from './utils'

export const useBootstrap = ({
  user,
  authLoading,
  eventState,
  snapshotHelpers,
  overrideHelpers,
  todoLinkHelpers,
  fetchGoogleEventsRef
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
    skipNextDayIndexRebuildRef
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
    disablePersist
  } = overrideHelpers

  const { hydrateEventTodoLinks, persistEventTodoLinks, linkTodoEvent } = todoLinkHelpers

  const snapshotSaveTimerRef = useRef(null)

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

      const toAdd = []
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
          if (todoId) linkTodoEvent(todoId, ev.id)
          toAdd.push(e)
          if (isPendingSync) pendingSyncEventIdsRef.current.set(ev.id, Date.now())
        }
      }
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
    } catch (_) {}
    return false
  }, [getVisibleRange, extendLoadedRange, linkTodoEvent, snapshotKey, user?.id])

  useEffect(() => {
    if (authLoading) return
    if (user) return
    eventState.resetState()
    persistEventTodoLinks()
  }, [authLoading, user, persistEventTodoLinks])

  useEffect(() => {
    if (!Array.isArray(events) || events.length === 0) {
      rebuildEventsByDayIndex([])
      skipNextDayIndexRebuildRef.current = false
      return
    }
    const seen = new Set()
    const deduped = []
    let hadDuplicates = false
    for (const ev of events) {
      if (!ev || !ev.id) continue
      if (seen.has(ev.id)) { hadDuplicates = true; continue }
      seen.add(ev.id)
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
    rebuildEventsByDayIndex(deduped)
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

      const cachedEvents = await loadEventsFromCache(user.id)
      if (cachedEvents && cachedEvents.length > 0) {
        setEvents(cachedEvents)
        for (const e of cachedEvents) {
          eventIdsRef.current.add(e.id)
          indexEventByDays(e)
        }
        hasLoadedInitialRef.current = true
        setInitialLoading(false)
      }

      hydrateFromSnapshot()
      loadedMonthsRef.current.clear()
      hasLoadedInitialRef.current = false
      await fetchGoogleEventsRef.current(true, false)

      await hydrateEventUserState(setCheckedOffEventIds)
      await hydrateEventTodoLinks()
      enablePersist()
      migrateLocalStorageToDB()
      checkAndRunBackfill()

      const syncKey = 'chronos:last-sync-ts'
      let lastSync = lastSyncTimestampRef.current || 0
      if (!lastSync && typeof window !== 'undefined') {
        const raw = window.sessionStorage.getItem(syncKey)
        lastSync = raw ? Number(raw) || 0 : 0
      }
      const nowTs = Date.now()
      const shouldSync = nowTs - lastSync > 5 * 60 * 1000
      if (shouldSync) {
        lastSyncTimestampRef.current = nowTs
        if (typeof window !== 'undefined') {
          try { window.sessionStorage.setItem(syncKey, String(nowTs)) } catch (_) {}
        }
        calendarApi.syncCalendar()
          .then(() => fetchGoogleEventsRef.current(true, false, true).catch(() => {}))
          .catch(() => {})
      }
    }
    bootstrap()
  }, [authLoading, user?.id, user?.has_google_credentials, hydrateFromSnapshot, migrateLocalStorageToDB, checkAndRunBackfill, hydrateEventUserState, hydrateEventTodoLinks, indexEventByDays])

  return { hydrateFromSnapshot, snapshotSaveTimerRef }
}
