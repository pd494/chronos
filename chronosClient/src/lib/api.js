const API_URL = import.meta.env.VITE_API_URL 

let refreshPromise = null
let sessionExpired = false
let isRedirecting = false

const JSON_HEADERS = { 'Content-Type': 'application/json' }

// Reset module state on page load
if (typeof window !== 'undefined') {
  const resetModuleState = () => {
    refreshPromise = null
    sessionExpired = false
    isRedirecting = false
  }
  
  // Check if we're returning from a redirect
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
    headers: JSON_HEADERS
  })

  if (!response.ok) {
    const detail = await parseErrorResponse(response)
    const error = new Error(detail)
    error.status = response.status
    throw error
  }

  return response.json()
}

function handleSessionExpired(error) {
  sessionExpired = true
  console.error('Token refresh failed:', error)
  if (typeof window !== 'undefined' && !isRedirecting) {
    isRedirecting = true
    window.location.href = '/?session_expired=true'
  }
  const err = new Error('Session expired. Please sign in again.')
  err.cause = error
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
        handleSessionExpired(error)
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

const mergeHeaders = (headers) => ({ ...JSON_HEADERS, ...headers })

async function apiFetch(endpoint, options = {}) {
  if (sessionExpired && !endpoint.includes('/auth/refresh')) {
    throw new Error('Session expired. Please sign in again.')
  }

  const makeRequest = () => fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: mergeHeaders(options.headers)
  })

  let response = await makeRequest()

  // Skip auto-refresh for /auth/me and /auth/refresh endpoints to prevent infinite loops
  const skipAutoRefresh = endpoint.includes('/auth/refresh') || endpoint.includes('/auth/me')
  
  if (response.status === 401 && !skipAutoRefresh) {
    try {
      await ensureSession()
      if (sessionExpired) {
        throw new Error('Session expired. Please sign in again.')
      }
      response = await makeRequest()
    } catch (refreshError) {
      if (!sessionExpired) {
        handleSessionExpired(refreshError)
      }
      throw refreshError
    }
  }

  if (!response.ok) {
    const detail = await parseErrorResponse(response)
    throw new Error(detail)
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
    return postJson('/auth/session', {
      access_token: accessToken,
      refresh_token: refreshToken
    })
  },

 
  async getMe() {
    return get('/auth/me')
  },

  async refresh() {
    return ensureSession()
  },

  async logout() {
    return postJson('/auth/logout')
  }
}

// ----- Todos API -----
export const todosApi = {

  async createTodo(todoData){
    return postJson('/todos/', todoData)
  },

  async getTodos(){
    return get('/todos/')
  },

  async updateTodo(todoId, updates){
    return putJson(`/todos/${todoId}`, updates)
  },

  async deleteTodo(todoId){
    return deleteRequest(`/todos/${todoId}`)
  },

  async createCategory(categoryData){
    return postJson('/todos/categories/', categoryData)
  },

  async getCategories(){
    return get('/todos/categories/')
  },

  async updateCategory(categoryId, updates){
    return patchJson(`/todos/categories/${categoryId}`, updates)
  },

  async deleteCategory(categoryId){
    return deleteRequest(`/todos/categories/${categoryId}`)
  },

  async convertToEvent(todoId, eventData){
    return postJson(`/todos/${todoId}/convert-to-event`, eventData)
  },

  async batchReorderCategories(updates){
    if (!Array.isArray(updates)) {
      throw new Error('batchReorderCategories expects an array of updates')
    }
    return patchJson('/todos/categories/batch-reorder', { updates })
  }
}

// ----- Calendar API -----

export const calendarApi = {
  async saveCredentials(tokens){
    return postJson('/calendar/credentials', tokens)
  },

  async getCalendars(){
    return get('/calendar/calendars')
  },

  async getEvents(start, end, calendarIds){
    const params = new URLSearchParams({
      start,
      end
    })
    if (calendarIds && calendarIds.length > 0){
      // Convert array of calendar IDs to comma-separated string and add to query params
      // e.g., ['cal1', 'cal2', 'cal3'] becomes 'cal1,cal2,cal3'
      params.append('calendar_ids', calendarIds.join(','))
    }
    return get(`/calendar/events?${params.toString()}`)
  }, 
  
  async createEvent(eventData){
    return postJson('/calendar/events', eventData)
  },
  
  async updateEvent(eventId, eventData){
    return putJson(`/calendar/events/${eventId}`, eventData)
  },

  async patchEvent(eventId, eventData){
    return patchJson(`/calendar/events/${eventId}`, eventData)
  },

  async deleteEvent(eventId){
    return deleteRequest(`/calendar/events/${eventId}`)
  }

}
