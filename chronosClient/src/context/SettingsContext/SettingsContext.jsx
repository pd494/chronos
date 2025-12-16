import { createContext, useContext, useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { settingsApi } from '../../lib/api'
import { useAuth } from '../AuthContext'
import { toast } from 'sonner'

const SettingsContext = createContext()

const SETTINGS_STORAGE_KEY = 'chronos:user-settings'
const UPDATE_DEBOUNCE_MS = 500

const DEFAULT_SETTINGS = {
  timezone: typeof Intl !== 'undefined' && Intl?.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : null,
  use_device_timezone: false,
  week_start_day: 0,
  default_view: 'month',
  show_week_numbers: false,
  week_numbering: 'locale',
  hide_weekends: false,
  use_24_hour_time: false,
  working_days: [1, 2, 3, 4, 5],
  working_hours_start_time: '09:00',
  working_hours_end_time: '17:00',
  time_grid_start_hour: 0,
  time_grid_end_hour: 23,
  default_calendar_id: 'primary',
  default_calendar_account_email: null,
  default_new_event_is_all_day: true,
  default_event_start_time: '09:00',
  default_event_duration: 60,
  default_event_color: 'blue',
  default_event_title: '',
  default_event_is_private: false,
  default_event_show_as_busy: true,
  default_event_location: null,
  default_add_google_meet: false,
  default_alert_minutes: 10,
  default_alert_minutes_list: [10],
  hide_past_deleted_declined_events: true,
  show_completed_tasks: true
}

const getStoredSettings = () => {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
    return stored ? JSON.parse(stored) : null
  } catch (_) {
    return null
  }
}

const persistSettings = (settings) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch (_) {
  }
}

const clearStoredSettings = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY)
  } catch (_) {
  }
}

export const useSettings = () => {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return context
}

export const SettingsProvider = ({ children }) => {
  const { user } = useAuth()
  const initialSettings = useMemo(() => getStoredSettings() || DEFAULT_SETTINGS, [])
  const [settings, setSettingsState] = useState(initialSettings)
  const settingsRef = useRef(initialSettings)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const debounceTimerRef = useRef(null)
  const isUpdatingRef = useRef(false)
  const loadRequestIdRef = useRef(0)
  const dirtyKeysRef = useRef(new Set())

  const showSavedToast = useCallback(() => {
    toast(
      <span className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-900 text-white">
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 7.5L5.2 9.7L11 3.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="text-gray-900">Saved</span>
      </span>,
      {
      id: 'settings-saved',
      duration: 1000,
      className: 'bg-white text-gray-900 border border-gray-200 shadow-lg',
    }
    )
  }, [])

  const updateSettings = useCallback(async (updates, options = {}) => {
    if (!user) return
    const suppressToast = options?.suppressToast === true

    if (!suppressToast) {
      showSavedToast()
    }

    try {
      if (updates && typeof updates === 'object') {
        Object.keys(updates).forEach((k) => dirtyKeysRef.current.add(k))
      }
    } catch (_) {
    }

    setSettingsState(prev => {
      const next = { ...prev, ...updates }
      settingsRef.current = next
      persistSettings(next)
      return next
    })

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(async () => {
      if (isUpdatingRef.current) return
      isUpdatingRef.current = true
      try {
        const updated = await settingsApi.updateSettings(updates)
        setSettingsState(updated)
        settingsRef.current = updated
        persistSettings(updated)
        setError(null)
      } catch (err) {
        console.error('Failed to update settings:', err)
        setError(err.message || 'Failed to update settings')
        if (!suppressToast) {
          toast('Failed to save', {
            id: 'settings-saved',
            duration: 2500,
            className: 'bg-white text-gray-900 border border-gray-200 shadow-lg'
          })
        }
        const stored = getStoredSettings()
        if (stored) {
          setSettingsState(stored)
          settingsRef.current = stored
        }
      } finally {
        isUpdatingRef.current = false
      }
    }, UPDATE_DEBOUNCE_MS)
  }, [user])

  const loadSettings = useCallback(async () => {
    if (!user) {
      setSettingsState(DEFAULT_SETTINGS)
      settingsRef.current = DEFAULT_SETTINGS
      return
    }

    const requestId = ++loadRequestIdRef.current
    const dirtySnapshot = new Set(dirtyKeysRef.current)
    setLoading(true)
    setError(null)
    try {
      const fetched = await settingsApi.getSettings()
      if (requestId !== loadRequestIdRef.current) return

      const base = {
        ...DEFAULT_SETTINGS,
        ...settingsRef.current
      }

      const merged = { ...base }
      for (const [key, value] of Object.entries(fetched || {})) {
        if (!dirtySnapshot.has(key)) {
          merged[key] = value
        }
      }

      const normalized = {
        ...merged,
        use_24_hour_time: false,
        time_grid_start_hour: 0,
        time_grid_end_hour: 23
      }
      setSettingsState(normalized)
      settingsRef.current = normalized
      persistSettings(normalized)

      dirtySnapshot.forEach((k) => dirtyKeysRef.current.delete(k))
    } catch (err) {
      console.error('Failed to load settings:', err)
      setError(err.message || 'Failed to load settings')
      const stored = getStoredSettings()
      if (stored) {
        setSettingsState(stored)
        settingsRef.current = stored
      }
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user) {
      const stored = getStoredSettings()
      if (stored) {
        setSettingsState(stored)
      }
      loadSettings()
    } else {
      setSettingsState(DEFAULT_SETTINGS)
      clearStoredSettings()
    }
  }, [user, loadSettings])

  const value = useMemo(() => ({
    settings,
    loading,
    error,
    updateSettings,
    loadSettings
  }), [settings, loading, error, updateSettings, loadSettings])

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}
