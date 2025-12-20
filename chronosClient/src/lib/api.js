const CONFIGURED_API_URL = import.meta.env.VITE_API_URL

function normalizeUrl(url) {
  return typeof url === 'string' ? url.replace(/\/+$/, '') : url
}

function resolveApiUrl() {
  if (typeof window === 'undefined') return normalizeUrl(CONFIGURED_API_URL)

  const defaultUrl = `${window.location.protocol}//${window.location.hostname}:8000`
  const configured = normalizeUrl(CONFIGURED_API_URL)
  if (!configured) return defaultUrl

  try {
    const parsed = new URL(configured)
    const pageHost = window.location.hostname
    const interchangeable = new Set(['localhost', '127.0.0.1'])

    if (interchangeable.has(parsed.hostname) && interchangeable.has(pageHost) && parsed.hostname !== pageHost) {
      parsed.hostname = pageHost
      return normalizeUrl(parsed.toString())
    }
  } catch (_) {
    return configured
  }

  return configured
}

const API_URL = resolveApiUrl()

let refreshPromise = null
let sessionExpired = false
let inMemoryAccessToken = null
let inMemoryRefreshToken = null

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function setInMemoryTokens(accessToken, refreshToken) {
  if (typeof accessToken === 'string' && accessToken) {
    inMemoryAccessToken = accessToken
  }
  if (typeof refreshToken === 'string' && refreshToken) {
    inMemoryRefreshToken = refreshToken
  }
}

function clearInMemoryTokens() {
  inMemoryAccessToken = null
  inMemoryRefreshToken = null
}

if (typeof window !== 'undefined') {
  const resetModuleState = () => {
    refreshPromise = null
    sessionExpired = false
  }

  if (window.performance?.navigation?.type === 1 || document.readyState === 'loading') {
    resetModuleState()
  }

  window.addEventListener('pageshow', resetModuleState)
}

async function parseErrorResponse(response) {
  try {
    const body = await response.json()
    if (body && typeof body.detail === 'string') {
      return body.detail
    }
  } catch (_) {}
  return `HTTP ${response.status}`
}

async function performRefresh() {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: JSON_HEADERS,
    body: inMemoryRefreshToken ? JSON.stringify({ refresh_token: inMemoryRefreshToken }) : undefined
  })

  if (!response.ok) {
    const detail = await parseErrorResponse(response)
    const error = new Error(detail)
    error.status = response.status
    throw error
  }

  const payload = await response.json()
  if (payload?.access_token || payload?.refresh_token) {
    setInMemoryTokens(payload?.access_token, payload?.refresh_token)
  }
  return payload
}

function isNoRefreshTokenError(error) {
  return error?.status === 401 && String(error?.message || '').toLowerCase().includes('no refresh token')
}

function handleSessionExpired(error) {
  if (!sessionExpired) {
    sessionExpired = true
    console.error('Token refresh failed:', error)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chronos:session-expired', { detail: { error } }))
    }
  }
  const err = new Error('Session expired. Please sign in again.')
  err.cause = error
  err.status = error?.status ?? 401
  throw err
}

