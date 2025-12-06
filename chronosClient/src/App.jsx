import { useEffect, useState, useRef } from 'react'
import Header from './components/Header'
import SplitView from './components/SplitView'
import MonthView from './components/calendar/MonthView'
import WeeklyView from './components/calendar/WeekView'
import DayView from './components/calendar/DayView'
import Sidebar from './components/todo/Sidebar'
import FloatingChatBar from './components/FloatingChatBar'
import TodoDragOverlay from './components/TodoDragOverlay'
import { useTaskContext } from './context/TaskContext/context'
import { useAuth } from './context/AuthContext'
import CategoryTabs from './components/todo/CategoryTabs'
import EventModal from './components/events/EventModal/EventModal'

import { useCalendar } from './context/CalendarContext/CalendarContext'
import './components/header.css'

// Toast notification component
const Toast = ({ message, visible, onClose, autoCloseDelay = 3000 }) => {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        onClose()
      }, autoCloseDelay)
      return () => clearTimeout(timer)
    }
  }, [visible, message, onClose, autoCloseDelay])

  if (!visible) return null

  return (
    <div
      className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[9999] text-white px-6 py-4 rounded-lg shadow-lg transition-all duration-300 ease-out"
      style={{
        backgroundColor: 'rgb(159, 134, 255)',
        animation: visible ? 'slideUp 0.3s ease-out' : 'none'
      }}
    >
      <p className="text-base font-medium">{message}</p>
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translate(-50%, 20px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>
    </div>
  )
}

const AppSkeleton = () => (
  <div className="h-full flex flex-col animate-pulse bg-gray-50">
    <div className="h-12 bg-white border-b border-gray-200" />
    <div className="flex flex-1">
      <div className="w-80 bg-white border-r border-gray-200" />
      <div className="flex-1 m-4 bg-white border border-gray-200 rounded-lg" />
    </div>
  </div>
)

const SignedOutState = ({ onLogin, loading }) => (
  <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-gray-50">
    <h1 className="text-2xl font-semibold text-gray-800 mb-4">You're signed out</h1>
    <p className="text-gray-600 mb-6 max-w-md">
      Sign in with Google to view your calendar, tasks, and meetings.
    </p>
    <button
      onClick={onLogin}
      disabled={loading}
      className="px-6 py-3 rounded-lg bg-purple-600 text-white font-medium disabled:opacity-60 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition"
    >
      {loading ? 'Preparing…' : 'Sign in with Google'}
    </button>
  </div>
)

function AppContent() {
  const { view, showEventModal, changeView, initialLoading, selectedEvent, toggleEventChecked } = useCalendar()
  const { categories } = useTaskContext()
  const { loading: authLoading, user, login } = useAuth()
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [activeCategory, setActiveCategory] = useState('All')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const deletionTimerRef = useRef(null)
  const deletionCountRef = useRef(0)

  const shouldShowSkeleton = authLoading && !user

  // Listen for event deletion to show toast
  useEffect(() => {
    const handleEventDeleted = (e) => {
      const message = e.detail?.message || 'Deleted Event'
      const normalizedMessage = String(message).toLowerCase()
      const isDeletion = normalizedMessage === 'deleted event'

      if (isDeletion) {
        // Clear previous timer if it exists
        if (deletionTimerRef.current) {
          clearTimeout(deletionTimerRef.current)
        }
        
        // Increment counter and update toast
        deletionCountRef.current += 1
        setToastMessage(`Deleted Event (${deletionCountRef.current})`)
        setToastVisible(true)
        
        // Reset counter after 5 seconds of no deletions
        deletionTimerRef.current = setTimeout(() => {
          deletionCountRef.current = 0
        }, 5000)
      } else {
        // Error message - reset counter and show error
        setToastMessage(message)
        setToastVisible(true)
        deletionCountRef.current = 0
        if (deletionTimerRef.current) {
          clearTimeout(deletionTimerRef.current)
        }
      }
    }

    window.addEventListener('eventDeleted', handleEventDeleted)
    return () => {
      window.removeEventListener('eventDeleted', handleEventDeleted)
      if (deletionTimerRef.current) {
        clearTimeout(deletionTimerRef.current)
      }
    }
  }, [])

  // Add keyboard shortcuts
  useEffect(() => {
    if (shouldShowSkeleton) return

    const handleKeyDown = (e) => {
      // Skip if user is typing in an input or textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Toggle check-off on selected event
      if (selectedEvent && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        e.stopPropagation()
        if (typeof e.stopImmediatePropagation === 'function') {
          e.stopImmediatePropagation()
        }
        toggleEventChecked(selectedEvent.id)
        return
      }

      // If the event modal is open, let its internal shortcuts handle other key presses.
      if (showEventModal) {
        return;
      }
      
      switch (e.key.toLowerCase()) {
        case 'm':
          changeView('month');
          break;
        case 'w':
          changeView('week');
          break;
        case 'd':
          changeView('day');
          break;
        case 'n':
          // Focus the task input
          const taskInput = document.querySelector('.task-input-field');
          if (taskInput) {
            taskInput.focus();
          }
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [changeView, showEventModal, shouldShowSkeleton])

  if (shouldShowSkeleton) {
    return <AppSkeleton />
  }

  if (!user) {
    return <SignedOutState onLogin={login} loading={authLoading} />
  }

  
  const renderCalendarView = () => {
    switch (view) {
      case 'month':
        return <MonthView />
      case 'week':
        return <WeeklyView />
      case 'day':
        return <DayView />
      default:
        return <MonthView />
    }
  }

  const handleSidebarChange = (width, visible) => {
    setSidebarWidth(width);
    setSidebarVisible(visible);
  };
  
  // Toggle sidebar collapse
  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };

  const handleCategoryChange = (category) => {
    setActiveCategory(category);
  };

  const handleCategoryRenamed = (previousName, nextName) => {
    if (previousName && nextName && activeCategory === previousName) {
      setActiveCategory(nextName);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="header-container">
        <div className="flex w-full items-center bg-white dark:bg-gray-800">
          <div 
            id="header-tabs-wrapper"
            className="flex-shrink-0 flex items-center bg-white overflow-hidden border-r border-gray-200"
            style={{ width: sidebarVisible ? sidebarWidth + 'px' : '0' }}
          >
            <CategoryTabs
              categories={categories}
              activeCategory={activeCategory}
              onCategoryChange={handleCategoryChange}
              isCompact={true}
              inHeader={true}
            />
          </div>
          
          <div className="flex-1">
            <Header />
          </div>
        </div>
      </div>
      <SplitView
        sidebar={<Sidebar 
          activeCategory={activeCategory}
          isSidebarCollapsed={isSidebarCollapsed}
          sidebarWidth={sidebarWidth}
          sidebarVisible={sidebarVisible}
          toggleSidebar={toggleSidebar}
          onCategoryRenamed={handleCategoryRenamed}
        />}
        overlayHeader={(
          <CategoryTabs
            categories={categories}
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryChange}
            isCompact={true}
            inHeader={true}
          />
        )}
        main={renderCalendarView()}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={toggleSidebar}
        onSidebarWidthChange={handleSidebarChange}
      />
      <TodoDragOverlay />
      {showEventModal && <EventModal />}
      {!showEventModal && <FloatingChatBar />}
      <Toast 
        message={toastMessage} 
        visible={toastVisible} 
        onClose={() => setToastVisible(false)}
      />
    </div>
  )
}

function App() {
  return <AppContent />
}

export default App
