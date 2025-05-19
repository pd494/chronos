import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App.jsx'
import AuthCallback from './components/AuthCallback.jsx'
import './index.css'
import { CalendarProvider } from './context/CalendarContext.jsx'
import { TodoProvider } from './context/TodoContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'

// Create the router
const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <AuthProvider>
        <TodoProvider>
          <CalendarProvider>
            <App />
          </CalendarProvider>
        </TodoProvider>
      </AuthProvider>
    ),
  },
  {
    path: '/auth-callback',
    element: <AuthCallback />,
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)