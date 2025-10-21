import { useState, useRef, useEffect } from 'react'
import { format, getHours, getMinutes, addDays } from 'date-fns'
import { useCalendar } from '../../context/CalendarContext'
import DayEvent from '../events/DayEvent'

const HOUR_HEIGHT = 60 // Height of one hour in pixels
const DAY_START_HOUR = 0 // Start displaying from 12 AM
const DAY_END_HOUR = 23 // End displaying at 11 PM
const ALL_DAY_SECTION_HEIGHT = 40 // Height of the all-day events section

const DailyView = () => {
  const {
    currentDate,
    events,
    navigateToNext,
    navigateToPrevious,
    openEventModal
  } = useCalendar()
  
  const containerRef = useRef(null)
  const touchStartX = useRef(null)
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollThreshold = 50
  const timelineRef = useRef(null)
  
  useEffect(() => {
    // Scroll to current time on initial load
    if (containerRef.current) {
      const now = new Date()
      const currentHour = getHours(now)
      const currentMinute = getMinutes(now)
      
      if (currentHour >= DAY_START_HOUR && currentHour <= DAY_END_HOUR) {
        const scrollPosition = (currentHour - DAY_START_HOUR) * HOUR_HEIGHT + 
                             (currentMinute / 60) * HOUR_HEIGHT - 100
        containerRef.current.scrollTop = scrollPosition
      } else {
        containerRef.current.scrollTop = 60 // Scroll to 9 AM by default
      }
    }
  }, [])
  
  // Set up current time indicator
  useEffect(() => {
    const updateTimeline = () => {
      if (timelineRef.current) {
        const now = new Date()
        const currentHour = getHours(now)
        const currentMinute = getMinutes(now)
        const percentage = (currentHour - DAY_START_HOUR) + (currentMinute / 60)
        
        timelineRef.current.style.top = `${percentage * HOUR_HEIGHT}px`
      }
    }
    
    updateTimeline()
    const interval = setInterval(updateTimeline, 60000) // Update every minute
    
    return () => clearInterval(interval)
  }, [])
  
  // Handle scroll for infinite scrolling
  const handleWheel = (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > scrollThreshold) {
      if (isScrolling) return
      
      if (e.deltaX > scrollThreshold) {
        setIsScrolling(true)
        navigateToNext()
        setTimeout(() => setIsScrolling(false), 500)
      } else if (e.deltaX < -scrollThreshold) {
        setIsScrolling(true)
        navigateToPrevious()
        setTimeout(() => setIsScrolling(false), 500)
      }
      
      e.preventDefault()
    }
  }
  
  // Handle touch for mobile scrolling
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX
  }
  
  const handleTouchMove = (e) => {
    if (!touchStartX.current || isScrolling) return
    
    const touchX = e.touches[0].clientX
    const diff = touchStartX.current - touchX
    
    if (diff > scrollThreshold) {
      setIsScrolling(true)
      navigateToNext()
      touchStartX.current = null
      setTimeout(() => setIsScrolling(false), 500)
    } else if (diff < -scrollThreshold) {
      setIsScrolling(true)
      navigateToPrevious()
      touchStartX.current = null
      setTimeout(() => setIsScrolling(false), 500)
    }
  }
  
  const handleTouchEnd = () => {
    touchStartX.current = null
  }
  
  // Generate time slots
  const hours = []
  for (let i = DAY_START_HOUR; i <= DAY_END_HOUR; i++) {
    hours.push(i)
  }
  
  // Get events for this day
  const dayEvents = events.filter(event => {
    const eventDate = new Date(event.start)
    return (
      eventDate.getFullYear() === currentDate.getFullYear() &&
      eventDate.getMonth() === currentDate.getMonth() &&
      eventDate.getDate() === currentDate.getDate()
    )
  })
  
  // Split events into all-day and regular events
  const allDayEvents = dayEvents.filter(event => {
    // Check if explicitly marked as all-day
    if (event.isAllDay) return true;
    
    // Check if it spans the entire day (midnight to 11:59pm)
    if (event.start.getHours() === 0 && event.start.getMinutes() === 0 && 
        event.end.getHours() === 23 && event.end.getMinutes() === 59) {
      return true;
    }
    
    // Check if it's a very long event (23+ hours) - treat as all-day
    const durationMs = event.end - event.start;
    const durationHours = durationMs / (1000 * 60 * 60);
    if (durationHours >= 23) return true;
    
    return false;
  })
  
  const regularEvents = dayEvents.filter(event => {
    // Check if explicitly marked as all-day
    if (event.isAllDay) return false;
    
    // Check if it spans the entire day (midnight to 11:59pm)
    if (event.start.getHours() === 0 && event.start.getMinutes() === 0 && 
        event.end.getHours() === 23 && event.end.getMinutes() === 59) {
      return false;
    }
    
    // Check if it's a very long event (23+ hours) - treat as all-day
    const durationMs = event.end - event.start;
    const durationHours = durationMs / (1000 * 60 * 60);
    if (durationHours >= 23) return false;
    
    return true;
  })
  
  // Function to render an all-day event
  const renderAllDayEvent = (event) => {
    const eventColor = event.color || 'blue';
    
    return (
      <div
        key={event.id}
        className="truncate rounded px-2 cursor-pointer text-xs mb-1 relative flex items-center"
        style={{
          height: '32px', // 25% taller
          backgroundColor: `var(--color-${eventColor}-500)`,
          opacity: 0.8,
        }}
        onClick={() => openEventModal(event)}
      >
        <div 
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l" 
          style={{ backgroundColor: `var(--color-${eventColor}-900)` }}
        ></div>
        <span 
          className="ml-2 font-medium truncate"
          style={{ color: `var(--color-${eventColor}-900)` }}
        >
          {event.title}
        </span>
      </div>
    );
  };
  
  return (
    <div 
      ref={containerRef}
      className="view-container"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* All-day events section */}
      {allDayEvents.length > 0 && (
        <div className="flex w-full border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-20">
          <div className="w-16 flex-shrink-0 text-center py-2 text-xs text-gray-500 border-r border-gray-200 dark:border-gray-700">
            All-day
          </div>
          <div className="flex-1 p-2" style={{ minHeight: `${ALL_DAY_SECTION_HEIGHT + 10}px` }}>
            {allDayEvents.map(event => renderAllDayEvent(event))}
          </div>
        </div>
      )}
      
      <div className="relative flex flex-1">
        {/* Time labels */}
        <div className="w-16 flex-shrink-0 relative z-10 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          {hours.map((hour) => (
            <div 
              key={hour} 
              className="h-[60px] relative"
            >
              <span className="absolute left-2 text-xs text-gray-500" style={{ top: hour === 0 ? '4px' : '-10px' }}>
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </span>
            </div>
          ))}
        </div>
        
        {/* Day grid */}
        <div className="flex-1 relative">
          {/* Horizontal time grid lines */}
          {hours.map((hour) => (
            <div 
              key={hour}
              className="time-grid-line"
              style={{ 
                top: `${(hour - DAY_START_HOUR) * HOUR_HEIGHT}px`,
                left: '0',
                right: '0'
              }}
            />
          ))}
          
          {/* Current time indicator */}
          <div 
            ref={timelineRef} 
            className="current-time-indicator"
          />
          
          {/* Day column */}
          <div 
            className="relative min-h-full w-full"
            style={{ height: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px` }}
          >
            {/* Events for this day (only regular events, not all-day) */}
            {regularEvents.map(event => (
              <DayEvent 
                key={event.id} 
                event={event} 
                hourHeight={HOUR_HEIGHT}
                dayStartHour={DAY_START_HOUR}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DailyView