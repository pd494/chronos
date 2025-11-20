// Lightweight IndexedDB cache for calendar events
// Stores events per user + calendar set + month bucket (YYYY-MM)

const DB_NAME = 'chronos-cache'
const DB_VERSION = 1
const STORE_EVENTS = 'events'

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        const store = db.createObjectStore(STORE_EVENTS, { keyPath: 'key' })
        store.createIndex('byUser', 'user')
        store.createIndex('byUserCal', ['user', 'calHash'])
        store.createIndex('byUserCalMonth', ['user', 'calHash', 'month'])
        store.createIndex('updated', 'updated')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export function monthKey(date) {
  const y = date.getFullYear()
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  return `${y}-${m}`
}

export async function putMonth({ user, calHash, month, events, updated }) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_EVENTS, 'readwrite')
    const store = tx.objectStore(STORE_EVENTS)
    const key = `${user}|${calHash}|${month}`
    store.put({ key, user, calHash, month, events, updated: updated || Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getMonths({ user, calHash, months }) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_EVENTS, 'readonly')
    const store = tx.objectStore(STORE_EVENTS)
    const out = new Map()
    let pending = months.length
    if (!pending) return resolve(out)
    months.forEach((m) => {
      const key = `${user}|${calHash}|${m}`
      const req = store.get(key)
      req.onsuccess = () => {
        if (req.result) out.set(m, req.result)
        if (--pending === 0) resolve(out)
      }
      req.onerror = () => {
        if (--pending === 0) resolve(out)
      }
    })
  })
}

export async function pruneOlderThan(ttlMs) {
  if (!ttlMs) return
  const db = await openDB()
  const threshold = Date.now() - ttlMs
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_EVENTS, 'readwrite')
    const store = tx.objectStore(STORE_EVENTS)
    const idx = store.index('updated')
    const range = IDBKeyRange.upperBound(threshold)
    const cursorReq = idx.openCursor(range)
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result
      if (!cursor) return
      store.delete(cursor.primaryKey)
      cursor.continue()
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

export async function clearCacheForCalHash({ user, calHash }) {
  if (!user) return
  const db = await openDB()
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_EVENTS, 'readwrite')
    const store = tx.objectStore(STORE_EVENTS)
    const idx = store.index('byUserCal')
    const cursorReq = idx.openCursor()
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result
      if (!cursor) return
      const value = cursor.value
      if (value?.user === user && (!calHash || value?.calHash === calHash)) {
        store.delete(cursor.primaryKey)
      }
      cursor.continue()
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}
