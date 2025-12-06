import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App.jsx'
import './tailwind.css'
import { CalendarProvider } from './context/CalendarContext/CalendarContext'
import { TaskProvider } from './context/TaskContext/TaskProvider'
import { AuthProvider } from './context/AuthContext.jsx'

// Create the router
const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <AuthProvider>
        <TaskProvider>
          <CalendarProvider>
            <App />
          </CalendarProvider>
        </TaskProvider>
      </AuthProvider>
    ),
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
