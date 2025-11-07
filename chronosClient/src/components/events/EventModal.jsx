import { useState, useEffect, useCallback, useRef } from 'react'
import { format, parse } from 'date-fns'
import { 
  FiX, FiTrash2, FiUsers, FiMapPin, FiClock, FiCalendar, FiChevronDown, FiPlus, FiCheck
} from 'react-icons/fi'
import { useCalendar } from '../../context/CalendarContext'

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
    deleteEvent,
    view
  } = useCalendar()
  
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [timeStart, setTimeStart] = useState('10:30')
  const [timeEnd, setTimeEnd] = useState('11:45')
  const [color, setColor] = useState('#3478F6')
  const [isAllDay, setIsAllDay] = useState(false)
  const [location, setLocation] = useState('')
  const [internalVisible, setInternalVisible] = useState(false)
  const [participants, setParticipants] = useState([])
  const [isAddingParticipant, setIsAddingParticipant] = useState(false)
  const [expandedChips, setExpandedChips] = useState(new Set())
  const [timeError, setTimeError] = useState('')
  const [participantEmail, setParticipantEmail] = useState('')
  const [showNotifyMembers, setShowNotifyMembers] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [modalPosition, setModalPosition] = useState({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerSide: 'left' })
  const [isFromDayClick, setIsFromDayClick] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const titleInputRef = useRef(null)
  const modalRef = useRef(null)
  const colorPickerRef = useRef(null)
  const participantInputRef = useRef(null)
  const initialValuesRef = useRef({})

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
  
  // Close modal when clicking outside (but not on events)
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if clicking on an event element (don't close if so)
      const clickedOnEvent = event.target.closest('[data-event-id]') || 
                            event.target.closest('.event-draggable') ||
                            event.target.closest('.event-indicator');
      
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
    let initialTimeStart = '10:30';
    let initialTimeEnd = '11:45';
    let initialColor = 'blue';
    let initialIsAllDay = false;
    let initialLocation = '';

    if (selectedEvent) {
      // Editing existing event
      const start = new Date(selectedEvent.start);
      const end = new Date(selectedEvent.end);
      
      initialEventName = selectedEvent.title || '';
      initialEventDate = format(start, 'yyyy-MM-dd');
      initialTimeStart = format(start, 'HH:mm');
      initialTimeEnd = format(end, 'HH:mm');
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
      initialTimeStart = format(startDateObj, 'HH:mm');
      initialTimeEnd = format(endDateObj, 'HH:mm');
      initialColor = dragColor || 'blue';
      initialIsAllDay = dragIsAllDay || false;
      
      // Set flag for whether to show date picker
      setIsFromDayClick(!!fromDayClick);
    }
    
    setEventName(initialEventName);
    setEventDate(initialEventDate);
    setTimeStart(initialTimeStart);
    setTimeEnd(initialTimeEnd);
    setColor(initialColor);
    setIsAllDay(initialIsAllDay);
    setLocation(initialLocation);
    
    // Store initial values for change detection
    const initialParticipants = selectedEvent?.participants || [];
    initialValuesRef.current = {
      eventName: initialEventName,
      eventDate: initialEventDate,
      timeStart: initialTimeStart,
      timeEnd: initialTimeEnd,
      color: initialColor,
      isAllDay: initialIsAllDay,
      location: initialLocation,
      participants: initialParticipants
    };
    setHasChanges(false);
    setParticipants(initialParticipants);
    setExpandedChips(new Set())
    setIsAddingParticipant(false)
    setParticipantEmail('')

  }, [selectedEvent])

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
  
  // Detect changes
  useEffect(() => {
    if (!selectedEvent) {
      setHasChanges(true); // New events always have changes
      return;
    }
    
    const initial = initialValuesRef.current;
    const participantsChanged = 
      JSON.stringify(participants.sort()) !== JSON.stringify((initial.participants || []).sort());
    
    const changed = 
      eventName !== initial.eventName ||
      eventDate !== initial.eventDate ||
      timeStart !== initial.timeStart ||
      timeEnd !== initial.timeEnd ||
      color !== initial.color ||
      isAllDay !== initial.isAllDay ||
      location !== initial.location ||
      participantsChanged;
    
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
  }, [selectedEvent, eventName, eventDate, timeStart, timeEnd, color, isAllDay, location, participants]);
  
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

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    
    let finalStartDateTime
    let finalEndDateTime

    if (isAllDay) {
      finalStartDateTime = buildDateWithTime(eventDate, '00:00') || new Date()
      finalStartDateTime.setHours(0, 0, 0, 0)
      finalEndDateTime = new Date(finalStartDateTime.getTime())
      finalEndDateTime.setHours(23, 59, 0, 0)
    } else {
      finalStartDateTime = buildDateWithTime(eventDate, timeStart) || new Date()
      finalEndDateTime = buildDateWithTime(eventDate, timeEnd)
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
      setTimeError('')
      return
    }
    const start = buildDateWithTime(eventDate, timeStart)
    const end = buildDateWithTime(eventDate, timeEnd)
    if (!start || !end) {
      setTimeError('')
      return
    }
    setTimeError(end <= start ? 'End time must be after start time' : '')
  }, [eventDate, timeStart, timeEnd, isAllDay, buildDateWithTime])
  
  const handleDelete = () => { // Ensure this is a stable function if used in useEffect deps
    if (selectedEvent) {
      deleteEvent(selectedEvent);
      closeAndAnimateOut();
    }
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
          width: '400px',
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
            
            {/* Date and Color Row */}
            <div className="grid grid-cols-[1.7fr_1fr] gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
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
              
              {/* Color Picker */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Color</label>
                <div className="relative" ref={colorPickerRef}>
                  <button
                    type="button"
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="flex items-center justify-center px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors w-full"
                  >
                    <div 
                      className="w-5 h-5 rounded-full" 
                      style={{ backgroundColor: color }}
                    />
                  </button>
                  {showColorPicker && (
                    <div className="absolute z-50 mt-1 p-2 bg-white rounded-lg shadow-lg border border-gray-200">
                      <div className="grid grid-cols-4 gap-2">
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
            </div>
            
            {/* Time Start/End */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Start</label>
                <input
                  type="time"
                  value={timeStart}
                  onChange={(e) => setTimeStart(e.target.value)}
                  disabled={isAllDay}
                  className="w-full px-3 py-1.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">End</label>
                <input
                  type="time"
                  value={timeEnd}
                  onChange={(e) => setTimeEnd(e.target.value)}
                  disabled={isAllDay}
                  className="w-full px-3 py-1.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                />
              </div>
            </div>
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
                        className="h-8 w-8 flex items-center justify-center bg-[#3478F6] text-white rounded-md hover:bg-[#2868E6] transition-colors flex-shrink-0"
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
          
          {/* Action Buttons */}
          <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-gray-100">
            <div className="flex space-x-1.5">
              {selectedEvent && (
                <button 
                  type="button"
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium"
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
      </div>
    </>
  )
}

export default EventModal
