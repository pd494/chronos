import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
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
  FiRepeat
} from 'react-icons/fi'
import { useCalendar } from '../../context/CalendarContext'
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
  '#3478F6',
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
    '#3478F6',  // blue
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

// Get modal position based on view type and clicked element
const getModalPosition = (view) => {
  const modalWidth = 400;
  const modalHeight = 500;
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  const margin = 20;
  const sideOffset = 12;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  let anchorRect = null;

  if (window.lastCalendarAnchorRect && Number.isFinite(window.lastCalendarAnchorRect.top)) {
    anchorRect = window.lastCalendarAnchorRect;
  } else {
    const fallbackElement = window.lastClickedEvent || window.lastClickedCalendarDay;
    if (fallbackElement) {
      const rect = fallbackElement.getBoundingClientRect();
      anchorRect = {
        top: rect.top + scrollTop,
        bottom: rect.bottom + scrollTop,
        left: rect.left + scrollLeft,
        right: rect.right + scrollLeft,
        width: rect.width,
        height: rect.height
      };
    }
  }

  if (!anchorRect) {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerSide: 'left', pointerOffset: 24 };
  }

  const anchorTop = anchorRect.top;
  const anchorBottom = anchorRect.bottom ?? (anchorTop + (anchorRect.height ?? 0));
  const anchorHeight = anchorRect.height ?? Math.max(anchorBottom - anchorTop, 1);
  const anchorLeft = anchorRect.left;
  const anchorRight = anchorRect.right ?? (anchorLeft + (anchorRect.width ?? 0));
  const anchorCenterY = anchorTop + anchorHeight / 2;

  const spaceOnRight = (viewportWidth + scrollLeft) - anchorRight;
  const spaceOnLeft = anchorLeft - scrollLeft;

  let pointerSide = 'left';
  let left;

  if (spaceOnRight >= modalWidth + margin) {
    left = anchorRight + sideOffset;
    pointerSide = 'left';
  } else if (spaceOnLeft >= modalWidth + margin) {
    left = anchorLeft - modalWidth - sideOffset;
    pointerSide = 'right';
  } else {
    const preferredLeft = anchorRight + sideOffset;
    const preferredRight = anchorLeft - modalWidth - sideOffset;
    const canFitRight = preferredLeft + modalWidth <= scrollLeft + viewportWidth - margin;
    const canFitLeft = preferredRight >= scrollLeft + margin;

    if (canFitRight || (!canFitLeft && preferredLeft >= preferredRight)) {
      left = preferredLeft;
      pointerSide = 'left';
    } else {
      left = preferredRight;
      pointerSide = 'right';
    }
  }

  left = clamp(left, scrollLeft + margin, scrollLeft + viewportWidth - modalWidth - margin);

  let top = anchorCenterY - modalHeight / 2;
  top = clamp(top, scrollTop + margin, scrollTop + viewportHeight - modalHeight - margin);

  const pointerOffset = clamp(anchorCenterY - top - 8, 16, modalHeight - 40);

  return {
    top: `${top}px`,
    left: `${left}px`,
    pointerSide,
    pointerOffset
  };
};

