const API_URL = import.meta.env.VITE_API_URL 

async function apiFetch(endpoint, options = {}) {
  const makeRequest = () => fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers }
  })

  let response = await makeRequest()

  if (response.status === 401 && !endpoint.includes('/auth/refresh')) {
    await authApi.refresh()
    response = await makeRequest()
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  return response.json()
}

export const authApi = {
 
  async syncSession(accessToken, refreshToken) {
    return apiFetch('/auth/session', {
      method: 'POST',
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken
      })
    })
  },

 
  async getMe() {
    return apiFetch('/auth/me')
  },

 
  async refresh() {
    return apiFetch('/auth/refresh', { method: 'POST' })
  },


  async logout() {
    return apiFetch('/auth/logout', { method: 'POST' })
  }
}

// ----- Todos API -----
export const todosApi = {

  async createTodo(todoData){
    return apiFetch('/todos/', {
      method: 'POST',
      body: JSON.stringify(todoData)
    })
  },

  async getTodos(){
    return apiFetch('/todos/');
  },

  async updateTodo(todoId, updates){
    return apiFetch(`/todos/${todoId}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    })
  },

  async completeTodo(todoId, isCompleted){
    const query = new URLSearchParams({ is_completed: String(isCompleted) })
    return apiFetch(`/todos/${todoId}/complete?${query.toString()}`, {
      method: 'PATCH'
    })
  },

  async deleteTodo(todoId){
    return apiFetch(`/todos/${todoId}`, {
      method: 'DELETE'
    })
  },

  async createCategory(categoryData){
    return apiFetch('/todos/categories/', {
      method: 'POST',
      body: JSON.stringify(categoryData)
    })
  },

  async getCategories(){
    return apiFetch('/todos/categories/')
  },

  async updateCategory(categoryId, updates){
    return apiFetch(`/todos/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    })
  },

  async deleteCategory(categoryId){
    return apiFetch(`/todos/categories/${categoryId}`, {
      method: 'DELETE'
    })
  },

}
