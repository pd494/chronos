import React, { useState, useEffect, useRef, useMemo } from 'react'
import { FiChevronLeft, FiChevronRight, FiChevronDown, FiPlus, FiRefreshCw } from 'react-icons/fi'
import { useCalendar } from '../context/CalendarContext/CalendarContext'
import { useTaskContext } from '../context/TaskContext/context'
import { useAuth } from '../context/AuthContext'
import { calendarApi } from '../lib/api'
import './header.css'

const CAL_COLOR_PALETTE = [
  '#7c3aed', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#14b8a6', '#8b5cf6', '#ec4899'
]

const NAMED_CAL_COLOR_MAP = {
  yellow: '#B38314',
  gold: '#B38314',
  orange: '#C65D00',
  red: '#7A0000',
  green: '#0B8043',
  teal: '#00897B',
  blue: '#1761C7',
  purple: '#8B4DE8',
  violet: '#8B4DE8',
  pink: '#D81B60',
  brown: '#8D6E63'
}

const normalizeNamedColor = (value) => {
  if (typeof value !== 'string') return value
  const v = value.trim().toLowerCase()
  if (!v) return value
  if (v.startsWith('#')) return v
  return NAMED_CAL_COLOR_MAP[v] || value
}

const hashColor = (id = '') => {
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) | 0
  const idx = Math.abs(h) % CAL_COLOR_PALETTE.length
  return CAL_COLOR_PALETTE[idx]
}

