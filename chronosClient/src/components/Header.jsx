import { useState, useEffect } from 'react'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { useCalendar } from '../context/CalendarContext'
import { useTaskContext } from '../context/TaskContext'
import CategoryTabs from './todo/sidebar/CategoryTabs'

const Header = ({
  darkModeButton = null
}) => {
  const {
    currentDate,
    view,
    navigateToToday,
    navigateToPrevious,
    navigateToNext,
    changeView,
    formatDateHeader,
    openEventModal
  } = useCalendar()
  
  // Task context for categories
  const { tasks } = useTaskContext()
  
  // Header no longer manages categories as they're moved to App level

  return (
    <header className="flex items-center h-12 bg-white dark:bg-gray-800" style={{ WebkitAppRegion: 'drag', paddingTop: '6px' }}>
      <div className="flex items-center justify-end w-full">
        {/* Controls inside buttons will automatically be no-drag */}

        {/* Navigation controls moved to App level */}

        {/* Right side - Controls all in one line */}
        <div className="flex items-center gap-1 mr-2 flex-shrink-0">
          
          <button
            onClick={() => openEventModal()}
            className="px-2 py-1 text-xs bg-white border border-gray-300 dark:bg-gray-800 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            New Event
          </button>
          
          <div className="flex text-xs border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
            <button
              onClick={() => changeView('month')}
              className={`px-2 py-1 ${
                view === 'month'
                  ? 'bg-gray-100 dark:bg-gray-700'
                  : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              style={{ WebkitAppRegion: 'no-drag', pointerEvents: 'auto' }}
            >
              Month
            </button>
            
            <button
              onClick={() => changeView('week')}
              className={`px-2 py-1 ${
                view === 'week'
                  ? 'bg-gray-100 dark:bg-gray-700'
                  : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              style={{ WebkitAppRegion: 'no-drag', pointerEvents: 'auto' }}
            >
              Week
            </button>
            
            <button
              onClick={() => changeView('day')}
              className={`px-2 py-1 ${
                view === 'day'
                  ? 'bg-gray-100 dark:bg-gray-700'
                  : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              style={{ WebkitAppRegion: 'no-drag', pointerEvents: 'auto' }}
            >
              Day
            </button>
          </div>
        </div>
        {/* Dark mode button (rightmost) */}
        {darkModeButton && (
          <div className="ml-2 flex-shrink-0">{darkModeButton}</div>
        )}
      </div>
    </header>
  )
}

export default Header