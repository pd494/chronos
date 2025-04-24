import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { CalendarProvider } from './context/CalendarContext.jsx'
import { TodoProvider } from './context/TodoContext.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <TodoProvider>
      <CalendarProvider>
        <App />
      </CalendarProvider>
    </TodoProvider>
  </React.StrictMode>,
)