const isLightColor = (hex) => {
  if (typeof hex !== 'string') return false
  const raw = hex.trim().replace(/^#/, '')
  if (!(raw.length === 3 || raw.length === 6)) return false
  const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if (![r, g, b].every(Number.isFinite)) return false
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 180
}

const readableTextColor = (value) => {
  const normalized = normalizeNamedColor(value)
  return isLightColor(normalized) ? '#111827' : '#ffffff'
}

const normalizeCalendar = (cal) => {
  const id = cal.id || cal.internal_id || cal.provider_calendar_id || cal.external_id || cal.calendar_id
  const providerCalendarId = cal.provider_calendar_id || cal.providerCalendarId || cal.provider_calendarId
  const summary = cal.summary || cal.name || providerCalendarId || 'Calendar'
  const rawColor = cal.color || cal.backgroundColor
  const color = normalizeNamedColor(rawColor) || hashColor(id || summary)
  return { id, summary, color, raw: cal, providerCalendarId }
}

const ViewButton = ({ view, currentView, onChange }) => {
  const label = view.charAt(0).toUpperCase() + view.slice(1)

  return (
    <button
      onClick={() => onChange(view)}
      className={`px-3 py-1 text-sm ${currentView === view
        ? 'bg-gray-100 dark:bg-gray-700 font-medium'
        : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
        }`}
      style={{ WebkitAppRegion: 'no-drag', pointerEvents: 'auto' }}
    >
      {label}
    </button>
  )
}

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

  const { addGoogleAccount, user, login } = useAuth()

  const [showViewDropdown, setShowViewDropdown] = useState(false)
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

  const { tasks } = useTaskContext()

  const viewButtonRef = useRef(null)
  const calendarMenuRef = useRef(null)

  const persistSelected = (ids) => {
    setSelectedCalendarIds(ids)
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('chronos:selected-calendars', JSON.stringify(ids)) } catch (_) { }
    }
  }

  const persistManualCalendars = (list) => {
    setManualCalendars(list)
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('chronos:manual-calendars', JSON.stringify(list)) } catch (_) { }
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
      if (typeof window !== 'undefined') {
        let known = []
        try {
          const raw = window.localStorage.getItem('chronos:known-calendars')
          known = raw ? JSON.parse(raw) : []
          if (!Array.isArray(known)) known = []
        } catch (_) {
          known = []
        }
        const knownSet = new Set(known)
        const newIds = merged.map(c => c.id).filter(Boolean).filter(id => !knownSet.has(id))
        const nextKnown = Array.from(new Set([...known, ...merged.map(c => c.id).filter(Boolean)]))
        try { window.localStorage.setItem('chronos:known-calendars', JSON.stringify(nextKnown)) } catch (_) { }

        if (selectedCalendarIds.length === 0 && merged.length) {
          persistSelected(merged.map(c => c.id))
        } else if (newIds.length) {
          const nextSelected = Array.from(new Set([...selectedCalendarIds, ...newIds]))
          persistSelected(nextSelected)
        }
      } else if (selectedCalendarIds.length === 0 && merged.length) {
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
      if (user) {
        await addGoogleAccount()
      } else {
        await login({ forceConsent: true })
      }
    } catch (_) {
      // ignore
    }
  }

  const handleViewChange = (newView) => {
    changeView(newView);
    setShowViewDropdown(false);
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showViewDropdown && viewButtonRef.current && !viewButtonRef.current.contains(event.target) &&
        !event.target.closest('.view-dropdown-menu')) {
        setShowViewDropdown(false)
      }

      if (showCalendarMenu && calendarMenuRef.current && !calendarMenuRef.current.contains(event.target)) {
        setShowCalendarMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showViewDropdown, showCalendarMenu])

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
    const handleCalendarUpdated = () => {
      loadCalendars()
    }
    window.addEventListener('calendarUpdated', handleCalendarUpdated)
    return () => window.removeEventListener('calendarUpdated', handleCalendarUpdated)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handler = async () => {
      try {
        await loadCalendars()
      } catch (_) { }
    }
    window.addEventListener('chronos:google-account-added', handler)
    return () => window.removeEventListener('chronos:google-account-added', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setSelectedCalendars(selectedCalendarIds)
  }, [selectedCalendarIds, setSelectedCalendars])

  useEffect(() => {
    if (!calendars.length) return
    const colorMap = {}
    const idMap = {}
    const accountEmails = new Set()
    calendars.forEach(c => { if (c.id && c.color) colorMap[c.id] = c.color })
    calendars.forEach(c => {
      if (c.id) idMap[c.id] = c.id
      const providerId = c.raw?.provider_calendar_id
      if (providerId && c.id) {
        idMap[providerId] = c.id
        idMap[c.id] = providerId
      }
      const email = c.raw?.account_email || c.raw?.accountEmail
      if (email) accountEmails.add(email.toLowerCase())
      const accountId = c.raw?.external_account_id
      if (accountId && typeof accountId === 'string' && accountId.includes('@')) {
        accountEmails.add(accountId.toLowerCase())
      }
      const providerCalId = c.raw?.provider_calendar_id
      if (providerCalId && typeof providerCalId === 'string' && providerCalId.includes('@')) {
        accountEmails.add(providerCalId.toLowerCase())
      }
    })
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem('chronos:calendar-colors', JSON.stringify(colorMap)) } catch (_) { }
      try { window.localStorage.setItem('chronos:calendar-id-map', JSON.stringify(idMap)) } catch (_) { }
      try { window.localStorage.setItem('chronos:account-emails', JSON.stringify([...accountEmails])) } catch (_) { }
    }
    window.chronosCalendarColors = colorMap
    window.chronosCalendarIdMap = idMap
    window.chronosAccountEmails = [...accountEmails]
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
      <div className="flex items-center space-x-3">
        <span className="text-sm font-semibold text-gray-900 select-none current-date" style={{ WebkitAppRegion: 'no-drag' }}>
          {formatDateHeader()}
        </span>

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

        <button
          onClick={navigateToToday}
          className="today-button"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          Today
        </button>
      </div>

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
              {calLoading ? (
                <div className="text-xs text-gray-500 p-4">Loading…</div>
              ) : visibleCalendars.length === 0 ? (
                <div className="text-xs text-gray-500 p-4">No calendars yet</div>
              ) : (
                (() => {
                  const grouped = {}
                  visibleCalendars.forEach(cal => {
                    const accountId = cal.raw?.external_account_id || cal.external_account_id
                    const email = cal.raw?.account_email || cal.raw?.accountEmail
                    const emailFallback = (!email && typeof accountId === 'string' && accountId.includes('@')) ? accountId : null
                    const label = email || emailFallback || (accountId ? `Google account ${String(accountId).slice(0, 6)}…` : (user?.email || 'Calendars'))
                    if (!grouped[label]) grouped[label] = []
                    grouped[label].push(cal)
                  })

                  return (
                    <>
                      {Object.entries(grouped).map(([email, cals], idx) => (
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
                                  <span style={{ color: readableTextColor(cal.color), fontWeight: 600 }}>{cal.summary}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="border-t border-gray-200" />
                      <div className="px-4 py-3">
                        <button
                          onClick={handleAddGoogle}
                          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          <FiPlus size={14} />
                          <span>Add Google account</span>
                        </button>
                      </div>
                    </>
                  )
                })()
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => openEventModal()}
          className="clean-button"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <FiPlus size={14} className="mr-1" />
          <span>Event</span>
        </button>

        <button
          onClick={handleManualRefresh}
          className="clean-button"
          style={{ WebkitAppRegion: 'no-drag' }}
          disabled={isManualRefresh}
        >
          <FiRefreshCw size={14} className={`mr-1 ${isManualRefresh ? 'animate-spin' : ''}`} />
          <span>Sync</span>
        </button>

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

      </div>
    </header>
  )
}

export default Header
