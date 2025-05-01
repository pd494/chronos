import { useEffect, useState } from 'react'
import Header from './components/Header'
import SplitView from './components/SplitView'
import MonthlyView from './components/calendar/MonthlyView'
import WeeklyView from './components/calendar/WeeklyView'
import DailyView from './components/calendar/DailyView'
import Sidebar from './components/todo/sidebar/Sidebar'
import EventModal from './components/events/EventModal'
import { useCalendar } from './context/CalendarContext'
import { TaskProvider } from './context/TaskContext'
import { FiSun, FiMoon } from 'react-icons/fi'

function App() {
  const { view, showEventModal } = useCalendar()
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    // Check user's preference from localStorage or system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const savedMode = localStorage.getItem('darkMode')
    
    if (savedMode !== null) {
      setIsDarkMode(savedMode === 'true')
    } else {
      setIsDarkMode(prefersDark)
    }
  }, [])

  useEffect(() => {
    // Apply dark mode class to document
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    
    // Save preference to localStorage
    localStorage.setItem('darkMode', isDarkMode)
  }, [isDarkMode])

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
  }
  
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

  return (
    <TaskProvider>
      <div className="h-full flex flex-col">
        <div className="absolute right-4 top-4 z-20">
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkMode ? <FiSun className="text-xl" /> : <FiMoon className="text-xl" />}
          </button>
        </div>
        
        <Header />
        
        <SplitView
          sidebar={<Sidebar />}
          main={renderCalendarView()}
        />
        
        {showEventModal && <EventModal />}
      </div>
    </TaskProvider>
  )
}

export default App