const EventModal = () => {
  const { 
    selectedEvent, 
    closeEventModal: contextCloseEventModal,
    createEvent,
    updateEvent,
    respondToInvite,
    deleteEvent,
    view
  } = useCalendar()
  
  const [eventName, setEventName] = useState('')
  const [eventSubtitle, setEventSubtitle] = useState('')
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [eventEndDate, setEventEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [timeStart, setTimeStart] = useState(DEFAULT_TIMED_START)
  const [timeEnd, setTimeEnd] = useState(DEFAULT_TIMED_END)
  const [color, setColor] = useState('#3478F6')
  const [isAllDay, setIsAllDay] = useState(true)
  const [location, setLocation] = useState('')
  const [internalVisible, setInternalVisible] = useState(false)
  const [participants, setParticipants] = useState([])
  const [expandedChips, setExpandedChips] = useState(new Set())
  const [timeError, setTimeError] = useState('')
  const [participantEmail, setParticipantEmail] = useState('')
  const [showNotifyMembers, setShowNotifyMembers] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
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
  const [inviteResponseLoading, setInviteResponseLoading] = useState(false)
  const [inviteResponseError, setInviteResponseError] = useState('')
  const [optimisticRSVPStatus, setOptimisticRSVPStatus] = useState(null)
  const currentRSVPStatus = selectedEvent ? (optimisticRSVPStatus ?? selectedEvent.viewerResponseStatus) : null
  const deletePromptRef = useRef(null)
  const [modalPosition, setModalPosition] = useState({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerSide: 'left' })
  const [isFromDayClick, setIsFromDayClick] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showNotificationPicker, setShowNotificationPicker] = useState(false)
  const [notifications, setNotifications] = useState([])
  const titleInputRef = useRef(null)
  const modalRef = useRef(null)
  const lastTimedRangeRef = useRef({ start: DEFAULT_TIMED_START, end: DEFAULT_TIMED_END })
  const colorPickerRef = useRef(null)
  const recurrencePickerRef = useRef(null)
  const recurrenceTriggerRef = useRef(null)
  const deleteButtonRef = useRef(null)
  const participantInputRef = useRef(null)
  const notificationPickerRef = useRef(null)
  const notificationTriggerRef = useRef(null)
  const initialValuesRef = useRef({})
  const recurrenceConfirmationTimerRef = useRef(null)

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

  useEffect(() => {
    // Set modal position and animate in when the component is mounted or event changes
    setModalPosition(getModalPosition(view));
    if (!internalVisible) {
      requestAnimationFrame(() => {
        setInternalVisible(true);
      });
    }
    
    // Prevent horizontal scrolling
    document.body.style.overflowX = 'hidden';
    
    return () => {
      document.body.style.overflowX = '';
    };
  }, [view, selectedEvent]);
  
  // Update position when window resizes
  useEffect(() => {
    const handleResize = () => {
      setModalPosition(getModalPosition(view));
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [view]);
  
  // Close color picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target)) {
        setShowColorPicker(false);
      }
    };
    
    if (showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showColorPicker]);

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

  useEffect(() => {
    if (!showNotificationPicker) return
    const handleClick = (event) => {
      if (notificationTriggerRef.current && notificationTriggerRef.current.contains(event.target)) return
      if (notificationPickerRef.current && notificationPickerRef.current.contains(event.target)) return
      setShowNotificationPicker(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showNotificationPicker])

  useEffect(() => {
    return () => {
      if (recurrenceConfirmationTimerRef.current) {
        clearTimeout(recurrenceConfirmationTimerRef.current)
        recurrenceConfirmationTimerRef.current = null
      }
    }
  }, [])
  
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

      const clickedInRecurrenceDropdown = recurrencePickerRef.current && recurrencePickerRef.current.contains(event.target)
      if (clickedInRecurrenceDropdown) {
        return
      }
      if (modalRef.current && !modalRef.current.contains(event.target) && !clickedOnEvent) {
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
        }, 300);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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
    }, 300); // Match animation duration
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
    setEventSubtitle(initialSubtitle);
    setRecurrenceState(cloneRecurrenceState(recurrenceDetails.state))
    setRecurrenceDraft(cloneRecurrenceState(recurrenceDetails.state))
    setRecurrenceSummary(recurrenceDetails.summary)
    setShowRecurrencePicker(false)
    
    // Set notifications from event or default
    const initialNotifications = selectedEvent?.reminders?.overrides || selectedEvent?.reminders?.useDefault ? [] : [];
    setNotifications(initialNotifications);
    
    // Store initial values for change detection
    const initialParticipants = selectedEvent?.participants || [];
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
      notifications: initialNotifications
    };
    setHasChanges(false);
    setParticipants(initialParticipants);
    setExpandedChips(new Set())
    setParticipantEmail('')

  }, [selectedEvent])

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

  useEffect(() => {
    if (!internalVisible) return
    if (titleInputRef.current) {
      titleInputRef.current.focus({ preventScroll: true })
    }
  }, [internalVisible])

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
    
    const notificationsChanged =
      JSON.stringify(notifications.sort((a, b) => a.minutes - b.minutes)) !== 
      JSON.stringify((initial.notifications || []).sort((a, b) => a.minutes - b.minutes));
    
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
      recurrenceRule !== initialRecurrenceRule;
    
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
  }, [selectedEvent, eventName, eventSubtitle, eventDate, eventEndDate, timeStart, timeEnd, color, isAllDay, location, participants, notifications, recurrenceState, buildDateWithTime]);
  

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
      } : { useDefault: false, overrides: [] }
    };

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

    const action = selectedEvent
      ? updateEvent(selectedEvent.id, eventData)
      : createEvent(eventData);

    closeAndAnimateOut();

    action.catch((error) => {
      console.error('Failed to save event:', error);
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
    } else if (!notifications.find(n => n.minutes === minutes)) {
      setNotifications([...notifications, { method: 'popup', minutes }]);
    }
    setShowNotificationPicker(false);
  };
  
  const handleRemoveNotification = (minutes) => {
    setNotifications(notifications.filter(n => n.minutes !== minutes));
  };
  
  const formatNotificationLabel = (minutes) => {
    const option = notificationOptions.find(o => o.minutes === minutes);
    return option ? option.label : `${minutes} minutes before`;
  };
  
  return (
    <>
      {/* No overlay - calendar always stays in focus */}
      
      {/* Popover Modal */}
      <div 
        ref={modalRef}
        className={`fixed bg-white shadow-xl z-50 transition-all duration-200 ease-out
                   ${internalVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
        style={{
          ...modalPosition,
          width: '580px',
          maxHeight: '90vh',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          overflowY: 'auto',
          overflowX: 'visible'
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
          className="px-0 py-0"
        >
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
            <div className="px-4 pt-4 pb-2">
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="Add title"
                className="w-full px-0 py-1 text-xl font-semibold text-gray-900 border-none focus:outline-none focus:ring-0"
                ref={titleInputRef}
              />
              <div className="relative">
                <textarea
                  value={eventSubtitle}
                  onChange={(e) => setEventSubtitle(e.target.value)}
                  placeholder="Add description"
                  className="w-full px-0 py-1 pr-32 text-sm text-gray-500 border-none focus:outline-none focus:ring-0 resize-none overflow-hidden"
                  rows={1}
                  style={{ minHeight: '20px' }}
                  onInput={(e) => {
                    e.target.style.height = 'auto'
                    e.target.style.height = e.target.scrollHeight + 'px'
                  }}
                />
                <button 
                  type="submit"
                  disabled={(selectedEvent && !hasChanges) || (!!timeError && !isAllDay)}
                  className={`absolute right-0 top-0 px-4 py-1.5 text-sm rounded-md transition-colors font-medium ${
                    (selectedEvent && !hasChanges) || (!!timeError && !isAllDay)
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {selectedEvent ? 'Update event' : 'Create event'}
                </button>
              </div>
            </div>

            {/* Add guests */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-start gap-3">
                <FiUsers className="text-gray-400 mt-1" size={20} />
                <div className="flex-1 space-y-3">
                  <input
                    ref={participantInputRef}
                    type="email"
                    value={participantEmail}
                    onChange={(e) => setParticipantEmail(e.target.value)}
                    onKeyDown={handleParticipantKeyDown}
                    placeholder="Add guests"
                    className="w-full px-0 py-1 text-sm text-gray-900 bg-transparent border-none focus:outline-none focus:ring-0"
                  />
                    {participants.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                    {participants.map((email) => {
                      const bgColor = getParticipantColor(email)
                      const expanded = expandedChips.has(email)
                      return (
                        <div
                          key={email}
                            className="flex items-center gap-2"
                        >
                          <button
                            type="button"
                            onClick={() => toggleChip(email)}
                              className="w-8 h-8 rounded-full text-xs font-semibold text-white flex items-center justify-center focus:outline-none"
                            style={{ backgroundColor: bgColor }}
                            aria-label={`Toggle ${email}`}
                              title={email}
                          >
                            {getInitials(email)}
                          </button>
                            {expanded && (
                              <span className="text-xs text-gray-600">{email}</span>
                            )}
              </div>
                      )
                    })}
                  </div>
                  )}
                </div>
              </div>
            </div>

            {/* Add location and Google Meet */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <FiMapPin className="text-gray-400" size={20} />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Add location"
                  className="flex-1 px-0 py-1 text-sm text-gray-900 border-none focus:outline-none focus:ring-0"
                />
                  <button
                    type="button"
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 text-sm text-gray-700"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M23 11.5A11.5 11.5 0 1 1 11.5 0 11.5 11.5 0 0 1 23 11.5zm-4.5 0a7 7 0 1 0-7 7 7 7 0 0 0 7-7z"/>
                  </svg>
                  Google Meet
                  </button>
                      </div>
                    </div>

            {/* Time and Date */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-start gap-[9px]">
                <div className="flex flex-col gap-3 pt-0.5">
                <FiClock className="text-gray-400" size={20} />
                  <FiCalendar className="text-gray-400" size={20} />
                </div>
                <div className="flex-1 space-y-0">
                  <div className="space-y-2">
                    {!isAllDay ? (
                      <>
                        <div className="flex items-center gap-2 text-sm text-gray-900">
                        <div className="inline-flex items-center gap-2">
                        <input
                          type="time"
                          value={timeStart}
                          onChange={(e) => handleTimeStartChange(e.target.value)}
                            className="px-0 py-0.5 border-none focus:outline-none text-sm text-gray-900 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden"
                            style={{
                              WebkitAppearance: 'none',
                              MozAppearance: 'textfield',
                              width: '70px'
                            }}
                          />
                          <span className="text-gray-400 font-semibold ml-2">→</span>
                        <input
                          type="time"
                          value={timeEnd}
                          onChange={(e) => handleTimeEndChange(e.target.value)}
                            className="px-0 py-0 border-none focus:outline-none text-sm text-gray-900 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden"
                            style={{
                              WebkitAppearance: 'none',
                              MozAppearance: 'textfield',
                              width: '70px'
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
                      onChange={(e) => setEventDate(e.target.value)}
                      className="border-none focus:outline-none text-sm text-gray-900 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden"
                      style={{
                        WebkitAppearance: 'none',
                        MozAppearance: 'textfield',
                        padding: '4px 0',
                        paddingTop: '8px',
                        width: '85px'
                      }}
                    />
                    <span className="text-gray-400 font-semibold -ml-1.5">→</span>
                    <input
                      type="date"
                      value={eventEndDate}
                      min={eventDate}
                      onChange={(e) => setEventEndDate(e.target.value)}
                      className="border-none focus:outline-none text-sm text-gray-900 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-inner-spin-button]:hidden"
                      style={{
                        WebkitAppearance: 'none',
                        MozAppearance: 'textfield',
                        padding: '4px 0',
                        paddingTop: '8px',
                        width: '85px'
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
                
            {/* Bottom action bar with icons */}
            <div className="px-4 py-3 flex items-center gap-4 border-t border-gray-100">
              {/* Notification icon */}
              <div className="relative" ref={notificationPickerRef}>
                      <button
                        type="button"
              onClick={() => setShowNotificationPicker(!showNotificationPicker)}
              className="p-2 bg-gray-50 border border-gray-200 rounded-full text-gray-500 hover:bg-gray-100 transition-colors relative"
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
            {showNotificationPicker && (
              <div className="absolute bottom-full left-0 mb-2 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[200px] max-h-80 overflow-y-auto">
                {notificationOptions.map((option) => {
                  const isSelected = option.minutes === null 
                    ? notifications.length === 0
                    : notifications.some(n => n.minutes === option.minutes);
                  return (
                      <button
                      key={option.label}
                        type="button"
                      onClick={() => handleAddNotification(option.minutes)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                        isSelected ? 'bg-red-50 text-red-700 font-medium' : 'text-gray-700'
                      }`}
                    >
                      {isSelected && option.minutes !== null && (
                        <span className="mr-2">✓</span>
                      )}
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex-1"></div>

          {/* Show Going status for shared events only */}
          {selectedEvent?.inviteCanRespond && (
            <div className="relative">
                                <button
                                  type="button"
                onClick={() => setShowNotifyMembers(!showNotifyMembers)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ${
                  currentRSVPStatus === 'accepted' 
                    ? 'bg-green-100 text-green-700'
                    : currentRSVPStatus === 'declined'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${
                  currentRSVPStatus === 'accepted' 
                    ? 'bg-green-500'
                    : currentRSVPStatus === 'declined'
                    ? 'bg-red-500'
                    : 'bg-gray-400'
                }`}></div>
                <span>
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
              className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  ref={deleteButtonRef}
                >
              Delete event
                </button>
              )}
            </div>

        {/* Notify Members Checkbox */}
        {participants.length > 0 && !selectedEvent?.inviteCanRespond && (
          <div className="px-4 pb-3 flex items-center">
            <input 
              type="checkbox" 
              checked={showNotifyMembers}
              onChange={(e) => setShowNotifyMembers(e.target.checked)}
              className="h-3 w-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="ml-2 text-xs text-gray-600">Notify members</span>
          </div>
        )}
        </form>

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
    </>
  )
}

export default EventModal
