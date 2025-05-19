import { useState, useRef, useEffect } from 'react'
import { format, isSameDay, isToday, getHours, getMinutes, getDay, addDays } from 'date-fns'
import { useCalendar } from '../../context/CalendarContext'
import WeekEvent from '../events/WeekEvent'
import Sortable from 'sortablejs'
import './WeeklyView.css'

const HOUR_HEIGHT = 60 // Height of one hour in pixels
const DAY_START_HOUR = 0 // Start displaying from 12 AM
const DAY_END_HOUR = 23 // End displaying at 11 PM
const ALL_DAY_SECTION_HEIGHT = 40 // Height of the all-day events section
// This offset fixes the day alignment issue when dragging
// The offset is +1 to shift events one day forward (compensating for the one-day-behind issue)
// When integrating with external calendars (Google, Outlook, etc.):
// 1. Imported events should be tagged with a 'source' property
// 2. You may need to set this to 0 if imported events already show on the correct day
// 3. If you change timezone handling, review this offset
const DAY_OFFSET = 0

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
  
  const hasDraggedRef = useRef(false)
  const dragInitialDayHourRef = useRef(null)
  
  const hourCellsRef = useRef({});
  const allDayCellsRef = useRef({});
  
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
  
  const handleCellMouseDown = (e, day, hour) => {
    if (e.button !== 0) return
    
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const minutePercentage = (relativeY % HOUR_HEIGHT) / HOUR_HEIGHT
    const minutes = Math.floor(minutePercentage * 60)
    const preciseHour = hour + (minutes / 60)

    setIsDragging(true)
    setDragDay(day)
    setDragStart(preciseHour)
    setDragEnd(preciseHour)
    hasDraggedRef.current = false
    dragInitialDayHourRef.current = { day, hour: preciseHour, rawHour: hour, rawMinutes: minutes }
  }

  const handleCellMouseMove = (e, day, hour) => {
    if (!isDragging) return
    hasDraggedRef.current = true

    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const minutePercentage = (relativeY % HOUR_HEIGHT) / HOUR_HEIGHT
    const minutes = Math.floor(minutePercentage * 60)
    setDragEnd(hour + (minutes / 60))
  }

  const handleGridMouseUp = () => {
    if (!isDragging) return;

    if (hasDraggedRef.current) {
      // It's a drag operation
      const startVal = Math.min(dragStart, dragEnd);
      let endVal = Math.max(dragStart, dragEnd);
      if (endVal === startVal) endVal = startVal + 0.5; // Default 30 min duration for tiny drag

      const eventStartDay = dragDay; 
      const eventStartHour = Math.floor(startVal);
      const eventStartMinute = Math.floor((startVal - eventStartHour) * 60);
      const eventEndHour = Math.floor(endVal);
      const eventEndMinute = Math.floor((endVal - eventEndHour) * 60);
      
      const startDate = new Date(eventStartDay);
      startDate.setHours(eventStartHour, eventStartMinute, 0, 0);

      const endDate = new Date(eventStartDay); 
      endDate.setHours(eventEndHour, eventEndMinute, 0, 0);

      // Ensure end time is after start time
      if (endDate <= startDate) {
        endDate.setTime(startDate.getTime() + 30 * 60 * 1000); // Add 30 minutes
      }

      const newEvent = {
        id: `temp-${Date.now()}`,
        title: 'New Event',
        start: startDate,
        end: endDate,
        color: 'blue'
      };
      
      console.log('Opening modal for DRAGGED event:', {
        startDate: startDate.toLocaleTimeString(),
        endDate: endDate.toLocaleTimeString()
      });
      
      // Store the exact times for the modal to use
      window.prefilledEventDates = {
        startDate,
        endDate,
        title: 'New Event',
        color: 'blue'
      };
      
      openEventModal(newEvent, true);

    } else {
      // It was a click, not a drag. Do nothing for now, 
      // as double-click will handle event creation from a click.
      console.log('Click detected on hour cell, no action taken (awaiting double-click implementation).');
    }

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    setDragDay(null);
    hasDraggedRef.current = false;
    dragInitialDayHourRef.current = null;
  };
  
  const handleCellDoubleClick = (e, day, hour) => {
    if (e.button !== 0) return; // Only handle left mouse button double clicks

    // For a double click, we want the event to start at the beginning of the clicked hour slot
    const startHour = hour;
    const startMinute = 0;
    const endHour = hour + 1; // Default 1-hour duration
    const endMinute = 0;

    const startDate = new Date(day);
    startDate.setHours(startHour, startMinute, 0, 0);

    const endDate = new Date(day); 
    endDate.setHours(endHour, endMinute, 0, 0);

    const newEvent = {
      id: `temp-${Date.now()}`,
      title: 'New Event',
      start: startDate,
      end: endDate,
      color: 'blue'
    };
    
    // Store the exact times for the modal to use
    window.prefilledEventDates = {
      startDate,
      endDate,
      title: 'New Event',
      color: 'blue'
    };

    console.log('Opening modal for DOUBLE-CLICK event:', {
      startDate: startDate.toLocaleTimeString(),
      endDate: endDate.toLocaleTimeString()
    });
    openEventModal(newEvent, true); // true indicates it's a new event for the modal
  };
  
  // Handle creating an all-day event
  const handleAllDayCellClick = (day) => {
    const startDate = new Date(day);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(day);
    endDate.setHours(23, 59, 59, 999);

    const newEvent = {
      id: `temp-${Date.now()}`,
      title: 'New Event',
      start: startDate,
      end: endDate,
      color: 'blue',
      isAllDay: true
    };
    
    // Store the exact times for the modal to use
    window.prefilledEventDates = {
      startDate,
      endDate,
      title: 'New Event',
      color: 'blue',
      isAllDay: true
    };

    openEventModal(newEvent, true);
  };
  
  // Get events for this week - ensure we're using proper Date objects
  // Process events to ensure all date objects are properly instantiated
  const weekEvents = events.map(event => {
    // Create proper Date objects from event dates
    const start = event.start instanceof Date ? event.start : new Date(event.start)
    const end = event.end instanceof Date ? event.end : new Date(event.end)

    // If this is an imported event (has a source property), we don't apply the offset
    // This allows external calendar events to display correctly
    const isImported = Boolean(event.source) // Sources can be 'google', 'outlook', etc.

    return {
      ...event,
      start,
      end,
      // Flag to track if the event is imported - useful for future features
      isImported
    }
  })
  
  // Split events into all-day and regular events
  const allDayEvents = weekEvents.filter(event => 
    event.isAllDay || 
    (event.start.getHours() === 0 && event.start.getMinutes() === 0 && 
     event.end.getHours() === 23 && event.end.getMinutes() === 59)
  )
  
  const regularEvents = weekEvents.filter(event => 
    !event.isAllDay && 
    !(event.start.getHours() === 0 && event.start.getMinutes() === 0 && 
      event.end.getHours() === 23 && event.end.getMinutes() === 59)
  )
  
  // Generate time slots
  const hours = []
  for (let i = DAY_START_HOUR; i <= DAY_END_HOUR; i++) {
    hours.push(i)
  }
  
  // Function to render an all-day event
  const renderAllDayEvent = (event, dayIndex) => {
    // Ensure event has a color, default to blue if not present
    const eventColor = event.color || 'blue';
    
    return (
      <div
        key={event.id}
        className="absolute h-6 truncate rounded px-1 cursor-pointer text-xs z-10"
        style={{
          top: '4px',
          left: '2px',
          right: '2px',
          backgroundColor: `var(--color-${eventColor}-500)`,
          opacity: 0.8,
        }}
        onClick={() => openEventModal(event)}
      >
        <div 
          className="absolute left-0 top-0 bottom-0 w-1" 
          style={{ backgroundColor: `var(--color-${eventColor}-900)` }}
        ></div>
        <span 
          className="ml-2 font-medium"
          style={{ color: `var(--color-${eventColor}-900)` }}
        >
          {event.title}
        </span>
      </div>
    );
  };
  
  // Log events for debugging
  console.log('Week days:', days.map(day => format(day, 'yyyy-MM-dd')));
  console.log('Regular events:', regularEvents.map(e => ({ 
    id: e.id,
    title: e.title,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    color: e.color,
    isImported: e.isImported
  })));
  
  // Initialize Sortable for droppable hour cells
  useEffect(() => {
    const hourCells = document.querySelectorAll('.hour-cell');
    
    // Create sortable instances for each hour cell
    hourCells.forEach(cell => {
      const sortable = Sortable.create(cell, {
        group: {
          name: 'tasks',
          pull: false,
          put: true // Allow dropping into the cell
        },
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag-active',
        dragoverClass: 'sortable-dragover',
        onStart: function() {
          // Add a class to the body to indicate dragging is in progress
          document.body.classList.add('task-dragging');
        },
        onEnd: function() {
          // Remove the dragging indicator class
          document.body.classList.remove('task-dragging');
          
          // Clear any lingering dragover classes
          document.querySelectorAll('.sortable-dragover').forEach(el => {
            el.classList.remove('sortable-dragover');
          });
        },
        // Handle when a task is dragged over this cell
        onAdd: function(evt) {
          console.log('Task dropped on hour cell', evt.to.getAttribute('data-hour'));
        },
        sort: false, // Disable sorting within the cell
        delay: 0, // No delay for mobile
        delayOnTouchOnly: true // Only apply delay on touch devices
      });
      
      // Store the sortable instance for cleanup
      hourCellsRef.current[cell.getAttribute('data-hour') + cell.getAttribute('data-day')] = sortable;
    });
    
    // Cleanup function to destroy sortable instances
    return () => {
      Object.values(hourCellsRef.current).forEach(sortable => {
        if (sortable && sortable.destroy) sortable.destroy();
      });
      hourCellsRef.current = {};
    };
  }, [days]); // Re-run when days change
  
  // Initialize Sortable for droppable all-day cells
  useEffect(() => {
    const allDayCells = document.querySelectorAll('[data-all-day="true"]');
    
    // Create sortable instances for each all-day cell
    allDayCells.forEach((cell, index) => {
      const sortable = Sortable.create(cell, {
        group: {
          name: 'tasks',
          pull: false,
          put: true // Allow dropping into the cell
        },
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag-active',
        dragoverClass: 'sortable-dragover',
        onStart: function() {
          // Add a class to the body to indicate dragging is in progress
          document.body.classList.add('task-dragging');
        },
        onEnd: function() {
          // Remove the dragging indicator class
          document.body.classList.remove('task-dragging');
          
          // Clear any lingering dragover classes
          document.querySelectorAll('.sortable-dragover').forEach(el => {
            el.classList.remove('sortable-dragover');
          });
        },
        // Handle when a task is dragged over this cell
        onAdd: function(evt) {
          console.log('Task dropped on all-day cell', evt.to.getAttribute('data-date'));
        },
        sort: false, // Disable sorting within the cell
        delay: 0, // No delay for mobile
        delayOnTouchOnly: true // Only apply delay on touch devices
      });
      
      // Store the sortable instance for cleanup
      allDayCellsRef.current[index] = sortable;
    });
    
    // Cleanup function to destroy sortable instances
    return () => {
      Object.values(allDayCellsRef.current).forEach(sortable => {
        if (sortable && sortable.destroy) sortable.destroy();
      });
      allDayCellsRef.current = {};
    };
  }, [days]); // Re-run when days change
  
  return (
    <div 
      ref={containerRef}
      className="view-container"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex w-full border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
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
      
      {/* All-day events section */}
      <div className="flex w-full border-b border-gray-200 dark:border-gray-700 sticky top-[41px] bg-white dark:bg-gray-800">
        <div className="w-16 flex-shrink-0 text-center py-2 text-xs text-gray-500 border-r border-gray-200 dark:border-gray-700">
          All-day
        </div>
        <div className="flex flex-1">
          {days.map((day, dayIndex) => (
            <div 
              key={dayIndex}
              className="flex-1 relative border-r border-gray-200 dark:border-gray-700 droppable-cell"
              data-date={format(day, 'yyyy-MM-dd')}
              data-all-day="true"
              style={{ height: `${ALL_DAY_SECTION_HEIGHT}px` }}
              onClick={() => handleAllDayCellClick(day)}
            >
              {allDayEvents
                .filter(event => {
                  // Similar logic as regular events to handle day offset
                  if (!event.isImported && DAY_OFFSET !== 0) {
                    const adjustedDay = new Date(day);
                    adjustedDay.setDate(adjustedDay.getDate() - DAY_OFFSET);
                    return isSameDay(event.start, adjustedDay);
                  }
                  return isSameDay(event.start, day);
                })
                .map(event => renderAllDayEvent(event, dayIndex))
              }
            </div>
          ))}
        </div>
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
          <div className="grid grid-cols-7 h-full" onMouseUp={handleGridMouseUp}>
            {days.map((day, dayIndex) => (
              <div 
                key={dayIndex}
                className="relative border-r border-gray-200 dark:border-gray-700 min-h-full"
                style={{ height: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px` }}
              >
                {/* Hour cells for drag-to-create */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="hour-cell droppable-cell"
                    data-hour={hour}
                    data-day={format(day, 'yyyy-MM-dd')}
                    data-date={format(day, 'yyyy-MM-dd')}
                    style={{
                      height: `${HOUR_HEIGHT}px`,
                      top: `${(hour - DAY_START_HOUR) * HOUR_HEIGHT}px`
                    }}
                    onMouseDown={(e) => handleCellMouseDown(e, day, hour)}
                    onMouseMove={(e) => handleCellMouseMove(e, day, hour)}
                    onDoubleClick={(e) => handleCellDoubleClick(e, day, hour)}
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
                
                {/* Regular events for this day */}
                {regularEvents
                  .filter(event => {
                    // Check if this is the day we're looking for
                    const isMay14 = format(day, 'yyyy-MM-dd') === '2025-05-14';
                    if (isMay14) {
                      console.log('May 14 day:', format(day, 'yyyy-MM-dd'));
                      console.log('Event checking for May 14:', event.title, event.start, event.color);
                    }
                    
                    // For manual events (with offset), we need to adjust the comparison
                    // by comparing the day minus the offset to find events for the correct day
                    if (!event.isImported && DAY_OFFSET !== 0) {
                      const adjustedDay = new Date(day);
                      adjustedDay.setDate(adjustedDay.getDate() - DAY_OFFSET);
                      return isSameDay(event.start, adjustedDay);
                    }
                    // For imported events, no adjustment needed
                    return isSameDay(event.start, day);
                  })
                  .map(event => (
                    <WeekEvent 
                      key={event.id} 
                      event={{
                        ...event,
                        // Ensure color is always set
                        color: event.color || 'blue'
                      }} 
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