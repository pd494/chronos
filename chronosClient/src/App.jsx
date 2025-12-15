import { useEffect, useState } from 'react'
import Header from './components/Header'
import SplitView from './components/SplitView'
import MonthView from './components/calendar/MonthView'
import WeeklyView from './components/calendar/WeekView'
import DayView from './components/calendar/DayView'
import Sidebar from './components/todo/Sidebar'
import FloatingChatBar from './components/FloatingChatBar'
import DndKitProvider from './components/DndKitProvider'
import { useTaskContext } from './context/TaskContext/context'
import { useAuth } from './context/AuthContext'
import CategoryTabs from './components/todo/CategoryTabs'
import EventModal from './components/events/EventModal/EventModal'

import { Toaster } from 'sonner'

import { useCalendar } from './context/CalendarContext/CalendarContext'

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
  const [activeCategory, setActiveCategory] = useState('All')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [sidebarVisible, setSidebarVisible] = useState(true)

  const shouldShowSkeleton = authLoading && !user

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
      <Toaster richColors position="bottom-center" />
      <div className="w-full flex flex-col relative z-50 border-b border-[#e5e5ea] overflow-visible">
        <div className="flex w-full items-center bg-white dark:bg-gray-800 h-12 min-h-12">
          <div
            id="header-tabs-wrapper"
            className="flex-shrink-0 flex items-center bg-white overflow-hidden border-r border-gray-200 h-12 min-h-12 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden whitespace-nowrap pl-0 transition-[width] duration-300 ease-in-out"
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
      {showEventModal && <EventModal />}
      {!showEventModal && <FloatingChatBar />}
    </div>
  )
}

function App() {
  return (
    <DndKitProvider>
      <AppContent />
    </DndKitProvider>
  )
}

export default App
