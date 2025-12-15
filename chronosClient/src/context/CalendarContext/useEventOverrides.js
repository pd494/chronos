import { useState, useCallback, useEffect, useRef } from 'react'
import { calendarApi } from '../../lib/api'
import { coerceDate } from './utils'

export const useEventOverrides = ({ user }) => {
  const eventOverridesRef = useRef(new Map())
  const dirtyOverrideIdsRef = useRef(new Set())
  const persistTimerRef = useRef(null)
  const hasMigratedLegacyRef = useRef(false)
  const suppressUserStatePersistRef = useRef(true)
  const lastSyncTimestampRef = useRef(0)

  const persistEventOverrides = useCallback(() => {
    if (suppressUserStatePersistRef.current) return
    const dirtyIds = Array.from(dirtyOverrideIdsRef.current)
    if (!dirtyIds.length) return
    dirtyOverrideIdsRef.current.clear()

    const updates = dirtyIds.map((eventId) => ({
      eventId,
      overrides: eventOverridesRef.current.get(eventId) || null
    }))

    calendarApi.batchUpdateEventUserState(updates).catch(error => {
      console.error('Failed to persist event overrides:', error)
    })
  }, [])

  const queuePersistEventOverrides = useCallback(() => {
    if (suppressUserStatePersistRef.current) return
    if (persistTimerRef.current) return
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null
      persistEventOverrides()
    }, 400)
  }, [persistEventOverrides])

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
      suppressUserStatePersistRef.current = true
    }
  }, [])

  const removeEventOverride = useCallback((eventId) => {
    if (!eventId) return
    if (eventOverridesRef.current.delete(eventId)) {
      dirtyOverrideIdsRef.current.add(eventId)
      queuePersistEventOverrides()
    }
  }, [queuePersistEventOverrides])

  const clearAllEventOverrides = useCallback(() => {
    const ids = Array.from(eventOverridesRef.current.keys())
    if (!ids.length) return
    eventOverridesRef.current.clear()
    ids.forEach(id => dirtyOverrideIdsRef.current.add(id))
    queuePersistEventOverrides()
    return ids.length
  }, [queuePersistEventOverrides])

  const recordEventOverride = useCallback((eventId, startDate, endDate) => {
    if (!eventId || !(startDate instanceof Date) || !(endDate instanceof Date)) return
    const nextOverride = {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      updatedAt: Date.now()
    }
    const prev = eventOverridesRef.current.get(eventId)
    if (
      prev &&
      prev.start === nextOverride.start &&
      prev.end === nextOverride.end
    ) {
      return
    }
    eventOverridesRef.current.set(eventId, nextOverride)
    dirtyOverrideIdsRef.current.add(eventId)
    queuePersistEventOverrides()
  }, [queuePersistEventOverrides])

  const clearOverrideIfSynced = useCallback((eventId, startDate, endDate) => {
    if (!eventId) return
    const override = eventOverridesRef.current.get(eventId)
    if (!override) return
    const overrideStart = coerceDate(override.start)
    const overrideEnd = coerceDate(override.end)
    const resolvedStart = coerceDate(startDate)
    const resolvedEnd = coerceDate(endDate)
    if (
      overrideStart &&
      overrideEnd &&
      resolvedStart &&
      resolvedEnd &&
      Math.abs(resolvedStart.getTime() - overrideStart.getTime()) < 60 * 1000 &&
      Math.abs(resolvedEnd.getTime() - overrideEnd.getTime()) < 60 * 1000
    ) {
      removeEventOverride(eventId)
    }
  }, [removeEventOverride])

  const applyEventTimeOverrides = useCallback((eventObject) => {
    if (!eventObject || !eventObject.id) return eventObject
    const override = eventOverridesRef.current.get(eventObject.id)
    if (!override) return eventObject
    const overrideStart = coerceDate(override.start)
    const overrideEnd = coerceDate(override.end)
    if (!overrideStart || !overrideEnd) {
      removeEventOverride(eventObject.id)
      return eventObject
    }
    const eventStart = coerceDate(eventObject.start)
    const eventEnd = coerceDate(eventObject.end)
    if (
      eventStart &&
      eventEnd &&
      Math.abs(eventStart.getTime() - overrideStart.getTime()) < 60 * 1000 &&
      Math.abs(eventEnd.getTime() - overrideEnd.getTime()) < 60 * 1000
    ) {
      removeEventOverride(eventObject.id)
      return eventObject
    }
    return {
      ...eventObject,
      start: overrideStart,
      end: overrideEnd,
      hasLocalOverride: true
    }
  }, [removeEventOverride])

  const hydrateEventUserState = useCallback(async (setCheckedOffEventIds) => {
    try {
      const response = await calendarApi.getEventUserState()
      const states = response.states || []

      const checkedIds = states
        .filter(state => state.is_checked_off)
        .map(state => state.event_id)
      setCheckedOffEventIds(new Set(checkedIds))

      const overrides = new Map()
      states.forEach(state => {
        if (state.time_overrides) {
          overrides.set(state.event_id, state.time_overrides)
        }
      })
      eventOverridesRef.current = overrides
    } catch (error) {
      console.error('Failed to load event user state:', error)
    }
  }, [])

  const migrateLocalStorageToDB = useCallback(async () => {
    if (typeof window === 'undefined') return
    if (hasMigratedLegacyRef.current) return
    const migrationKey = 'chronos:migration:event-state'
    if (window.localStorage.getItem(migrationKey)) {
      hasMigratedLegacyRef.current = true
      return
    }

    try {
      const checkedEventsRaw = window.localStorage.getItem('chronos:checked-events')
      if (checkedEventsRaw) {
        const checkedEvents = JSON.parse(checkedEventsRaw)
        if (Array.isArray(checkedEvents)) {
          const promises = checkedEvents.map(eventId =>
            calendarApi.updateEventUserState(eventId, true)
          )
          await Promise.all(promises)
          window.localStorage.removeItem('chronos:checked-events')
        }
      }

      const overridesRaw = window.localStorage.getItem('chronos:event-overrides')
      if (overridesRaw) {
        const overrides = JSON.parse(overridesRaw)
        if (Array.isArray(overrides)) {
          const promises = overrides.map(([eventId, timeOverrides]) =>
            calendarApi.updateEventUserState(eventId, false, timeOverrides)
          )
          await Promise.all(promises)
          window.localStorage.removeItem('chronos:event-overrides')
        }
      }

      const linksRaw = window.localStorage.getItem('chronos:event-todo-links')
      if (linksRaw) {
        const links = JSON.parse(linksRaw)
        if (Array.isArray(links)) {
          const promises = links.map(([todoId, eventId]) =>
            calendarApi.updateTodoEventLink(todoId, eventId, eventId)
          )
          await Promise.all(promises)
          window.localStorage.removeItem('chronos:event-todo-links')
        }
      }

    } catch (error) {
      console.error('Failed to migrate localStorage data:', error)
    } finally {
      try {
        window.localStorage.setItem(migrationKey, '1')
      } catch (_) { }
      hasMigratedLegacyRef.current = true
    }
  }, [])

  const checkAndRunBackfill = useCallback(async () => {
    if (!user?.has_google_credentials) return

    try {
      const response = await calendarApi.getSyncStatus()
      const syncState = response.sync_state || {}

      if (!syncState.backfill_before_ts && !syncState.backfill_after_ts) {
        console.log('Initial backfill needed for existing user')
        calendarApi.triggerBackfill(true)
          .then(() => console.log('Backfill triggered'))
          .catch(error => console.error('Initial backfill failed:', error))
      }
    } catch (error) {
      console.error('Failed to check sync status:', error)
    }
  }, [user?.has_google_credentials])

  const enablePersist = useCallback(() => {
    suppressUserStatePersistRef.current = false
  }, [])

  const disablePersist = useCallback(() => {
    suppressUserStatePersistRef.current = true
  }, [])

  return {
    eventOverridesRef,
    lastSyncTimestampRef,
    removeEventOverride,
    clearAllEventOverrides,
    recordEventOverride,
    clearOverrideIfSynced,
    applyEventTimeOverrides,
    hydrateEventUserState,
    migrateLocalStorageToDB,
    checkAndRunBackfill,
    enablePersist,
    disablePersist
  }
}
