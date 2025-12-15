import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'

export const COLOR_OPTIONS = [
  { id: 'blue', name: 'Blue', value: 'blue' },
  { id: 'green', name: 'Green', value: 'green' },
  { id: 'orange', name: 'Orange', value: 'orange' },
  { id: 'purple', name: 'Purple', value: 'purple' },
  { id: 'red', name: 'Red', value: 'red' },
  { id: 'pink', name: 'Pink', value: 'pink' },
  { id: 'teal', name: 'Teal', value: 'teal' },
  { id: 'cyan', name: 'Cyan', value: 'cyan' },
  { id: 'amber', name: 'Amber', value: 'amber' },
  { id: 'lime', name: 'Lime', value: 'lime' },
  { id: 'indigo', name: 'Indigo', value: 'indigo' },
  { id: 'yellow', name: 'Yellow', value: 'yellow' }
]

export const CATEGORY_COLORS = [
  { name: 'blue', hex: '#C5E0F9' },
  { name: 'violet', hex: '#D3D3FF' },
  { name: 'red', hex: '#f67f9cff' },
  { name: 'yellow', hex: '#FFFFC5' },
  { name: 'green', hex: '#D4F4DD' },
  { name: 'teal', hex: '#B8E6E6' },
  { name: 'orange', hex: '#FFDAB3' },
  { name: 'brown', hex: '#E8D6C0' }
]

export const ORDINAL_DISPLAY = { 1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth', '-1': 'Last' }
export const FREQUENCY_UNITS = { DAILY: 'day(s)', WEEKLY: 'week(s)', MONTHLY: 'month(s)', YEARLY: 'year(s)' }
export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHLY_DAYS = Array.from({ length: 31 }, (_, idx) => idx + 1)
export const ORDINAL_SELECT_OPTIONS = [
  { value: 1, label: 'first' },
  { value: 2, label: 'second' },
  { value: 3, label: 'third' },
  { value: 4, label: 'fourth' },
  { value: -1, label: 'last' }
]

export const RSVP_OPTIONS = [
  { label: 'Maybe', value: 'tentative' },
  { label: 'Decline', value: 'declined' },
  { label: 'Accept', value: 'accepted' }
]

export const NOTIFICATION_OPTIONS = [
  { label: 'None', minutes: null },
  { label: 'At time of event', minutes: 0 },
  { label: '5 minutes before', minutes: 5 },
  { label: '10 minutes before', minutes: 10 },
  { label: '15 minutes before', minutes: 15 },
  { label: '30 minutes before', minutes: 30 },
  { label: '1 hour before', minutes: 60 },
  { label: '2 hours before', minutes: 120 },
  { label: '1 day before', minutes: 1440 },
  { label: '2 days before', minutes: 2880 }
]

export const DEFAULT_TIMED_START = '10:30'
export const DEFAULT_TIMED_END = '11:45'
export const DEFAULT_MODAL_DIMENSIONS = { width: 520, height: 'auto' }
export const MIN_MODAL_WIDTH = 320
export const MIN_MODAL_HEIGHT = 320
export const VIEWPORT_MARGIN = 16
export const MODAL_SIDE_OFFSET = 12
export const DESCRIPTION_LINE_HEIGHT = 24
export const MAX_DESCRIPTION_PREVIEW_HEIGHT = 52

export const getInitials = (email) => {
  const name = email.split('@')[0]
  return name.charAt(0).toUpperCase()
}

export const getHandle = (email) => {
  const local = (email || '').split('@')[0] || ''
  if (!local) return ''
  return `@${local.charAt(0).toUpperCase()}${local.slice(1)}`
}

export const getParticipantColor = (email) => {
  const colors = ['#1761C7', '#FF3B30', '#34C759', '#FF9500', '#AF52DE', '#FFD60A', '#00C7BE', '#FF2D55']
  const index = email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
  return colors[index]
}

export const getEventNotificationOverrides = (event) => {
  if (!event?.reminders?.overrides || !Array.isArray(event.reminders.overrides)) return []
  return event.reminders.overrides
    .map((override) => {
      const minutes = Number(override?.minutes)
      if (!Number.isFinite(minutes)) return null
      return { method: override?.method || 'popup', minutes }
    })
    .filter(Boolean)
}

export const clearCalendarSnapshots = () => {
  if (typeof window === 'undefined' || !window.sessionStorage) return
  try {
    const keys = Object.keys(window.sessionStorage)
    keys.forEach((key) => {
      if (key.startsWith('chronos:snap:')) window.sessionStorage.removeItem(key)
    })
  } catch (_) { }
}

export const deriveVisibleRange = (date, activeView) => {
  if (!(date instanceof Date)) return null
  if (activeView === 'day') return { start: startOfDay(date), end: endOfDay(date) }
  if (activeView === 'week') return { start: startOfWeek(date), end: endOfWeek(date) }
  return { start: startOfWeek(startOfMonth(date)), end: endOfWeek(endOfMonth(date)) }
}

export const timeToMinutes = (time24h) => {
  if (!time24h || typeof time24h !== 'string' || !time24h.includes(':')) return 0
  const [hours, minutes] = time24h.split(':').map(Number)
  return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes)
}

export const minutesToTime = (totalMinutes) => {
  const minutesInDay = 24 * 60
  let safe = totalMinutes % minutesInDay
  if (safe < 0) safe += minutesInDay
  const hours = Math.floor(safe / 60)
  const minutes = safe % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export const formatTimeForDisplay = (time24h) => {
  if (!time24h || typeof time24h !== 'string' || !time24h.includes(':')) return 'Invalid Time'
  const [hours, minutes] = time24h.split(':')
  const hour = parseInt(hours, 10)
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minutes} ${period}`
}

export const toggleTimePeriod = (time24h) => {
  if (!time24h || typeof time24h !== 'string' || !time24h.includes(':')) return time24h
  const [hours, minutes] = time24h.split(':')
  const hour = parseInt(hours, 10)
  const newHour = hour >= 12 ? hour - 12 : hour + 12
  return `${String(newHour).padStart(2, '0')}:${minutes}`
}

export const getTimeParts = (time24h) => {
  if (!time24h || typeof time24h !== 'string' || !time24h.includes(':')) return { hour: '12', minute: '00', period: 'AM' }
  const [hours, minutes] = time24h.split(':')
  const hour = parseInt(hours, 10)
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return { hour: String(hour12), minute: minutes, period }
}

export const formatInviteStatus = (status) => {
  switch (status) {
    case 'accepted': return 'Accepted'
    case 'declined': return 'Declined'
    case 'tentative': return 'Maybe'
    default: return 'no response'
  }
}

export const formatNotificationLabel = (minutes) => {
  const option = NOTIFICATION_OPTIONS.find(o => o.minutes === minutes)
  return option ? option.label : `${minutes} minutes before`
}

export const getColorHex = (colorValue) => {
  if (!colorValue) return '#1761C7'
  if (colorValue.startsWith('#')) return colorValue
  const colorMap = {
    blue: '#1761C7', green: '#34C759', orange: '#FF9500', purple: '#AF52DE',
    red: '#FF3B30', pink: '#FF2D55', teal: '#00C7BE', cyan: '#06b6d4',
    amber: '#f59e0b', lime: '#84cc16', indigo: '#6366f1', yellow: '#FFD60A'
  }
  return colorMap[colorValue] || '#1761C7'
}

export const generateConferenceRequestId = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
