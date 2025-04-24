import { createContext, useContext, useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'

const TodoContext = createContext()

const initialTodos = [
  { id: '1', text: 'new meeting @ 2pm', completed: false },
  { id: '2', text: 'New todo @list @2pm', completed: false },
  { id: '3', text: 'PAY BOFA', completed: false },
  { id: '4', text: 'bofa due date', completed: false },
  { id: '5', text: 'cse 111 section', completed: false },
  { id: '6', text: "Valentine's Day", completed: false },
  { id: '7', text: 'Demo Day', completed: false }
]

export const TodoProvider = ({ children }) => {
  const [todos, setTodos] = useState(() => {
    const savedTodos = localStorage.getItem('todos')
    return savedTodos ? JSON.parse(savedTodos) : initialTodos
  })
  const [filter, setFilter] = useState('all')

  // Save todos to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('todos', JSON.stringify(todos))
  }, [todos])

  const addTodo = (text) => {
    const newTodo = {
      id: uuidv4(),
      text,
      completed: false
    }
    setTodos([...todos, newTodo])
  }

  const toggleTodo = (id) => {
    setTodos(
      todos.map(todo =>
        todo.id === id ? { ...todo, completed: !todo.completed } : todo
      )
    )
  }

  const editTodo = (id, text) => {
    setTodos(
      todos.map(todo =>
        todo.id === id ? { ...todo, text } : todo
      )
    )
  }

  const deleteTodo = (id) => {
    setTodos(todos.filter(todo => todo.id !== id))
  }

  const clearCompleted = () => {
    setTodos(todos.filter(todo => !todo.completed))
  }

  const changeFilter = (newFilter) => {
    setFilter(newFilter)
  }

  const getFilteredTodos = () => {
    switch (filter) {
      case 'all':
        return todos
      case 'active':
        return todos.filter(todo => !todo.completed)
      case 'completed':
        return todos.filter(todo => todo.completed)
      default:
        return todos
    }
  }

  const value = {
    todos,
    filter,
    addTodo,
    toggleTodo,
    editTodo,
    deleteTodo,
    clearCompleted,
    changeFilter,
    getFilteredTodos
  }

  return <TodoContext.Provider value={value}>{children}</TodoContext.Provider>
}

export const useTodo = () => {
  const context = useContext(TodoContext)
  if (!context) {
    throw new Error('useTodo must be used within a TodoProvider')
  }
  return context
}