import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { CalendarProvider } from './context/CalendarContext.jsx'
import { TaskProvider } from './context/TaskContext.jsx'
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