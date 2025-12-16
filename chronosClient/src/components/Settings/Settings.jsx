import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { useSettings } from '../../context/SettingsContext'
import { useAuth } from '../../context/AuthContext'
import { usePlacesAutocomplete } from '../../hooks/usePlacesAutocomplete'
import { calendarApi } from '../../lib/api'
import SettingRow from './SettingRow'
import ToggleSwitch from './ToggleSwitch'
import { CATEGORY_COLORS } from '../events/EventModal/constants'
import { getEventColors, normalizeToPaletteColor } from '../../lib/eventColors'

const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="5" r="3" />
    <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" strokeLinecap="round" />
  </svg>
)

const CircleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="8" cy="8" r="4" />
  </svg>
)

const GridIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="1" />
  </svg>
)

const LinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M6 10l4-4M7 4h1a4 4 0 014 4v1M9 12H8a4 4 0 01-4-4V7" strokeLinecap="round" />
  </svg>
)

const GearIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M13 3l-1.5 1.5M4.5 11.5L3 13" strokeLinecap="round" />
  </svg>
)

const CalendarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="3" width="12" height="11" rx="2" />
    <path d="M5 1v3M11 1v3M2 7h12" strokeLinecap="round" />
  </svg>
)

const PaletteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="2" width="12" height="12" rx="2" />
  </svg>
)

const VideoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="4" width="9" height="8" rx="2" />
    <path d="M11 6l3-2v8l-3-2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const EventIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="3" width="12" height="11" rx="2" />
    <path d="M2 7h12" strokeLinecap="round" />
    <path d="M5 1v3M11 1v3" strokeLinecap="round" />
    <path d="M5.5 9.5h5" strokeLinecap="round" />
  </svg>
)

const BoltIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M9 1L4 9h4l-1 6 5-8H8l1-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const CommandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 6V4a2 2 0 114 0v8a2 2 0 104 0v-2M4 10v2a2 2 0 104 0V4a2 2 0 114 0v2" />
  </svg>
)

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M8 2v9M5 8l3 3 3-3M3 13h10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const StarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M8 2l1.5 3.5L13 6l-2.5 2.5.5 4L8 11l-3 1.5.5-4L3 6l3.5-.5L8 2z" strokeLinejoin="round" />
  </svg>
)

const SparkleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M8 1v3M8 12v3M1 8h3M12 8h3M3 3l2 2M11 11l2 2M13 3l-2 2M5 11l-2 2" strokeLinecap="round" />
  </svg>
)

const UsersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="6" cy="5" r="2.5" />
    <circle cx="11" cy="6" r="2" />
    <path d="M1 14c0-2.5 2-4 5-4s5 1.5 5 4" strokeLinecap="round" />
    <path d="M11 10c2 0 4 1 4 3" strokeLinecap="round" />
  </svg>
)

const MessageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M2 3h12v8H6l-3 2v-2H2V3z" strokeLinejoin="round" />
  </svg>
)

const ArrowLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M10 3L5 8l5 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const ArrowRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M6 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const LogOutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M6 2H4a2 2 0 00-2 2v8a2 2 0 002 2h2M10 11l3-3-3-3M6 8h7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M8 3v10M3 8h10" strokeLinecap="round" />
  </svg>
)

