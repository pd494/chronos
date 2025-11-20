import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth
} from 'date-fns'
import {
  FiX,
  FiUsers,
  FiMapPin,
  FiClock,
  FiCalendar,
  FiChevronDown,
  FiChevronRight,
  FiPlus,
  FiCheck,
  FiRepeat,
  FiXCircle,
  FiLoader,
  FiVideo,
  FiLock,
  FiUnlock
} from 'react-icons/fi'
import { useCalendar } from '../../context/CalendarContext'
import { useAuth } from '../../context/AuthContext'
import { usePlacesAutocomplete } from '../../hooks/usePlacesAutocomplete'
import { calendarApi } from '../../lib/api'
import {
  buildRecurrencePayload,
  cloneRecurrenceState,
  createDefaultRecurrenceState,
  describeRecurrence,
  formatRecurrenceSummary,
  WEEKDAY_CODES,
  WEEKDAY_MINI,
  WEEKDAY_LABELS,
  RECURRENCE_FREQUENCIES
} from '../../lib/recurrence'

// Define color options directly
const COLOR_OPTIONS = [
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
];

// Category color options (same as category picker)
const CATEGORY_COLORS = [
  '#1761C7',  // Blue - matches EVENT_COLORS.blue.text (5% darker)
  '#FF3B30',
  '#34C759',
  '#FF9500',
  '#AF52DE',
  '#FFD60A',
  '#00C7BE',
  '#FF2D55'
];

const ORDINAL_DISPLAY = {
  1: 'First',
  2: 'Second',
  3: 'Third',
  4: 'Fourth',
  '-1': 'Last'
}

