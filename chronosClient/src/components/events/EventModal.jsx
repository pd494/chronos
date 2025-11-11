import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format, parse } from 'date-fns'
import { 
  FiX, FiTrash2, FiUsers, FiMapPin, FiClock, FiCalendar, FiChevronDown, FiPlus, FiCheck, FiRepeat
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
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [eventEndDate, setEventEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [timeStart, setTimeStart] = useState(DEFAULT_TIMED_START)
  const [timeEnd, setTimeEnd] = useState(DEFAULT_TIMED_END)
  const [color, setColor] = useState('#3478F6')
  const [isAllDay, setIsAllDay] = useState(true)
  const [location, setLocation] = useState('')
  const [internalVisible, setInternalVisible] = useState(false)
  const [participants, setParticipants] = useState([])
  const [isAddingParticipant, setIsAddingParticipant] = useState(false)
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
  const titleInputRef = useRef(null)
  const modalRef = useRef(null)
  const lastTimedRangeRef = useRef({ start: DEFAULT_TIMED_START, end: DEFAULT_TIMED_END })
  const colorPickerRef = useRef(null)
  const recurrencePickerRef = useRef(null)
  const recurrenceTriggerRef = useRef(null)
  const deleteButtonRef = useRef(null)
  const participantInputRef = useRef(null)
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
          setIsAddingParticipant(false)
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
      setIsAddingParticipant(false)
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
    setRecurrenceState(cloneRecurrenceState(recurrenceDetails.state))
    setRecurrenceDraft(cloneRecurrenceState(recurrenceDetails.state))
    setRecurrenceSummary(recurrenceDetails.summary)
    setShowRecurrencePicker(false)
    
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
      participants: initialParticipants,
      recurrenceRule: selectedEvent?.recurrenceRule || ''
    };
    setHasChanges(false);
    setParticipants(initialParticipants);
    setExpandedChips(new Set())
    setIsAddingParticipant(false)
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
      titleInputRef.current.select()
    }
  }, [internalVisible])

  useEffect(() => {
    if (isAddingParticipant && participantInputRef.current) {
      participantInputRef.current.focus({ preventScroll: true })
    }
  }, [isAddingParticipant])

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
    
    const anchorDate = buildDateWithTime(eventDate, timeStart) || new Date()
    const recurrencePayload = buildRecurrencePayload(recurrenceState, anchorDate)
    const recurrenceRule = recurrencePayload?.rule || ''
    const initialRecurrenceRule = initial.recurrenceRule || ''

    const changed = 
      eventName !== initial.eventName ||
      eventDate !== initial.eventDate ||
      eventEndDate !== initial.eventEndDate ||
      timeStart !== initial.timeStart ||
      timeEnd !== initial.timeEnd ||
      color !== initial.color ||
      isAllDay !== initial.isAllDay ||
      location !== initial.location ||
      participantsChanged ||
      recurrenceRule !== initialRecurrenceRule;
    
    setHasChanges(changed);
    
    // Auto-enable notifications when meaningful fields change (not color)
    // This matches Google Calendar behavior
    if (selectedEvent && participants.length > 0) {
      const meaningfulChange = 
        eventName !== initial.eventName ||
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
  }, [selectedEvent, eventName, eventDate, eventEndDate, timeStart, timeEnd, color, isAllDay, location, participants, recurrenceState, buildDateWithTime]);
  

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
    lastTimedRangeRef.current = {
      ...lastTimedRangeRef.current,
      start: nextValue
    }
  }, [ensureTimedMode, isAllDay])

  const handleTimeEndChange = useCallback((value) => {
    if (isAllDay) {
      ensureTimedMode()
    }
    const nextValue = value || DEFAULT_TIMED_END
    setTimeEnd(nextValue)
    lastTimedRangeRef.current = {
      ...lastTimedRangeRef.current,
      end: nextValue
    }
  }, [ensureTimedMode, isAllDay])

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

    const eventData = {
      title: eventName.trim() === '' ? (selectedEvent ? selectedEvent.title : 'New Event') : eventName,
      start: finalStartDateTime,
      end: finalEndDateTime,
      color,
      isAllDay,
      location,
      participants,
      sendNotifications: showNotifyMembers && participants.length > 0
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
  
  const formatDateForDisplay = (dateStr) => {
    try {
      const date = parse(dateStr, 'yyyy-MM-dd', new Date());
      return format(date, 'EEEE, MMM d');
    } catch {
      return 'Invalid Date';
    }
  };
  
  const handleAddParticipant = () => {
    const email = participantEmail.trim();
    if (email && email.includes('@') && !participants.includes(email)) {
      setParticipants([...participants, email]);
      setParticipantEmail('');
      setIsAddingParticipant(false);
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
          width: '460px',
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
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            Create Event
          </h2>
          <button 
            type="button"
            onClick={closeAndAnimateOut}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <FiX size={16} />
          </button>
        </div>
        
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
          className="px-6 py-2.5"
        >
          <div className="space-y-2">
            {/* Shared edit notice for attendee edits */}
            {selectedEvent && selectedEvent.viewerIsAttendee && !selectedEvent.viewerIsOrganizer && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm">
                Changes you make only update your view of this shared event.
              </div>
            )}

            {/* Event Name */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Event Name</label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="Event name"
                className="w-full px-3 py-2 text-base text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent truncate"
                ref={titleInputRef}
              />
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                {(isFromDayClick && !selectedEvent) ? (
                  // Static date display when created from day click (new event only)
                  <div className="flex items-center px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                    <FiCalendar className="text-gray-500 mr-2" size={14} />
                    <span className="flex-grow text-sm text-gray-900 truncate">{formatDateForDisplay(eventDate)}</span>
                  </div>
                ) : (
                  // Date picker when editing existing event or from + Event button
                  <div className="relative">
                    <div className="flex items-center px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                      <FiCalendar className="text-gray-500 mr-2" size={14} />
                      <span className="flex-grow text-sm text-gray-900 truncate">{formatDateForDisplay(eventDate)}</span>
                      <FiChevronDown className="text-gray-400" size={14} />
                    </div>
                    <input
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                <div className="relative">
                  <div className="flex items-center px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                    <FiCalendar className="text-gray-500 mr-2" size={14} />
                    <span className="flex-grow text-sm text-gray-900 truncate">{formatDateForDisplay(eventEndDate)}</span>
                    <FiChevronDown className="text-gray-400" size={14} />
                  </div>
                  <input
                    type="date"
                    value={eventEndDate}
                    min={eventDate}
                    onChange={(e) => setEventEndDate(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Color & Repeat */}
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 items-end">
              {/* Color Picker */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Color</label>
                <div className="relative" ref={colorPickerRef}>
                  <button
                    type="button"
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="flex items-center justify-center px-1.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors h-10 w-11"
                  >
                    <div 
                      className="w-5 h-5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  </button>
                  {showColorPicker && (
                    <div className="absolute z-50 mt-1 p-2 bg-white rounded-lg shadow-lg border border-gray-200">
                      <div className="grid grid-cols-4 gap-3">
                        {CATEGORY_COLORS.map((colorOption) => (
                          <button
                            key={colorOption}
                            type="button"
                            onClick={() => {
                              setColor(colorOption);
                              setShowColorPicker(false);
                            }}
                            className={`w-8 h-8 rounded-full transition-all hover:scale-110 ${
                              color === colorOption ? 'ring-2 ring-offset-2 ring-gray-400' : ''
                            }`}
                            style={{ backgroundColor: colorOption }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Recurrence */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Repeat</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={handleToggleRecurrencePicker}
                    className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors w-full h-10"
                    ref={recurrenceTriggerRef}
                  >
                    <FiRepeat className="text-gray-500" size={14} />
                    <span className={`text-sm truncate ${recurrenceState.enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                      {recurrenceSummary}
                    </span>
                    <FiChevronDown className="text-gray-400 ml-auto" size={14} />
                  </button>
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
                              <p className="text-sm font-semibold text-gray-900">Repeat</p>
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
                                </label>
                                {recurrenceDraft.yearlyMode === 'weekday' && (
                                  <div className="flex items-center gap-2 pl-6">
                                    <select
                                      value={recurrenceDraft.yearlyWeek}
                                      onChange={(e) => updateRecurrenceDraft({ yearlyWeek: parseInt(e.target.value, 10) || 1 })}
                                      className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                      {ORDINAL_SELECT_OPTIONS.map(({ value, label }) => (
                                        <option key={value} value={value}>{label}</option>
                                      ))}
                                    </select>
                                    <select
                                      value={recurrenceDraft.yearlyWeekday}
                                      onChange={(e) => updateRecurrenceDraft({ yearlyWeekday: e.target.value })}
                                      className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
                                    >
                                      {WEEKDAY_CODES.map((code) => (
                                        <option key={code} value={code}>{WEEKDAY_LABELS[code]}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-gray-600">Ends</label>
                            <div className="space-y-1 text-sm text-gray-700">
                              <label className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="recurrenceEnds"
                                  checked={recurrenceDraft.ends === 'never'}
                                  onChange={() => updateRecurrenceDraft({ ends: 'never' }, { forceEnable: false })}
                                />
                                Never
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="recurrenceEnds"
                                  checked={recurrenceDraft.ends === 'count'}
                                  onChange={() => updateRecurrenceDraft({ ends: 'count' }, { forceEnable: false })}
                                />
                                <span>After</span>
                                <input
                                  type="number"
                                  min="1"
                                  value={recurrenceDraft.count}
                                  onChange={(e) => updateRecurrenceDraft({ count: Math.max(1, parseInt(e.target.value, 10) || 1) }, { forceEnable: false })}
                                  className="w-16 px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  disabled={recurrenceDraft.ends !== 'count'}
                                />
                                <span>occurrences</span>
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name="recurrenceEnds"
                                  checked={recurrenceDraft.ends === 'until'}
                                  onChange={() => updateRecurrenceDraft({ ends: 'until', endDate: recurrenceDraft.endDate || format(recurrenceAnchorDate(), 'yyyy-MM-dd') }, { forceEnable: false })}
                                />
                                <span>On</span>
                                <input
                                  type="date"
                                  value={recurrenceDraft.endDate}
                                  onChange={(e) => updateRecurrenceDraft({ endDate: e.target.value }, { forceEnable: false })}
                                  className="flex-1 px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  disabled={recurrenceDraft.ends !== 'until'}
                                />
                              </label>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={handleCancelRecurrenceEdit}
                              className="px-3 py-1.5 text-sm text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleApplyRecurrence}
                              className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      )}
                      {recurrenceConfirmationVisible && (
                        <div
                          className="absolute -bottom-2 -right-2 rounded-full shadow-lg flex items-center justify-center"
                          style={{ width: '28px', height: '28px', backgroundColor: '#7C3AED', color: 'white' }}
                        >
                          <FiCheck size={16} />
                        </div>
                      )}
                    </div>
                  , document.body)}
                </div>
              </div>
            </div>
            
            {/* All-day toggle */}
            <div className="flex items-center gap-2">
              <input
                id="event-all-day-toggle"
                type="checkbox"
                checked={isAllDay}
                onChange={(e) => handleAllDayToggle(e.target.checked)}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="event-all-day-toggle" className="text-sm text-gray-700 select-none">
                All-day event
              </label>
            </div>

            {/* Time Start/End */}
            {isAllDay ? (
              <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 border border-dashed border-gray-200 rounded-lg text-sm text-gray-700">
                <FiClock className="text-blue-500" size={16} />
                <span className="flex-1">This event spans the entire day. Toggle off to pick custom hours.</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Start</label>
                  <input
                    type="time"
                    value={timeStart}
                    onChange={(e) => handleTimeStartChange(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">End</label>
                  <input
                    type="time"
                    value={timeEnd}
                    onChange={(e) => handleTimeEndChange(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}
            {!isAllDay && timeError && (
              <div className="text-xs text-red-600">{timeError}</div>
            )}
            
            {/* Participants */}
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <div className="flex items-center gap-1">
                  <label className="text-xs font-medium text-gray-700">Participants</label>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600">{participants.length}</span>
                </div>
                <div className="flex flex-1 items-center gap-2 min-h-[32px]">
                  {isAddingParticipant ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <input
                        ref={participantInputRef}
                        type="email"
                        value={participantEmail}
                        onChange={(e) => setParticipantEmail(e.target.value)}
                        onKeyDown={handleParticipantKeyDown}
                        placeholder="Add email address"
                        className="flex-1 min-w-[240px] px-3 py-1.5 h-8 text-sm text-gray-900 bg-gray-50 border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={handleAddParticipant}
                        className="h-8 w-8 flex items-center justify-center bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                        aria-label="Save participant"
                      >
                        <FiCheck size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setParticipantEmail('')
                          setIsAddingParticipant(false)
                        }}
                        className="h-8 w-8 flex items-center justify-center bg-gray-200 text-gray-600 rounded-md hover:bg-gray-300 transition-colors"
                        aria-label="Cancel add participant"
                      >
                        <FiX size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1">
                      <div
                        className={`flex gap-1.5 flex-1 items-center ${participants.length >= 5 ? 'overflow-x-auto' : 'flex-wrap overflow-visible'}`}
                      >
                        {participants.map((email) => {
                          const bgColor = getParticipantColor(email);
                          const expanded = expandedChips.has(email)
                          return (
                            <div
                              key={email}
                              className="group inline-flex items-center h-8 rounded-full flex-shrink-0 cursor-default select-none px-3"
                              style={{ backgroundColor: bgColor + '26' }}
                              title={email}
                            >
                              <button
                                type="button"
                                onClick={() => toggleChip(email)}
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0 focus:outline-none"
                                style={{ backgroundColor: bgColor, color: 'white' }}
                                aria-label={`Toggle ${email}`}
                              >
                                {getInitials(email)}
                              </button>
                              <div
                                className="ml-2 inline-flex items-center gap-1 transition-all duration-150"
                                style={{
                                  color: bgColor,
                                  maxWidth: expanded ? 200 : 0,
                                  opacity: expanded ? 1 : 0,
                                  overflow: 'hidden'
                                }}
                              >
                                <span className="text-xs font-medium whitespace-nowrap">{getHandle(email)}</span>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleRemoveParticipant(email) }}
                                  className="transition-opacity opacity-0 group-hover:opacity-100 flex-shrink-0"
                                  style={{ color: bgColor }}
                                  aria-label={`Remove ${email}`}
                                >
                                  <FiX size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingParticipant(true)
                          setExpandedChips(new Set())
                          setParticipantEmail('')
                        }}
                        className="h-8 w-8 flex items-center justify-center text-white rounded-md transition-colors flex-shrink-0 focus:outline-none"
                        style={{ backgroundColor: 'rgb(159, 134, 255)' }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = 'rgb(139, 114, 235)'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = 'rgb(159, 134, 255)'}
                        aria-label="Add participant"
                      >
                        <FiPlus size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Notify Members Checkbox */}
              {participants.length > 0 && (
                <div className="flex items-center mt-1.5">
                  <input 
                    type="checkbox" 
                    checked={showNotifyMembers}
                    onChange={(e) => setShowNotifyMembers(e.target.checked)}
                    className="h-3 w-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="ml-2 text-xs text-gray-700">Notify members</span>
                </div>
              )}
            </div>
          </div>
          
          {/* RSVP Controls */}
          {selectedEvent?.inviteCanRespond && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-sm font-semibold text-gray-900">Going?</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {RSVP_OPTIONS.map((option) => {
                    const isActive = currentRSVPStatus === option.value
                    const commonClasses = 'px-3.5 py-1.5 rounded-full border text-sm font-semibold transition-all flex items-center justify-center gap-1 min-w-[90px]'
                    let palette = 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                    if (option.value === 'accepted') {
                      palette = isActive
                        ? 'bg-[#9F86FF] text-white border-[#9F86FF]'
                        : 'bg-[rgba(159,134,255,0.15)] text-[#5c3fb3] border-[rgba(159,134,255,0.3)] hover:border-[#9F86FF]'
                    } else if (option.value === 'declined') {
                      palette = isActive
                        ? 'bg-[#F87171] text-white border-[#F87171]'
                        : 'bg-[rgba(248,113,113,0.15)] text-[#b91c1c] border-[rgba(248,113,113,0.25)] hover:border-[#F87171]'
                    } else if (isActive) {
                      palette = 'bg-gray-900 text-white border-gray-900'
                    }
                    const inactiveFade = isActive ? '' : ' opacity-55 hover:opacity-100'
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleInviteResponse(option.value)}
                        disabled={inviteResponseLoading}
                        className={`${commonClasses} ${palette}${inactiveFade}`}
                      >
                        {isActive && <FiCheck size={14} />}
                        {option.label}
                      </button>
                    )
                  })}
                  {inviteResponseLoading && (
                    <span className="text-xs text-gray-500">Saving…</span>
                  )}
                </div>
              </div>
              {inviteResponseError && (
                <p className="text-xs text-red-500 mt-2">{inviteResponseError}</p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-gray-100">
            <div className="flex space-x-1.5">
              {selectedEvent && (
                <button 
                  type="button"
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium"
                  ref={deleteButtonRef}
                >
                  Delete
                </button>
              )}
              <button 
                type="submit"
                disabled={(selectedEvent && !hasChanges) || (!!timeError && !isAllDay)}
                className={`px-6 py-2 rounded-lg transition-colors font-medium ${
                  (selectedEvent && !hasChanges) || (!!timeError && !isAllDay)
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {selectedEvent ? 'Update Event' : 'Create Event'}
              </button>
            </div>
          </div>
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
