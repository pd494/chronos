import { useCallback } from 'react'
import { IDB_NAME, IDB_STORE, IDB_VERSION, SNAPSHOT_VERSION } from './constants'
import { safeToISOString, coerceDate } from './utils'

// IndexedDB operations
export const openDB = () => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB not available'))
      return
    }
    const request = indexedDB.open(IDB_NAME, IDB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: 'id' })
    }
  })
}

export const saveEventsToCache = async (userId, events) => {
  if (!userId) return
  try {
    const db = await openDB()
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    const cacheData = {
      id: 'events', userId,
      events: events.filter(e => e.isGoogleEvent).map(e => ({
        ...e, start: e.start instanceof Date ? e.start.toISOString() : e.start,
        end: e.end instanceof Date ? e.end.toISOString() : e.end
      })),
      cachedAt: Date.now()
    }
    store.put(cacheData)
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
    db.close()
  } catch (e) {}
}

export const loadEventsFromCache = async (userId) => {
  if (!userId) return null
  try {
    const db = await openDB()
    const tx = db.transaction(IDB_STORE, 'readonly')
    const store = tx.objectStore(IDB_STORE)
    const request = store.get('events')
    const cacheData = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    db.close()
    if (!cacheData) return null
    if (cacheData.userId !== userId) return null
    if (Date.now() - cacheData.cachedAt > 24 * 60 * 60 * 1000) return null
    return cacheData.events.map(e => ({ ...e, start: new Date(e.start), end: new Date(e.end) }))
  } catch (e) { return null }
}

export const addEventToCache = async (userId, newEvent) => {
  if (!userId || !newEvent) return
  try {
    const db = await openDB()
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    const request = store.get('events')
    const cacheData = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    const events = cacheData?.events || []
    const eventToAdd = {
      ...newEvent, start: newEvent.start instanceof Date ? newEvent.start.toISOString() : newEvent.start,
      end: newEvent.end instanceof Date ? newEvent.end.toISOString() : newEvent.end
    }
    const existingIdx = events.findIndex(e => e.id === newEvent.id)
    if (existingIdx >= 0) events[existingIdx] = eventToAdd
    else events.push(eventToAdd)
    store.put({ id: 'events', userId, events, cachedAt: Date.now() })
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
    db.close()
  } catch (e) {}
}

export const removeEventFromCache = async (eventId) => {
  if (!eventId) return
  try {
    const db = await openDB()
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    const request = store.get('events')
    const cacheData = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
    if (!cacheData?.events) { db.close(); return }
    const events = cacheData.events.filter(e => e.id !== eventId)
    store.put({ ...cacheData, events, cachedAt: Date.now() })
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
    db.close()
  } catch (e) {}
}

export const clearEventsCache = async () => {
  try {
    const db = await openDB()
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    store.delete('events')
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
    db.close()
  } catch (e) {}
}