const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
  </svg>
)

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
    <circle cx="7" cy="7" r="7" />
    <path d="M4 7l2 2 4-4" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Settings = ({ onClose }) => {
  const { settings, updateSettings, loading } = useSettings()
  const { user, logout, addGoogleAccount } = useAuth()
  const [activeSection, setActiveSection] = useState('profile')
  const [calendarSubscriptions, setCalendarSubscriptions] = useState([])
  const [calendarSubscriptionsLoading, setCalendarSubscriptionsLoading] = useState(false)
  const [newSubscriptionUrl, setNewSubscriptionUrl] = useState('')
  const [newSubscriptionName, setNewSubscriptionName] = useState('')
  const [profileDraft, setProfileDraft] = useState({
    location: '',
    twitter: ''
  })

  const locationInputRef = useRef(null)
  const handleLocationSelect = (address) => {
    setProfileDraft(prev => ({ ...prev, location: address }))
  }
  const {
    predictions: locationPredictions,
    showSuggestions: showLocationSuggestions,
    isLoading,
    getPlacePredictions: getLocationPredictions,
    selectPlace: selectLocationPlace,
    setShowSuggestions: setShowLocationSuggestions
  } = usePlacesAutocomplete(locationInputRef, handleLocationSelect)

  const [openDropdown, setOpenDropdown] = useState(null)
  const [timezoneSearch, setTimezoneSearch] = useState('')

  const [calendars, setCalendars] = useState([])
  const [calendarsLoading, setCalendarsLoading] = useState(false)
  const [colorPickerOpen, setColorPickerOpen] = useState(null) // calendarId or null
  const [defaultEventColorPickerOpen, setDefaultEventColorPickerOpen] = useState(false)

  const calendarColors = useMemo(() => CATEGORY_COLORS.map(c => ({
    value: c.name,
    label: c.name.charAt(0).toUpperCase() + c.name.slice(1),
    hex: c.hex
  })), [])

  const getHex = useCallback((val) => {
    if (!val) return '#C5E0F9'
    if (val.startsWith('#')) return val
    const found = calendarColors.find(c => c.value === val)
    return found ? found.hex : '#C5E0F9'
  }, [calendarColors])

  const fetchCalendars = useCallback(async () => {
    if (!user) return
    setCalendarsLoading(true)
    try {
      const response = await calendarApi.getCalendars()
      setCalendars(response.calendars || [])
    } catch (error) {
      console.error('Failed to fetch calendars:', error)
    } finally {
      setCalendarsLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (activeSection === 'calendars' && calendars.length === 0) {
      fetchCalendars()
    }
  }, [activeSection, calendars.length, fetchCalendars])

  const fetchCalendarSubscriptions = useCallback(async () => {
    if (!user) return
    setCalendarSubscriptionsLoading(true)
    try {
      const res = await calendarApi.listSubscriptions()
      setCalendarSubscriptions(res.subscriptions || [])
    } catch (e) {
      console.error('Failed to fetch calendar subscriptions:', e)
    } finally {
      setCalendarSubscriptionsLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (activeSection === 'calendars' && calendarSubscriptions.length === 0) {
      fetchCalendarSubscriptions()
    }
  }, [activeSection, calendarSubscriptions.length, fetchCalendarSubscriptions])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e) => {
      const section = e?.detail?.section
      if (section) setActiveSection(section)
    }
    window.addEventListener('chronos:open-settings-section', handler)
    return () => window.removeEventListener('chronos:open-settings-section', handler)
  }, [])

  const handleCalendarColorChange = useCallback(async (calendarId, newColor) => {
    setCalendars(prev => prev.map(cal =>
      cal.id === calendarId ? { ...cal, backgroundColor: newColor } : cal
    ))
    setColorPickerOpen(null)

    try {
      await calendarApi.updateCalendar(calendarId, { color: newColor })

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('calendarUpdated', {
          detail: { calendarId, color: newColor }
        }))
        window.dispatchEvent(new CustomEvent('eventsRefreshNeeded'))
      }
    } catch (error) {
      console.error('Failed to update calendar color:', error)
      fetchCalendars()
    }
  }, [fetchCalendars])

  useEffect(() => {
    const handleClickOutside = () => {
      setColorPickerOpen(null)
      setDefaultEventColorPickerOpen(false)
    }
    if (colorPickerOpen || defaultEventColorPickerOpen) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [colorPickerOpen, defaultEventColorPickerOpen])

  useEffect(() => {
    setColorPickerOpen(null)
    setDefaultEventColorPickerOpen(false)
  }, [activeSection])

  const allTimezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone')
    } catch (_) {
      return ['America/Los_Angeles', 'America/New_York', 'America/Chicago', 'America/Denver', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney']
    }
  }, [])

  const timezoneOptions = useMemo(() => {
    const now = new Date()
    const formatOffset = (minutes) => {
      const total = Math.round(Number(minutes) || 0)
      const sign = total >= 0 ? '+' : '-'
      const abs = Math.abs(total)
      const hh = String(Math.floor(abs / 60)).padStart(2, '0')
      const mm = String(abs % 60).padStart(2, '0')
      return `GMT${sign}${hh}:${mm}`
    }

    const getOffsetMinutes = (tz) => {
      try {
        const dtf = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
        const parts = dtf.formatToParts(now)
        const get = (type) => parts.find(p => p.type === type)?.value
        const y = get('year')
        const mo = get('month')
        const d = get('day')
        const h = get('hour')
        const mi = get('minute')
        const s = get('second')
        if (!y || !mo || !d || !h || !mi || !s) return 0
        const asUtcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
        const diffMs = asUtcMs - now.getTime()
        return Math.round(diffMs / 60000)
      } catch (_) {
        return 0
      }
    }

    const toLabel = (tz) => {
      const offset = getOffsetMinutes(tz)
      const pretty = String(tz).replace(/_/g, ' ').replace(/\//g, ' / ')
      return `(${formatOffset(offset)}) ${pretty}`
    }

    return allTimezones
      .map((tz) => ({ value: tz, label: toLabel(tz) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [allTimezones])

  const timezoneLabelByValue = useMemo(() => {
    const map = new Map()
    for (const opt of timezoneOptions) map.set(opt.value, opt.label)
    return map
  }, [timezoneOptions])

  const profileInitial = useMemo(() => {
    const name = user?.name || user?.email || ''
    const first = String(name).trim().charAt(0)
    return (first || 'U').toUpperCase()
  }, [user?.email, user?.name])

  const profileName = user?.name || 'Your name'
  const profileEmail = user?.email || 'you@example.com'

  const userSettingsSections = [
    { id: 'profile', label: 'Profile', Icon: UserIcon }
  ]

  const appSettingsSections = [
    { id: 'general', label: 'General', Icon: GearIcon },
    { id: 'calendars', label: 'Calendars', Icon: CalendarIcon },
    { id: 'events', label: 'Events', Icon: EventIcon },
    { id: 'appearance', label: 'Appearance', Icon: PaletteIcon },
    { id: 'meetings', label: 'Meetings', Icon: VideoIcon }
  ]

  const formatDurationLabel = (minutes) => {
    const safe = Math.max(30, Math.min(360, Number(minutes) || 0))
    const hrs = Math.floor(safe / 60)
    const mins = safe % 60
    if (hrs <= 0) return `${mins} min`
    if (mins === 0) return `${hrs} hr`
    return `${hrs} hr ${mins} min`
  }

  const renderEventSettings = () => {
    const MIN_MINUTES = 30
    const MAX_MINUTES = 360
    const STEP_MINUTES = 15
    const PREVIEW_BOX_HEIGHT = 220
    const FIRST_HOUR_WEIGHT = 0.4
    const MIN_CONTENT_HEIGHT = 56
    const durationMinutes = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Number(settings?.default_event_duration) || 60))

    const minutesToPreviewHeight = (minutes) => {
      const safe = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Number(minutes) || 0))
      const firstHourHeight = PREVIEW_BOX_HEIGHT * FIRST_HOUR_WEIGHT
      const remainingHeight = PREVIEW_BOX_HEIGHT - firstHourHeight

      let h
      if (safe <= 60) {
        h = (safe / 60) * firstHourHeight
      } else {
        h = firstHourHeight + ((safe - 60) / (MAX_MINUTES - 60)) * remainingHeight
      }

      return Math.min(PREVIEW_BOX_HEIGHT, Math.max(MIN_CONTENT_HEIGHT, h))
    }

    const eventHeight = minutesToPreviewHeight(durationMinutes)
    const defaultEventColor = settings?.default_event_color || 'blue'
    const defaultEventHex = getHex(defaultEventColor)
    const markerPalette = getEventColors(normalizeToPaletteColor(defaultEventColor))

    const sanitizeTimeValue = (value) => {
      const raw = String(value || '').trim()
      if (!raw) return '09:00'
      const m = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
      if (!m) return '09:00'
      return `${m[1]}:${m[2]}`
    }

    const applyDuration = (nextMinutes) => {
      const clamped = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, nextMinutes))
      const snapped = Math.round(clamped / STEP_MINUTES) * STEP_MINUTES
      updateSettings({ default_event_duration: snapped }, { suppressToast: true })
    }

    const handleResizeStart = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const startY = e.clientY
      const startMinutes = durationMinutes
      const frameRect = e.currentTarget?.closest('[data-settings-event-preview-frame="true"]')?.getBoundingClientRect?.() || null

      const onMove = (moveEvent) => {
        if (frameRect) {
          const insideX = moveEvent.clientX >= frameRect.left && moveEvent.clientX <= frameRect.right
          const insideY = moveEvent.clientY >= frameRect.top && moveEvent.clientY <= frameRect.bottom
          if (!insideX || !insideY) return
        }
        const deltaY = moveEvent.clientY - startY
        const range = MAX_MINUTES - MIN_MINUTES
        const deltaMinutes = (deltaY / PREVIEW_BOX_HEIGHT) * range
        applyDuration(Math.round(startMinutes + deltaMinutes))
      }

      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

    return (
      <div className="space-y-0" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}>
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Events</h2>
          <p className="text-[13px] text-gray-500">Customize event defaults and what shows on your calendar.</p>
        </div>

        <div className="py-4 border-t border-gray-100">
          <div className="text-[13px] font-medium text-gray-900 mb-2">Preview</div>
          <div className="bg-gray-100 rounded-2xl p-4 border border-gray-200">
            <div className="relative overflow-hidden" data-settings-event-preview-frame="true" style={{ height: PREVIEW_BOX_HEIGHT }}>
              <div
                className="absolute left-0 right-0 top-0 rounded-lg overflow-hidden"
                style={{
                  height: `${eventHeight}px`,
                  backgroundColor: markerPalette.background,
                  opacity: 1
                }}
              >
                <div
                  className="absolute top-1 bottom-1 w-1 rounded-full"
                  style={{ left: 2, backgroundColor: markerPalette.border }}
                />
                <div className="h-full pl-3 pr-2 py-2" style={{ paddingBottom: 42 }}>
                  <div>
                    <div className="text-[12px] font-medium" style={{ color: markerPalette.text }}>
                      New Event
                    </div>
                    <div className="text-[11px]" style={{ color: 'rgba(55, 65, 81, 0.7)' }}>
                      Drag the handle to resize
                    </div>
                  </div>
                </div>

                <div
                  role="button"
                  tabIndex={0}
                  onMouseDown={handleResizeStart}
                  onWheel={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const direction = e.deltaY > 0 ? 1 : -1
                    applyDuration(durationMinutes + (direction * STEP_MINUTES))
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp') { e.preventDefault(); applyDuration(durationMinutes - STEP_MINUTES) }
                    if (e.key === 'ArrowDown') { e.preventDefault(); applyDuration(durationMinutes + STEP_MINUTES) }
                  }}
                  className="absolute left-1/2 -translate-x-1/2 cursor-ns-resize"
                  style={{
                    top: 'auto',
                    bottom: 8,
                    width: 72,
                    height: 18,
                    backgroundColor: 'transparent',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 0,
                    lineHeight: 0
                  }}
                  title="Drag to change default duration"
                >
                  <div className="h-[3px] w-8 rounded-full" style={{ backgroundColor: 'rgba(55, 65, 81, 0.22)' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <SettingRow
          label="Default event duration"
          description={`New timed events default to ${formatDurationLabel(durationMinutes)}.`}
        >
          <div className="text-[13px] font-medium text-gray-900">
            {formatDurationLabel(durationMinutes)}
          </div>
        </SettingRow>

        <SettingRow
          label="Default new event type"
          description="Choose whether new events start as timed or all-day."
        >
          <CustomDropdown
            value={settings?.default_new_event_is_all_day === false ? 'timed' : 'all_day'}
            onChange={(val) => {
              const nextAllDay = val === 'all_day'
              updateSettings({ default_new_event_is_all_day: nextAllDay })
            }}
            options={[
              { value: 'timed', label: 'Timed' },
              { value: 'all_day', label: 'All-day' }
            ]}
            dropdownKey="defaultNewEventType"
          />
        </SettingRow>

        {settings?.default_new_event_is_all_day === false && (
          <SettingRow
            label="Default start time"
            description="Used when creating a new timed event."
          >
            <input
              type="time"
              value={sanitizeTimeValue(settings?.default_event_start_time)}
              onChange={(e) => updateSettings({ default_event_start_time: sanitizeTimeValue(e.target.value) }, { suppressToast: true })}
              className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-gray-300"
              style={{ fontFamily: '-apple-system, BlinkMacSystemFont, \"SF Pro Text\", sans-serif' }}
            />
          </SettingRow>
        )}

        <SettingRow
          label="Default event color"
          description="New events start with this color."
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setDefaultEventColorPickerOpen((v) => !v)
              }}
              className="w-6 h-6 rounded-full border-2 border-gray-300 cursor-pointer hover:scale-110 transition-transform"
              style={{ backgroundColor: defaultEventHex }}
              title="Change default color"
            />

            {defaultEventColorPickerOpen && (
              <div
                className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-3"
                style={{ width: 192 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="grid grid-cols-4 gap-2">
                  {calendarColors.map(color => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => {
                        updateSettings({ default_event_color: color.value })
                        setDefaultEventColorPickerOpen(false)
                      }}
                      className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${defaultEventColor === color.value ? 'ring-2 ring-gray-400 ring-offset-2 ring-offset-white' : ''}`}
                      style={{ backgroundColor: color.hex }}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </SettingRow>

        <SettingRow
          label="Hide past declined events"
          description="Don’t show declined events once they’re in the past."
        >
          <ToggleSwitch
            checked={settings.hide_past_deleted_declined_events !== false}
            onChange={handleToggle('hide_past_deleted_declined_events')}
          />
        </SettingRow>

        <SettingRow
          label="Auto-delete completed tasks"
          description="Hide and delete completed tasks after 7 days."
        >
          <ToggleSwitch
            checked={settings?.show_completed_tasks !== false}
            onChange={(checked) => updateSettings({ show_completed_tasks: checked })}
          />
        </SettingRow>

      </div>
    )
  }

  const connectedAccounts = useMemo(() => {
    const result = []

    if (user?.email) {
      result.push(user.email)
    }

    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem('chronos:authenticated-accounts')
        const accounts = stored ? JSON.parse(stored) : []
        accounts.forEach(acc => {
          if (acc.email && !result.some(e => e.toLowerCase() === acc.email.toLowerCase())) {
            result.push(acc.email)
          }
        })
      } catch (_) { }
    }

    return result
  }, [user?.email])

  const billingSettingsSections = [
    { id: 'plans', label: 'Plans', Icon: CircleIcon },
    { id: 'subscriptions', label: 'Subscriptions', Icon: CircleIcon },
    { id: 'billing', label: 'Billing', Icon: CircleIcon }
  ]

  const weekStartOptions = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' }
  ]

  const weekNumberingOptions = [
    { value: 'locale', label: 'Locale' },
    { value: 'iso', label: 'ISO (Mon-start)' }
  ]

  const hourRangeOptions = Array.from({ length: 24 }, (_, h) => ({ value: h, label: `${h}` }))

  const workingDayOptions = [
    { value: 0, label: 'Sun' },
    { value: 1, label: 'Mon' },
    { value: 2, label: 'Tue' },
    { value: 3, label: 'Wed' },
    { value: 4, label: 'Thu' },
    { value: 5, label: 'Fri' },
    { value: 6, label: 'Sat' }
  ]

  const normalizeMinutesList = (value) => {
    const raw = Array.isArray(value) ? value : []
    const nums = raw
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 10080)
    const unique = Array.from(new Set(nums)).sort((a, b) => a - b)
    return unique.length ? unique : [10]
  }

  const viewOptions = [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' }
  ]

  const handleToggle = (key) => (checked) => {
    updateSettings({ [key]: checked })
  }

  const handleSelect = (key) => (value) => {
    updateSettings({ [key]: value })
  }

  const handleProfileDraft = (patch) => {
    setProfileDraft((prev) => ({ ...prev, ...patch }))
  }

  const CustomDropdown = ({ value, onChange, options, dropdownKey }) => {
    const isOpen = openDropdown === dropdownKey
    const selectedOption = options.find(o => o.value === value) || options[0]

    return (
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpenDropdown(isOpen ? null : dropdownKey)
          }}
          className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[13px] font-medium text-gray-900 hover:bg-gray-50 transition-colors"
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}
        >
          <span>{selectedOption?.label}</span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={isOpen ? "M12 10L8 6L4 10" : "M4 6L8 10L12 6"} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {isOpen && (
          <div
            className="absolute top-full left-0 mt-1 py-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[120px]"
            style={{ animation: 'fadeIn 0.15s ease-out' }}
            onClick={(e) => e.stopPropagation()}
          >
            {options.map(option => (
              <button
                key={option.value}
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(option.value)
                  setOpenDropdown(null)
                }}
                className={`w-full px-3 py-1.5 text-left text-[13px] hover:bg-gray-50 transition-colors ${option.value === value ? 'text-gray-900 font-medium bg-gray-50' : 'text-gray-700'
                  }`}
                style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderGeneralSettings = () => (
    <div className="space-y-0">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}>General</h2>
        <p className="text-[13px] text-gray-500">Configure your calendar preferences</p>
      </div>

      <SettingRow
        label="Use device timezone"
        description="Automatically use your device's timezone"
      >
        <ToggleSwitch
          checked={settings.use_device_timezone}
          onChange={handleToggle('use_device_timezone')}
        />
      </SettingRow>

      {!settings.use_device_timezone && (
        <SettingRow
          label="Timezone"
          description="Select your timezone"
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            {openDropdown === 'timezone' && (
              <div
                className="fixed inset-0 z-40"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setOpenDropdown(null)
                  setTimezoneSearch('')
                }}
              />
            )}
            <input
              type="text"
              value={openDropdown === 'timezone'
                ? timezoneSearch
                : (settings?.timezone ? (timezoneLabelByValue.get(settings.timezone) || settings.timezone) : '')}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => {
                setTimezoneSearch(String(e.target.value))
                if (openDropdown !== 'timezone') setOpenDropdown('timezone')
              }}
              onFocus={() => {
                setTimezoneSearch('')
                setOpenDropdown('timezone')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setOpenDropdown(null)
                  setTimezoneSearch('')
                  return
                }

                if (e.key === 'Enter') {
                  e.preventDefault()
                  const query = String(timezoneSearch || '').trim()
                  if (!query) {
                    updateSettings({ timezone: null, use_device_timezone: true })
                    setOpenDropdown(null)
                    setTimezoneSearch('')
                    return
                  }
                  const match = allTimezones.find(tz => tz.toLowerCase() === query.toLowerCase())
                  if (match) {
                    handleSelect('timezone')(match)
                    setOpenDropdown(null)
                    setTimezoneSearch('')
                  }
                }
              }}
              onBlur={() => {
                const query = String(timezoneSearch || '').trim()
                if (!query) {
                  updateSettings({ timezone: null, use_device_timezone: true })
                }
                setOpenDropdown(null)
                setTimezoneSearch('')
              }}
              placeholder="Search time zones"
              className="w-56 px-3 py-1.5 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-gray-300"
              style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}
            />
            {openDropdown === 'timezone' && (
              <div
                className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto z-50"
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  const q = String(timezoneSearch || '').toLowerCase().trim()
                  const filtered = timezoneOptions.filter(opt => {
                    if (!q) return true
                    return opt.value.toLowerCase().includes(q) || opt.label.toLowerCase().includes(q)
                  })

                  const list = !q
                    ? filtered.filter(opt => {
                        const tz = opt.value
                        return (
                          tz.startsWith('America/') ||
                          tz.startsWith('Europe/') ||
                          tz.startsWith('Asia/') ||
                          tz.startsWith('Africa/') ||
                          tz.startsWith('Australia/') ||
                          tz.startsWith('Pacific/')
                        )
                      })
                    : filtered

                  return list.slice(0, 50).map(opt => (
                    <button
                      key={opt.value}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSelect('timezone')(opt.value)
                        setOpenDropdown(null)
                        setTimezoneSearch('')
                      }}
                      className={`w-full px-3 py-1.5 text-left text-[13px] hover:bg-gray-50 transition-colors ${opt.value === settings.timezone ? 'text-gray-900 font-medium bg-gray-50' : 'text-gray-700'
                        }`}
                      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}
                    >
                      {opt.label}
                    </button>
                  ))
                })()}
                {timezoneOptions.filter(opt => {
                  const q = String(timezoneSearch || '').toLowerCase().trim()
                  if (!q) return true
                  return opt.value.toLowerCase().includes(q) || opt.label.toLowerCase().includes(q)
                }).length === 0 && (
                  <div className="px-3 py-2 text-[13px] text-gray-500">No matching timezones</div>
                )}
              </div>
            )}
          </div>
        </SettingRow>
      )}

      <SettingRow
        label="Start of week"
        description="Choose which day your week starts"
      >
        <CustomDropdown
          value={settings.week_start_day}
          onChange={(val) => handleSelect('week_start_day')(val)}
          options={weekStartOptions}
          dropdownKey="weekStart"
        />
      </SettingRow>

      <SettingRow
        label="Default view"
        description="The default calendar view when you open the app"
      >
        <CustomDropdown
          value={settings.default_view}
          onChange={handleSelect('default_view')}
          options={viewOptions}
          dropdownKey="defaultView"
        />
      </SettingRow>

    </div>
  )

  const renderAppearanceSettings = () => (
    <div className="space-y-0">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}>Appearance</h2>
        <p className="text-[13px] text-gray-500">Customize how your calendar looks.</p>
      </div>

      <SettingRow
        label="Show week numbers"
        description="Display week numbers in the calendar."
      >
        <ToggleSwitch
          checked={settings?.show_week_numbers === true}
          onChange={(checked) => updateSettings({ show_week_numbers: checked })}
        />
      </SettingRow>

      <SettingRow
        label="Hide weekends"
        description="Hide Saturday and Sunday in week view."
      >
        <ToggleSwitch
          checked={settings?.hide_weekends === true}
          onChange={(checked) => updateSettings({ hide_weekends: checked })}
        />
      </SettingRow>
    </div>
  )

  const renderCalendarSettings = () => {
    const calendarsByAccount = {}
    calendars.forEach(cal => {
      const accountEmail = cal.account_email || cal.external_account_id || 'Unknown Account'
      if (!calendarsByAccount[accountEmail]) {
        calendarsByAccount[accountEmail] = []
      }
      calendarsByAccount[accountEmail].push(cal)
    })

    const normalizedUrl = (newSubscriptionUrl || '').trim()

    const handleAddSubscription = async () => {
      const url = (newSubscriptionUrl || '').trim()
      const name = (newSubscriptionName || '').trim()
      if (!url) return
      try {
        await calendarApi.createSubscription({ url, name: name || null, color: null })
        setNewSubscriptionUrl('')
        setNewSubscriptionName('')
        await fetchCalendarSubscriptions()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('calendarUpdated'))
          window.dispatchEvent(new CustomEvent('eventsRefreshNeeded'))
        }
      } catch (e) {
        console.error('Failed to create subscription:', e)
      }
    }

    const handleDeleteSubscription = async (id) => {
      if (!id) return
      try {
        await calendarApi.deleteSubscription(id)
        await fetchCalendarSubscriptions()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('calendarUpdated'))
          window.dispatchEvent(new CustomEvent('eventsRefreshNeeded'))
        }
      } catch (e) {
        console.error('Failed to delete subscription:', e)
      }
    }

    return (
      <div className="space-y-0" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}>
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Calendars</h2>
          <p className="text-[13px] text-gray-500">Manage your calendar colors and visibility.</p>
        </div>

        <div className="py-4 border-t border-gray-100">
          <div className="text-[13px] font-medium text-gray-900 mb-2">Subscribe by URL</div>
          <div className="space-y-2">
            <input
              type="text"
              value={newSubscriptionName}
              onChange={(e) => setNewSubscriptionName(e.target.value)}
              placeholder="Name (optional)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-gray-300"
              style={{ fontFamily: '-apple-system, BlinkMacSystemFont, \"SF Pro Text\", sans-serif' }}
            />
            <input
              type="text"
              value={newSubscriptionUrl}
              onChange={(e) => setNewSubscriptionUrl(e.target.value)}
              placeholder="https://.../calendar.ics"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-1 focus:ring-gray-300"
              style={{ fontFamily: '-apple-system, BlinkMacSystemFont, \"SF Pro Text\", sans-serif' }}
            />
            <div className="flex items-center justify-between">
              <div className="text-[12px] text-gray-500 truncate" title={normalizedUrl}>
                {normalizedUrl ? normalizedUrl : ' '}
              </div>
              <button
                type="button"
                onClick={handleAddSubscription}
                disabled={!normalizedUrl || calendarSubscriptionsLoading}
                className="px-3 py-2 rounded-lg bg-gray-900 text-white text-[13px] font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>

            {calendarSubscriptionsLoading ? (
              <div className="text-[13px] text-gray-500">Loading…</div>
            ) : calendarSubscriptions.length === 0 ? (
              <div className="text-[13px] text-gray-500">No subscriptions yet</div>
            ) : (
              <div className="space-y-2 pt-2">
                {calendarSubscriptions.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-gray-900 truncate">
                        {(sub.name || '').trim() || 'Subscription'}
                      </div>
                      <div className="text-[12px] text-gray-500 truncate" title={sub.url}>
                        {sub.url}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteSubscription(sub.id)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] text-gray-700 hover:bg-gray-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {calendarsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-6 w-6 border-2 border-gray-300 border-t-gray-600 rounded-full"></div>
          </div>
        ) : calendars.length === 0 ? (
          <div className="text-[13px] text-gray-500 py-4">
            No calendars found. Connect a Google account to see your calendars.
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(calendarsByAccount).map(([accountEmail, accountCalendars]) => (
              <div key={accountEmail}>
                <div className="text-[12px] font-medium text-gray-500 mb-3 uppercase tracking-wide">
                  {accountEmail}
                </div>

                <div className="space-y-1">
                  {accountCalendars.map(calendar => (
                    <div
                      key={calendar.id}
                      className="flex items-center gap-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setColorPickerOpen(colorPickerOpen === calendar.id ? null : calendar.id)
                          }}
                          className="w-5 h-5 rounded-full border-2 border-gray-300 cursor-pointer hover:scale-110 transition-transform"
                          style={{ backgroundColor: getHex(calendar.backgroundColor) }}
                          title="Change color"
                        />

                        {colorPickerOpen === calendar.id && (
                          <div
                            className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-xl z-50 p-3"
                            style={{ width: 192 }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="grid grid-cols-4 gap-2">
                              {calendarColors.map(color => (
                                <button
                                  key={color.value}
                                  type="button"
                                  onClick={() => handleCalendarColorChange(calendar.id, color.value)}
                                  className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${(calendar.backgroundColor === color.value || (calendar.backgroundColor && calendar.backgroundColor.toLowerCase() === color.value.toLowerCase())) ? 'ring-2 ring-gray-400 ring-offset-2 ring-offset-white' : ''
                                    }`}
                                  style={{ backgroundColor: color.hex }}
                                  title={color.label}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-gray-900 truncate">
                          {calendar.summary || calendar.provider_calendar_id}
                        </div>
                      </div>

                      <ToggleSwitch
                        checked={calendar.selected !== false}
                        onChange={async (checked) => {
                          setCalendars(prev => prev.map(cal =>
                            cal.id === calendar.id ? { ...cal, selected: checked } : cal
                          ))
                          try {
                            await calendarApi.updateCalendar(calendar.id, { selected: checked })
                          } catch (error) {
                            console.error('Failed to update calendar visibility:', error)
                            fetchCalendars()
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderProfileSettings = () => {
    const accounts = connectedAccounts.map((email, idx) => ({
      email,
      name: email === user?.email ? user?.name : email.split('@')[0],
      isPrimary: idx === 0 || email.toLowerCase() === user?.email?.toLowerCase()
    }))

    return (
      <div className="space-y-0" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}>
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Profile</h2>
          <p className="text-[13px] text-gray-500">Manage your profile and connected accounts.</p>
        </div>

        <div className="flex items-center gap-4 py-4">
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt={profileName}
              className="h-12 w-12 rounded-full object-cover text-[10px]"
            />
          ) : (
            <div className="h-12 w-12 rounded-full bg-[#5A3A33] text-white flex items-center justify-center text-lg font-medium">
              {profileInitial}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-gray-900 truncate">{profileName}</div>
            <div className="text-[12px] text-gray-500 truncate">{profileEmail}</div>
          </div>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium border border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
          >
            Visit profile
          </button>
        </div>

        <div className="py-4 border-t border-gray-100 relative">
          <div className="text-[13px] font-medium text-gray-900 mb-1">Location</div>
          <div className="text-[12px] text-gray-500 mb-2">Set your current location for timezone.</div>
          <div className="relative">
            <input
              ref={locationInputRef}
              value={profileDraft.location}
              onChange={(e) => {
                handleProfileDraft({ location: e.target.value })
                getLocationPredictions(e.target.value)
              }}
              onFocus={() => profileDraft.location.length >= 2 && setShowLocationSuggestions(true)}
              placeholder="e.g., San Francisco"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-[13px] text-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-300"
            />
            {isLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full"></div>
              </div>
            )}
            {showLocationSuggestions && locationPredictions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                {locationPredictions.map((prediction) => (
                  <button
                    key={prediction.place_id}
                    onClick={() => {
                      selectLocationPlace(prediction)
                      const tz = prediction.feature?.properties?.timezone?.name
                      const shouldAutoApplyTimezone = settings?.use_device_timezone !== false && !settings?.timezone
                      if (shouldAutoApplyTimezone && tz && typeof tz === 'string') {
                        updateSettings({ timezone: tz, use_device_timezone: false })
                      }
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="text-[13px] text-gray-900">{prediction.main_text}</div>
                    <div className="text-[11px] text-gray-500">{prediction.secondary_text}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="pt-6 mt-4 border-t border-gray-200">
          <h3 className="text-[15px] font-semibold text-gray-900 mb-1">Connected Accounts</h3>
          <p className="text-[12px] text-gray-500 mb-4">Manage your connected Google accounts.</p>

          <div className="space-y-3">
            {accounts.map((account, idx) => {
              const initial = (account.name || account.email || 'U').charAt(0).toUpperCase()
              const isCreatePrimary = String(settings?.default_calendar_account_email || '').toLowerCase() === String(account.email || '').toLowerCase()
              return (
                <div key={idx} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl bg-white">
                  <div className="h-10 w-10 rounded-full bg-[#4A6741] text-white flex items-center justify-center text-sm font-medium">
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-gray-900 truncate">{account.name || account.email}</div>
                    <div className="text-[12px] text-gray-500 truncate">{account.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      updateSettings({
                        default_calendar_account_email: account.email,
                        default_calendar_id: 'primary'
                      })
                    }}
                    className={`flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-lg border transition-colors ${isCreatePrimary ? 'text-blue-600 border-blue-200 bg-blue-50' : 'text-gray-600 border-gray-200 bg-white hover:bg-gray-50'}`}
                  >
                    {isCreatePrimary && <CheckIcon />}
                    {isCreatePrimary ? 'Primary' : 'Make primary'}
                  </button>
                </div>
              )
            })}
          </div>

          <button
            onClick={() => addGoogleAccount && addGoogleAccount()}
            className="w-full flex items-center justify-center gap-2 py-3 mt-4 border border-gray-200 rounded-xl text-[13px] text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            <PlusIcon />
            Add Google account
          </button>
        </div>
      </div>
    )
  }

  const renderContent = () => {
    switch (activeSection) {
      case 'profile':
        return renderProfileSettings()
      case 'general':
        return renderGeneralSettings()
      case 'calendars':
        return renderCalendarSettings()
      case 'events':
        return renderEventSettings()
      case 'appearance':
        return renderAppearanceSettings()
      default:
        return (
          <div className="space-y-0" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1 capitalize">{activeSection.replace(/([A-Z])/g, ' $1').trim()}</h2>
              <p className="text-[13px] text-gray-500">Coming soon.</p>
            </div>
          </div>
        )
    }
  }

  if (loading && !settings) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-gray-500 text-[13px]" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}>Loading settings...</div>
      </div>
    )
  }

  const renderNavButton = (section, isActive) => {
    const { Icon } = section
    return (
      <button
        key={section.id}
        onClick={() => setActiveSection(section.id)}
        className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${isActive ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}
      >
        <Icon />
        <span>{section.label}</span>
      </button>
    )
  }

  const renderNavSection = (title, sections) => (
    <div className="mb-5">
      {title && (
        <div className="px-3 mb-1.5 text-[11px] font-medium text-gray-400 tracking-wide uppercase" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}>
          {title}
        </div>
      )}
      <nav className="space-y-0.5">
        {sections.map((section) => renderNavButton(section, activeSection === section.id))}
      </nav>
    </div>
  )

  const allSections = [...userSettingsSections, ...appSettingsSections, ...billingSettingsSections]
  const currentIndex = allSections.findIndex(s => s.id === activeSection)
  const prevSection = currentIndex > 0 ? allSections[currentIndex - 1] : null
  const nextSection = currentIndex < allSections.length - 1 ? allSections[currentIndex + 1] : null

  return (
    <div className="h-full flex justify-center bg-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}>
      <div className="flex w-full max-w-5xl h-full overflow-hidden my-4">
        <div className="w-60 bg-white flex flex-col border-r border-gray-100">
          <div className="flex-1 overflow-y-auto py-6 px-3">
            {renderNavSection('User Settings', userSettingsSections)}
            {renderNavSection('App Settings', appSettingsSections)}
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-white">
          <div className="flex justify-end p-4">
            <button
              onClick={onClose}
              className="flex flex-col items-center text-gray-300 hover:text-gray-500 transition-colors"
            >
              <XIcon />
              <span className="text-[10px] mt-0.5 uppercase tracking-wide">esc</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-12 pb-8">
            <div className="max-w-xl mx-auto">
              {renderContent()}
            </div>
          </div>

          <div className="border-t border-gray-100 px-12 py-4 flex items-center justify-end">
            {nextSection && (
              <button
                onClick={() => setActiveSection(nextSection.id)}
                className="flex items-center gap-3 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <div className="text-right">
                  <div className="text-[13px] font-medium text-gray-700">{nextSection.label}</div>
                  <div className="text-[11px] text-gray-400">Next</div>
                </div>
                <ArrowRightIcon />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
