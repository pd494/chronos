import React, { useState, useEffect, useRef } from 'react'
import { FiChevronLeft, FiChevronRight, FiChevronDown, FiPlus, FiShare2 } from 'react-icons/fi'
import { useCalendar } from '../context/CalendarContext'
import { useTaskContext } from '../context/TaskContext'
import './header.css'

const ViewButton = ({ view, currentView, onChange }) => {
  // Capitalize first letter
  const label = view.charAt(0).toUpperCase() + view.slice(1);
  
  return (
    <button
      onClick={() => onChange(view)}
      className={`px-3 py-1 text-sm ${
        currentView === view
          ? 'bg-gray-100 dark:bg-gray-700 font-medium'
          : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
      style={{ WebkitAppRegion: 'no-drag', pointerEvents: 'auto' }}
    >
      {label}
    </button>
  );
};

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
  
  // State for view dropdown
  const [showViewDropdown, setShowViewDropdown] = useState(false)
  
  // Task context for categories
  const { tasks } = useTaskContext()
  
  // Reference for dropdown button
  const viewButtonRef = useRef(null)
  
  // Handle view change
  const handleViewChange = (newView) => {
    changeView(newView);
    setShowViewDropdown(false);
  }
  
  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showViewDropdown) return
    
    const handleClickOutside = (event) => {
      if (viewButtonRef.current && !viewButtonRef.current.contains(event.target) &&
          !event.target.closest('.view-dropdown-menu')) {
        setShowViewDropdown(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showViewDropdown])
  
  // Share functionality
  const handleShare = () => {
    console.log('Share calendar')
    // Add your share functionality here
  }

  // Create modified dark mode button
  const renderDarkModeButton = () => {
    if (!darkModeButton) return null;
    
    // Clone the original button but add our class
    return (
      <div className="flex-shrink-0">
        {React.cloneElement(darkModeButton, { 
          className: `p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors dark-mode-button ${darkModeButton.props.className || ''}`
        })}
      </div>
    );
  }

  return (
    <header className="flex items-center justify-between h-12 bg-white dark:bg-gray-800 px-4 md:px-6" style={{ WebkitAppRegion: 'drag' }}>
      {/* Left: Month/Year and Navigation */}
      <div className="flex items-center space-x-3">
        {/* Current Date Display - Now first */}
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 select-none current-date" style={{ WebkitAppRegion: 'no-drag' }}>
          {formatDateHeader()}
        </span>
        
        {/* Navigate Previous/Next - Now after month text */}
        <div className="flex items-center navigation-buttons">
          <button
            onClick={navigateToPrevious}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <FiChevronLeft size={18} />
          </button>
          <button
            onClick={navigateToNext}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <FiChevronRight size={18} />
          </button>
        </div>
        
        {/* Today Button - Now after arrows, simpler styling */}
        <button
          onClick={navigateToToday}
          className="today-button"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          Today
        </button>
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-2">
        {/* Create Event Button - Borderless */}
        <button
          onClick={() => openEventModal()}
          className="clean-button"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <FiPlus size={14} className="mr-1" />
          <span>Event</span>
        </button>
        
        {/* View Dropdown - Borderless with completely redone dropdown */}
        <div style={{ position: 'relative', zIndex: 9999 }}>
          <button 
            ref={viewButtonRef}
            onClick={() => setShowViewDropdown(!showViewDropdown)}
            className="clean-button"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <span className="mr-1">{view.charAt(0).toUpperCase() + view.slice(1)}</span>
            <FiChevronDown size={14} />
          </button>
          
          {showViewDropdown && (
            <div className="view-dropdown-menu">
              <button
                onClick={() => handleViewChange('day')}
                className={view === 'day' ? 'active' : ''}
              >
                <span>Day</span>
                <span className="keyboard-shortcut">(D)</span>
              </button>
              <button
                onClick={() => handleViewChange('week')}
                className={view === 'week' ? 'active' : ''}
              >
                <span>Week</span>
                <span className="keyboard-shortcut">(W)</span>
              </button>
              <button
                onClick={() => handleViewChange('month')}
                className={view === 'month' ? 'active' : ''}
              >
                <span>Month</span>
                <span className="keyboard-shortcut">(M)</span>
              </button>
            </div>
          )}
        </div>
        
        {/* Share Button with lavender background */}
        <button
          onClick={handleShare}
          className="share-button"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          Share
        </button>
        
        {renderDarkModeButton()}
      </div>
    </header>
  )
}

export default Header