// Session storage snapshot operations
export const useSnapshotStorage = ({ user, view, currentDate, getVisibleRange }) => {
  const snapshotKey = useCallback((start, end, viewType = view) => {
    if (!user?.id || !start || !end) return null
    const ukey = user.id
    const viewKey = viewType
    const startIso = safeToISOString(start) || 'invalid'
    const endIso = safeToISOString(end) || 'invalid'
    return `chronos:snap:v${SNAPSHOT_VERSION}:${ukey}:${viewKey}:${startIso}:${endIso}`
  }, [user?.id, view])

  const clearAllSnapshots = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      const keysToRemove = []
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i)
        if (key && key.startsWith('chronos:snap:')) keysToRemove.push(key)
      }
      keysToRemove.forEach(key => window.sessionStorage.removeItem(key))
    } catch (_) {}
  }, [])

  const removeEventFromAllSnapshots = useCallback((eventId) => {
    if (typeof window === 'undefined') return
    try {
      const keys = Object.keys(window.sessionStorage)
      keys.forEach(key => {
        if (key.startsWith('chronos:snap:')) {
          try {
            const raw = window.sessionStorage.getItem(key)
            const parsed = JSON.parse(raw)
            if (parsed?.events) {
              const filtered = parsed.events.filter(ev => ev.id !== eventId)
              if (filtered.length !== parsed.events.length) {
                window.sessionStorage.setItem(key, JSON.stringify({ version: SNAPSHOT_VERSION, events: filtered }))
              }
            }
          } catch (e) {}
        }
      })
    } catch (e) {}
  }, [])

  const removeTodoFromAllSnapshots = useCallback((todoId) => {
    if (typeof window === 'undefined' || !todoId) return
    try {
      const keys = Object.keys(window.sessionStorage)
      keys.forEach(key => {
        if (!key.startsWith('chronos:snap:')) return
        const raw = window.sessionStorage.getItem(key)
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (parsed?.events) {
          const filtered = parsed.events.filter(ev => String(ev.todoId || ev.todo_id) !== String(todoId))
          if (filtered.length !== parsed.events.length) {
            window.sessionStorage.setItem(key, JSON.stringify({ version: SNAPSHOT_VERSION, events: filtered }))
          }
        }
      })
    } catch (_) {}
  }, [])

  const saveSnapshotsForAllViews = useCallback((newEvent) => {
    if (typeof window === 'undefined') return
    const eventStart = coerceDate(newEvent.start)
    const eventEnd = coerceDate(newEvent.end)
    if (!eventStart || !eventEnd) return

    const views = ['month', 'week', 'day']
    views.forEach(viewType => {
      const range = getVisibleRange(currentDate, viewType)
      const eventStartTime = eventStart.getTime()
      const eventEndTime = eventEnd.getTime()
      const rangeStartTime = range.start.getTime()
      const rangeEndTime = range.end.getTime()
      const isInRange = eventStartTime <= rangeEndTime && eventEndTime >= rangeStartTime
      if (!isInRange) return

      const key = snapshotKey(range.start, range.end, viewType)
      try {
        const existing = window.sessionStorage.getItem(key)
        const parsed = existing ? JSON.parse(existing) : { version: SNAPSHOT_VERSION, events: [] }
        let list = parsed.events || []

        if (!list.some(x => x.id === newEvent.id)) {
          const startIso = safeToISOString(newEvent.start)
          const endIso = safeToISOString(newEvent.end)
          if (startIso && endIso) {
            list.push({
              id: newEvent.id, clientKey: newEvent.clientKey || newEvent.id, title: newEvent.title,
              description: newEvent.description || null, start: startIso, end: endIso,
              color: newEvent.color, calendar_id: newEvent.calendar_id, location: newEvent.location || '',
              participants: newEvent.participants || [], attendees: newEvent.attendees || [],
              todoId: newEvent.todoId, isOptimistic: newEvent.isOptimistic, isAllDay: newEvent.isAllDay,
              isPendingSync: Boolean(newEvent.isPendingSync), transparency: newEvent.transparency || 'opaque',
              visibility: newEvent.visibility || 'default', organizerEmail: newEvent.organizerEmail || null,
              viewerIsOrganizer: Boolean(newEvent.viewerIsOrganizer), viewerIsAttendee: Boolean(newEvent.viewerIsAttendee),
              viewerResponseStatus: newEvent.viewerResponseStatus || null
            })
          }
        } else {
          list = list.map(ev => ev.id === newEvent.id ? { ...ev, ...newEvent } : ev)
        }
        window.sessionStorage.setItem(key, JSON.stringify({ version: SNAPSHOT_VERSION, events: list }))
      } catch (err) { console.error('Failed to update snapshot:', err) }
    })
  }, [currentDate, snapshotKey, getVisibleRange])

  return {
    snapshotKey, clearAllSnapshots, removeEventFromAllSnapshots, removeTodoFromAllSnapshots, saveSnapshotsForAllViews
  }
}
