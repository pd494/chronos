import { useState, useRef, useEffect, useMemo } from 'react'
import { format, isSameDay, isToday, getHours, getMinutes, getDay, addDays } from 'date-fns'
import { useCalendar } from '../../context/CalendarContext'
import { useTaskContext } from '../../context/TaskContext'
import WeekEvent from '../events/WeekEvent'
import Sortable from 'sortablejs'
import './WeeklyView.css'
import { calculateTimeGridLayout } from '../../lib/eventLayout'

const HOUR_HEIGHT = 60 // Height of one hour in pixels
const DAY_START_HOUR = 0 // Start displaying from 12 AM
const DAY_END_HOUR = 23 // End displaying at 11 PM
const ALL_DAY_SECTION_HEIGHT = 40 // Height of the all-day events section
const ALL_DAY_EVENT_HEIGHT = 30
const ALL_DAY_EVENT_GAP = 4
const TIMED_EVENT_GAP = 4
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
    openEventModal,
    getEventsForDate
  } = useCalendar()
  
  const { convertTodoToEvent } = useTaskContext()
  
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
    
    // Reset drag state immediately to prevent scroll issues
    const wasDragging = hasDraggedRef.current;
    const savedDragDay = dragDay;
    const savedDragStart = dragStart;
    const savedDragEnd = dragEnd;
    const savedDragInitial = dragInitialDayHourRef.current;
    
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    setDragDay(null);
    hasDraggedRef.current = false;
    dragInitialDayHourRef.current = null;

    if (wasDragging) {
      // It's a drag operation
      const startVal = Math.min(savedDragStart, savedDragEnd);
      let endVal = Math.max(savedDragStart, savedDragEnd);
      if (endVal === startVal) endVal = startVal + 0.5; // Default 30 min duration for tiny drag

      const eventStartDay = savedDragDay; 
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
      
      // Store drag position for inline modal (relative to viewport, not scroll)
      if (savedDragInitial) {
        const cellElement = document.querySelector(`[data-hour="${savedDragInitial.rawHour}"][data-day="${format(savedDragDay, 'yyyy-MM-dd')}"]`);
        if (cellElement) {
          const rect = cellElement.getBoundingClientRect();
          window.lastDragPosition = {
            top: rect.top,
            left: rect.right + 10
          };
        }
      }
      
      // Store the exact times for the modal to use
      window.prefilledEventDates = {
        startDate,
        endDate,
        title: 'New Event',
        color: '#3478F6'
      };
      
      openEventModal(newEvent, true);

    } else {
      // It was a click, not a drag. Do nothing for now, 
      // as double-click will handle event creation from a click.
      console.log('Click detected on hour cell, no action taken (awaiting double-click implementation).');
    }
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
    
    // Store position for inline modal
    const rect = e.currentTarget.getBoundingClientRect();
    window.lastDragPosition = {
      top: rect.top,
      left: rect.right + 10
    };
    
    // Store the exact times for the modal to use
    window.prefilledEventDates = {
      startDate,
      endDate,
      title: 'New Event',
      color: '#3478F6'
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
  
  // Get events for this week using the day-index cache for instant availability
  const weekEvents = useMemo(() => {
    if (!Array.isArray(days) || days.length === 0) return []

    const collected = new Map()

    for (const day of days) {
      const dailyEvents = typeof getEventsForDate === 'function'
        ? (getEventsForDate(day) || [])
        : []

      for (const ev of dailyEvents) {
        if (!ev || !ev.id) continue
        if (!collected.has(ev.id)) {
          const start = ev.start instanceof Date ? ev.start : new Date(ev.start)
          const end = ev.end instanceof Date ? ev.end : new Date(ev.end)
          collected.set(ev.id, {
            ...ev,
            start,
            end,
            isImported: Boolean(ev.source)
          })
        }
      }
    }

    return Array.from(collected.values())
  }, [days, getEventsForDate, events])
  
  // Split events into all-day and regular events
  const allDayEvents = useMemo(() => weekEvents.filter(event => {
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
  }), [weekEvents])
  
  const regularEvents = useMemo(() => weekEvents.filter(event => {
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
  }), [weekEvents])
  
  // Generate time slots
  const hours = []
  for (let i = DAY_START_HOUR; i <= DAY_END_HOUR; i++) {
    hours.push(i)
  }
  
  // Function to render an all-day event
  const renderAllDayEvent = (event, indexKey) => {
    // Ensure event has a color, default to blue if not present
    const eventColor = event.color || 'blue';
    
    // Check if color is a hex code (starts with #)
    const isHexColor = eventColor.startsWith('#');
    
    // Function to lighten a hex color for better appearance
    const lightenHexColor = (hex, percent = 30) => {
      hex = hex.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const lightenedR = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)));
      const lightenedG = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)));
      const lightenedB = Math.min(255, Math.floor(b + (255 - b) * (percent / 100)));
      return `#${lightenedR.toString(16).padStart(2, '0')}${lightenedG.toString(16).padStart(2, '0')}${lightenedB.toString(16).padStart(2, '0')}`;
    };
    
    // Function to darken a hex color for text/border
    const darkenHexColor = (hex, percent = 30) => {
      hex = hex.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      const darkenedR = Math.floor(r * (1 - percent / 100));
      const darkenedG = Math.floor(g * (1 - percent / 100));
      const darkenedB = Math.floor(b * (1 - percent / 100));
      return `#${darkenedR.toString(16).padStart(2, '0')}${darkenedG.toString(16).padStart(2, '0')}${darkenedB.toString(16).padStart(2, '0')}`;
    };
    
    const backgroundColor = isHexColor ? lightenHexColor(eventColor, 30) : `var(--color-${eventColor}-500)`;
    const textColor = isHexColor ? darkenHexColor(eventColor, 30) : `var(--color-${eventColor}-900)`;
    
    return (
      <div
        key={event.id || `${event.start.getTime()}-${event.title}-${indexKey}`}
        className="truncate rounded px-2 cursor-pointer text-xs flex items-center mb-1"
        style={{
          height: `${ALL_DAY_EVENT_HEIGHT}px`,
          backgroundColor: backgroundColor,
          opacity: 0.85,
          marginBottom: `${ALL_DAY_EVENT_GAP}px`,
        }}
        onClick={(e) => {
          e.stopPropagation();
          openEventModal(event);
        }}
      >
        <span 
          className="font-medium truncate"
          style={{ color: textColor }}
        >
          {event.title}
        </span>
      </div>
    );
  };
  
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
        onAdd: async function(evt) {
          const taskId = evt.item.getAttribute('data-task-id') || evt.item.getAttribute('data-id');
          const hour = parseInt(evt.to.getAttribute('data-hour'), 10);
          const dateStr = evt.to.getAttribute('data-date');
          
          // Remove the CLONE safely - defer to avoid conflicts with React
          setTimeout(() => {
            try {
              if (evt.item && evt.item.parentNode) {
                evt.item.parentNode.removeChild(evt.item);
              }
            } catch (e) {
              // Ignore - React may have already removed it
            }
          }, 0);
          
          if (taskId && !isNaN(hour) && dateStr) {
            // Parse the date string properly to avoid timezone issues
            const [year, month, day] = dateStr.split('-').map(Number);
            const startDate = new Date(year, month - 1, day, hour, 0, 0, 0);
            const endDate = new Date(year, month - 1, day, hour + 1, 0, 0, 0);
            
            try {
              await convertTodoToEvent(taskId, startDate, endDate, false);
            } catch (error) {
              console.error('Failed to convert todo to event:', error);
            }
          }
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
  }, [days, convertTodoToEvent]); // Re-run when days change
  
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
        onAdd: async function(evt) {
          const taskId = evt.item.getAttribute('data-task-id') || evt.item.getAttribute('data-id');
          const dateStr = evt.to.getAttribute('data-date');
          
          // Remove the CLONE safely - defer to avoid conflicts with React
          setTimeout(() => {
            try {
              if (evt.item && evt.item.parentNode) {
                evt.item.parentNode.removeChild(evt.item);
              }
            } catch (e) {
              // Ignore - React may have already removed it
            }
          }, 0);
          
          if (taskId && dateStr) {
            const [year, month, day] = dateStr.split('-').map(Number);
            const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
            const endDate = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
            
            try {
              await convertTodoToEvent(taskId, startDate, endDate, true);
            } catch (error) {
              console.error('Failed to convert todo to event:', error);
            }
          }
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
  }, [days, convertTodoToEvent]); // Re-run when days change
  
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
          {days.map((day, dayIndex) => {
            const eventsForDay = allDayEvents.filter(event => {
              if (!event.isImported && DAY_OFFSET !== 0) {
                const adjustedDay = new Date(day);
                adjustedDay.setDate(adjustedDay.getDate() - DAY_OFFSET);
                return isSameDay(event.start, adjustedDay);
              }
              return isSameDay(event.start, day);
            });

            const requiredHeight = Math.max(
              ALL_DAY_SECTION_HEIGHT,
              Math.max(1, eventsForDay.length) * (ALL_DAY_EVENT_HEIGHT + ALL_DAY_EVENT_GAP) - ALL_DAY_EVENT_GAP
            );

            return (
              <div 
                key={dayIndex}
                className="flex-1 relative border-r border-gray-200 dark:border-gray-700 droppable-cell"
                data-date={format(day, 'yyyy-MM-dd')}
                data-all-day="true"
                style={{ minHeight: `${requiredHeight}px`, padding: '4px' }}
                onClick={() => handleAllDayCellClick(day)}
              >
                {eventsForDay.map((event, idx) => renderAllDayEvent(event, idx))}
              </div>
            );
          })}
        </div>
      </div>
      
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
          <div 
            className="grid grid-cols-7 h-full" 
            onMouseUp={handleGridMouseUp}
            onMouseLeave={handleGridMouseUp}
          >
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
                {(() => {
                  const dayEvents = regularEvents
                    .filter(event => {
                    // For manual events (with offset), we need to adjust the comparison
                    // by comparing the day minus the offset to find events for the correct day
                    if (!event.isImported && DAY_OFFSET !== 0) {
                      const adjustedDay = new Date(day);
                      adjustedDay.setDate(adjustedDay.getDate() - DAY_OFFSET);
                      return isSameDay(event.start, adjustedDay);
                    }
                    // For imported events, no adjustment needed
                    return isSameDay(event.start, day);
                  });

                  const layouts = calculateTimeGridLayout(dayEvents);

                  return layouts.map(({ event, column, columns }) => (
                    <WeekEvent
                      key={event.id || `${(event.start instanceof Date ? event.start : new Date(event.start)).getTime()}-${column}-${columns}`}
                      event={{
                        ...event,
                        color: event.color || 'blue'
                      }}
                      hourHeight={HOUR_HEIGHT}
                      dayStartHour={DAY_START_HOUR}
                      position={{ column, columns, gap: TIMED_EVENT_GAP }}
                    />
                  ));
                })()}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default WeeklyView
