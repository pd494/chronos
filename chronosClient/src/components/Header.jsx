import React, { useState, useEffect, useRef } from 'react'
import { FiChevronLeft, FiChevronRight, FiChevronDown, FiPlus, FiUser, FiLogOut } from 'react-icons/fi'
import { useCalendar } from '../context/CalendarContext'
import { useTaskContext } from '../context/TaskContext'
import { useAuth } from '../context/AuthContext'
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

const Header = () => {
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
  
  const { user, login, logout } = useAuth()
  
  // State for view dropdown
  const [showViewDropdown, setShowViewDropdown] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  
  // Task context for categories
  const { tasks } = useTaskContext()
  
  // Reference for dropdown button
  const viewButtonRef = useRef(null)
  const userMenuRef = useRef(null)
  
  // Handle view change
  const handleViewChange = (newView) => {
    changeView(newView);
    setShowViewDropdown(false);
  }
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showViewDropdown && viewButtonRef.current && !viewButtonRef.current.contains(event.target) &&
          !event.target.closest('.view-dropdown-menu')) {
        setShowViewDropdown(false)
      }
      
      if (showUserMenu && userMenuRef.current && !userMenuRef.current.contains(event.target) &&
          !event.target.closest('.user-menu-dropdown')) {
        setShowUserMenu(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showViewDropdown, showUserMenu])

  return (
    <header className="flex items-center justify-between h-12 bg-white px-4 md:px-6" style={{ WebkitAppRegion: 'drag' }}>
      {/* Left: Month/Year and Navigation */}
      <div className="flex items-center space-x-3">
        {/* Current Date Display - Now first */}
        <span className="text-sm font-semibold text-gray-900 select-none current-date" style={{ WebkitAppRegion: 'no-drag' }}>
          {formatDateHeader()}
        </span>
        
        {/* Navigate Previous/Next - Now after month text */}
        <div className="flex items-center navigation-buttons">
          <button
            onClick={navigateToPrevious}
            className="p-1 rounded-full hover:bg-gray-100 text-gray-600"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <FiChevronLeft size={18} />
          </button>
          <button
            onClick={navigateToNext}
            className="p-1 rounded-full hover:bg-gray-100 text-gray-600"
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
        
        {/* Auth Button/Menu */}
        {user ? (
          <div style={{ position: 'relative', zIndex: 9999 }}>
            <button
              ref={userMenuRef}
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{ 
                WebkitAppRegion: 'no-drag',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                padding: 0
              }}
            >
              {user.avatar_url ? (
                <img 
                  src={user.avatar_url} 
                  alt={user.name} 
                  style={{ 
                    width: '32px', 
                    height: '32px', 
                    borderRadius: '50%',
                    objectFit: 'cover'
                  }} 
                />
              ) : (
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <FiUser size={18} />
                </div>
              )}
            </button>
            
            {showUserMenu && (
              <div className="user-menu-dropdown" style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '8px',
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                minWidth: '200px',
                zIndex: 10000
              }}>
                <div style={{ padding: '12px', borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '14px', fontWeight: '500' }}>{user.name}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>{user.email}</div>
                </div>
                <button
                  onClick={logout}
                  style={{
                    width: '100%',
                    padding: '12px',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#f3f4f6'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  <FiLogOut size={16} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={login}
            className="share-button"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            Sign In
          </button>
        )}
      </div>
    </header>
  )
}

export default Header