async function ensureSession() {
  if (!refreshPromise) {
    refreshPromise = performRefresh()
      .then((result) => {
        sessionExpired = false
        return result
      })
      .catch((error) => {
        const status = error?.status
        if ((status === 401 || status === 403) && !isNoRefreshTokenError(error)) {
          handleSessionExpired(error)
        }
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

const mergeHeaders = (headers) => ({ ...JSON_HEADERS, ...headers })

async function apiFetch(endpoint, options = {}) {
  const isAuthRecoveryEndpoint =
    endpoint.includes('/auth/refresh') ||
    endpoint.includes('/auth/session') ||
    endpoint.includes('/auth/logout')

  if (sessionExpired && !isAuthRecoveryEndpoint) {
    throw new Error('Session expired. Please sign in again.')
  }

  const authHeader =
    inMemoryAccessToken && !(options.headers && (options.headers.Authorization || options.headers.authorization))
      ? { Authorization: `Bearer ${inMemoryAccessToken}` }
      : {}

  const makeRequest = () => fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: mergeHeaders({ ...authHeader, ...options.headers })
  })

  let response = await makeRequest()

  const skipAutoRefresh = endpoint.includes('/auth/refresh') || endpoint.includes('/auth/me')

  if (response.status === 401 && !skipAutoRefresh) {
    try {
      await ensureSession()
      if (sessionExpired) {
        throw new Error('Session expired. Please sign in again.')
      }
      response = await makeRequest()
    } catch (refreshError) {
      const status = refreshError?.status
      if (!sessionExpired && (status === 401 || status === 403) && !isNoRefreshTokenError(refreshError)) {
        handleSessionExpired(refreshError)
      }
      throw refreshError
    }
  }

  if (!response.ok) {
    const detail = await parseErrorResponse(response)
    const error = new Error(detail)
    error.status = response.status
    throw error
  }

  return response.json()
}

const requestWithJson = (endpoint, method, payload, options = {}) =>
  apiFetch(endpoint, {
    ...options,
    method,
    body: payload === undefined ? undefined : JSON.stringify(payload)
  })

const get = (endpoint, options) => apiFetch(endpoint, options)
const postJson = (endpoint, payload, options) => requestWithJson(endpoint, 'POST', payload, options)
const putJson = (endpoint, payload, options) => requestWithJson(endpoint, 'PUT', payload, options)
const patchJson = (endpoint, payload, options) => requestWithJson(endpoint, 'PATCH', payload, options)
const deleteRequest = (endpoint, options) => apiFetch(endpoint, { ...options, method: 'DELETE' })

export const authApi = {

  async syncSession(accessToken, refreshToken) {
    setInMemoryTokens(accessToken, refreshToken)
    const result = await postJson('/auth/session', {
      access_token: accessToken,
      refresh_token: refreshToken
    })
    sessionExpired = false
    return result
  },


  async getMe() {
    return get('/auth/me')
  },

  async refresh() {
    return ensureSession()
  },

  async logout(options = {}) {
    clearInMemoryTokens()
    return postJson('/auth/logout', {}, { keepalive: Boolean(options.keepalive) })
  }
}

export const todosApi = {

  async createTodo(todoData) {
    return postJson('/todos/', todoData)
  },

  async getTodos() {
    return get('/todos/')
  },

  async updateTodo(todoId, updates) {
    return putJson(`/todos/${todoId}`, updates)
  },

  async deleteTodo(todoId) {
    return deleteRequest(`/todos/${todoId}`)
  },

  async createCategory(categoryData) {
    return postJson('/todos/categories/', categoryData)
  },

  async getCategories() {
    return get('/todos/categories/')
  },

  async updateCategory(categoryId, updates) {
    return patchJson(`/todos/categories/${categoryId}`, updates)
  },

  async deleteCategory(categoryId) {
    return deleteRequest(`/todos/categories/${categoryId}`)
  },

  async convertToEvent(todoId, eventData) {
    return postJson(`/todos/${todoId}/convert-to-event`, eventData)
  },

  async getBootstrap() {
    return get('/todos/')
  },

  async batchReorderCategories(updates) {
    if (!Array.isArray(updates)) {
      throw new Error('batchReorderCategories expects an array of updates')
    }
    return patchJson('/todos/categories/batch-reorder', { updates })
  }
}

function toGoogleEventBody(eventData) {
  const body = {}

  if (eventData.title) body.summary = eventData.title
  if (eventData.description) body.description = eventData.description
  if (eventData.location) body.location = eventData.location

  if (Array.isArray(eventData.participants) && eventData.participants.length) {
    body.attendees = eventData.participants.map((email) => ({ email }))
  }

  if (eventData.reminders) {
    body.reminders = eventData.reminders
  }

  if (eventData.color) {
    body.extendedProperties = body.extendedProperties || {}
    body.extendedProperties.private = {
      ...(body.extendedProperties.private || {}),
      categoryColor: eventData.color
    }
  }

  if (Array.isArray(eventData.recurrence)) {
    body.recurrence = eventData.recurrence
  } else if (eventData.recurrenceRule) {
    body.recurrence = [eventData.recurrenceRule]
  }

  if (eventData.conferenceData) {
    body.conferenceData = eventData.conferenceData
  }

  if (eventData.transparency) {
    body.transparency = eventData.transparency
  }

  if (eventData.visibility) {
    body.visibility = eventData.visibility
  }

  if (eventData.recurrenceRule || eventData.recurrenceSummary || eventData.recurrenceMeta) {
    body.extendedProperties = body.extendedProperties || {}
    const privateProps = { ...(body.extendedProperties.private || {}) }
    if (eventData.recurrenceRule) {
      privateProps.recurrenceRule = eventData.recurrenceRule
    }
    if (eventData.recurrenceSummary) {
      privateProps.recurrenceSummary = eventData.recurrenceSummary
    }
    if (eventData.recurrenceMeta) {
      privateProps.recurrenceMeta = typeof eventData.recurrenceMeta === 'string'
        ? eventData.recurrenceMeta
        : JSON.stringify(eventData.recurrenceMeta)
    }
    body.extendedProperties.private = {
      ...privateProps
    }
  }
  if (eventData.recurrenceEditScope || eventData.recurringEditScope) {
    body.recurringEditScope = eventData.recurrenceEditScope || eventData.recurringEditScope
  }

  const tz = eventData.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const start = eventData.start instanceof Date ? eventData.start : new Date(eventData.start)
  const end = eventData.end instanceof Date ? eventData.end : new Date(eventData.end)

  if (eventData.isAllDay) {
    const toYMD = (d) => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }
    body.start = { date: toYMD(start) }
    body.end = { date: toYMD(end) }
  } else {
    const formatInTimeZone = (d, timeZone) => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).formatToParts(d)
      const get = (type) => parts.find(p => p.type === type)?.value
      const y = get('year')
      const m = get('month')
      const day = get('day')
      const h = get('hour')
      const min = get('minute')
      const s = get('second')
      return `${y}-${m}-${day}T${h}:${min}:${s}`
    }
    body.start = { dateTime: formatInTimeZone(start, tz), timeZone: tz }
    body.end = { dateTime: formatInTimeZone(end, tz), timeZone: tz }
  }

  return body
}

