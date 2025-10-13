import { createContext, useContext, useState, useCallback } from 'react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  addWeeks,
  addDays,
  isSameDay,
  format,
  parse
} from 'date-fns'
import { v4 as uuidv4 } from 'uuid'

const CalendarContext = createContext()



export const CalendarProvider = ({ children }) => {
  const [currentDate, setCurrentDate] = useState(new Date()) // Always use today's date on refresh
  const [view, setView] = useState('month')
  const [headerDisplayDate, setHeaderDisplayDate] = useState(currentDate); // Date for header display, especially for month view scrolling
  const [events, setEvents] = useState([])
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showEventModal, setShowEventModal] = useState(false)


  const getDaysInMonth = useCallback((date) => {
    const start = startOfWeek(startOfMonth(date))
    const end = endOfWeek(endOfMonth(date))
    return eachDayOfInterval({ start, end })
  }, [])

  const getDaysInWeek = useCallback((date) => {
    const start = startOfWeek(date)
    const end = endOfWeek(date)
    return eachDayOfInterval({ start, end })
  }, [])

  const navigateToToday = useCallback(() => {
    setCurrentDate(new Date())
  }, [])

  const navigateToPrevious = useCallback(() => {
    setCurrentDate(date => {
      if (view === 'month') return addMonths(date, -1)
      if (view === 'week') return addWeeks(date, -1)
      return addDays(date, -1)
    })
  }, [view])

  const navigateToNext = useCallback(() => {
    setCurrentDate(date => {
      if (view === 'month') return addMonths(date, 1)
      if (view === 'week') return addWeeks(date, 1)
      return addDays(date, 1)
    })
  }, [view])

  const changeView = useCallback((newView) => {
    setView(newView)
  }, [])

  const selectDate = useCallback((date) => {
    setCurrentDate(date)
    setView('day')
  }, [])

  const getEventsForDate = useCallback((date) => {
    return events.filter(event => isSameDay(new Date(event.start), date))
  }, [events])

  const createEvent = useCallback((eventData) => {
    // Ensure dates are proper Date objects
    const processedData = {
      ...eventData,
      start: eventData.start instanceof Date ? eventData.start : new Date(eventData.start),
      end: eventData.end instanceof Date ? eventData.end : new Date(eventData.end),
      color: eventData.color || 'blue'
    };
    
    const newEvent = {
      id: uuidv4(),
      ...processedData
    }
    
    setEvents(prev => [...prev, newEvent]);
    
    return newEvent
  }, [])

  const updateEvent = useCallback((id, updatedData) => {
    // Ensure dates are proper Date objects
    const processedData = {
      ...updatedData,
      start: updatedData.start instanceof Date ? updatedData.start : new Date(updatedData.start),
      end: updatedData.end instanceof Date ? updatedData.end : new Date(updatedData.end)
    };
    
    setEvents(prev => 
      prev.map(event => 
        event.id === id ? { ...event, ...processedData } : event
      )
    );
    
    // Force a re-render by updating the current date slightly
    setCurrentDate(current => {
      // Create a completely new date object that's guaranteed to trigger a re-render
      const newDate = new Date(current.getTime() + 1);
      setTimeout(() => {
        // Reset it back after forcing the re-render
        setCurrentDate(new Date(current.getTime()));
      }, 10);
      return newDate;
    });
  }, [])

  const deleteEvent = useCallback((id) => {
    setEvents(prev => prev.filter(event => event.id !== id))
  }, [])

  const toggleEventComplete = useCallback((id) => {
    setEvents(prev => {
      const updatedEvents = prev.map(event => 
        event.id === id ? { ...event, completed: !event.completed } : event
      );
      
      // If the currently selected event is being toggled, update it
      if (selectedEvent && selectedEvent.id === id) {
        setSelectedEvent(prev => ({ ...prev, completed: !prev.completed }));
      }
      
      return updatedEvents;
    });
  }, [selectedEvent]);

  const openEventModal = useCallback((event = null, isNewEvent = false) => {
    // If this is a new drag-created event
    if (isNewEvent && event) {
      // Clone the date objects to avoid reference issues
      const exactStartDate = new Date(event.start.getTime());
      const exactEndDate = new Date(event.end.getTime());
      
      console.log('MODAL OPENING with drag event:', {
        start: exactStartDate.toLocaleString(),
        startHour: exactStartDate.getHours(),
        startMinute: exactStartDate.getMinutes(),
        end: exactEndDate.toLocaleString(),
        endHour: exactEndDate.getHours(),
        endMinute: exactEndDate.getMinutes()
      });
      
      // Set selected event to null since this is a new event
      setSelectedEvent(null);
      
      // Store exact times for the modal to use
      window.prefilledEventDates = {
        startDate: exactStartDate,
        endDate: exactEndDate,
        title: event.title || 'New Event',
        color: event.color || 'blue',
        noAutoFocus: true // Add flag to prevent auto-focusing
      };
    } else if (event) {
      // Normal event editing
      setSelectedEvent(event);
      window.prefilledEventDates = null;
    } else {
      // Called from the + Event button in header with no event
      setSelectedEvent(null);
      
      // Create a default new event starting at the current hour, lasting 1 hour
      const now = new Date();
      const startDate = new Date(now);
      startDate.setMinutes(0, 0, 0); // Round to the current hour
      
      const endDate = new Date(startDate);
      endDate.setHours(startDate.getHours() + 1); // 1 hour duration
      
      // Create default prefilled event
      window.prefilledEventDates = {
        startDate,
        endDate,
        title: 'New Event',
        color: 'blue'
      };
      
      console.log('Opening new event modal from button:', {
        start: startDate.toLocaleString(),
        end: endDate.toLocaleString()
      });
    }
    
    setShowEventModal(true);
  }, [])

  const closeEventModal = useCallback(() => {
    setSelectedEvent(null)
    setShowEventModal(false)
  }, [])

  const formatDateHeader = useCallback(() => {
    if (view === 'month') {
      // Use headerDisplayDate for month view header
      return format(headerDisplayDate, 'MMMM yyyy')
    }
    if (view === 'week') {
      const weekStart = startOfWeek(currentDate)
      const weekEnd = endOfWeek(currentDate)
      return `${format(currentDate, 'MMMM yyyy')}`
    }
    return format(currentDate, 'EEE MMMM d, yyyy')
  }, [currentDate, view, headerDisplayDate])

  const value = {
    currentDate,
    view,
    events,
    selectedEvent,
    showEventModal,
    headerDisplayDate, // Expose the state
    getDaysInMonth,
    getDaysInWeek,
    navigateToToday,
    navigateToPrevious,
    navigateToNext,
    changeView,
    selectDate,
    getEventsForDate,
    createEvent,
    updateEvent,
    deleteEvent,
    toggleEventComplete,
    openEventModal,
    closeEventModal,
    formatDateHeader,
    setHeaderDisplayDate // Expose the setter
  }

  return (
    <CalendarContext.Provider value={value}>
      {children}
    </CalendarContext.Provider>
  )
}

export const useCalendar = () => {
  const context = useContext(CalendarContext)
  if (!context) {
    throw new Error('useCalendar must be used within a CalendarProvider')
  }
  return context
}