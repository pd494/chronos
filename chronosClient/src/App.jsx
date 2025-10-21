import { useEffect, useState } from 'react'
import Header from './components/Header'
import SplitView from './components/SplitView'
import MonthlyView from './components/calendar/MonthlyView'
import WeeklyView from './components/calendar/WeeklyView'
import DailyView from './components/calendar/DailyView'
import Sidebar from './components/todo/sidebar/Sidebar'
import FloatingChatBar from './components/FloatingChatBar'
import { useTaskContext } from './context/TaskContext'
import { useAuth } from './context/AuthContext'
import CategoryTabs from './components/todo/sidebar/CategoryTabs'
import EventModal from './components/events/EventModal'

import { useCalendar } from './context/CalendarContext'
import './components/header.css'

const AppSkeleton = () => (
  <div className="h-full flex flex-col animate-pulse bg-gray-50">
    <div className="h-12 bg-white border-b border-gray-200" />
    <div className="flex flex-1">
      <div className="w-80 bg-white border-r border-gray-200" />
      <div className="flex-1 m-4 bg-white border border-gray-200 rounded-lg" />
    </div>
  </div>
)

function AppContent() {
  const { view, showEventModal, changeView, initialLoading } = useCalendar()
  const { categories } = useTaskContext()
  const { loading: authLoading } = useAuth()

  const shouldShowSkeleton = authLoading

  if (shouldShowSkeleton) {
    return <AppSkeleton />
  }

  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip if user is typing in an input or textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // If the event modal is open, let its internal shortcuts handle the key press.
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
  }, [changeView, showEventModal]);

  
  const renderCalendarView = () => {
    switch (view) {
      case 'month':
        return <MonthlyView />
      case 'week':
        return <WeeklyView />
      case 'day':
        return <DailyView />
      default:
        return <MonthlyView />
    }
  }

  const [activeCategory, setActiveCategory] = useState('All');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  
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
        main={renderCalendarView()}
        onSidebarWidthChange={handleSidebarChange}
      />
      {showEventModal && <EventModal />}
      {!showEventModal && <FloatingChatBar />}
    </div>
  )
}

function App() {
  return <AppContent />
}

export default App
