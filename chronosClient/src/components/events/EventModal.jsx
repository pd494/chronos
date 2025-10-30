import { useState, useEffect, useCallback, useRef } from 'react'
import { format, parse } from 'date-fns'
import { 
  FiX, FiTrash2, FiUsers, FiMapPin, FiClock, FiCalendar, FiChevronDown, FiPlus
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

// Helper to get color for participant avatar
const getParticipantColor = (email) => {
  const colors = ['bg-purple-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-pink-500', 'bg-indigo-500'];
  const index = email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return colors[index];
};

// Get modal position based on view type and clicked element
const getModalPosition = (view) => {
  const modalWidth = 400;
  const modalHeight = 500;
  
  // For weekly/daily views, position inline where dragged
  if (view === 'week' || view === 'day') {
    const dragPosition = window.lastDragPosition;
    if (dragPosition) {
      // Center vertically in viewport
      const viewportHeight = window.innerHeight;
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const centerY = scrollTop + (viewportHeight / 2) - (modalHeight / 2);
      
      // Calculate left/right position
      const spaceOnRight = window.innerWidth - dragPosition.left;
      let left, pointerSide;
      
      if (spaceOnRight >= modalWidth + 20) {
        left = dragPosition.left;
        pointerSide = 'left';
      } else {
        left = dragPosition.left - modalWidth - 10;
        pointerSide = 'right';
      }
      
      // Ensure modal stays within horizontal bounds
      if (left + modalWidth > window.innerWidth) {
        left = window.innerWidth - modalWidth - 20;
        pointerSide = 'right';
      }
      if (left < 20) {
        left = 20;
        pointerSide = 'left';
      }
      
      return { 
        top: `${Math.max(20, centerY)}px`, 
        left: `${left}px`,
        pointerSide
      };
    }
  }
  
  // For monthly view, position next to clicked day
  const clickedElement = window.lastClickedCalendarDay;
  if (!clickedElement) {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerSide: 'left' };
  }
  
  const rect = clickedElement.getBoundingClientRect();
  
  // Calculate if modal should be on left or right
  const spaceOnRight = window.innerWidth - rect.right;
  const spaceOnLeft = rect.left;
  
  let left, pointerSide;
  
  if (spaceOnRight >= modalWidth + 20) {
    // Position on right
    left = rect.right + 10;
    pointerSide = 'left';
  } else if (spaceOnLeft >= modalWidth + 20) {
    // Position on left
    left = rect.left - modalWidth - 10;
    pointerSide = 'right';
  } else {
    // Not enough space, position on left side
    left = rect.left - modalWidth - 10;
    pointerSide = 'right';
  }
  
  // Ensure modal stays within horizontal bounds
  if (left + modalWidth > window.innerWidth) {
    left = window.innerWidth - modalWidth - 20;
  }
  if (left < 20) {
    left = 20;
  }
  
  // Center vertically in viewport
  const viewportHeight = window.innerHeight;
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const centerY = scrollTop + (viewportHeight / 2) - (modalHeight / 2);
  
  return { top: `${Math.max(20, centerY)}px`, left: `${left}px`, pointerSide };
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
  const [participantEmail, setParticipantEmail] = useState('')
  const [showNotifyMembers, setShowNotifyMembers] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [modalPosition, setModalPosition] = useState({ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerSide: 'left' })
  const [isFromDayClick, setIsFromDayClick] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const titleInputRef = useRef(null)
  const modalRef = useRef(null)
  const colorPickerRef = useRef(null)
  const initialValuesRef = useRef({})

  useEffect(() => {
    // Set modal position and animate in when the component is mounted
    setModalPosition(getModalPosition(view));
    requestAnimationFrame(() => {
      setInternalVisible(true);
    });
    
    // Prevent horizontal scrolling
    document.body.style.overflowX = 'hidden';
    
    return () => {
      document.body.style.overflowX = '';
    };
  }, [view]);
  
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

  const closeAndAnimateOut = useCallback(() => {
    setInternalVisible(false);
    setTimeout(() => {
      window.prefilledEventDates = null; // Clear prefilled dates on close
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
    initialValuesRef.current = {
      eventName: initialEventName,
      eventDate: initialEventDate,
      timeStart: initialTimeStart,
      timeEnd: initialTimeEnd,
      color: initialColor,
      isAllDay: initialIsAllDay,
      location: initialLocation
    };
    setHasChanges(false);
    setParticipants(selectedEvent?.participants || []);

  }, [selectedEvent])

  useEffect(() => {
    if (!internalVisible) return
    if (titleInputRef.current) {
      titleInputRef.current.focus({ preventScroll: true })
      titleInputRef.current.select()
    }
  }, [internalVisible])
  
  // Detect changes
  useEffect(() => {
    if (!selectedEvent) {
      setHasChanges(true); // New events always have changes
      return;
    }
    
    const initial = initialValuesRef.current;
    const changed = 
      eventName !== initial.eventName ||
      eventDate !== initial.eventDate ||
      timeStart !== initial.timeStart ||
      timeEnd !== initial.timeEnd ||
      color !== initial.color ||
      isAllDay !== initial.isAllDay ||
      location !== initial.location;
    
    setHasChanges(changed);
  }, [selectedEvent, eventName, eventDate, timeStart, timeEnd, color, isAllDay, location]);
  
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
        finalEndDateTime = new Date(finalStartDateTime.getTime() + 30 * 60 * 1000)
      }
    }

    const eventData = {
      title: eventName.trim() === '' ? (selectedEvent ? selectedEvent.title : 'New Event') : eventName,
      start: finalStartDateTime,
      end: finalEndDateTime,
      color,
      isAllDay,
      location,
      participants
    };
        
    const action = selectedEvent
      ? updateEvent(selectedEvent.id, eventData)
      : createEvent(eventData);

    closeAndAnimateOut();

    action.catch((error) => {
      console.error('Failed to save event:', error);
    });
  };
  
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
    }
  };
  
  const handleRemoveParticipant = (email) => {
    setParticipants(participants.filter(p => p !== email));
  };
  
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
          maxHeight: '500px',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          overflowY: 'hidden',
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
                top: '24px',
                borderTop: '8px solid transparent',
                borderBottom: '8px solid transparent',
                borderRight: '8px solid #e5e7eb'
              }}
            />
            <div 
              className="absolute w-0 h-0 z-10"
              style={{
                left: '-7px',
                top: '24px',
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
                top: '24px',
                borderTop: '8px solid transparent',
                borderBottom: '8px solid transparent',
                borderLeft: '8px solid #e5e7eb'
              }}
            />
            <div 
              className="absolute w-0 h-0 z-10"
              style={{
                right: '-7px',
                top: '24px',
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
                ref={titleInputRef}
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="TreeDocs Team Sync"
                className="w-full px-3 py-1.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {/* Date */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
              {(isFromDayClick && !selectedEvent) ? (
                // Static date display when created from day click (new event only)
                <div className="flex items-center px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
                  <FiCalendar className="text-gray-500 mr-2" size={14} />
                  <span className="flex-grow text-sm text-gray-900">{formatDateForDisplay(eventDate)}</span>
                </div>
              ) : (
                // Date picker when editing existing event or from + Event button
                <div className="relative">
                  <div className="flex items-center px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                    <FiCalendar className="text-gray-500 mr-2" size={14} />
                    <span className="flex-grow text-sm text-gray-900">{formatDateForDisplay(eventDate)}</span>
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
            
            {/* Color Picker */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Color</label>
              <div className="relative" ref={colorPickerRef}>
                <button
                  type="button"
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  className="flex items-center px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors w-full"
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
            
            {/* Participants */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-700">Participants</label>
                {participants.length > 0 && (
                  <span className="text-xs text-gray-500">{participants.length}</span>
                )}
              </div>
              
              {/* Participant Avatars */}
              {participants.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {participants.map((email) => (
                    <div key={email} className="flex items-center space-x-1 bg-gray-100 rounded-full px-2 py-0.5">
                      <div className={`w-4 h-4 rounded-full ${getParticipantColor(email)} flex items-center justify-center text-white text-xs font-medium`}>
                        {getInitials(email)}
                      </div>
                      <span className="text-xs text-gray-700">{email.split('@')[0]}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveParticipant(email)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <FiX size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Add Participant Input */}
              <div className="flex items-center space-x-1.5">
                <input
                  type="email"
                  value={participantEmail}
                  onChange={(e) => setParticipantEmail(e.target.value)}
                  onKeyDown={handleParticipantKeyDown}
                  placeholder="Add email address"
                  className="flex-1 px-3 py-1.5 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={handleAddParticipant}
                  className="p-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <FiPlus size={14} />
                </button>
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
                disabled={selectedEvent && !hasChanges}
                className={`px-6 py-2 rounded-lg transition-colors font-medium ${
                  selectedEvent && !hasChanges
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
