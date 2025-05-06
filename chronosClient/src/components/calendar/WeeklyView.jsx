import { useState, useRef, useEffect } from 'react'
import { format, isSameDay, isToday, getHours, getMinutes, getDay, addDays } from 'date-fns'
import { useCalendar } from '../../context/CalendarContext'
import WeekEvent from '../events/WeekEvent'
import './WeeklyView.css'

const HOUR_HEIGHT = 60 // Height of one hour in pixels
const DAY_START_HOUR = 0 // Start displaying from 12 AM
const DAY_END_HOUR = 23 // End displaying at 11 PM

const WeeklyView = () => {
  const {
    currentDate,
    events,
    getDaysInWeek,
    navigateToNext,
    navigateToPrevious,
    selectDate,
    openEventModal
  } = useCalendar()
  
  const [days, setDays] = useState(getDaysInWeek(currentDate))
  const containerRef = useRef(null)
  const touchStartX = useRef(null)
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollThreshold = 50
  const timelineRef = useRef(null)
  
  // State for drag-to-create event functionality
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState(null)
  const [dragEnd, setDragEnd] = useState(null)
  const [dragDay, setDragDay] = useState(null)
  
  useEffect(() => {
    setDays(getDaysInWeek(currentDate))
  }, [currentDate, getDaysInWeek])
  
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
  
  // Basic drag-to-create functionality
  const handleMouseDown = (e, day, hour) => {
    if (e.button !== 0) return // Only handle left mouse button
    
    // Get minutes from mouse position for more precise time
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const minutePercentage = (relativeY % HOUR_HEIGHT) / HOUR_HEIGHT
    const minutes = Math.floor(minutePercentage * 60)
    
    // Set drag state with hour and minute precision
    setIsDragging(true)
    setDragDay(day)
    setDragStart(hour + (minutes / 60))
    setDragEnd(hour + (minutes / 60))
  }

  const handleMouseMove = (e, day, hour) => {
    if (!isDragging) return
    
    // Update the end hour with more precision
    // Get minutes from mouse position for more precise time
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const minutePercentage = (relativeY % HOUR_HEIGHT) / HOUR_HEIGHT
    const minutes = Math.floor(minutePercentage * 60)
    
    // Store both hour and minutes
    setDragEnd(hour + (minutes / 60))
  }

  const handleMouseUp = () => {
    if (!isDragging) return
    
    // Make sure start is before end
    const startValue = Math.min(dragStart, dragEnd)
    const endValue = Math.max(dragStart, dragEnd)
    
    // If drag is too small, default to 30 minutes
    const adjustedEndValue = (endValue === startValue) ? startValue + 0.5 : endValue
    
    // Extract hours and minutes
    const startHour = Math.floor(startValue)
    const startMinute = Math.floor((startValue - startHour) * 60)
    
    const endHour = Math.floor(adjustedEndValue)
    const endMinute = Math.floor((adjustedEndValue - endHour) * 60)
    
    // Create dates for the event
    const startDate = new Date(dragDay)
    startDate.setHours(startHour, startMinute, 0, 0)
    
    const endDate = new Date(dragDay)
    endDate.setHours(endHour, endMinute, 0, 0)
    
    // Create the event object
    const newEvent = {
      id: `temp-${Date.now()}`,
      title: 'New Event',
      start: startDate,
      end: endDate,
      color: 'blue'
    }
    
    // Open the event modal with our event data
    openEventModal(newEvent, true)
    
    // Reset drag state
    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
    setDragDay(null)
  }
  
  // Get events for this week - ensure we're using proper Date objects
  // Process events to ensure all date objects are properly instantiated
  const weekEvents = events.map(event => ({
    ...event,
    start: event.start instanceof Date ? event.start : new Date(event.start),
    end: event.end instanceof Date ? event.end : new Date(event.end)
  }))
  
  // Generate time slots
  const hours = []
  for (let i = DAY_START_HOUR; i <= DAY_END_HOUR; i++) {
    hours.push(i)
  }
  
  return (
    <div 
      ref={containerRef}
      className="view-container"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex w-full border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10 bg-white dark:bg-gray-800">
        <div className="w-16 text-center py-2 text-gray-500 border-r border-gray-200 dark:border-gray-700">
          GMT-7
        </div>
        {days.map((day, index) => {
          const dayNumber = format(day, 'd')
          const dayName = format(day, 'EEE')
          const isCurrentDay = isToday(day)
          
          return (
            <div 
              key={index}
              className={`flex-1 p-2 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700
                ${isCurrentDay ? 'font-semibold' : ''}
              `}
              onClick={() => selectDate(day)}
            >
              <div className="text-sm">{dayName} {dayNumber}</div>
            </div>
          )
        })}
      </div>
      
      <div className="relative flex flex-1">
        {/* Time labels */}
        <div className="w-16 flex-shrink-0 relative z-10 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          {hours.map((hour) => (
            <div 
              key={hour} 
              className="h-[60px] relative border-t border-gray-200 dark:border-gray-700"
            >
              <span className="absolute -top-2.5 left-2 text-xs text-gray-500">
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </span>
            </div>
          ))}
        </div>
        
        {/* Week grid */}
        <div className="flex-1 relative">
          {/* Horizontal time grid lines */}
          {hours.map((hour) => (
            <div 
              key={hour}
              className="time-grid-line"
              style={{ top: `${(hour - DAY_START_HOUR) * HOUR_HEIGHT}px` }}
            />
          ))}
          
          {/* Current time indicator - only shown for today */}
          {days.some(day => isToday(day)) && (
            <div 
              ref={timelineRef} 
              className="current-time-indicator"
            />
          )}
          
          {/* Day columns */}
          <div className="grid grid-cols-7 h-full">
            {days.map((day, dayIndex) => (
              <div 
                key={dayIndex}
                className="relative border-r border-gray-200 dark:border-gray-700 min-h-full"
                style={{ height: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px` }}
                onMouseUp={handleMouseUp}
              >
                {/* Hour cells for drag-to-create */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="hour-cell"
                    data-hour={hour}
                    data-day={format(day, 'yyyy-MM-dd')}
                    style={{
                      height: `${HOUR_HEIGHT}px`,
                      top: `${(hour - DAY_START_HOUR) * HOUR_HEIGHT}px`
                    }}
                    onMouseDown={(e) => handleMouseDown(e, day, hour)}
                    onMouseMove={(e) => handleMouseMove(e, day, hour)}
                  />
                ))}
                
                {/* Drag selection indicator */}
                {isDragging && dragDay && isSameDay(dragDay, day) && (
                  <div
                    className="drag-selection"
                    style={{
                      top: `${(Math.min(dragStart, dragEnd) - DAY_START_HOUR) * HOUR_HEIGHT}px`,
                      height: `${Math.abs(dragEnd - dragStart) * HOUR_HEIGHT || HOUR_HEIGHT/4}px`,
                      left: '2px',
                      right: '2px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(0, 122, 255, 0.3)',
                      border: '1px solid rgba(0, 122, 255, 0.5)',
                      pointerEvents: 'none', // Ensure it doesn't interfere with mouse events
                      zIndex: 10
                    }}
                  />
                )}
                
                {/* Events for this day */}
                {weekEvents
                  .filter(event => isSameDay(event.start, day))
                  .map(event => (
                    <WeekEvent 
                      key={event.id} 
                      event={event} 
                      hourHeight={HOUR_HEIGHT}
                      dayStartHour={DAY_START_HOUR}
                    />
                  ))
                }
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default WeeklyView