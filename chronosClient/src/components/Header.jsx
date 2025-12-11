import React, { useState, useEffect, useRef, useMemo } from 'react'
import { FiChevronLeft, FiChevronRight, FiChevronDown, FiPlus, FiUser, FiLogOut, FiCalendar } from 'react-icons/fi'
import { useCalendar } from '../context/CalendarContext/CalendarContext'
import { useTaskContext } from '../context/TaskContext/context'
import { useAuth } from '../context/AuthContext'
import { calendarApi } from '../lib/api'
import './header.css'

const CAL_COLOR_PALETTE = [
  '#7c3aed', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#14b8a6', '#8b5cf6', '#ec4899'
]

const hashColor = (id = '') => {
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0
  const idx = Math.abs(h) % CAL_COLOR_PALETTE.length
  return CAL_COLOR_PALETTE[idx]
}

const normalizeCalendar = (cal) => {
  const id = cal.id || cal.provider_calendar_id || cal.external_id || cal.calendar_id
  const summary = cal.summary || cal.name || cal.provider_calendar_id || 'Calendar'
  const color = cal.color || cal.backgroundColor || hashColor(id || summary)
  return { id, summary, color, raw: cal }
}

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
    openEventModal,
    refreshEvents,
    setSelectedCalendars
  } = useCalendar()
  
  const { user, login, logout } = useAuth()
  
  // State for view dropdown
  const [showViewDropdown, setShowViewDropdown] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [isManualRefresh, setIsManualRefresh] = useState(false)
  const [showCalendarMenu, setShowCalendarMenu] = useState(false)
  const [calendars, setCalendars] = useState([])
  const [manualCalendars, setManualCalendars] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = window.localStorage.getItem('chronos:manual-calendars')
      return stored ? JSON.parse(stored) : []
    } catch (_) {
      return []
    }
  })
  const [selectedCalendarIds, setSelectedCalendarIds] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      const stored = window.localStorage.getItem('chronos:selected-calendars')
      return stored ? JSON.parse(stored) : []
    } catch (_) {
      return []
    }
  })
  const [calLoading, setCalLoading] = useState(false)
  const [calError, setCalError] = useState('')
  const [manualInput, setManualInput] = useState('')
  const [calendarSearch, setCalendarSearch] = useState('')
  
  // Task context for categories
  const { tasks } = useTaskContext()
  
  // Reference for dropdown button
  const viewButtonRef = useRef(null)
  const userMenuRef = useRef(null)
  const calendarMenuRef = useRef(null)

  const persistSelected = (ids) => {
    setSelectedCalendarIds(ids)
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('chronos:selected-calendars', JSON.stringify(ids)) } catch (_) {}
    }
  }

  const persistManualCalendars = (list) => {
    setManualCalendars(list)
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('chronos:manual-calendars', JSON.stringify(list)) } catch (_) {}
    }
  }

  const loadCalendars = async () => {
    setCalLoading(true)
    setCalError('')
    try {
      const res = await calendarApi.getCalendars()
      const list = (res.calendars || []).map(normalizeCalendar).filter(c => c.id)
      const merged = [...list, ...manualCalendars]
      setCalendars(merged)
      if (selectedCalendarIds.length === 0 && merged.length) {
        persistSelected(merged.map(c => c.id))
      }
    } catch (e) {
      setCalError('Failed to load calendars')
    } finally {
      setCalLoading(false)
    }
  }

  const handleToggleCalendar = (id) => {
    if (!id) return
    const next = selectedCalendarIds.includes(id)
      ? selectedCalendarIds.filter(x => x !== id)
      : [...selectedCalendarIds, id]
    persistSelected(next)
  }

  const handleAddManual = (e) => {
    e?.preventDefault?.()
    const trimmed = (manualInput || '').trim()
    if (!trimmed) return
    if (calendars.some(c => c.id === trimmed)) {
      if (!selectedCalendarIds.includes(trimmed)) persistSelected([...selectedCalendarIds, trimmed])
      setManualInput('')
      return
    }
    const newCal = { id: trimmed, summary: trimmed, color: hashColor(trimmed), raw: { type: 'manual' } }
    const nextManual = [...manualCalendars, newCal]
    const nextCalendars = [...calendars, newCal]
    persistManualCalendars(nextManual)
    setCalendars(nextCalendars)
    persistSelected([...selectedCalendarIds, trimmed])
    setManualInput('')
  }

  const handleAddGoogle = async () => {
    try {
      await login({ forceConsent: true })
      await loadCalendars()
    } catch (_) {
      // ignore
    }
  }
  
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

      if (showCalendarMenu && calendarMenuRef.current && !calendarMenuRef.current.contains(event.target)) {
        setShowCalendarMenu(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showViewDropdown, showUserMenu, showCalendarMenu])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (cancelled) return
      await loadCalendars()
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setSelectedCalendars(selectedCalendarIds)
  }, [selectedCalendarIds, setSelectedCalendars])

  useEffect(() => {
    if (!calendars.length) return
    const colorMap = {}
    const idMap = {}
    calendars.forEach(c => { if (c.id && c.color) colorMap[c.id] = c.color })
    calendars.forEach(c => {
      if (c.id) idMap[c.id] = c.id
      const providerId = c.raw?.provider_calendar_id
      if (providerId && c.id) idMap[providerId] = c.id
    })
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('chronos:calendar-colors', JSON.stringify(colorMap)) } catch (_) {}
      try { window.localStorage.setItem('chronos:calendar-id-map', JSON.stringify(idMap)) } catch (_) {}
    }
    window.chronosCalendarColors = colorMap
    window.chronosCalendarIdMap = idMap
  }, [calendars])

  const visibleCalendars = useMemo(() => {
    const term = calendarSearch.trim().toLowerCase()
    if (!term) return calendars
    return calendars.filter(c => (c.summary || '').toLowerCase().includes(term))
  }, [calendars, calendarSearch])

  const selectedCalendars = useMemo(
    () => calendars.filter(c => selectedCalendarIds.includes(c.id)),
    [calendars, selectedCalendarIds]
  )

  const handleManualRefresh = async () => {
    if (isManualRefresh) return
    setIsManualRefresh(true)
    try {
      await refreshEvents()
    } catch (error) {
      console.error('Manual refresh failed:', error)
    } finally {
      setIsManualRefresh(false)
    }
  }

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
        <div style={{ position: 'relative', zIndex: 9999 }} ref={calendarMenuRef}>
          <button
            onClick={() => setShowCalendarMenu(p => !p)}
            className="clean-button calendar-chip"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                {selectedCalendars.slice(0, 5).map(dot => (
                  <span
                    key={dot.id}
                    className="calendar-chip-dot"
                    style={{ backgroundColor: dot.color }}
                  />
                ))}
                {selectedCalendars.length === 0 && <span className="calendar-chip-dot muted" />}
                {selectedCalendars.length > 5 && (
                  <span className="text-[10px] text-gray-500 font-medium">
                    +{selectedCalendars.length - 5}
                  </span>
                )}
              </span>
              <span className="text-sm text-gray-800 font-medium">
                {calLoading ? 'Calendars…' : `${selectedCalendars.length || 0} calendars`}
              </span>
              <span className="calendar-chip-add">+</span>
            </span>
          </button>

          {showCalendarMenu && (
            <div
              className="user-menu-dropdown modal-fade-in"
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '8px',
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
                width: 'fit-content',
                maxWidth: '80vw',
                padding: '0',
                zIndex: 10000
              }}
            >
              {/* Group calendars by their source account */}
              {calLoading ? (
                <div className="text-xs text-gray-500 p-4">Loading…</div>
              ) : visibleCalendars.length === 0 ? (
                <div className="text-xs text-gray-500 p-4">No calendars yet</div>
              ) : (
                (() => {
                  const grouped = {}
                  visibleCalendars.forEach(cal => {
                    const email = cal.raw?.email || (cal.summary.includes('@') ? cal.summary : user?.email || 'Calendars')
                    if (!grouped[email]) grouped[email] = []
                    grouped[email].push(cal)
                  })
                  
                  return Object.entries(grouped).map(([email, cals], idx) => (
                    <div key={email}>
                      {idx > 0 && <div className="border-t border-gray-200" />}
                      <div className="px-4 py-3">
                        <div className="text-xs font-medium text-gray-600 mb-2">{email}</div>
                        <div className="space-y-2">
                          {cals.map(cal => (
                            <label
                              key={cal.id}
                              className={`calendar-row ${selectedCalendarIds.includes(cal.id) ? 'active' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedCalendarIds.includes(cal.id)}
                                onChange={() => handleToggleCalendar(cal.id)}
                              />
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke={cal.color}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{ flexShrink: 0 }}
                              >
                                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
                                <line x1="7" y1="2" x2="7" y2="6" />
                                <line x1="17" y1="2" x2="17" y2="6" />
                              </svg>
                              <span style={{ color: cal.color, fontWeight: 600 }}>{cal.summary}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                })()
              )}
            </div>
          )}
        </div>

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
            <div className="view-dropdown-menu modal-fade-in">
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
              <div className="user-menu-dropdown modal-fade-in" style={{
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
