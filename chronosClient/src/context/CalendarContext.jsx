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

const initialEvents = [
  {
    id: '1',
    title: 'Meeting w/ Ely',
    start: new Date(2025, 3, 21, 7, 0),
    end: new Date(2025, 3, 21, 8, 0),
    color: 'orange'
  },
  {
    id: '2',
    title: 'Team Catch-up',
    start: new Date(2025, 3, 21, 8, 15),
    end: new Date(2025, 3, 21, 11, 0),
    color: 'blue'
  },
  {
    id: '3',
    title: 'Checkin w/ Pedra',
    start: new Date(2025, 3, 21, 15, 0),
    end: new Date(2025, 3, 21, 16, 0),
    color: 'blue'
  },
  {
    id: '4',
    title: 'Family Time',
    start: new Date(2025, 3, 20, 10, 0),
    end: new Date(2025, 3, 20, 13, 30),
    color: 'red'
  },
  {
    id: '5',
    title: 'Team Intro',
    start: new Date(2025, 3, 22, 8, 15),
    end: new Date(2025, 3, 22, 9, 30),
    color: 'green'
  },
  {
    id: '6',
    title: 'Task Presentation',
    start: new Date(2025, 3, 22, 10, 45),
    end: new Date(2025, 3, 22, 13, 30),
    color: 'green'
  },
  {
    id: '7',
    title: 'Product Meeting',
    start: new Date(2025, 3, 23, 9, 0),
    end: new Date(2025, 3, 23, 11, 30),
    color: 'orange'
  },
  {
    id: '8',
    title: 'Team Meeting',
    start: new Date(2025, 3, 23, 13, 30),
    end: new Date(2025, 3, 23, 14, 30),
    color: 'blue'
  },
  {
    id: '9',
    title: '1:1 w/ Tommy',
    start: new Date(2025, 3, 24, 9, 45),
    end: new Date(2025, 3, 24, 10, 45),
    color: 'purple'
  },
  {
    id: '10',
    title: 'Kick-off call',
    start: new Date(2025, 3, 24, 11, 0),
    end: new Date(2025, 3, 24, 11, 30),
    color: 'purple'
  },
  {
    id: '11',
    title: 'Weekly Review',
    start: new Date(2025, 3, 25, 8, 45),
    end: new Date(2025, 3, 25, 9, 45),
    color: 'blue'
  },
  {
    id: '12',
    title: 'Meeting w/ Mike',
    start: new Date(2025, 3, 25, 14, 30),
    end: new Date(2025, 3, 25, 15, 30),
    color: 'orange'
  },
  {
    id: '13',
    title: 'Family Time',
    start: new Date(2025, 3, 26, 7, 0),
    end: new Date(2025, 3, 26, 8, 0),
    color: 'red'
  }
]

export const CalendarProvider = ({ children }) => {
  const [currentDate, setCurrentDate] = useState(new Date()) // Always use today's date on refresh
  const [view, setView] = useState('month')
  const [headerDisplayDate, setHeaderDisplayDate] = useState(currentDate); // Date for header display, especially for month view scrolling
  const [events, setEvents] = useState(() => {
    const savedEvents = localStorage.getItem('calendarEvents')
    return savedEvents ? JSON.parse(savedEvents).map(event => ({
      ...event,
      start: new Date(event.start),
      end: new Date(event.end)
    })) : initialEvents
  })
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [showEventModal, setShowEventModal] = useState(false)

  // Save events to localStorage whenever they change
  useState(() => {
    localStorage.setItem('calendarEvents', JSON.stringify(events))
  }, [events])

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
      end: eventData.end instanceof Date ? eventData.end : new Date(eventData.end)
    };
    
    const newEvent = {
      id: uuidv4(),
      ...processedData
    }
    
    setEvents(prev => {
      const updatedEvents = [...prev, newEvent];
      // Update localStorage
      localStorage.setItem('calendarEvents', JSON.stringify(updatedEvents));
      return updatedEvents;
    });
    
    return newEvent
  }, [])

  const updateEvent = useCallback((id, updatedData) => {
    // Ensure dates are proper Date objects
    const processedData = {
      ...updatedData,
      start: updatedData.start instanceof Date ? updatedData.start : new Date(updatedData.start),
      end: updatedData.end instanceof Date ? updatedData.end : new Date(updatedData.end)
    };
    
    setEvents(prev => {
      const updatedEvents = prev.map(event => 
        event.id === id ? { ...event, ...processedData } : event
      );
      // Update localStorage for persistence
      localStorage.setItem('calendarEvents', JSON.stringify(updatedEvents));
      return updatedEvents;
    });
    
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
        color: event.color || 'blue'
      };
    } else {
      // Normal event editing
      setSelectedEvent(event);
      window.prefilledEventDates = null;
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