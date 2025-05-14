import { useState, useEffect, useCallback, useRef } from 'react'
import { format, parse } from 'date-fns'
import { 
  FiX, FiTrash2, FiUsers, FiMapPin, FiClock, FiCheckCircle, FiCheck, FiCalendar, FiChevronDown
  // Removed unused icons like FiVideo, FiRefreshCw, FiLock, FiBell, FiMoreHorizontal, FiBriefcase
} from 'react-icons/fi'
import { useCalendar } from '../../context/CalendarContext'

// Define color options directly
const COLOR_OPTIONS = [
  { id: 'blue', name: 'Blue', value: 'blue' },
  { id: 'green', name: 'Green', value: 'green' },
  { id: 'orange', name: 'Orange', value: 'orange' },
  { id: 'purple', name: 'Purple', value: 'purple' },
  { id: 'red', name: 'Red', value: 'red' }
];

const EventModal = () => {
  const { 
    selectedEvent, 
    closeEventModal: contextCloseEventModal, // Renamed to avoid conflict
    createEvent,
    updateEvent,
    deleteEvent,
    // currentDate, // Not directly used in this modal's state logic anymore for new events
    toggleEventComplete
  } = useCalendar()
  
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [timeStart, setTimeStart] = useState('10:30')
  const [timeEnd, setTimeEnd] = useState('11:45')
  const [color, setColor] = useState('blue')
  const [isAllDay, setIsAllDay] = useState(false)
  const [location, setLocation] = useState('')
  const [completed, setCompleted] = useState(false)
  const [internalVisible, setInternalVisible] = useState(false)
  const titleInputRef = useRef(null)

  useEffect(() => {
    // Animate in when the component is mounted
    requestAnimationFrame(() => {
      setInternalVisible(true);
    });
  }, []);

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
        
        // Toggle complete on 'd' key
        if (e.key === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey) {
          toggleEventComplete(selectedEvent.id);
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedEvent, closeAndAnimateOut, toggleEventComplete, deleteEvent, internalVisible]);
  
  useEffect(() => {
    let initialEventName = 'New Event';
    let initialEventDate = format(new Date(), 'yyyy-MM-dd');
    let initialTimeStart = '10:30';
    let initialTimeEnd = '11:45';
    let initialColor = 'blue';
    let initialIsAllDay = false;
    let initialLocation = '';
    let initialCompleted = false;

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
      initialCompleted = selectedEvent.completed || false;
    } else if (window.prefilledEventDates) {
      // Creating new event from drag-to-create/double-click with prefilled dates
      const { 
        startDate: dragStartDate, 
        endDate: dragEndDate, 
        title: dragTitle, 
        color: dragColor,
        isAllDay: dragIsAllDay,
        noAutoFocus
      } = window.prefilledEventDates;
      
      const startDateObj = dragStartDate instanceof Date ? dragStartDate : new Date(dragStartDate);
      const endDateObj = dragEndDate instanceof Date ? dragEndDate : new Date(dragEndDate);
      
      initialEventName = dragTitle || 'New Event';
      initialEventDate = format(startDateObj, 'yyyy-MM-dd');
      initialTimeStart = format(startDateObj, 'HH:mm');
      initialTimeEnd = format(endDateObj, 'HH:mm');
      initialColor = dragColor || 'blue';
      initialIsAllDay = dragIsAllDay || false;
    }
    
    setEventName(initialEventName);
    setEventDate(initialEventDate);
    setTimeStart(initialTimeStart);
    setTimeEnd(initialTimeEnd);
    setColor(initialColor);
    setIsAllDay(initialIsAllDay);
    setLocation(initialLocation);
    setCompleted(initialCompleted);

  }, [selectedEvent]); // Removed window.prefilledEventDates from deps, it's a global side effect. Consider context for this.
  
  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    
    const finalStartDateTime = isAllDay 
      ? parse(`${eventDate} 00:00`, 'yyyy-MM-dd HH:mm', new Date())
      : parse(`${eventDate} ${timeStart}`, 'yyyy-MM-dd HH:mm', new Date());
      
    const finalEndDateTime = isAllDay
      ? parse(`${eventDate} 23:59`, 'yyyy-MM-dd HH:mm', new Date())
      : parse(`${eventDate} ${timeEnd}`, 'yyyy-MM-dd HH:mm', new Date());

    const eventData = {
      title: eventName.trim() === '' ? (selectedEvent ? selectedEvent.title : 'New Event') : eventName,
      start: finalStartDateTime,
      end: finalEndDateTime,
      color,
      isAllDay,
      location,
      completed
    };
        
    if (selectedEvent) {
      updateEvent(selectedEvent.id, eventData);
    } else {
      createEvent(eventData);
    }
    
    closeAndAnimateOut();
  };
  
  const handleDelete = () => { // Ensure this is a stable function if used in useEffect deps
    if (selectedEvent) {
      deleteEvent(selectedEvent.id);
      closeAndAnimateOut();
    }
  };
  
  const handleToggleComplete = () => {
    if (selectedEvent) {
      toggleEventComplete(selectedEvent.id);
      setCompleted(!completed);
    } else {
      setCompleted(!completed);
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
  
  return (
    <>
      {/* Overlay background */}
      <div className={`fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity duration-300 ${internalVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
           onClick={closeAndAnimateOut}></div>
      
      {/* Bottom Sheet Modal */}
      <div 
        className={`fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-xl shadow-2xl z-50 transition-all duration-300 ease-in-out
                   ${internalVisible ? 'transform translate-y-0' : 'transform translate-y-full'}`}
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Checkmark/Complete button in top left */}
        <div className="absolute left-4 top-4">
          <button
            type="button"
            onClick={handleToggleComplete}
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              completed 
                ? 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-200' 
                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
            }`}
          >
            <FiCheckCircle size={18} />
          </button>
        </div>
        
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 ml-10">
            {selectedEvent ? 'Edit Event' : 'Create Event'}
          </h2>
          <button 
            type="button"
            onClick={closeAndAnimateOut}
            className="p-1 text-gray-500 dark:text-gray-400 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <FiX size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="px-5 py-4">
          <div className="space-y-5">
            {/* Event Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Event Name</label>
              <input
                ref={titleInputRef}
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="Add title"
                className="w-full px-3 py-2 text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
              <div className="relative">
                <div className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <FiCalendar className="text-gray-500 mr-2" />
                  <span className="flex-grow">{formatDateForDisplay(eventDate)}</span>
                  <FiChevronDown className="text-gray-500" />
                </div>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>
            </div>
            
            {/* Time Start/End */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time Start</label>
                <div className="relative">
                  <div className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <FiClock className="text-gray-500 mr-2" />
                    <span className="flex-grow">{formatTimeForDisplay(timeStart)}</span>
                    <FiChevronDown className="text-gray-500" />
                  </div>
                  <input
                    type="time"
                    value={timeStart}
                    onChange={(e) => setTimeStart(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    disabled={isAllDay}
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time End</label>
                <div className="relative">
                  <div className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    <FiClock className="text-gray-500 mr-2" />
                    <span className="flex-grow">{formatTimeForDisplay(timeEnd)}</span>
                    <FiChevronDown className="text-gray-500" />
                  </div>
                  <input
                    type="time"
                    value={timeEnd}
                    onChange={(e) => setTimeEnd(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    disabled={isAllDay}
                  />
                </div>
              </div>
            </div>
            
            {/* All Day Toggle */}
            <div className="flex items-center">
              <label className="inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isAllDay}
                  onChange={(e) => setIsAllDay(e.target.checked)}
                  className="form-checkbox h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">All day</span>
              </label>
            </div>
            
            {/* Participants */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Participants</label>
              <div className="flex items-center px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600">
                <FiUsers className="text-gray-500 mr-2" />
                <span className="text-gray-700 dark:text-gray-300">Add participants</span>
              </div>
            </div>
            
            {/* Color Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Color</label>
              <div className="flex items-center space-x-3">
                {COLOR_OPTIONS.map(opt => (
                  <button
                    type="button"
                    key={opt.id}
                    onClick={() => setColor(opt.value)}
                    className={`w-8 h-8 rounded-full transition-all ${
                      color === opt.value 
                        ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-600' 
                        : ''
                    }`}
                    style={{ backgroundColor: `var(--color-${opt.value}-500)` }}
                    title={opt.name}
                    aria-label={`Set color to ${opt.name}`}
                  />
                ))}
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="mt-6 flex justify-between pb-5">
            <button 
              type="button"
              onClick={closeAndAnimateOut}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            
            <div className="flex space-x-2">
              {selectedEvent && (
                <button 
                  type="button"
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-200 rounded-lg hover:bg-red-200 dark:hover:bg-red-800"
                >
                  Delete
                </button>
              )}
              <button 
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
              >
                {selectedEvent ? 'Save' : 'Create Event'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}

export default EventModal