export const calendarApi = {
  async saveCredentials(tokens) {
    return postJson('/calendar/credentials', tokens)
  },

  async getCalendars() {
    return get('/calendar/calendars')
  },

  async updateCalendar(calendarId, updates) {
    return patchJson(`/calendar/calendars/${encodeURIComponent(calendarId)}`, updates)
  },

  async getEvents(start, end, calendarIds) {
    const params = new URLSearchParams({ start, end })
    if (calendarIds && calendarIds.length > 0) {
      params.append('calendar_ids', calendarIds.join(','))
    }
    return get(`/calendar/events?${params.toString()}`)
  },

  async getEventUserState() {
    return get('/calendar/event-user-state')
  },

  async updateEventUserState(eventId, isCheckedOff = false, timeOverrides = null) {
    return postJson('/calendar/event-user-state', {
      event_id: eventId,
      is_checked_off: isCheckedOff,
      time_overrides: timeOverrides
    })
  },

  async batchUpdateEventUserState(updates) {
    return postJson('/calendar/event-user-state/batch', {
      updates: updates.map(u => ({
        event_id: u.eventId,
        is_checked_off: false,
        time_overrides: u.overrides
      }))
    })
  },

  async getTodoEventLinks() {
    return get('/calendar/todo-event-links')
  },

  async updateTodoEventLink(todoId, eventId = null, googleEventId = null) {
    return postJson('/calendar/todo-event-links', {
      todo_id: todoId,
      event_id: eventId,
      google_event_id: googleEventId
    })
  },

  async deleteTodoEventLink(todoId) {
    return deleteRequest(`/calendar/todo-event-links/${todoId}`)
  },

  async syncCalendar() {
    return postJson('/calendar/sync', {})
  },

  async syncCalendarForeground() {
    return postJson('/calendar/sync', { foreground: true })
  },

  async getSyncStatus() {
    return get('/calendar/sync-status')
  },

  async triggerBackfill(initialBackfill = true) {
    return postJson('/calendar/sync', { initial_backfill: initialBackfill })
  },

  async createEvent(eventData, calendarId = 'primary', sendNotifications = false, accountEmail = null) {
    const payload = {
      calendar_id: calendarId,
      event_data: toGoogleEventBody(eventData),
      send_notifications: sendNotifications
    }

    if (typeof accountEmail === 'string' && accountEmail.trim()) {
      payload.account_email = accountEmail.trim()
    }

    return postJson('/calendar/events', payload)
  },

  async updateEvent(eventId, eventData, calendarId = 'primary', sendNotifications = false, accountEmail = null) {
    const payload = {
      calendar_id: calendarId,
      event_data: toGoogleEventBody(eventData),
      send_notifications: sendNotifications
    }

    if (typeof accountEmail === 'string' && accountEmail.trim()) {
      payload.account_email = accountEmail.trim()
    }

    return putJson(`/calendar/events/${eventId}`, payload)
  },

  async deleteEvent(eventId, calendarId = 'primary', accountEmail = null) {
    const params = new URLSearchParams()
    if (calendarId) params.set('calendar_id', String(calendarId))
    if (typeof accountEmail === 'string' && accountEmail.trim()) params.set('account_email', accountEmail.trim())
    const suffix = params.toString() ? `?${params.toString()}` : ''
    return deleteRequest(`/calendar/events/${eventId}${suffix}`)
  },

  async respondToInvite(eventId, responseStatus, calendarId = 'primary') {
    if (!eventId) {
      throw new Error('eventId is required to respond to an invite')
    }
    if (!responseStatus) {
      throw new Error('responseStatus is required to respond to an invite')
    }
    const payload = {
      calendar_id: calendarId,
      response_status: responseStatus
    }
    return postJson(`/calendar/events/${eventId}/respond`, payload)
  },

  async addAccount({ accessToken, refreshToken, expiresAt, externalAccountId, accountEmail, scopes }) {
    return postJson('/calendar/add-account', {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      external_account_id: externalAccountId,
      account_email: accountEmail,
      scopes
    })
  },

  async listSubscriptions() {
    return get('/calendar/subscriptions')
  },

  async createSubscription({ url, name = null, color = null }) {
    return postJson('/calendar/subscriptions', { url, name, color })
  },

  async deleteSubscription(subscriptionId) {
    return deleteRequest(`/calendar/subscriptions/${encodeURIComponent(subscriptionId)}`)
  }

}

export const settingsApi = {
  async getSettings() {
    return get('/settings')
  },

  async updateSettings(settings) {
    return putJson('/settings', settings)
  }
}

export const chatApi = {
  async getTodoSuggestions(content) {
    const response = await apiFetch('/chat/todo-suggestions', {
      method: 'POST',
      body: JSON.stringify({ content })
    })
    return response
  },

  async calendarChat(content, options = {}) {
    return postJson('/chat/calendar', { content }, options)
  }
}