const FREQUENCY_UNITS = {
  DAILY: 'day(s)',
  WEEKLY: 'week(s)',
  MONTHLY: 'month(s)',
  YEARLY: 'year(s)'
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHLY_DAYS = Array.from({ length: 31 }, (_, idx) => idx + 1)
const ORDINAL_SELECT_OPTIONS = [
  { value: 1, label: 'first' },
  { value: 2, label: 'second' },
  { value: 3, label: 'third' },
  { value: 4, label: 'fourth' },
  { value: -1, label: 'last' }
]

const RSVP_OPTIONS = [
  { label: 'Maybe', value: 'tentative' },
  { label: 'Decline', value: 'declined' },
  { label: 'Accept', value: 'accepted' }
]

const DEFAULT_TIMED_START = '10:30'
const DEFAULT_TIMED_END = '11:45'

// Helper to get initials from email
const getInitials = (email) => {
  const name = email.split('@')[0];
  return name.charAt(0).toUpperCase();
};

// Helper to get display name like @Name from email
const getHandle = (email) => {
  const local = (email || '').split('@')[0] || ''
  if (!local) return ''
  return `@${local.charAt(0).toUpperCase()}${local.slice(1)}`
}

// Helper to get color for participant avatar - using our color palette
const getParticipantColor = (email) => {
  const colors = [
    '#1761C7',  // blue - standardized
    '#FF3B30',  // red
    '#34C759',  // green
    '#FF9500',  // orange
    '#AF52DE',  // purple
    '#FFD60A',  // yellow
    '#00C7BE',  // teal
    '#FF2D55'   // pink
  ];
  const index = email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
};

const getEventNotificationOverrides = (event) => {
  if (!event?.reminders?.overrides || !Array.isArray(event.reminders.overrides)) {
    return []
  }
  return event.reminders.overrides
    .map((override) => {
      const minutes = Number(override?.minutes)
      if (!Number.isFinite(minutes)) {
        return null
      }
      return {
        method: override?.method || 'popup',
        minutes
      }
    })
    .filter(Boolean)
}

const clearCalendarSnapshots = () => {
  if (typeof window === 'undefined' || !window.sessionStorage) return
  try {
    const keys = Object.keys(window.sessionStorage)
    keys.forEach((key) => {
      if (key.startsWith('chronos:snap:')) {
        window.sessionStorage.removeItem(key)
      }
    })
  } catch (_) {
    // Ignore storage errors
  }
}

const deriveVisibleRange = (date, activeView) => {
  if (!(date instanceof Date)) return null
  if (activeView === 'day') {
    return {
      start: startOfDay(date),
      end: endOfDay(date)
    }
  }
  if (activeView === 'week') {
    return {
      start: startOfWeek(date),
      end: endOfWeek(date)
    }
  }
  return {
    start: startOfWeek(startOfMonth(date)),
    end: endOfWeek(endOfMonth(date))
  }
}

const DEFAULT_MODAL_DIMENSIONS = { width: 520, height: 'auto' }
const MIN_MODAL_WIDTH = 320
const MIN_MODAL_HEIGHT = 320
const VIEWPORT_MARGIN = 16
const MODAL_SIDE_OFFSET = 12
const DESCRIPTION_LINE_HEIGHT = 24
// 4px top padding + 2 lines (48px) = 52px
const MAX_DESCRIPTION_PREVIEW_HEIGHT = 52

// Get modal position based on view type and clicked element
const getModalPosition = (view, dimensions = DEFAULT_MODAL_DIMENSIONS) => {
  if (typeof window === 'undefined') {
    const fallbackWidth = dimensions?.width || DEFAULT_MODAL_DIMENSIONS.width
    const fallbackHeight = dimensions?.height || DEFAULT_MODAL_DIMENSIONS.height
    return {
      top: 0,
      left: 0,
      pointerSide: null,
      pointerOffset: (fallbackHeight || 0) / 2,
      width: fallbackWidth || DEFAULT_MODAL_DIMENSIONS.width,
      maxHeight: fallbackHeight || DEFAULT_MODAL_DIMENSIONS.height
    }
  }

  const viewportHeight = Math.max(window.innerHeight || document.documentElement?.clientHeight || 0, 0)
  const viewportWidth = Math.max(window.innerWidth || document.documentElement?.clientWidth || 0, 0)
  const scrollTop = window.pageYOffset || document.documentElement?.scrollTop || 0
  const scrollLeft = window.pageXOffset || document.documentElement?.scrollLeft || 0

  const clamp = (value, min, max) => {
    if (!Number.isFinite(value)) return min
    if (max < min) return min
    return Math.min(Math.max(value, min), max)
  }

  const normalizeWidth = (rawWidth) => {
    const availableWidth = Math.max(0, viewportWidth - VIEWPORT_MARGIN * 2)
    if (availableWidth === 0) {
      return rawWidth || DEFAULT_MODAL_DIMENSIONS.width
    }
    const desired = rawWidth || DEFAULT_MODAL_DIMENSIONS.width
    const minWidth = Math.min(MIN_MODAL_WIDTH, availableWidth)
    return Math.max(Math.min(desired, availableWidth), minWidth)
  }

  const normalizeHeight = (rawHeight) => {
    const availableHeight = Math.max(0, viewportHeight - VIEWPORT_MARGIN * 2)
    if (availableHeight === 0) {
      return availableHeight
    }
    // For auto height, return available height to let content fit
    if (rawHeight === 'auto') {
      return availableHeight
    }
    const desired = rawHeight || availableHeight
    const minHeight = Math.min(MIN_MODAL_HEIGHT, availableHeight || MIN_MODAL_HEIGHT)
    return Math.max(Math.min(desired, availableHeight), minHeight)
  }

  let modalWidth = normalizeWidth(dimensions?.width)
  let modalHeight = normalizeHeight(dimensions?.height)

  const resolveAnchorRect = () => {
    let anchor = null
    if (window.lastCalendarAnchorRect && Number.isFinite(window.lastCalendarAnchorRect.top)) {
      anchor = window.lastCalendarAnchorRect
    } else {
      const fallbackElement = window.lastClickedEvent || window.lastClickedCalendarDay
      if (fallbackElement) {
        const rect = fallbackElement.getBoundingClientRect()
        anchor = {
          top: rect.top + scrollTop,
          bottom: rect.bottom + scrollTop,
          left: rect.left + scrollLeft,
          right: rect.right + scrollLeft,
          width: rect.width,
          height: rect.height
        }
      }
    }

    if (!anchor) return null
    const height = anchor.height ?? Math.max((anchor.bottom ?? 0) - (anchor.top ?? 0), 1)
    const width = anchor.width ?? Math.max((anchor.right ?? 0) - (anchor.left ?? 0), 1)
    const top = (anchor.top ?? 0) - scrollTop
    const left = (anchor.left ?? 0) - scrollLeft
    return {
      top,
      bottom: top + height,
      left,
      right: left + width,
      width,
      height
    }
  }

  const anchorRect = resolveAnchorRect()

  const fallbackCentered = () => {
    const centeredTop = viewportHeight
      ? clamp((viewportHeight - modalHeight) / 2, VIEWPORT_MARGIN, viewportHeight - modalHeight - VIEWPORT_MARGIN)
      : VIEWPORT_MARGIN
    const centeredLeft = viewportWidth
      ? clamp((viewportWidth - modalWidth) / 2, VIEWPORT_MARGIN, viewportWidth - modalWidth - VIEWPORT_MARGIN)
      : VIEWPORT_MARGIN
    return {
      top: centeredTop,
      left: centeredLeft,
      pointerSide: null,
      pointerOffset: modalHeight / 2,
      width: modalWidth,
      maxHeight: modalHeight
    }
  }

  if (!anchorRect) {
    return fallbackCentered()
  }

  const availableRight = Math.max(0, viewportWidth - anchorRect.right - VIEWPORT_MARGIN - MODAL_SIDE_OFFSET)
  const availableLeft = Math.max(0, anchorRect.left - VIEWPORT_MARGIN - MODAL_SIDE_OFFSET)

  const pickSide = () => {
    const fitsRight = availableRight >= modalWidth
    const fitsLeft = availableLeft >= modalWidth
    if (fitsRight && !fitsLeft) return 'left'
    if (!fitsRight && fitsLeft) return 'right'
    if (availableRight <= 0 && availableLeft <= 0) return null
    return availableRight >= availableLeft ? 'left' : 'right'
  }

  let pointerSide = pickSide()
  let availableSpace = pointerSide === 'left' ? availableRight : availableLeft

  if ((!availableSpace || availableSpace <= 0) && pointerSide === 'left' && availableLeft > 0) {
    pointerSide = 'right'
    availableSpace = availableLeft
  } else if ((!availableSpace || availableSpace <= 0) && pointerSide === 'right' && availableRight > 0) {
    pointerSide = 'left'
    availableSpace = availableRight
  }

  if (!pointerSide || !availableSpace || availableSpace <= 0) {
    return fallbackCentered()
  }

  const maxWidthForSide = Math.max(0, availableSpace)
  const minWidthForSide = Math.min(MIN_MODAL_WIDTH, maxWidthForSide || MIN_MODAL_WIDTH)
  modalWidth = Math.max(Math.min(modalWidth, maxWidthForSide), minWidthForSide || modalWidth)

  let left = pointerSide === 'left'
    ? anchorRect.right + MODAL_SIDE_OFFSET
    : anchorRect.left - modalWidth - MODAL_SIDE_OFFSET
  left = clamp(left, VIEWPORT_MARGIN, viewportWidth - modalWidth - VIEWPORT_MARGIN)

  let top = anchorRect.top + anchorRect.height / 2 - modalHeight / 2
  top = clamp(top, VIEWPORT_MARGIN, viewportHeight - modalHeight - VIEWPORT_MARGIN)

  const pointerOffset = clamp(anchorRect.top + anchorRect.height / 2 - top - 8, 16, modalHeight - 40)

  return {
    top,
    left,
    pointerSide,
    pointerOffset,
    width: modalWidth,
    maxHeight: modalHeight
  }
}

const EventModal = () => {
  const { 
    selectedEvent, 
    closeEventModal: contextCloseEventModal,
    createEvent,
    updateEvent,
    respondToInvite,
    deleteEvent,
    view,
    currentDate,
    fetchEventsForRange,
    refreshEvents
  } = useCalendar()
  const { user } = useAuth()
  
  const [eventName, setEventName] = useState('')
  const [eventSubtitle, setEventSubtitle] = useState('')
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [eventEndDate, setEventEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [timeStart, setTimeStart] = useState(DEFAULT_TIMED_START)
  const [timeEnd, setTimeEnd] = useState(DEFAULT_TIMED_END)
  const [color, setColor] = useState('#1761C7')
  const [isAllDay, setIsAllDay] = useState(true)
  const [location, setLocation] = useState('')
  const [conferenceRequestId, setConferenceRequestId] = useState(null)
  const [tempEventId, setTempEventId] = useState(null)
  const tempEventIdRef = useRef(null)
  useEffect(() => {
    tempEventIdRef.current = tempEventId
  }, [tempEventId])
  const [isGeneratingMeeting, setIsGeneratingMeeting] = useState(false)
  const cleanupTemporaryEvent = useCallback(async (eventId = tempEventIdRef.current) => {
    if (!eventId) return
    try {
      await calendarApi.deleteEvent(eventId, 'primary')
    } catch (err) {
      console.error('Failed to delete temporary event:', err)
    } finally {
      setTempEventId(current => (current === eventId ? null : current))
      if (tempEventIdRef.current === eventId) {
        tempEventIdRef.current = null
      }
    }
  }, [])
  const locationInputRef = useRef(null)
  const locationContainerRef = useRef(null)
  const descriptionInputRef = useRef(null)
  const handlePlaceSelection = useCallback((address) => {
    setLocation(address)
    setConferenceRequestId(null)
    if (!address.includes('meet.google.com')) {
      cleanupTemporaryEvent()
    }
  }, [cleanupTemporaryEvent])

  const {
    predictions,
    showSuggestions,
    isLoading,
    getPlacePredictions,
    selectPlace,
    setShowSuggestions,
  } = usePlacesAutocomplete(locationInputRef, handlePlaceSelection)
  const [internalVisible, setInternalVisible] = useState(true)
  const [participants, setParticipants] = useState([])
  const [expandedChips, setExpandedChips] = useState(new Set())
  const [timeError, setTimeError] = useState('')
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const [descriptionOverflowing, setDescriptionOverflowing] = useState(false)
  const [participantEmail, setParticipantEmail] = useState('')
  const [showNotifyMembers, setShowNotifyMembers] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [colorPickerDropdownCoords, setColorPickerDropdownCoords] = useState({ top: 0, left: 0, placement: 'bottom' })
  const [showRecurrencePicker, setShowRecurrencePicker] = useState(false)
  const [recurrenceViewMode, setRecurrenceViewMode] = useState('shortcuts')
  const [recurrenceState, setRecurrenceState] = useState(() => createDefaultRecurrenceState(new Date()))
  const [recurrenceDraft, setRecurrenceDraft] = useState(() => createDefaultRecurrenceState(new Date()))
  const [recurrenceSummary, setRecurrenceSummary] = useState('Does not repeat')
  const [recurrenceConfirmationVisible, setRecurrenceConfirmationVisible] = useState(false)
  const [recurrenceDropdownPlacement, setRecurrenceDropdownPlacement] = useState('bottom')
  const [recurrenceDropdownMaxHeight, setRecurrenceDropdownMaxHeight] = useState(360)
  const [recurrenceDropdownCoords, setRecurrenceDropdownCoords] = useState({ top: 0, left: 0, width: 280 })
  const [showRecurringDeletePrompt, setShowRecurringDeletePrompt] = useState(false)
  const [deletePromptCoords, setDeletePromptCoords] = useState({ top: 0, left: 0 })
  const [showRecurringEditPrompt, setShowRecurringEditPrompt] = useState(false)
  const [recurringEditScope, setRecurringEditScope] = useState('single')
  const [pendingEventData, setPendingEventData] = useState(null)
  const [inviteResponseLoading, setInviteResponseLoading] = useState(false)
  const [inviteResponseError, setInviteResponseError] = useState('')
  const [optimisticRSVPStatus, setOptimisticRSVPStatus] = useState(null)
  
  // Normalize response status to prevent invalid values like "ip"
  const normalizeResponseStatus = useCallback((value) => {
    if (!value) return null
    const lower = String(value).toLowerCase()
    // Only allow valid statuses
    if (['accepted', 'declined', 'tentative', 'needsaction'].includes(lower)) {
      return lower === 'needsaction' ? 'needsAction' : lower
    }
    return null
  }, [])
  
  const rawStatus = selectedEvent ? (optimisticRSVPStatus ?? selectedEvent.viewerResponseStatus) : null
  const currentRSVPStatus = normalizeResponseStatus(rawStatus)
  const deletePromptRef = useRef(null)
  const [modalPosition, setModalPosition] = useState(() => getModalPosition(view, DEFAULT_MODAL_DIMENSIONS))
  const [isFromDayClick, setIsFromDayClick] = useState(false)
  const hasRenderedOnceRef = useRef(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showNotificationPicker, setShowNotificationPicker] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [showAsBusy, setShowAsBusy] = useState(true)
  const [isPrivateEvent, setIsPrivateEvent] = useState(false)
  const [notificationDropdownCoords, setNotificationDropdownCoords] = useState({ top: 0, left: 0, width: 200, placement: 'bottom' })
  const modalRef = useRef(null)
  const lastTimedRangeRef = useRef({ start: DEFAULT_TIMED_START, end: DEFAULT_TIMED_END })
  const colorPickerDropdownRef = useRef(null)
  const colorPickerTriggerRef = useRef(null)
  const recurrencePickerRef = useRef(null)
  const recurrenceTriggerRef = useRef(null)
  const deleteButtonRef = useRef(null)
  const recurringEditPromptRef = useRef(null)
  const participantInputRef = useRef(null)
  const notificationPickerRef = useRef(null)
  const notificationTriggerRef = useRef(null)
  const initialValuesRef = useRef({})
  const recurrenceConfirmationTimerRef = useRef(null)
  const measureModalSize = useCallback(() => {
    const node = modalRef.current
    if (!node) {
      return DEFAULT_MODAL_DIMENSIONS
    }
    const rect = node.getBoundingClientRect()
    return {
      width: rect.width || DEFAULT_MODAL_DIMENSIONS.width,
      height: rect.height || DEFAULT_MODAL_DIMENSIONS.height
    }
  }, [])
  const updateModalPosition = useCallback(() => {
    setModalPosition(getModalPosition(view, measureModalSize()))
  }, [measureModalSize, view])
  const updateColorPickerDropdownPosition = useCallback(() => {
    if (!colorPickerTriggerRef.current) return
    const rect = colorPickerTriggerRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0
    const scrollX = window.scrollX || document.documentElement?.scrollLeft || 0
    const scrollY = window.scrollY || document.documentElement?.scrollTop || 0
    const dropdownWidth = 192
    const dropdownHeight = 176
    let placement = 'bottom'
    let top = rect.bottom + scrollY + 8
    if (rect.bottom + dropdownHeight > viewportHeight && rect.top - dropdownHeight > VIEWPORT_MARGIN * 2) {
      placement = 'top'
      top = rect.top + scrollY - 8
    }
    let left = rect.left + scrollX
    if (left + dropdownWidth > viewportWidth - VIEWPORT_MARGIN) {
      left = Math.max(VIEWPORT_MARGIN, viewportWidth - dropdownWidth - VIEWPORT_MARGIN)
    }
    setColorPickerDropdownCoords({ top, left, placement })
  }, [])
  const trimmedLocation = location?.trim()
  const isLocationUrl = useMemo(() => {
    if (!trimmedLocation) return false
    try {
      const parsed = new URL(trimmedLocation)
      return ['http:', 'https:'].includes(parsed.protocol)
    } catch (error) {
      return false
    }
  }, [trimmedLocation])
  const googleMapsLink = useMemo(() => {
    if (!trimmedLocation || isLocationUrl) return ''
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmedLocation)}`
  }, [trimmedLocation, isLocationUrl])
  const generateConferenceRequestId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  }
  const handleGenerateMeetingLink = async () => {
    setIsGeneratingMeeting(true)
    setLocation('Generating Google Meet link…')
    setShowSuggestions(false)
    
    try {
      if (tempEventId) {
        await cleanupTemporaryEvent()
      }
      // Get start and end dates for the temporary event
      let startDate, endDate
      if (isAllDay) {
        const start = buildDateWithTime(eventDate, '00:00') || new Date()
        const end = buildDateWithTime(eventEndDate || eventDate, '00:00') || new Date()
        startDate = start
        endDate = new Date(end)
        endDate.setDate(endDate.getDate() + 1)
      } else {
        startDate = buildDateWithTime(eventDate, timeStart) || new Date()
        endDate = buildDateWithTime(eventEndDate || eventDate, timeEnd) || new Date(startDate.getTime() + 60 * 60 * 1000) // Default to 1 hour
      }

      // Create a temporary event with conference data
      const requestId = generateConferenceRequestId()
      const baseTitle =
        eventName?.trim() ||
        selectedEvent?.title ||
        'New Event'
      const tempEventData = {
        title: baseTitle,
        start: startDate,
        end: endDate,
        isAllDay,
        // Don't set location - let Google generate the hangoutLink from conferenceData
        conferenceData: {
          createRequest: {
            requestId: requestId,
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        }
      }
      
      console.log('Creating temp event with data:', tempEventData)

      const response = await calendarApi.createEvent(tempEventData, 'primary', false)
      
      // The backend returns {event: {...}}, so we need to access response.event
      const createdEvent = response.event || response
      
      console.log('Created event response:', createdEvent)
      console.log('hangoutLink:', createdEvent.hangoutLink)
      console.log('conferenceData:', createdEvent.conferenceData)
      
      // Extract the Google Meet link from the response
      let meetLink = ''
      
      // Check hangoutLink first (direct field)
      if (createdEvent.hangoutLink) {
        meetLink = createdEvent.hangoutLink
        console.log('Found meeting link in hangoutLink:', meetLink)
      } 
      // Check conferenceData.hangoutLink
      else if (createdEvent.conferenceData?.hangoutLink) {
        meetLink = createdEvent.conferenceData.hangoutLink
        console.log('Found meeting link in conferenceData.hangoutLink:', meetLink)
      }
      // Check conferenceData.entryPoints
      else if (createdEvent.conferenceData?.entryPoints) {
        const videoEntry = createdEvent.conferenceData.entryPoints.find(
          ep => ep.entryPointType === 'video' && ep.uri
        )
        if (videoEntry?.uri) {
          meetLink = videoEntry.uri
          console.log('Found meeting link in entryPoints:', meetLink)
        }
      }

      if (meetLink) {
        setLocation(meetLink)
        setTempEventId(createdEvent.id)
        setConferenceRequestId(null) // Clear this since we already have the link
      } else {
        console.error('No meeting link found in response')
        console.error('Full response:', JSON.stringify(createdEvent, null, 2))
        setLocation('Failed to generate meeting link')
      }
    } catch (error) {
      console.error('Error generating meeting link:', error)
      console.error('Error details:', error.response || error.message || error)
      setLocation('Failed to generate meeting link. Please try again.')
    } finally {
      setIsGeneratingMeeting(false)
    }
  }

  const timeToMinutes = (time24h) => {
    if (!time24h || typeof time24h !== 'string' || !time24h.includes(':')) return 0
    const [hours, minutes] = time24h.split(':').map(Number)
    return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes)
  }

  const minutesToTime = (totalMinutes) => {
    const minutesInDay = 24 * 60
    let safe = totalMinutes % minutesInDay
    if (safe < 0) safe += minutesInDay
    const hours = Math.floor(safe / 60)
    const minutes = safe % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  const buildDateWithTime = useCallback((dateStr, timeStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null
    const [year, month, day] = dateStr.split('-').map(Number)
    if ([year, month, day].some(num => Number.isNaN(num))) return null
    const base = new Date(year, month - 1, day, 0, 0, 0, 0)
    if (Number.isNaN(base.getTime())) return null
    if (timeStr && typeof timeStr === 'string' && timeStr.includes(':')) {
      const [hour, minute] = timeStr.split(':').map(Number)
      if (!Number.isNaN(hour) && !Number.isNaN(minute)) {
        base.setHours(hour, minute, 0, 0)
      }
    }
    return base
  }, [])


  const formatInviteStatus = (status) => {
    switch (status) {
      case 'accepted':
        return 'Accepted'
      case 'declined':
        return 'Declined'
      case 'tentative':
        return 'Maybe'
      default:
        return 'no response'
    }
  }

  const computeRecurrenceDropdownPlacement = useCallback(() => {
    if (typeof window === 'undefined') return
    const triggerEl = recurrenceTriggerRef.current
    if (!triggerEl) {
      setRecurrenceDropdownPlacement('bottom')
      setRecurrenceDropdownMaxHeight(360)
      return
    }
    const rect = triggerEl.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const margin = 16
    const spaceAbove = rect.top - margin
    const spaceBelow = viewportHeight - rect.bottom - margin
    const preferredHeight = 360
    const maxDropdownWidth = Math.min(300, Math.max(220, viewportWidth - margin * 2))
    const centeredLeft = rect.left + rect.width / 2 - maxDropdownWidth / 2
    const constrainedLeft = Math.min(
      Math.max(margin, centeredLeft),
      viewportWidth - margin - maxDropdownWidth
    )

    if (spaceBelow >= preferredHeight || spaceBelow >= spaceAbove) {
      setRecurrenceDropdownPlacement('bottom')
      setRecurrenceDropdownMaxHeight(Math.min(400, Math.max(240, spaceBelow)))
      setRecurrenceDropdownCoords({ top: rect.bottom + 6, left: constrainedLeft, width: maxDropdownWidth })
    } else {
      setRecurrenceDropdownPlacement('top')
      setRecurrenceDropdownMaxHeight(Math.min(400, Math.max(240, spaceAbove)))
      setRecurrenceDropdownCoords({ top: rect.top - 6, left: constrainedLeft, width: maxDropdownWidth })
    }
  }, [])

  useLayoutEffect(() => {
    // Skip position updates on very first render to prevent animation
    if (!hasRenderedOnceRef.current) {
      hasRenderedOnceRef.current = true
      return
    }
    updateModalPosition()
  }, [updateModalPosition])
  
  useEffect(() => {
    // Reset flag when switching events
    hasRenderedOnceRef.current = false
    updateModalPosition()
    
    // Prevent horizontal scrolling
    document.body.style.overflowX = 'hidden'
    
    return () => {
      document.body.style.overflowX = ''
    }
  }, [view, selectedEvent, updateModalPosition])
  
  useEffect(() => {
    if (!internalVisible) return
    updateModalPosition()
  }, [internalVisible, updateModalPosition])
  
  // Update position when window resizes
  useEffect(() => {
    const handleResize = () => {
      updateModalPosition()
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [updateModalPosition])
  
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined
    const node = modalRef.current
    if (!node) return undefined
    
    // Delay observer to skip initial render animation
    const setupTimer = setTimeout(() => {
      if (!hasRenderedOnceRef.current) return
      
      const observer = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          updateModalPosition()
        })
      })
      observer.observe(node)
      node._resizeObserver = observer
    }, 200)
    
    return () => {
      clearTimeout(setupTimer)
      if (node._resizeObserver) {
        node._resizeObserver.disconnect()
        delete node._resizeObserver
      }
    }
  }, [updateModalPosition])
  
  // Close/reposition color picker dropdown
  useEffect(() => {
    if (!showColorPicker) return
    updateColorPickerDropdownPosition()
    const handleClickOutside = (event) => {
      if (colorPickerTriggerRef.current?.contains(event.target)) return
      if (colorPickerDropdownRef.current?.contains(event.target)) return
      setShowColorPicker(false)
    }
    const handleReposition = () => updateColorPickerDropdownPosition()
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('resize', handleReposition)
    window.addEventListener('scroll', handleReposition, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('resize', handleReposition)
      window.removeEventListener('scroll', handleReposition, true)
    }
  }, [showColorPicker, updateColorPickerDropdownPosition])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (recurrencePickerRef.current && recurrencePickerRef.current.contains(event.target)) {
        return
      }
      setShowRecurrencePicker(false)
      setRecurrenceViewMode('shortcuts')
    }
    if (showRecurrencePicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showRecurrencePicker])

  useEffect(() => {
    if (!showRecurrencePicker) return
    computeRecurrenceDropdownPlacement()
    const handleResize = () => computeRecurrenceDropdownPlacement()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [showRecurrencePicker, computeRecurrenceDropdownPlacement])

  useEffect(() => {
    if (!showRecurrencePicker) {
      setRecurrenceViewMode('shortcuts')
    }
  }, [showRecurrencePicker])

  useEffect(() => {
    if (!showRecurringDeletePrompt) return
    const handleClick = (event) => {
      // If clicking the delete button that opened the prompt, ignore
      if (deleteButtonRef.current && deleteButtonRef.current.contains(event.target)) return
      // If clicking inside the prompt itself, ignore
      if (deletePromptRef.current && deletePromptRef.current.contains(event.target)) return
      // Otherwise, close the prompt
      setShowRecurringDeletePrompt(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showRecurringDeletePrompt])

  const updateNotificationDropdownPosition = useCallback(() => {
    if (!notificationTriggerRef.current) return
    const rect = notificationTriggerRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0
    const scrollX = window.scrollX || document.documentElement?.scrollLeft || 0
    const scrollY = window.scrollY || document.documentElement?.scrollTop || 0
    const width = Math.max(220, rect.width + 40)
    const dropdownHeight = 320
    let placement = 'bottom'
    let top = rect.bottom + scrollY + 8
    if (rect.bottom + dropdownHeight > viewportHeight && rect.top - dropdownHeight > VIEWPORT_MARGIN * 2) {
      placement = 'top'
      top = rect.top + scrollY - 8
    }
    let left = rect.left + scrollX
    if (left + width > viewportWidth - VIEWPORT_MARGIN) {
      left = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN)
    }
    setNotificationDropdownCoords({
      top,
      left,
      width,
      placement
    })
  }, [])

  useEffect(() => {
    if (!showNotificationPicker) return
    updateNotificationDropdownPosition()
    const handleClick = (event) => {
      if (notificationTriggerRef.current && notificationTriggerRef.current.contains(event.target)) return
      if (notificationPickerRef.current && notificationPickerRef.current.contains(event.target)) return
      setShowNotificationPicker(false)
    }
    const handleResize = () => updateNotificationDropdownPosition()
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleResize, true)
    document.addEventListener('mousedown', handleClick)
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleResize, true)
      document.removeEventListener('mousedown', handleClick)
    }
  }, [showNotificationPicker, updateNotificationDropdownPosition])

  useEffect(() => {
    return () => {
      if (recurrenceConfirmationTimerRef.current) {
        clearTimeout(recurrenceConfirmationTimerRef.current)
        recurrenceConfirmationTimerRef.current = null
      }
    }
  }, [])
  
  useEffect(() => {
    return () => {
      cleanupTemporaryEvent()
    }
  }, [cleanupTemporaryEvent])
  
  // Close modal when clicking outside (but not on events)
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if clicking on an event element (don't close if so)
      const clickedOnEvent = event.target.closest('[data-event-id]') || 
                            event.target.closest('.event-draggable') ||
                            event.target.closest('.event-indicator');
      
      // If clicking inside the delete prompt, don't close the modal
      if (deletePromptRef.current && deletePromptRef.current.contains(event.target)) {
        return
      }

      // If clicking inside the color picker dropdown, don't close the modal
      if (colorPickerDropdownRef.current && colorPickerDropdownRef.current.contains(event.target)) {
        return
      }

      // If clicking on the color picker trigger button, don't close the modal
      if (colorPickerTriggerRef.current && colorPickerTriggerRef.current.contains(event.target)) {
        return
      }

      const clickedInRecurrenceDropdown = recurrencePickerRef.current && recurrencePickerRef.current.contains(event.target)
      if (clickedInRecurrenceDropdown) {
        return
      }
      
      // If clicking inside the recurring edit prompt, don't close the modal
      if (recurringEditPromptRef.current && recurringEditPromptRef.current.contains(event.target)) {
        return
      }
      
      if (modalRef.current && !modalRef.current.contains(event.target) && !clickedOnEvent) {
        // Prevent the click from propagating to calendar elements
        event.stopPropagation();
        event.preventDefault();
        
        setInternalVisible(false);
        setTimeout(() => {
          window.prefilledEventDates = null;
          window.lastCalendarAnchorRect = null;
          window.lastClickedEvent = null;
          window.lastClickedCalendarDay = null;
          window.lastClickedEventId = null;
          setExpandedChips(new Set())
          setParticipantEmail('')
          setShowRecurrencePicker(false)
          contextCloseEventModal();
        }, 150);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside, true); // Use capture phase to intercept early
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [contextCloseEventModal]);

  const closeAndAnimateOut = useCallback(() => {
    setInternalVisible(false);
    setTimeout(() => {
      window.prefilledEventDates = null; // Clear prefilled dates on close
      window.lastCalendarAnchorRect = null;
      window.lastClickedEvent = null;
      window.lastClickedCalendarDay = null;
      window.lastClickedEventId = null;
      setExpandedChips(new Set())
      setParticipantEmail('')
      setShowRecurrencePicker(false)
      contextCloseEventModal();
    }, 150); // Faster close animation
  }, [contextCloseEventModal]);
  
  // Set up keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Close on Escape
      if (e.key === 'Escape') {
        closeAndAnimateOut();
        return; // Prevent further processing for Escape
      }

      // Don't block global shortcuts like W/D/M when modal is closing
      if (!internalVisible) return;
      
      // Stop propagation for all keyboard events when modal is visible
      // This prevents global shortcuts from firing
      e.stopPropagation();
      
      // These shortcuts should only apply if there's a selected event
      // for delete operations
      if (selectedEvent) {
        // Delete on Backspace or Delete
        if ((e.key === 'Backspace' || e.key === 'Delete') && (e.ctrlKey || e.metaKey)) {
          handleDelete(); // handleDelete itself will call closeAndAnimateOut
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedEvent, closeAndAnimateOut, deleteEvent, internalVisible]);
  
  useEffect(() => {
    let initialEventName = 'New Event';
    let initialEventDate = format(new Date(), 'yyyy-MM-dd');
    let initialEventEndDate = initialEventDate;
    let initialTimeStart = '00:00';
    let initialTimeEnd = '23:59';
    let timedFallbackStart = DEFAULT_TIMED_START;
    let timedFallbackEnd = DEFAULT_TIMED_END;
    let initialColor = 'blue';
    let initialIsAllDay = true;
    let initialLocation = '';
    let initialSubtitle = '';

    if (selectedEvent) {
      // Editing existing event
      const start = new Date(selectedEvent.start);
      const end = new Date(selectedEvent.end);
      
      initialEventName = selectedEvent.title || '';
      initialEventDate = format(start, 'yyyy-MM-dd');
      if (selectedEvent.isAllDay) {
        const inclusiveEnd = new Date(end)
        inclusiveEnd.setDate(inclusiveEnd.getDate() - 1)
        initialEventEndDate = format(inclusiveEnd, 'yyyy-MM-dd')
      } else {
        initialEventEndDate = format(end, 'yyyy-MM-dd')
      }
      initialTimeStart = format(start, 'HH:mm');
      initialTimeEnd = format(end, 'HH:mm');
      timedFallbackStart = initialTimeStart;
      timedFallbackEnd = initialTimeEnd;
      initialColor = selectedEvent.color || 'blue';
      initialIsAllDay = selectedEvent.isAllDay || false;
      initialLocation = selectedEvent.location || '';
      initialSubtitle = selectedEvent.description || '';
    } else if (window.prefilledEventDates) {
      // Creating new event from drag-to-create/double-click with prefilled dates
      const { 
        startDate: dragStartDate, 
        endDate: dragEndDate, 
        title: dragTitle, 
        color: dragColor,
        isAllDay: dragIsAllDay,
        fromDayClick
      } = window.prefilledEventDates;
      
      const startDateObj = dragStartDate instanceof Date ? dragStartDate : new Date(dragStartDate);
      const endDateObj = dragEndDate instanceof Date ? dragEndDate : new Date(dragEndDate);
      
      initialEventName = dragTitle || 'New Event';
      initialEventDate = format(startDateObj, 'yyyy-MM-dd');
      initialColor = dragColor || 'blue';
      const derivedAllDay = typeof dragIsAllDay === 'boolean' ? dragIsAllDay : true;
      initialIsAllDay = derivedAllDay;
      if (derivedAllDay) {
        const inclusiveEnd = new Date(endDateObj)
        inclusiveEnd.setDate(inclusiveEnd.getDate() - 1)
        initialEventEndDate = format(inclusiveEnd, 'yyyy-MM-dd')
        initialTimeStart = '00:00'
        initialTimeEnd = '23:59'
      } else {
        initialEventEndDate = format(endDateObj, 'yyyy-MM-dd')
        initialTimeStart = format(startDateObj, 'HH:mm');
        initialTimeEnd = format(endDateObj, 'HH:mm');
        timedFallbackStart = initialTimeStart;
        timedFallbackEnd = initialTimeEnd;
      }
      
      // Set flag for whether to show date picker
      setIsFromDayClick(!!fromDayClick);
    } else {
      // Brand new event from + button defaults to all-day on the current date
      initialIsAllDay = true;
    }
    
    const recurrenceAnchor = (() => {
      if (selectedEvent?.start) {
        const existing = new Date(selectedEvent.start)
        if (!Number.isNaN(existing.getTime())) {
          return existing
        }
      }
      return buildDateWithTime(initialEventDate, initialTimeStart) || new Date()
    })()
    const recurrenceDetails = selectedEvent
      ? describeRecurrence(
          selectedEvent.recurrenceRule,
          recurrenceAnchor,
          selectedEvent.recurrenceMeta
        )
      : {
          state: createDefaultRecurrenceState(recurrenceAnchor),
          summary: 'Does not repeat'
        }

    setEventName(initialEventName);
    setEventSubtitle(initialSubtitle);
    setEventDate(initialEventDate);
    setEventEndDate(initialEventEndDate);
    setColor(initialColor);
    setIsAllDay(initialIsAllDay);
    if (initialIsAllDay) {
      setTimeStart('00:00');
      setTimeEnd('23:59');
    } else {
      setTimeStart(initialTimeStart);
      setTimeEnd(initialTimeEnd);
    }
    lastTimedRangeRef.current = {
      start: timedFallbackStart,
      end: timedFallbackEnd
    }
    setLocation(initialLocation);
    setConferenceRequestId(null);
    // Clean up temporary event if modal is being reset
    cleanupTemporaryEvent()
    setIsGeneratingMeeting(false)
    setEventSubtitle(initialSubtitle);
    setRecurrenceState(cloneRecurrenceState(recurrenceDetails.state))
    setRecurrenceDraft(cloneRecurrenceState(recurrenceDetails.state))
    setRecurrenceSummary(recurrenceDetails.summary)
    const initialBusyState = selectedEvent ? selectedEvent.transparency !== 'transparent' : true
    const initialPrivacyState = selectedEvent ? selectedEvent.visibility === 'private' : false
    setShowAsBusy(initialBusyState)
    setIsPrivateEvent(initialPrivacyState)
    setShowRecurrencePicker(false)
    
    
    // Set notifications from event or default
    const initialNotifications = getEventNotificationOverrides(selectedEvent);
    setNotifications(initialNotifications);
    
    // Set initial participants - don't include current user if they are the organizer
    let initialParticipants = selectedEvent?.participants || [];
    
    // Remove current user from participants if they are the organizer
    if (selectedEvent?.organizerEmail === user?.email) {
      initialParticipants = initialParticipants.filter(p => p !== user.email);
    } else {
      // Add organizer to participants if they're not already included and not the current user
      if (selectedEvent?.organizerEmail && !initialParticipants.includes(selectedEvent.organizerEmail) && selectedEvent.organizerEmail !== user?.email) {
        initialParticipants = [selectedEvent.organizerEmail, ...initialParticipants];
      }
    }
    
    // Store initial values for change detection
    initialValuesRef.current = {
      eventName: initialEventName,
      eventDate: initialEventDate,
      eventEndDate: initialEventEndDate,
      timeStart: initialIsAllDay ? '00:00' : initialTimeStart,
      timeEnd: initialIsAllDay ? '23:59' : initialTimeEnd,
      color: initialColor,
      isAllDay: initialIsAllDay,
      location: initialLocation,
      eventSubtitle: initialSubtitle,
      participants: initialParticipants,
      recurrenceRule: selectedEvent?.recurrenceRule || '',
      notifications: initialNotifications,
      showAsBusy: initialBusyState,
      isPrivateEvent: initialPrivacyState
    };
    setHasChanges(false);
    setParticipants(initialParticipants);
    setExpandedChips(new Set())
    setParticipantEmail('')

  }, [selectedEvent, cleanupTemporaryEvent])

  useEffect(() => {
    setIsDescriptionExpanded(false)
  }, [selectedEvent?.id])

  useLayoutEffect(() => {
    const textarea = descriptionInputRef.current
    if (!textarea) return
    const previewHeight = MAX_DESCRIPTION_PREVIEW_HEIGHT
    textarea.style.height = 'auto'
    const fullHeight = textarea.scrollHeight
    const canExpand = fullHeight > previewHeight + 4
    setDescriptionOverflowing(canExpand)
    if (isDescriptionExpanded) {
      textarea.style.overflowY = 'auto'
      textarea.style.height = `${fullHeight}px`
    } else {
      textarea.style.overflowY = 'hidden'
      textarea.style.height = `${Math.min(fullHeight, previewHeight)}px`
    }
    if (!canExpand && isDescriptionExpanded) {
      setIsDescriptionExpanded(false)
    }
  }, [eventSubtitle, isDescriptionExpanded])

  useEffect(() => {
    if (!internalVisible) return
    updateModalPosition()
  }, [isDescriptionExpanded, internalVisible, updateModalPosition])

  useEffect(() => {
    setInviteResponseLoading(false)
    setInviteResponseError('')
    setOptimisticRSVPStatus(null)
  }, [selectedEvent?.id])

  useEffect(() => {
    if (!eventDate || !eventEndDate) return
    const start = new Date(eventDate)
    const end = new Date(eventEndDate)
    if (end < start) {
      setEventEndDate(eventDate)
    }
  }, [eventDate, eventEndDate])

  const conciseRecurrenceSummary = useCallback((state) => {
    if (!state?.enabled) return 'Does not repeat'
    switch (state.frequency) {
      case 'DAILY':
        return 'Daily'
      case 'WEEKLY':
        return 'Weekly'
      case 'MONTHLY':
        return 'Monthly'
      case 'YEARLY':
        return 'Yearly'
      default:
        return 'Custom'
    }
  }, [])

  useEffect(() => {
    setRecurrenceSummary(conciseRecurrenceSummary(recurrenceState))
  }, [recurrenceState, conciseRecurrenceSummary])

  const handleInviteResponse = useCallback(async (status) => {
    if (!selectedEvent || inviteResponseLoading) return
    const currentStatus = optimisticRSVPStatus ?? selectedEvent.viewerResponseStatus
    if (currentStatus === status) return
    
    setOptimisticRSVPStatus(status)
    setInviteResponseError('')
    setInviteResponseLoading(true)
    closeAndAnimateOut()
    
    try {
      await respondToInvite(selectedEvent.id, status)
    } catch (error) {
      setOptimisticRSVPStatus(null)
      setInviteResponseError('Could not update your RSVP. Please try again.')
    } finally {
      setInviteResponseLoading(false)
    }
  }, [selectedEvent, inviteResponseLoading, respondToInvite, closeAndAnimateOut, optimisticRSVPStatus])
  
  // Detect changes
  useEffect(() => {
    if (!selectedEvent) {
      setHasChanges(true); // New events always have changes
      return;
    }
    
    const initial = initialValuesRef.current;
    const participantsChanged = 
      JSON.stringify(participants.sort()) !== JSON.stringify((initial.participants || []).sort());
    
    const normalizeMinutes = (notification) => {
      if (!notification) return 0
      const parsed = Number(notification.minutes)
      return Number.isFinite(parsed) ? parsed : 0
    }
    const sortedNotifications = (list = []) =>
      [...list].sort((a, b) => normalizeMinutes(a) - normalizeMinutes(b))
    const notificationsChanged =
      JSON.stringify(sortedNotifications(notifications)) !==
      JSON.stringify(sortedNotifications(initial.notifications || []));
    
    const anchorDate = buildDateWithTime(eventDate, timeStart) || new Date()
    const recurrencePayload = buildRecurrencePayload(recurrenceState, anchorDate)
    const recurrenceRule = recurrencePayload?.rule || ''
    const initialRecurrenceRule = initial.recurrenceRule || ''

    const changed = 
      eventName !== initial.eventName ||
      eventSubtitle !== initial.eventSubtitle ||
      eventDate !== initial.eventDate ||
      eventEndDate !== initial.eventEndDate ||
      timeStart !== initial.timeStart ||
      timeEnd !== initial.timeEnd ||
      color !== initial.color ||
      isAllDay !== initial.isAllDay ||
      location !== initial.location ||
      participantsChanged ||
      notificationsChanged ||
      recurrenceRule !== initialRecurrenceRule ||
      showAsBusy !== initial.showAsBusy ||
      isPrivateEvent !== initial.isPrivateEvent;
    
    setHasChanges(changed);
    
    // Auto-enable notifications when meaningful fields change (not color)
    // This matches Google Calendar behavior
    if (selectedEvent && participants.length > 0) {
      const meaningfulChange = 
        eventName !== initial.eventName ||
        eventSubtitle !== initial.eventSubtitle ||
        eventDate !== initial.eventDate ||
        timeStart !== initial.timeStart ||
        timeEnd !== initial.timeEnd ||
        isAllDay !== initial.isAllDay ||
        location !== initial.location ||
        participantsChanged;
      
      if (meaningfulChange) {
        setShowNotifyMembers(true);
      }
    }
  }, [selectedEvent, eventName, eventSubtitle, eventDate, eventEndDate, timeStart, timeEnd, color, isAllDay, location, participants, notifications, recurrenceState, buildDateWithTime, showAsBusy, isPrivateEvent]);
  

  // kept for backward compat (no-op now that we use portal)

  const recurrenceAnchorDate = useCallback(() => {
    return buildDateWithTime(eventDate, timeStart) || new Date()
  }, [buildDateWithTime, eventDate, timeStart])

  const triggerRecurrenceConfirmation = useCallback(() => {
    if (recurrenceConfirmationTimerRef.current) {
      clearTimeout(recurrenceConfirmationTimerRef.current)
    }
    setRecurrenceConfirmationVisible(true)
    recurrenceConfirmationTimerRef.current = setTimeout(() => {
      setRecurrenceConfirmationVisible(false)
      recurrenceConfirmationTimerRef.current = null
    }, 2000)
  }, [])

  const handleFrequencySelectChange = (value) => {
    if (value === 'CUSTOM') {
      setRecurrenceViewMode('custom')
      return
    }
    updateRecurrenceDraft({ frequency: value })
  }

  const buildPresetRecurrenceState = useCallback((preset) => {
    const anchor = recurrenceAnchorDate()
    const base = createDefaultRecurrenceState(anchor)
    const weekday = WEEKDAY_CODES[anchor.getDay()]

    if (preset === 'none') {
      base.enabled = false
      return base
    }

    base.enabled = true
    switch (preset) {
      case 'daily':
        base.frequency = 'DAILY'
        base.interval = 1
        break
      case 'weekly':
        base.frequency = 'WEEKLY'
        base.interval = 1
        base.daysOfWeek = [weekday]
        break
      case 'monthly':
        base.frequency = 'MONTHLY'
        base.interval = 1
        base.monthlyMode = 'day'
        base.monthlyDay = anchor.getDate()
        break
      case 'yearly':
        base.frequency = 'YEARLY'
        base.interval = 1
        base.yearlyMode = 'date'
        base.yearlyMonth = anchor.getMonth() + 1
        base.yearlyDay = anchor.getDate()
        break
      default:
        break
    }
    return base
  }, [recurrenceAnchorDate])

  const recurrenceShortcutOptions = [
    { id: 'none', label: 'Does not repeat', description: 'One-time event' },
    { id: 'daily', label: 'Daily', description: 'Every day' },
    { id: 'weekly', label: 'Weekly', description: 'Same day each week' },
    { id: 'monthly', label: 'Monthly', description: 'Same date each month' },
    { id: 'yearly', label: 'Yearly', description: 'Same date every year' },
    { id: 'custom', label: 'Custom...', description: 'Advanced repeat options' }
  ]

  const handleRecurrenceShortcutSelect = (optionId) => {
    if (optionId === 'custom') {
      setRecurrenceDraft(cloneRecurrenceState(recurrenceState))
      setRecurrenceViewMode('custom')
      return
    }
    const nextState = buildPresetRecurrenceState(optionId)
    setRecurrenceState(cloneRecurrenceState(nextState))
    setRecurrenceDraft(cloneRecurrenceState(nextState))
    const nextSummary = formatRecurrenceSummary(nextState, recurrenceAnchorDate())
    setRecurrenceSummary(nextSummary)
    setShowRecurrencePicker(false)
    triggerRecurrenceConfirmation()
  }

  const handleToggleRecurrencePicker = () => {
    if (showRecurrencePicker) {
      setRecurrenceDraft(cloneRecurrenceState(recurrenceState))
      setShowRecurrencePicker(false)
      return
    }
    const draft = cloneRecurrenceState(recurrenceState)
    if (!draft.enabled) {
      draft.enabled = true
    }
    setRecurrenceDraft(draft)
    setRecurrenceViewMode('shortcuts')
    computeRecurrenceDropdownPlacement()
    setShowRecurrencePicker(true)
  }

  const handleClearRecurrence = () => {
    const cleared = createDefaultRecurrenceState(recurrenceAnchorDate())
    setRecurrenceState(cloneRecurrenceState(cleared))
    setRecurrenceDraft(cloneRecurrenceState(cleared))
    setRecurrenceSummary('Does not repeat')
    setShowRecurrencePicker(false)
    triggerRecurrenceConfirmation()
  }

  const updateRecurrenceDraft = (updates = {}, { forceEnable = true } = {}) => {
    setRecurrenceDraft((prev) => ({
      ...prev,
      ...updates,
      enabled: forceEnable ? true : prev.enabled
    }))
  }

  const toggleRecurrenceDay = (dayCode) => {
    setRecurrenceDraft((prev) => {
      let nextDays
      if (prev.daysOfWeek.includes(dayCode)) {
        nextDays = prev.daysOfWeek.filter((code) => code !== dayCode)
        if (!nextDays.length) {
          nextDays = [dayCode]
        }
      } else {
        nextDays = [...prev.daysOfWeek, dayCode]
      }
      return {
        ...prev,
        daysOfWeek: nextDays,
        enabled: true
      }
    })
  }

  const handleSelectMonthlyDay = (day) => {
    updateRecurrenceDraft({ monthlyMode: 'day', monthlyDay: day })
  }

  const handleSelectYearlyMonth = (month) => {
    updateRecurrenceDraft({ yearlyMonth: month }, { forceEnable: true })
  }

  const handleApplyRecurrence = () => {
    setRecurrenceState(cloneRecurrenceState(recurrenceDraft))
    setRecurrenceSummary(formatRecurrenceSummary(recurrenceDraft, recurrenceAnchorDate()))
    setShowRecurrencePicker(false)
    triggerRecurrenceConfirmation()
  }

  const handleCancelRecurrenceEdit = () => {
    setRecurrenceDraft(cloneRecurrenceState(recurrenceState))
    setRecurrenceViewMode('shortcuts')
    setShowRecurrencePicker(false)
  }

  const ensureTimedMode = useCallback(() => {
    if (!isAllDay) return
    const fallbackStart = lastTimedRangeRef.current.start || DEFAULT_TIMED_START
    const fallbackEnd = lastTimedRangeRef.current.end || DEFAULT_TIMED_END
    setIsAllDay(false)
    setTimeStart(fallbackStart)
    setTimeEnd(fallbackEnd)
  }, [isAllDay])

  const handleAllDayToggle = useCallback((checked) => {
    if (checked) {
      if (!isAllDay) {
        lastTimedRangeRef.current = {
          start: timeStart || DEFAULT_TIMED_START,
          end: timeEnd || DEFAULT_TIMED_END
        }
      }
      setIsAllDay(true)
      setTimeStart('00:00')
      setTimeEnd('23:59')
      setTimeError('')
    } else {
      ensureTimedMode()
    }
  }, [ensureTimedMode, isAllDay, timeStart, timeEnd])

  const handleTimeStartChange = useCallback((value) => {
    if (isAllDay) {
      ensureTimedMode()
    }
    const nextValue = value || DEFAULT_TIMED_START
    setTimeStart(nextValue)
    const startMinutes = timeToMinutes(nextValue)
    const endMinutes = timeToMinutes(timeEnd)
    if (endMinutes <= startMinutes) {
      const bumped = minutesToTime(startMinutes + 30)
      setTimeEnd(bumped)
      lastTimedRangeRef.current = {
        start: nextValue,
        end: bumped
      }
      return
    }
    lastTimedRangeRef.current = {
      ...lastTimedRangeRef.current,
      start: nextValue
    }
  }, [ensureTimedMode, isAllDay, timeEnd])

  const handleTimeEndChange = useCallback((value) => {
    if (isAllDay) {
      ensureTimedMode()
    }
    const nextValue = value || DEFAULT_TIMED_END
    const startMinutes = timeToMinutes(timeStart)
    let endMinutes = timeToMinutes(nextValue)
    if (endMinutes <= startMinutes) {
      endMinutes = startMinutes + 30
    }
    const safeEnd = minutesToTime(endMinutes)
    setTimeEnd(safeEnd)
    lastTimedRangeRef.current = {
      ...lastTimedRangeRef.current,
      end: safeEnd
    }
  }, [ensureTimedMode, isAllDay, timeStart])


  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    
    // Check if this is a recurring event being edited
    if (selectedEvent && isRecurringEvent && !pendingEventData) {
      // Build the event data first
      let finalStartDateTime
      let finalEndDateTime

      if (isAllDay) {
        finalStartDateTime = buildDateWithTime(eventDate, '00:00') || new Date()
        finalStartDateTime.setHours(0, 0, 0, 0)
        const rawEnd = buildDateWithTime(eventEndDate || eventDate, '00:00') || new Date(finalStartDateTime)
        rawEnd.setHours(0, 0, 0, 0)
        if (rawEnd < finalStartDateTime) {
          setTimeError('End date must be after start date')
          return
        }
        finalEndDateTime = new Date(rawEnd.getTime())
        finalEndDateTime.setDate(finalEndDateTime.getDate() + 1)
      } else {
        finalStartDateTime = buildDateWithTime(eventDate, timeStart) || new Date()
        finalEndDateTime = buildDateWithTime(eventEndDate || eventDate, timeEnd)
        if (!finalEndDateTime || finalEndDateTime <= finalStartDateTime) {
          setTimeError('End time must be after start time')
          return
        }
      }

      const trimmedSubtitle = eventSubtitle.trim()
      const eventData = {
        title: eventName.trim() === '' ? (selectedEvent ? selectedEvent.title : 'New Event') : eventName,
        start: finalStartDateTime,
        end: finalEndDateTime,
        color,
        isAllDay,
        location,
        description: trimmedSubtitle,
        participants,
        sendNotifications: showNotifyMembers && participants.length > 0,
        reminders: notifications.length > 0 ? {
          useDefault: false,
          overrides: notifications
        } : { useDefault: false, overrides: [] },
        transparency: showAsBusy ? 'opaque' : 'transparent',
        visibility: isPrivateEvent ? 'private' : 'public'
      }

      const isGoogleMeetLink = location?.includes('meet.google.com')
      if (conferenceRequestId && !isGoogleMeetLink && !tempEventId) {
        eventData.conferenceData = {
          createRequest: {
            requestId: conferenceRequestId
          }
        }
      }

      const recurrencePayload = buildRecurrencePayload(recurrenceState, finalStartDateTime)
      if (recurrencePayload) {
        eventData.recurrence = [recurrencePayload.rule]
        eventData.recurrenceRule = recurrencePayload.rule
        eventData.recurrenceSummary = recurrencePayload.summary
        eventData.recurrenceMeta = recurrencePayload.meta
      } else {
        eventData.recurrence = []
        eventData.recurrenceRule = ''
        eventData.recurrenceSummary = 'Does not repeat'
        eventData.recurrenceMeta = { enabled: false }
      }

      // Store the event data and show the prompt
      setPendingEventData(eventData)
      setShowRecurringEditPrompt(true)
      return
    }
    
    let finalStartDateTime
    let finalEndDateTime

    if (isAllDay) {
      finalStartDateTime = buildDateWithTime(eventDate, '00:00') || new Date()
      finalStartDateTime.setHours(0, 0, 0, 0)
      const rawEnd = buildDateWithTime(eventEndDate || eventDate, '00:00') || new Date(finalStartDateTime)
      rawEnd.setHours(0, 0, 0, 0)
      if (rawEnd < finalStartDateTime) {
        setTimeError('End date must be after start date')
        return
      }
      finalEndDateTime = new Date(rawEnd.getTime())
      finalEndDateTime.setDate(finalEndDateTime.getDate() + 1)
    } else {
      finalStartDateTime = buildDateWithTime(eventDate, timeStart) || new Date()
      finalEndDateTime = buildDateWithTime(eventEndDate || eventDate, timeEnd)
      if (!finalEndDateTime || finalEndDateTime <= finalStartDateTime) {
        setTimeError('End time must be after start time')
        return
      }
    }

    const trimmedSubtitle = eventSubtitle.trim()
    const eventData = {
      title: eventName.trim() === '' ? (selectedEvent ? selectedEvent.title : 'New Event') : eventName,
      start: finalStartDateTime,
      end: finalEndDateTime,
      color,
      isAllDay,
      location,
      description: trimmedSubtitle,
      participants,
      sendNotifications: showNotifyMembers && participants.length > 0,
      reminders: notifications.length > 0 ? {
        useDefault: false,
        overrides: notifications
      } : { useDefault: false, overrides: [] },
      transparency: showAsBusy ? 'opaque' : 'transparent',
      visibility: isPrivateEvent ? 'private' : 'public'
    };

    // Only create conference data if we don't already have a Google Meet link
    // If we're updating a temporary event (tempEventId exists), don't add conference data
    // as the meeting link is already in the location field
    const isGoogleMeetLink = location?.includes('meet.google.com')
    if (conferenceRequestId && !isGoogleMeetLink && !tempEventId) {
      eventData.conferenceData = {
        createRequest: {
          requestId: conferenceRequestId
        }
      }
    }

    const recurrencePayload = buildRecurrencePayload(recurrenceState, finalStartDateTime)
    if (recurrencePayload) {
      eventData.recurrence = [recurrencePayload.rule]
      eventData.recurrenceRule = recurrencePayload.rule
      eventData.recurrenceSummary = recurrencePayload.summary
      eventData.recurrenceMeta = recurrencePayload.meta
    } else {
      eventData.recurrence = []
      eventData.recurrenceRule = ''
      eventData.recurrenceSummary = 'Does not repeat'
      eventData.recurrenceMeta = { enabled: false }
    }
        
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chronos:month-range-reset'))
    }

    // If we have a temporary event with a meeting link, update it instead of creating a new one
    // This ensures the same meeting link is preserved for consistency
    let action
    if (tempEventId && !selectedEvent) {
      // Update the temporary event with the real event data to keep the same meeting link
      action = updateEvent(tempEventId, eventData)
      setTempEventId(null) // Clear temp event ID after updating
    } else if (selectedEvent) {
      action = updateEvent(selectedEvent.id, eventData)
      // Clean up temporary event if it exists (shouldn't happen when editing, but just in case)
      if (tempEventId) {
        cleanupTemporaryEvent()
      }
    } else {
      action = createEvent(eventData)
      // Clean up temporary event if it exists (shouldn't happen when creating new, but just in case)
      if (tempEventId) {
        cleanupTemporaryEvent()
      }
    }

    closeAndAnimateOut();

    action.catch((error) => {
      console.error('Failed to save event:', error);
    }).finally(() => {
      setConferenceRequestId(null)
    });
  };

  // Validate times whenever inputs change
  useEffect(() => {
    if (isAllDay) {
      const start = buildDateWithTime(eventDate, '00:00')
      const end = buildDateWithTime(eventEndDate, '00:00')
      if (!start || !end) {
        setTimeError('')
        return
      }
      setTimeError(end < start ? 'End date must be after start date' : '')
      return
    }
    const start = buildDateWithTime(eventDate, timeStart)
    const end = buildDateWithTime(eventEndDate || eventDate, timeEnd)
    if (!start || !end) {
      setTimeError('')
      return
    }
    setTimeError(end <= start ? 'End time must be after start time' : '')
  }, [eventDate, eventEndDate, timeStart, timeEnd, isAllDay, buildDateWithTime])
  
  const isRecurringEvent = useMemo(() => {
    if (!selectedEvent) return false
    // Check if it's an instance of a recurring event
    if (selectedEvent.recurringEventId || selectedEvent.parentRecurrenceId) {
      return true
    }
    // Check if it has recurrence metadata enabled
    if (selectedEvent.recurrenceMeta?.enabled) {
      return true
    }
    // Check if it has a recurrence rule
    if (selectedEvent.recurrenceRule && typeof selectedEvent.recurrenceRule === 'string' && selectedEvent.recurrenceRule.trim().length > 0) {
      return true
    }
    return false
  }, [selectedEvent])

  const executeDelete = useCallback((scope = 'single') => {
    if (!selectedEvent) return
    deleteEvent({ ...selectedEvent, deleteScope: scope })
    setShowRecurringDeletePrompt(false)
    closeAndAnimateOut()
  }, [selectedEvent, deleteEvent, closeAndAnimateOut])

  const executeRecurringEdit = useCallback((scope) => {
    if (!pendingEventData || !selectedEvent) return
    
    const eventDataWithScope = {
      ...pendingEventData,
      recurringEditScope: scope
    }
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chronos:month-range-reset'))
    }

    const action = updateEvent(selectedEvent.id, eventDataWithScope)
    
    setShowRecurringEditPrompt(false)
    setPendingEventData(null)
    setRecurringEditScope('single')
    closeAndAnimateOut()

    action
      .then(() => {
        if (scope === 'future' || scope === 'all') {
          clearCalendarSnapshots()
          if (typeof refreshEvents === 'function') {
            refreshEvents()
          } else if (typeof fetchEventsForRange === 'function') {
            const range = deriveVisibleRange(currentDate, view)
            if (range?.start && range?.end) {
              fetchEventsForRange(range.start, range.end, true, true).catch(() => {})
            }
          }
        }
      })
      .catch((error) => {
        console.error('Failed to save recurring event:', error)
      })
      .finally(() => {
        setConferenceRequestId(null)
      })
  }, [pendingEventData, selectedEvent, updateEvent, closeAndAnimateOut, fetchEventsForRange, currentDate, view, refreshEvents])

  const handleDelete = () => { // Ensure this is a stable function if used in useEffect deps
    if (!selectedEvent) return
    if (isRecurringEvent) {
      if (deleteButtonRef.current && modalRef.current) {
        const rect = deleteButtonRef.current.getBoundingClientRect()
        const modalRect = modalRef.current.getBoundingClientRect()
        setDeletePromptCoords({ top: rect.bottom + 8, left: modalRect.left })
      }
      setShowRecurringDeletePrompt(true)
      return
    }
    executeDelete('single')
  };
  
  const formatTimeForDisplay = (time24h) => {
    if (!time24h || typeof time24h !== 'string' || !time24h.includes(':')) return 'Invalid Time';
    const [hours, minutes] = time24h.split(':');
    const hour = parseInt(hours, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${period}`;
  };
  
  const toggleTimePeriod = (time24h) => {
    if (!time24h || typeof time24h !== 'string' || !time24h.includes(':')) return time24h;
    const [hours, minutes] = time24h.split(':');
    const hour = parseInt(hours, 10);
    const newHour = hour >= 12 ? hour - 12 : hour + 12;
    return `${String(newHour).padStart(2, '0')}:${minutes}`;
  };

  const getTimeParts = (time24h) => {
    if (!time24h || typeof time24h !== 'string' || !time24h.includes(':')) return { hour: '12', minute: '00', period: 'AM' };
    const [hours, minutes] = time24h.split(':');
    const hour = parseInt(hours, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return { hour: String(hour12), minute: minutes, period };
  };
  
  const handleAddParticipant = () => {
    const email = participantEmail.trim();
    if (email && email.includes('@') && !participants.includes(email)) {
      setParticipants([...participants, email]);
      setParticipantEmail('');
      setExpandedChips(new Set())
      // Auto-enable notifications when adding a new participant
      setShowNotifyMembers(true);
    }
  };

  const handleRemoveParticipant = (email) => {
    setParticipants(participants.filter(p => p !== email));
    setExpandedChips(prev => {
      const next = new Set(prev)
      next.delete(email)
      return next
    })
  };
  
  const toggleChip = (email) => {
    setExpandedChips(prev => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    })
  }
  
  const handleParticipantKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddParticipant();
    }
  };
  
  const notificationOptions = [
    { label: 'None', minutes: null },
    { label: 'At time of event', minutes: 0 },
    { label: '5 minutes before', minutes: 5 },
    { label: '10 minutes before', minutes: 10 },
    { label: '15 minutes before', minutes: 15 },
    { label: '30 minutes before', minutes: 30 },
    { label: '1 hour before', minutes: 60 },
    { label: '2 hours before', minutes: 120 },
    { label: '1 day before', minutes: 1440 },
    { label: '2 days before', minutes: 2880 },
  ];
  
  const handleAddNotification = (minutes) => {
    if (minutes === null) {
      setNotifications([]);
    } else {
      const exists = notifications.find(n => n.minutes === minutes)
      if (exists) {
        // Remove if already exists (toggle off)
        setNotifications(notifications.filter(n => n.minutes !== minutes));
      } else {
        // Add if doesn't exist (toggle on)
        setNotifications([...notifications, { method: 'popup', minutes }]);
      }
    }
  };
  
  const handleRemoveNotification = (minutes) => {
    setNotifications(notifications.filter(n => n.minutes !== minutes));
  };
  
  const formatNotificationLabel = (minutes) => {
    const option = notificationOptions.find(o => o.minutes === minutes);
    return option ? option.label : `${minutes} minutes before`;
  };

  // Helper to get color hex value for display
  const getColorHex = useCallback((colorValue) => {
    if (!colorValue) return '#1761C7'
    if (colorValue.startsWith('#')) return colorValue
    const colorMap = {
      blue: '#1761C7',  // Updated to match EVENT_COLORS.blue.text (5% darker)
      green: '#34C759',
      orange: '#FF9500',
      purple: '#AF52DE',
      red: '#FF3B30',
      pink: '#FF2D55',
      teal: '#00C7BE',
      cyan: '#06b6d4',
      amber: '#f59e0b',
      lime: '#84cc16',
      indigo: '#6366f1',
      yellow: '#FFD60A'
    }
    return colorMap[colorValue] || '#1761C7'
  }, [])
  
  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <>
      {/* No overlay - calendar always stays in focus */}
      
      {/* Popover Modal */}
        <div
          ref={modalRef}
          className={`fixed bg-white shadow-xl z-50 transition-all duration-200 ease-out
                    ${internalVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
          style={{
            top: `${modalPosition.top ?? 0}px`,
            left: `${modalPosition.left ?? 0}px`,
            width: `${modalPosition.width ?? DEFAULT_MODAL_DIMENSIONS.width}px`,
            border: '1px solid #e5e7eb',
            borderRadius: '22px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
      >
        {/* Pointer arrow - left side */}
        {modalPosition.pointerSide === 'left' && (
          <>
            <div 
              className="absolute w-0 h-0 z-10"
              style={{
                left: '-8px',
                top: `${modalPosition.pointerOffset ?? 24}px`,
                borderTop: '8px solid transparent',
                borderBottom: '8px solid transparent',
                borderRight: '8px solid #e5e7eb'
              }}
            />
            <div 
              className="absolute w-0 h-0 z-10"
              style={{
                left: '-7px',
                top: `${modalPosition.pointerOffset ?? 24}px`,
                borderTop: '8px solid transparent',
                borderBottom: '8px solid transparent',
                borderRight: '8px solid white'
              }}
            />
          </>
        )}
        {/* Pointer arrow - right side */}
        {modalPosition.pointerSide === 'right' && (
          <>
            <div 
              className="absolute w-0 h-0 z-10"
              style={{
                right: '-8px',
                top: `${modalPosition.pointerOffset ?? 24}px`,
                borderTop: '8px solid transparent',
                borderBottom: '8px solid transparent',
                borderLeft: '8px solid #e5e7eb'
              }}
            />
            <div 
              className="absolute w-0 h-0 z-10"
              style={{
                right: '-7px',
                top: `${modalPosition.pointerOffset ?? 24}px`,
                borderTop: '8px solid transparent',
                borderBottom: '8px solid transparent',
                borderLeft: '8px solid white'
              }}
            />
          </>
        )}
        
        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            const target = e.target
            const isEmailInput = typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement && target.type === 'email'
            if (
              e.key === 'Enter' &&
              e.target.tagName !== 'TEXTAREA' &&
              !isEmailInput
            ) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          className="px-0 py-0 flex flex-col"
        >
          <div>
            <div className="space-y-0">
            {/* Shared edit notice for attendee edits */}
            {selectedEvent && selectedEvent.viewerIsAttendee && !selectedEvent.viewerIsOrganizer && (
              <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm">
                Changes you make only update your view of this shared event.
              </div>
            )}

            {/* Close button */}
            <button 
              type="button"
              onClick={closeAndAnimateOut}
              className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors z-10"
            >
              <FiX size={20} />
            </button>

            {/* Event Name - Large with subtitle */}
            <div className="px-4 pt-[14px] pb-2">
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="Add title"
                className="w-full px-0 py-1 text-xl font-semibold text-gray-900 border-none focus:outline-none focus:ring-0"
                style={{ letterSpacing: '0.01em' }}
              />
              <div className={`border-b border-transparent ${eventSubtitle.trim() ? 'pb-2' : 'pb-0'}`}>
                <textarea
                  ref={descriptionInputRef}
                  value={eventSubtitle}
                  onChange={(e) => setEventSubtitle(e.target.value)}
                  placeholder="Add description"
                  className="w-full px-0 py-1 text-sm text-gray-500 border-none focus:outline-none focus:ring-0 resize-none"
                  rows={1}
                  style={{
                    minHeight: eventSubtitle.trim() ? '32px' : '24px',
                    lineHeight: `${DESCRIPTION_LINE_HEIGHT}px`,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    paddingBottom: (!isDescriptionExpanded && descriptionOverflowing) ? '0px' : (eventSubtitle.trim() ? '6px' : '0px'),
                    overflow: 'hidden',
                    pointerEvents: (!isDescriptionExpanded && descriptionOverflowing) ? 'none' : 'auto'
                  }}
                />
              </div>
              {descriptionOverflowing && (
                <div className="pb-2 pt-0" style={{ marginTop: '-15px' }}>
                  <button
                    type="button"
                    onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    {isDescriptionExpanded ? 'See less' : 'See more'}
                  </button>
                </div>
              )}
              </div>
            </div>
            {/* Grey line after description */}
            <div className="border-b border-gray-100"></div>

            {/* Add guests */}
            <div className="px-4 py-2.5 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <FiUsers className="text-gray-400 mt-1" size={20} />
                  <div className="flex-1 space-y-2.5">
                  <input
                    ref={participantInputRef}
                    type="email"
                    value={participantEmail}
                    onChange={(e) => setParticipantEmail(e.target.value)}
                    onKeyDown={handleParticipantKeyDown}
                    placeholder="Add guests"
                    className="w-full px-0 py-1 text-sm text-gray-900 bg-transparent border-none focus:outline-none focus:ring-0"
                  />
                    {participants.length > 0 && (() => {
                      // For viewing existing events with attendee data
                      const hasAttendeeData = selectedEvent?.attendees && Array.isArray(selectedEvent.attendees)
                      const attendeesMap = hasAttendeeData 
                        ? new Map(selectedEvent.attendees.map(a => [a.email, a]))
                        : new Map()
                      
                      const goingCount = hasAttendeeData 
                        ? selectedEvent.attendees.filter(a => a.responseStatus === 'accepted').length
                        : 0
                      
                      // Count declined: count each participant with declined status
                      let declinedCount = 0
                      participants.forEach(email => {
                        const attendee = attendeesMap.get(email)
                        if (attendee?.responseStatus === 'declined') {
                          declinedCount++
                        }
                      })
                      
                      // Count awaiting: count each participant based on their status
                      let awaitingCount = 0
                      participants.forEach(email => {
                        const attendee = attendeesMap.get(email)
                        if (!attendee) {
                          // Participant not in attendees list (newly added, not yet synced)
                          awaitingCount++
                        } else {
                          // Participant is in attendees list, check their status
                          const status = attendee.responseStatus
                          // Count as awaiting if status is needsAction, null, undefined, or not accepted/declined
                          if (status !== 'accepted' && status !== 'declined') {
                            awaitingCount++
                          }
                        }
                      })
                      
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center">
                            {participants.slice(0, 5).map((email, index) => {
                              const bgColor = getParticipantColor(email)
                              const attendee = attendeesMap.get(email)
                              const isAccepted = attendee?.responseStatus === 'accepted'
                              const isDeclined = attendee?.responseStatus === 'declined'
                              
                              const isOrganizer = selectedEvent?.viewerIsOrganizer || !selectedEvent
                              
                              return (
                                <div
                                  key={email}
                                  className="relative group"
                                  style={{ 
                                    marginLeft: index > 0 ? '-8px' : '0',
                                    zIndex: 5 - index
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => toggleChip(email)}
                                    className="rounded-full text-xs font-semibold text-white flex items-center justify-center focus:outline-none border-2 border-white relative"
                                    style={{ 
                                      backgroundColor: bgColor,
                                      width: '33.6px',
                                      height: '33.6px'
                                    }}
                                    aria-label={`Toggle ${email}`}
                                    title={email}
                                  >
                                    {getInitials(email)}
                                  </button>
                                  {isAccepted && (
                                    <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center border border-white">
                                      <FiCheck size={10} className="text-white" strokeWidth={3} />
                                    </div>
                                  )}
                                  {isDeclined && (
                                    <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center border border-white">
                                      <FiX size={10} className="text-white" strokeWidth={3} />
                                    </div>
                                  )}
                                  {isOrganizer && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleRemoveParticipant(email)
                                      }}
                                      className="absolute -bottom-1 -right-1 w-4 h-4 bg-white hover:bg-red-50 rounded-full flex items-center justify-center border border-gray-300 hover:border-red-400 shadow-sm opacity-0 group-hover:opacity-100 transition-all duration-150 z-10"
                                      aria-label={`Remove ${email}`}
                                      title={`Remove ${email}`}
                                    >
                                      <FiXCircle size={10} className="text-gray-600 hover:text-red-600" strokeWidth={2.5} />
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                            {participants.length > 5 && (
                              <div
                                className="rounded-full text-xs font-semibold bg-gray-200 text-gray-600 flex items-center justify-center border-2 border-white"
                                style={{ 
                                  marginLeft: '-5px',
                                  zIndex: 0,
                                  width: '33.6px',
                                  height: '33.6px'
                                }}
                              >
                                +{participants.length - 5}
                              </div>
                            )}
                            {(goingCount > 0 || declinedCount > 0 || awaitingCount > 0) && (
                              <div className="text-xs text-gray-500 ml-2">
                                {goingCount > 0 && `${goingCount} going`}
                                {goingCount > 0 && (declinedCount > 0 || awaitingCount > 0) && ', '}
                                {declinedCount > 0 && `${declinedCount} declined`}
                                {declinedCount > 0 && awaitingCount > 0 && ', '}
                                {awaitingCount > 0 && `${awaitingCount} awaiting`}
                              </div>
                            )}
                          </div>
                          {expandedChips.size > 0 && (
                            <div className="pt-1">
                              <span className="text-xs text-gray-600">
                                {participants.filter(email => expandedChips.has(email)).map((email, index, array) => {
                                  const isOrganizer = selectedEvent?.organizerEmail === email && email !== user?.email
                                  const attendee = attendeesMap.get(email)
                                  const isAccepted = attendee?.responseStatus === 'accepted'
                                  
                                  return (
                                    <span key={email} className={isOrganizer ? "font-semibold text-gray-900" : ""}>
                                      {email}
                                      {isOrganizer && " (Organizer)"}
                                      {isAccepted && <FiCheck className="inline ml-1 text-green-500" size={12} strokeWidth={3} />}
                                      {index < array.length - 1 && <span className="font-normal text-gray-600">, </span>}
                                    </span>
                                  )
                                })}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={(selectedEvent && !hasChanges) || (!!timeError && !isAllDay)}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors font-medium whitespace-nowrap self-start ${
                    (selectedEvent && !hasChanges) || (!!timeError && !isAllDay)
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {selectedEvent ? 'Update event' : 'Create event'}
                </button>
              </div>
            </div>

            {/* Add location and Google Meet */}
            <div className="px-4 py-2.5 border-b border-gray-100 relative overflow-visible">
              <div className="flex items-center gap-2" ref={locationContainerRef}>
                <FiMapPin className="text-gray-400 flex-shrink-0" size={20} />
                <div className="flex-1 relative min-w-0">
                  <input
                    ref={locationInputRef}
                    type="text"
                    value={location}
                    onChange={(e) => {
                      const value = e.target.value
                      // Clear temp event if user manually edits location (and it's not the Google Meet link we just set)
                      if (value !== location && !value.includes('meet.google.com')) {
                        cleanupTemporaryEvent()
                      }
                      setLocation(value)
                      setConferenceRequestId(null)
                      getPlacePredictions(value)
                    }}
                    onFocus={(e) => {
                      // Select all text when focusing for easy replacement
                      e.target.select()
                    }}
                    onBlur={() => {
                      // Delay to allow click on suggestion
                      setTimeout(() => setShowSuggestions(false), 200)
                    }}
                    placeholder="Add location or URL"
                    className="w-full px-0 py-1 text-sm text-gray-900 border-none focus:outline-none focus:ring-0 truncate"
                  />
                  {isLoading && (
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none">
                      <FiLoader className="animate-spin text-gray-400" size={16} />
                    </div>
                  )}
                </div>
                {!trimmedLocation || (trimmedLocation && isLocationUrl) || isGeneratingMeeting ? (
                  <div className="flex flex-col items-end">
                    {trimmedLocation && isLocationUrl && !isGeneratingMeeting ? (
                      <a
                        href={trimmedLocation}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs flex-shrink-0 backdrop-blur transition-colors bg-blue-500/80 text-white hover:bg-blue-600/80 border border-blue-500/50"
                      >
                        <FiVideo className="text-white" size={16} />
                        <span className="hidden sm:inline">Join meeting</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={handleGenerateMeetingLink}
                        disabled={isGeneratingMeeting}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs flex-shrink-0 backdrop-blur disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                          tempEventId || isGeneratingMeeting
                            ? 'bg-emerald-500 text-white hover:bg-emerald-600' 
                            : 'bg-white/80 border border-gray-200 text-gray-700 hover:bg-white/90'
                        }`}
                      >
                        {isGeneratingMeeting ? (
                          <>
                            <FiLoader className="animate-spin text-white" size={16} />
                            <span className="hidden sm:inline">Generating link...</span>
                          </>
                        ) : (
                          <>
                            <FiVideo size={16} style={{ color: tempEventId ? 'white' : '#4b5563' }} />
                            <span className="hidden sm:inline">Generate Google Meet</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                ) : trimmedLocation && !isLocationUrl ? (
                  <a
                    href={googleMapsLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-2 py-1.5 bg-white/80 border border-gray-200 rounded-lg hover:bg-white/90 text-xs text-gray-700 flex-shrink-0 backdrop-blur"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 4.75 3.75 9.1 6.5 11.36a1 1 0 001 0C15.25 18.1 19 13.75 19 9c0-3.87-3.13-7-7-7zm0 14c-2.76-2.5-5-6.02-5-7.5 0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.48-2.24 5-5 7.5zm0-10a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/>
                    </svg>
                    <span className="hidden sm:inline">Get directions</span>
                  </a>
                ) : null}
              </div>
              {/* Dropdown positioned absolutely to overlay other components - scroll only within dropdown */}
              {showSuggestions && predictions.length > 0 && (
                <div 
                  className="absolute left-4 right-4 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-[9999] overflow-y-auto overflow-x-hidden" 
                  style={{ 
                    maxHeight: '320px',
                    scrollBehavior: 'smooth'
                  }}
                  onWheel={(e) => {
                    const target = e.currentTarget
                    const { scrollTop, scrollHeight, clientHeight } = target
                    const isScrollingDown = e.deltaY > 0
                    const isScrollingUp = e.deltaY < 0
                    const isAtTop = scrollTop === 0
                    const isAtBottom = scrollHeight - scrollTop <= clientHeight + 1
                    
                    // If we're at the boundaries and trying to scroll further, prevent modal scroll
                    if ((isAtTop && isScrollingUp) || (isAtBottom && isScrollingDown)) {
                      e.stopPropagation()
                    }
                    // Otherwise, allow normal scrolling within dropdown
                  }}
                  onTouchMove={(e) => {
                    // Only prevent if we're at boundaries
                    const target = e.currentTarget
                    const { scrollTop, scrollHeight, clientHeight } = target
                    const isAtTop = scrollTop === 0
                    const isAtBottom = scrollHeight - scrollTop <= clientHeight + 1
                    
                    if (isAtTop || isAtBottom) {
                      e.stopPropagation()
                    }
                  }}
                >
                  {predictions.map((prediction) => (
                    <button
                      key={prediction.place_id}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        selectPlace(prediction)
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault() // Prevent input blur
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-xs text-gray-900 border-b border-gray-100 last:border-b-0 first:rounded-t-lg last:rounded-b-lg"
                    >
                      <div className="font-medium text-xs leading-tight">{prediction.main_text}</div>
                      {prediction.secondary_text && (
                        <div className="text-xs text-gray-500 leading-tight mt-0.5">{prediction.secondary_text}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Time and Date */}
            <div className="px-4 py-2.5 border-b border-gray-100">
              <div className="flex items-start gap-[9px]">
                <div className="flex flex-col gap-3 pt-0.5">
                <FiClock className="text-gray-400" size={20} />
                  <FiCalendar className="text-gray-400" size={20} />
                </div>
                <div className="flex-1 space-y-0">
                  <div className="space-y-2">
                    {!isAllDay ? (
                      <>
                        <div className="flex items-center gap-2 text-sm text-gray-900 overflow-visible">
                        <div className="inline-flex items-center gap-2 overflow-visible">
                        <input
                          type="time"
                          value={timeStart}
                          onChange={(e) => {
                            let value = e.target.value
                            if (value) {
                              const [hour, minute] = value.split(':').map(Number)
                              // Validate hour (0-23) and minute (0-59)
                              const validHour = Math.min(23, Math.max(0, hour || 0))
                              const validMinute = Math.min(59, Math.max(0, minute || 0))
                              value = `${String(validHour).padStart(2, '0')}:${String(validMinute).padStart(2, '0')}`
                              handleTimeStartChange(value)
                            }
                          }}
                          onBlur={(e) => {
                            let value = e.target.value
                            if (value) {
                              const [hour, minute] = value.split(':').map(Number)
                              const validHour = Math.min(23, Math.max(0, hour || 0))
                              const validMinute = Math.min(59, Math.max(0, minute || 0))
                              value = `${String(validHour).padStart(2, '0')}:${String(validMinute).padStart(2, '0')}`
                              handleTimeStartChange(value)
                            }
                          }}
                          className="px-0 py-0.5 border-none focus:outline-none text-sm text-gray-900 font-bold [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden"
                          style={{
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            width: '95px',
                            minWidth: '95px',
                            marginLeft: '2px',
                            overflow: 'visible'
                          }}
                        />
                          <span className="text-gray-400 font-semibold" style={{ marginLeft: '-1.9px', marginRight: '8px' }}>→</span>
                        <input
                          type="time"
                          value={timeEnd}
                          onChange={(e) => {
                            let value = e.target.value
                            if (value) {
                              const [hour, minute] = value.split(':').map(Number)
                              // Validate hour (0-23) and minute (0-59)
                              const validHour = Math.min(23, Math.max(0, hour || 0))
                              const validMinute = Math.min(59, Math.max(0, minute || 0))
                              value = `${String(validHour).padStart(2, '0')}:${String(validMinute).padStart(2, '0')}`
                              handleTimeEndChange(value)
                            }
                          }}
                          onBlur={(e) => {
                            let value = e.target.value
                            if (value) {
                              const [hour, minute] = value.split(':').map(Number)
                              const validHour = Math.min(23, Math.max(0, hour || 0))
                              const validMinute = Math.min(59, Math.max(0, minute || 0))
                              value = `${String(validHour).padStart(2, '0')}:${String(validMinute).padStart(2, '0')}`
                              handleTimeEndChange(value)
                            }
                          }}
                          className="px-0 py-0 border-none focus:outline-none text-sm text-gray-900 font-bold [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden"
                          style={{
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield',
                            width: '95px',
                            minWidth: '95px',
                            overflow: 'visible'
                          }}
                        />
                          </div>
                          <div className="flex items-center gap-2 ml-auto">
                          <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                id="event-all-day-toggle"
                                type="checkbox"
                                checked={isAllDay}
                                onChange={(e) => handleAllDayToggle(e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                              <span className="ml-2 text-xs text-gray-600 whitespace-nowrap">All day</span>
                            </label>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-sm text-gray-900">
                      <span className="text-gray-500">All day</span>
                          <div className="flex items-center gap-2 ml-auto">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                id="event-all-day-toggle"
                                type="checkbox"
                                checked={isAllDay}
                                onChange={(e) => handleAllDayToggle(e.target.checked)}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                              <span className="ml-2 text-xs text-gray-600 whitespace-nowrap">All day</span>
                            </label>
                          </div>
                        </div>
                      </>
                  )}
                </div>

                  <div className="flex items-center gap-2 text-sm text-gray-900">
                    <div className="inline-flex items-center gap-2">
                    <input
                      type="date"
                      value={eventDate}
                      onChange={(e) => {
                        let value = e.target.value
                        if (value) {
                          const [year, month, day] = value.split('-').map(Number)
                          // Validate month (1-12)
                          const validMonth = Math.min(12, Math.max(1, month || 1))
                          // Get max days for the month
                          const maxDay = new Date(year, validMonth, 0).getDate()
                          // Validate day (1 to maxDay for the month)
                          const validDay = Math.min(maxDay, Math.max(1, day || 1))
                          value = `${year}-${String(validMonth).padStart(2, '0')}-${String(validDay).padStart(2, '0')}`
                          setEventDate(value)
                          // If end date is before new start date, adjust it
                          if (eventEndDate && new Date(eventEndDate) < new Date(value)) {
                            setEventEndDate(value)
                          }
                        }
                      }}
                      onBlur={(e) => {
                        let value = e.target.value
                        if (value) {
                          const [year, month, day] = value.split('-').map(Number)
                          const validMonth = Math.min(12, Math.max(1, month || 1))
                          const maxDay = new Date(year, validMonth, 0).getDate()
                          const validDay = Math.min(maxDay, Math.max(1, day || 1))
                          value = `${year}-${String(validMonth).padStart(2, '0')}-${String(validDay).padStart(2, '0')}`
                          setEventDate(value)
                          // If end date is before new start date, adjust it
                          if (eventEndDate && new Date(eventEndDate) < new Date(value)) {
                            setEventEndDate(value)
                          }
                        }
                      }}
                      className="border-none focus:outline-none text-sm text-gray-900 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden"
                      style={{
                        WebkitAppearance: 'none',
                        MozAppearance: 'textfield',
                        padding: '4px 0',
                        paddingTop: '8px',
                        width: '85px',
                        marginLeft: '2px'
                      }}
                    />
                    <span className="text-gray-400 font-semibold mx-2">→</span>
                    <input
                      type="date"
                      value={eventEndDate}
                      min={eventDate}
                      onChange={(e) => {
                        let value = e.target.value
                        if (value) {
                          const [year, month, day] = value.split('-').map(Number)
                          // Validate month (1-12)
                          const validMonth = Math.min(12, Math.max(1, month || 1))
                          // Get max days for the month
                          const maxDay = new Date(year, validMonth, 0).getDate()
                          // Validate day (1 to maxDay for the month)
                          const validDay = Math.min(maxDay, Math.max(1, day || 1))
                          value = `${year}-${String(validMonth).padStart(2, '0')}-${String(validDay).padStart(2, '0')}`
                          // Ensure end date is not before start date
                          if (eventDate && new Date(value) < new Date(eventDate)) {
                            value = eventDate
                          }
                          setEventEndDate(value)
                        }
                      }}
                      onBlur={(e) => {
                        let value = e.target.value
                        if (value) {
                          const [year, month, day] = value.split('-').map(Number)
                          const validMonth = Math.min(12, Math.max(1, month || 1))
                          const maxDay = new Date(year, validMonth, 0).getDate()
                          const validDay = Math.min(maxDay, Math.max(1, day || 1))
                          value = `${year}-${String(validMonth).padStart(2, '0')}-${String(validDay).padStart(2, '0')}`
                          // Ensure end date is not before start date
                          if (eventDate && new Date(value) < new Date(eventDate)) {
                            value = eventDate
                          }
                          setEventEndDate(value)
                        }
                      }}
                      className="border-none focus:outline-none text-sm text-gray-900 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden"
                      style={{
                        WebkitAppearance: 'none',
                        MozAppearance: 'textfield',
                        padding: '4px 0',
                        paddingTop: '8px',
                        width: '85px',
                        marginLeft: '2px'
                      }}
                    />
                    </div>
                      <button
                        type="button"
                        onClick={handleToggleRecurrencePicker}
                        className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-800 whitespace-nowrap ml-auto"
                        ref={recurrenceTriggerRef}
                      >
                        <FiRepeat className="text-gray-600" size={14} />
                        <span className={`text-sm truncate ${recurrenceState.enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                          {recurrenceSummary}
                        </span>
                        <FiChevronDown className="text-gray-400" size={14} />
                      </button>
                    </div>
                  </div>
                    {showRecurrencePicker && createPortal(
                    <div
                      ref={recurrencePickerRef}
                      className="fixed z-[1000] bg-white border border-gray-200 rounded-xl shadow-xl p-3 space-y-3 overflow-y-auto"
                      style={{
                        top: recurrenceDropdownPlacement === 'top' ? recurrenceDropdownCoords.top : recurrenceDropdownCoords.top,
                        left: recurrenceDropdownCoords.left,
                        width: recurrenceDropdownCoords.width,
                        maxHeight: recurrenceDropdownMaxHeight,
                        transform: recurrenceDropdownPlacement === 'top' ? 'translateY(-100%)' : 'none'
                      }}
                    >
                      {recurrenceViewMode === 'shortcuts' ? (
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-xs text-gray-500">{recurrenceSummary}</p>
                            </div>
                            <button
                              type="button"
                              onClick={handleClearRecurrence}
                              className="text-xs text-blue-600 hover:text-blue-700"
                            >
                              Reset
                            </button>
                          </div>
                          <div className="space-y-1">
                            {recurrenceShortcutOptions.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => handleRecurrenceShortcutSelect(option.id)}
                                className="w-full text-left px-3 py-2 rounded-lg border border-transparent hover:border-blue-200 hover:bg-blue-50 transition-colors"
                              >
                                <div className="text-sm font-medium text-gray-900">{option.label}</div>
                                <div className="text-xs text-gray-500">{option.description}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <button
                              type="button"
                              onClick={() => setRecurrenceViewMode('shortcuts')}
                              className="text-xs text-gray-600 hover:text-gray-800"
                            >
                              ← Back
                            </button>
                            <p className="text-sm font-semibold text-gray-900">Custom repeat</p>
                            <button
                              type="button"
                              onClick={handleClearRecurrence}
                              className="text-xs text-blue-600 hover:text-blue-700"
                            >
                              Clear
                            </button>
                          </div>
                          <p className="text-xs text-gray-500">
                            {formatRecurrenceSummary(recurrenceDraft, recurrenceAnchorDate())}
                          </p>
                          <div>
                            <label className="text-xs font-medium text-gray-600">Frequency</label>
                            <select
                              value={recurrenceDraft.frequency}
                              onChange={(e) => handleFrequencySelectChange(e.target.value)}
                              className="mt-1 w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {RECURRENCE_FREQUENCIES.map((freq) => (
                                <option key={freq.value} value={freq.value}>{freq.label}</option>
                              ))}
                              <option value="CUSTOM">Custom…</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-gray-600">Every</label>
                            <input
                              type="number"
                              min="1"
                              value={recurrenceDraft.interval}
                              onChange={(e) => updateRecurrenceDraft({ interval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                              className="w-16 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-500">
                              {FREQUENCY_UNITS[recurrenceDraft.frequency] || 'occurrence(s)'}
                            </span>
                          </div>
                          {recurrenceDraft.frequency === 'WEEKLY' && (
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Week on</label>
                              <div className="grid grid-cols-7 gap-1">
                                {WEEKDAY_CODES.map((code) => {
                                  const active = recurrenceDraft.daysOfWeek.includes(code)
                                  return (
                                    <button
                                      type="button"
                                      key={code}
                                      onClick={() => toggleRecurrenceDay(code)}
                                      className={`h-8 rounded-lg text-xs font-semibold transition-colors ${
                                        active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                      }`}
                                    >
                                      {WEEKDAY_MINI[code]}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          {recurrenceDraft.frequency === 'MONTHLY' && (
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-gray-600">Each month</label>
                              <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                  <input
                                    type="radio"
                                    name="recurrenceMonthlyMode"
                                    checked={recurrenceDraft.monthlyMode === 'day'}
                                    onChange={() => updateRecurrenceDraft({ monthlyMode: 'day' })}
                                  />
                                  <span>Each</span>
                                </label>
                                {recurrenceDraft.monthlyMode === 'day' && (
                                  <div className="grid grid-cols-7 gap-1">
                                    {MONTHLY_DAYS.map((day) => {
                                      const active = recurrenceDraft.monthlyDay === day
                                      return (
                                        <button
                                          key={day}
                                          type="button"
                                          onClick={() => handleSelectMonthlyDay(day)}
                                          className={`h-8 rounded-lg text-xs font-semibold transition-colors ${
                                            active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                          }`}
                                        >
                                          {day}
                                        </button>
                                      )
                                    })}
                                  </div>
                                )}
                                <label className="flex items-center gap-2 text-sm text-gray-700 pt-1">
                                  <input
                                    type="radio"
                                    name="recurrenceMonthlyMode"
                                    checked={recurrenceDraft.monthlyMode === 'weekday'}
                                    onChange={() => updateRecurrenceDraft({ monthlyMode: 'weekday' })}
                                  />
                                  <span>On the</span>
                                  <select
                                    value={recurrenceDraft.monthlyWeek}
                                    onChange={(e) => updateRecurrenceDraft({ monthlyWeek: parseInt(e.target.value, 10) || 1 })}
                                    className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    {ORDINAL_SELECT_OPTIONS.map(({ value, label }) => (
                                      <option key={value} value={value}>{label}</option>
                                    ))}
                                  </select>
                                  <select
                                    value={recurrenceDraft.monthlyWeekday}
                                    onChange={(e) => updateRecurrenceDraft({ monthlyWeekday: e.target.value })}
                                    className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
                                  >
                                    {WEEKDAY_CODES.map((code) => (
                                      <option key={code} value={code}>{WEEKDAY_LABELS[code]}</option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                            </div>
                          )}
                          {recurrenceDraft.frequency === 'YEARLY' && (
                            <div className="space-y-2">
                              <label className="text-xs font-medium text-gray-600">Year in</label>
                              <div className="grid grid-cols-3 gap-1">
                                {MONTH_LABELS.map((label, idx) => {
                                  const monthNumber = idx + 1
                                  const active = recurrenceDraft.yearlyMonth === monthNumber
                                  return (
                                    <button
                                      key={label}
                                      type="button"
                                      onClick={() => handleSelectYearlyMonth(monthNumber)}
                                      className={`h-9 rounded-lg text-xs font-semibold transition-colors ${
                                        active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  )
                                })}
                              </div>
                              <div className="space-y-1">
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                  <input
                                    type="radio"
                                    name="recurrenceYearlyMode"
                                    checked={recurrenceDraft.yearlyMode === 'date'}
                                    onChange={() => updateRecurrenceDraft({ yearlyMode: 'date' })}
                                  />
                                  <span>On day</span>
                                  <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={recurrenceDraft.yearlyDay}
                                    onChange={(e) => updateRecurrenceDraft({ yearlyDay: Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
                                    className="w-20 px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    disabled={recurrenceDraft.yearlyMode !== 'date'}
                                  />
                                </label>
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                  <input
                                    type="radio"
                                    name="recurrenceYearlyMode"
                                    checked={recurrenceDraft.yearlyMode === 'weekday'}
                                    onChange={() => updateRecurrenceDraft({ yearlyMode: 'weekday' })}
                                  />
                                  <span>On the</span>
                                    <select
                                      value={recurrenceDraft.yearlyOrdinal}
                                      onChange={(e) => updateRecurrenceDraft({ yearlyOrdinal: parseInt(e.target.value, 10) || 1 })}
                                      className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                      {ORDINAL_SELECT_OPTIONS.map(({ value, label }) => (
                                        <option key={value} value={value}>{label}</option>
                                      ))}
                                    </select>
                                    <select
                                      value={recurrenceDraft.yearlyWeekday}
                                      onChange={(e) => updateRecurrenceDraft({ yearlyWeekday: e.target.value })}
                                      className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                      {WEEKDAY_CODES.map((code) => (
                                        <option key={code} value={code}>{WEEKDAY_LABELS[code]}</option>
                                      ))}
                                    </select>
                                  </label>
                              </div>
                            </div>
                          )}
                            <div className="flex items-center justify-between">
                              <div className="space-y-1 text-xs text-gray-500">
                                <p>{recurrenceSummary}</p>
                            </div>
                              <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleApplyRecurrence}
                              className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                        </div>
                      )}
                      </div>,
                      document.body
                    )}
                </div>
              </div>
            </div>
          {/* Footer */}
          <div className="z-20 bg-white border-t border-gray-100 px-4 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="relative" ref={colorPickerTriggerRef}>
                <button
                  type="button"
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  className="px-2 py-2 hover:bg-gray-50 transition-colors"
                  title="Change color"
                >
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: getColorHex(color) }}
                  />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowNotificationPicker(prev => !prev)}
                className="px-2 py-2 text-gray-500 hover:bg-gray-50 transition-colors"
                title="Add notification"
                ref={notificationTriggerRef}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {notifications.length > 0 && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                    {notifications.length}
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowAsBusy(prev => !prev)}
                className="flex items-center gap-1 px-3 py-1 text-sm font-normal text-gray-700 hover:bg-gray-50 transition-colors"
                title={showAsBusy ? 'Show as busy' : 'Show as free'}
                style={{ minWidth: 64 }}
              >
                <span className={`w-2 h-2 rounded-full ${showAsBusy ? 'bg-red-500' : 'bg-green-500'}`} />
                <span>{showAsBusy ? 'Busy' : 'Free'}</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPrivateEvent(prev => !prev)}
                className={`p-2 transition-colors ${
                  isPrivateEvent ? 'text-gray-900' : 'text-gray-500 hover:text-gray-600'
                }`}
                aria-pressed={isPrivateEvent}
                title={isPrivateEvent ? 'Private event' : 'Public event'}
              >
                {isPrivateEvent ? <FiLock size={16} /> : <FiUnlock size={16} />}
              </button>
              <div className="flex-1"></div>
              {selectedEvent?.inviteCanRespond && selectedEvent?.organizerEmail !== user?.email && (
                <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowNotifyMembers(prev => !prev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm shrink-0 transition-colors ${
                    currentRSVPStatus === 'accepted'
                      ? 'text-green-700'
                      : currentRSVPStatus === 'declined'
                      ? 'text-red-600'
                      : 'text-gray-600'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${
                    currentRSVPStatus === 'accepted'
                      ? 'bg-green-500'
                      : currentRSVPStatus === 'declined'
                      ? 'bg-red-500'
                      : 'bg-gray-400'
                  }`}></div>
                    <span className="whitespace-nowrap">
                      {currentRSVPStatus === 'accepted' ? 'Going' : currentRSVPStatus === 'declined' ? 'Not going' : 'Maybe'}
                    </span>
                    <FiChevronDown size={14} />
                  </button>
                  {showNotifyMembers && (
                    <div className="absolute bottom-full right-0 mb-2 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px]">
                      {RSVP_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            handleInviteResponse(option.value);
                            setShowNotifyMembers(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                            currentRSVPStatus === option.value ? 'font-semibold' : ''
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {selectedEvent && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-3 py-1 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  ref={deleteButtonRef}
                >
                  Delete event
                </button>
              )}
            </div>
            {participants.length > 0 && !selectedEvent?.inviteCanRespond && (
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={showNotifyMembers}
                  onChange={(e) => setShowNotifyMembers(e.target.checked)}
                  className="h-3 w-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span>Notify members</span>
              </div>
            )}
          </div>
        </form>

        {showColorPicker && typeof document !== 'undefined' && createPortal(
          <div
            ref={colorPickerDropdownRef}
            className="fixed z-[1100] bg-white border border-gray-200 rounded-2xl shadow-xl p-3"
            style={{
              top: colorPickerDropdownCoords.top,
              left: colorPickerDropdownCoords.left,
              width: 192,
              transform: colorPickerDropdownCoords.placement === 'top' ? 'translateY(-100%)' : 'none'
            }}
          >
            <div className="grid grid-cols-4 gap-2">
              {CATEGORY_COLORS.map((colorHex) => (
                <button
                  key={colorHex}
                  type="button"
                  onClick={() => {
                    // Map blue hex back to named color for consistency
                    const selectedColor = colorHex === '#1761C7' ? 'blue' : colorHex
                    setColor(selectedColor)
                    setShowColorPicker(false)
                  }}
                  className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${
                    getColorHex(color) === colorHex ? 'ring-2 ring-gray-400 ring-offset-2 ring-offset-white' : ''
                  }`}
                  style={{ backgroundColor: colorHex }}
                />
              ))}
            </div>
          </div>,
          document.body
        )}

        {showNotificationPicker && typeof document !== 'undefined' && createPortal(
          <div
            ref={notificationPickerRef}
            className="fixed z-[1100] bg-white border border-gray-200 rounded-2xl shadow-xl p-3 space-y-3"
            style={{
              top: notificationDropdownCoords.top,
              left: notificationDropdownCoords.left,
              width: notificationDropdownCoords.width,
              transform: notificationDropdownCoords.placement === 'top' ? 'translateY(-100%)' : 'none',
              maxHeight: 360,
              overflowY: 'auto'
            }}
          >
            <div>
              <p className="text-xs font-medium text-gray-500">Reminders</p>
            </div>
            <div className="space-y-1">
              {notificationOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleAddNotification(option.minutes)
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <span>{option.label}</span>
                  {(
                    option.minutes === null
                      ? notifications.length === 0
                      : notifications.some((note) => note.minutes === option.minutes)
                  ) && <FiCheck className="text-green-600" />}
                </button>
              ))}
            </div>
            {notifications.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Active</p>
                <div className="space-y-1">
                  {notifications
                    .slice()
                    .sort((a, b) => a.minutes - b.minutes)
                    .map((notification) => (
                      <div
                        key={notification.minutes}
                        className="flex items-center justify-between px-3 py-2 text-sm rounded-lg bg-gray-50"
                      >
                        <span>{formatNotificationLabel(notification.minutes)}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveNotification(notification.minutes)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>,
          document.body
        )}

        {showRecurringEditPrompt && typeof document !== 'undefined' && createPortal(
          <>
            {/* Backdrop overlay */}
            <div
              className="fixed inset-0 z-[1199] bg-black bg-opacity-30"
              onMouseDown={(e) => {
                e.stopPropagation()
                setShowRecurringEditPrompt(false)
                setPendingEventData(null)
                setRecurringEditScope('single')
              }}
            />
            
            {/* Modal */}
            <div
              ref={recurringEditPromptRef}
              className="fixed z-[1200] bg-white rounded-3xl shadow-2xl"
              style={{
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 400,
                maxWidth: '90vw'
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
            <div className="p-6">
              <h2 className="text-2xl font-semibold text-gray-900 mb-6">Edit recurring event</h2>
              
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="radio"
                      name="recurring-edit-scope"
                      value="single"
                      checked={recurringEditScope === 'single'}
                      onChange={(e) => setRecurringEditScope(e.target.value)}
                      className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>
                  <span className="text-base text-gray-700 group-hover:text-gray-900">This event</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="radio"
                      name="recurring-edit-scope"
                      value="future"
                      checked={recurringEditScope === 'future'}
                      onChange={(e) => setRecurringEditScope(e.target.value)}
                      className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>
                  <span className="text-base text-gray-700 group-hover:text-gray-900">This and following events</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input
                      type="radio"
                      name="recurring-edit-scope"
                      value="all"
                      checked={recurringEditScope === 'all'}
                      onChange={(e) => setRecurringEditScope(e.target.value)}
                      className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>
                  <span className="text-base text-gray-700 group-hover:text-gray-900">All events</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 mt-8">
                <button
                  type="button"
                  onClick={() => {
                    setShowRecurringEditPrompt(false)
                    setPendingEventData(null)
                    setRecurringEditScope('single')
                  }}
                  className="px-6 py-2 text-base font-medium text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => executeRecurringEdit(recurringEditScope)}
                  className="px-8 py-2 text-base font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
          </>,
          document.body
        )}

        {showRecurringDeletePrompt && typeof document !== 'undefined' && createPortal(
          <div
            className="fixed z-[1200] bg-white border border-gray-200 rounded-2xl shadow-xl p-3 space-y-3"
            style={{
              top: deletePromptCoords.top,
              left: deletePromptCoords.left,
              width: 280
            }}
            ref={deletePromptRef}
            onMouseDown={(e) => {
              // Prevent document-level mousedown handlers from closing the prompt
              // before the button onClick handlers can fire
              e.stopPropagation()
            }}
          >
            <div>
              <p className="text-sm font-semibold text-gray-900">Delete recurring event?</p>
              <p className="text-xs text-gray-500 mt-0.5">Remove only this event or the entire series.</p>
            </div>
            <div className="space-y-2 text-sm">
              <button
                type="button"
                onClick={() => executeDelete('single')}
                className="w-full px-3 py-2 text-left rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                Delete this event
              </button>
              <button
                type="button"
                onClick={() => executeDelete('series')}
                className="w-full px-3 py-2 text-left rounded-lg text-white"
                style={{ backgroundColor: 'rgb(159, 134, 255)' }}
              >
                Delete entire series
              </button>
              <button
                type="button"
                onClick={() => setShowRecurringDeletePrompt(false)}
                className="w-full px-3 py-2 text-left rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>,
          document.body
        )}
      </div>
    </>,
    document.body
  )
}

export default EventModal
