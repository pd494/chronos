import { useState, useRef, useEffect, useMemo } from 'react'
import { format, getHours, getMinutes, addDays } from 'date-fns'
import { useCalendar } from '../../context/CalendarContext'
import { useTaskContext } from '../../context/TaskContext'
import DayEvent from '../events/DayEvent'
import AllDayEvent from '../events/AllDayEvent'
import Sortable from 'sortablejs'
import { calculateTimeGridLayout } from '../../lib/eventLayout'
import './DailyView.css'

const HOUR_HEIGHT = 60 // Height of one hour in pixels
const DAY_START_HOUR = 0 // Start displaying from 12 AM
const DAY_END_HOUR = 23 // End displaying at 11 PM
const ALL_DAY_SECTION_HEIGHT = 40 // Height of the all-day events section
const ALL_DAY_EVENT_HEIGHT = 30
const ALL_DAY_EVENT_GAP = 4
const TIMED_EVENT_GAP = 4
const SNAP_INTERVAL_MINUTES = 5
const MAX_SNAP_MINUTES = (DAY_END_HOUR * 60) + SNAP_INTERVAL_MINUTES
const clampSnapMinutes = (minutes) => Math.max(0, Math.min(minutes, MAX_SNAP_MINUTES))
const snapMinutesToLatestHalfHour = (totalMinutes) => {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return 0
  return clampSnapMinutes(Math.floor(totalMinutes / SNAP_INTERVAL_MINUTES) * SNAP_INTERVAL_MINUTES)
}
const snapHourValue = (hourValue) => {
  if (hourValue == null) return null
  const totalMinutes = Math.max(0, hourValue) * 60
  return snapMinutesToLatestHalfHour(totalMinutes) / 60
}
const snapHourMinutePair = (hour, minutes = 0) => {
  const snappedMinutes = snapMinutesToLatestHalfHour((hour * 60) + minutes)
  const snappedHour = Math.floor(snappedMinutes / 60)
  const snappedMinute = snappedMinutes % 60
  return { hour: snappedHour, minutes: snappedMinute }
}
const DRAG_DISTANCE_THRESHOLD = 0.08 // ~5 minutes to start the preview

const DailyView = () => {
  const {
    currentDate,
    events,
    navigateToNext,
    navigateToPrevious,
    openEventModal,
    getEventsForDate,
    updateEvent
  } = useCalendar()
  
  const { convertTodoToEvent } = useTaskContext()
  
  const containerRef = useRef(null)
  const touchStartX = useRef(null)
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollThreshold = 50
  const timelineRef = useRef(null)
  
  // State for drag-to-create event functionality
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState(null)
  const [dragEnd, setDragEnd] = useState(null)
  const hasDraggedRef = useRef(false)
  const dragTimeoutRef = useRef(null)
  const dragInitialHourRef = useRef(null)
  
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

  // Handle dropping an existing event onto a specific hour cell (preserve duration)
  const handleEventDrop = (e, hour) => {
    e.preventDefault();
    e.stopPropagation();

    const eventData = e.dataTransfer.getData('event');
    if (!eventData) return;

    try {
      const draggedEvent = JSON.parse(eventData);
      const oldStart = new Date(draggedEvent.start);
      const oldEnd = new Date(draggedEvent.end);
      const rawDurationMs = Math.max(1, oldEnd.getTime() - oldStart.getTime());
      const ONE_HOUR = 60 * 60 * 1000;
      const durationMs = (draggedEvent.isAllDay || rawDurationMs >= 23 * ONE_HOUR)
        ? ONE_HOUR
        : rawDurationMs;

      // Minute precision based on cursor position in the hour cell
      const rect = e.currentTarget.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const minutePercentage = Math.min(1, Math.max(0, (relativeY % HOUR_HEIGHT) / HOUR_HEIGHT));
      const minutes = Math.floor(minutePercentage * 60);
      const { hour: snappedHour, minutes: snappedMinutes } = snapHourMinutePair(hour, minutes);

      const newStart = new Date(currentDate);
      newStart.setHours(snappedHour, snappedMinutes, 0, 0);
      const newEnd = new Date(newStart.getTime() + durationMs);

      // Optimistically update via context
      updateEvent(draggedEvent.id, {
        ...draggedEvent,
        start: newStart,
        end: newEnd,
        isAllDay: false,
      });
    } catch (error) {
      console.error('Error dropping event onto day hour cell:', error);
    }

    clearEventDragPreview();
  };

  const emitDragPreviewUpdate = (startDate, endDate) => {
    if (typeof window === 'undefined') return
    const dragMeta = window.__chronosDraggedEventMeta || null
    if (!dragMeta?.id) return
    window.dispatchEvent(new CustomEvent('chronos-drag-preview', {
      detail: {
        id: dragMeta.id,
        start: startDate ? startDate.toISOString() : null,
        end: endDate ? endDate.toISOString() : null
      }
    }))
  }
  const updateEventDragPreview = (e, hourCell, hour) => {
    if (!hourCell) {
      clearEventDragPreview()
      return
    }
    const rect = hourCell.getBoundingClientRect()
    const relativeY = Math.min(rect.height, Math.max(0, e.clientY - rect.top))
    const minutePercentage = rect.height ? relativeY / rect.height : 0
    const minutes = Math.floor(minutePercentage * 60)
    const { hour: snappedHour, minutes: snappedMinutes } = snapHourMinutePair(hour, minutes)
    const dragMeta = typeof window !== 'undefined' ? window.__chronosDraggedEventMeta : null
    if (!dragMeta) {
      emitDragPreviewUpdate(null, null)
      return
    }
    const durationMs = dragMeta.durationMs || 60 * 60 * 1000
    const newStart = new Date(currentDate)
    newStart.setHours(snappedHour, snappedMinutes, 0, 0)
    const newEnd = new Date(newStart.getTime() + durationMs)
    emitDragPreviewUpdate(newStart, newEnd)
  };

  const clearEventDragPreview = () => emitDragPreviewUpdate(null, null);
  const resetPreviewIfNoTarget = () => {
    clearEventDragPreview();
  };

  const handleHourCellDragOver = (e, hour) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    updateEventDragPreview(e, e.currentTarget, hour);
  };
  const handleAllDayDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearEventDragPreview();
  };

  const handleDragLeave = () => {
    resetPreviewIfNoTarget();
  };

  const handleAllDayEventDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const eventData = e.dataTransfer.getData('event');
    if (!eventData) return;

    try {
      const draggedEvent = JSON.parse(eventData);
      const oldStart = new Date(draggedEvent.start);
      const oldEnd = new Date(draggedEvent.end);
      const durationMs = Math.max(30 * 60 * 1000, oldEnd.getTime() - oldStart.getTime());

      const newStart = new Date(currentDate);
      newStart.setHours(0, 0, 0, 0);
      const msInDay = 24 * 60 * 60 * 1000;
      let newEnd;

      if (draggedEvent.isAllDay) {
        const daySpan = Math.max(1, Math.round(durationMs / msInDay) || 1);
        newEnd = new Date(newStart.getTime() + daySpan * msInDay);
      } else {
        newEnd = new Date(newStart.getTime() + msInDay);
      }

      updateEvent(draggedEvent.id, {
        ...draggedEvent,
        start: newStart,
        end: newEnd,
        isAllDay: true,
      });
    } catch (error) {
      console.error('Error dropping all-day event in daily view:', error);
    }

    clearEventDragPreview();
  };

  const handleCellMouseDown = (e, hour) => {
    if (e.button !== 0) return
    
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const minutePercentage = (relativeY % HOUR_HEIGHT) / HOUR_HEIGHT
    const minutes = Math.floor(minutePercentage * 60)
    const preciseHour = hour + (minutes / 60)
    const snappedHour = snapHourValue(preciseHour)

    // Store drag info but don't show preview yet
    setDragStart(snappedHour)
    setDragEnd(snappedHour)
    hasDraggedRef.current = false
    dragInitialHourRef.current = preciseHour
    
    // Delay showing drag preview by 500ms
    dragTimeoutRef.current = setTimeout(() => {
      setIsDragging(true)
    }, 500)
  }

  const handleCellMouseMove = (e, hour) => {
    if (dragStart === null) return
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const minutePercentage = (relativeY % HOUR_HEIGHT) / HOUR_HEIGHT
    const minutes = Math.floor(minutePercentage * 60)
    const preciseHour = hour + (minutes / 60)
    const snappedHour = snapHourValue(preciseHour)

    const startRaw = dragInitialHourRef.current ?? dragStart ?? preciseHour
    const distanceMoved = Math.abs(preciseHour - startRaw)
    const shouldActivateDrag = isDragging || distanceMoved >= DRAG_DISTANCE_THRESHOLD

    if (!isDragging && shouldActivateDrag) {
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current)
        dragTimeoutRef.current = null
      }
      setIsDragging(true)
    }

    if (shouldActivateDrag) {
      hasDraggedRef.current = true
      setDragEnd(snappedHour)
    }
  }

  const handleGridMouseUp = () => {
    // Clear the timeout if mouse up happens before drag starts
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current)
      dragTimeoutRef.current = null
    }
    
    if (!isDragging && dragStart === null) return;
    
    const wasDragging = hasDraggedRef.current && isDragging;
    const savedDragStart = dragStart;
    const savedDragEnd = dragEnd;
    
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    hasDraggedRef.current = false;
    dragInitialHourRef.current = null;
    
    if (wasDragging && savedDragStart !== null && savedDragEnd !== null) {
      const startHour = Math.min(savedDragStart, savedDragEnd);
      const endHour = Math.max(savedDragStart, savedDragEnd);
      
      const startDate = new Date(currentDate);
      startDate.setHours(Math.floor(startHour), Math.round((startHour % 1) * 60), 0, 0);
      
      const endDate = new Date(currentDate);
      endDate.setHours(Math.floor(endHour), Math.round((endHour % 1) * 60), 0, 0);
      
      openEventModal(null, true);
      window.prefilledEventDates = {
        startDate,
        endDate,
        title: '',
        color: 'blue',
        isAllDay: false
      };
    }
  }

  const handleCellDoubleClick = (e, hour) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const minutePercentage = (relativeY % HOUR_HEIGHT) / HOUR_HEIGHT;
    const minutes = Math.floor(minutePercentage * 60);
    
    const startDate = new Date(currentDate);
    startDate.setHours(hour, minutes, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setHours(startDate.getHours() + 1, startDate.getMinutes(), 0, 0);
    
    openEventModal(null, true);
    window.prefilledEventDates = {
      startDate,
      endDate,
      title: '',
      color: 'blue',
      isAllDay: false
    };
  }
  
  useEffect(() => {
    const handleMouseUp = () => handleGridMouseUp();
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [isDragging, dragStart, dragEnd, currentDate, openEventModal])
  
  // Generate time slots
  const hours = []
  for (let i = DAY_START_HOUR; i <= DAY_END_HOUR; i++) {
    hours.push(i)
  }
  
  // Get events for this day using the cached day index for instant results
  const dayEvents = useMemo(() => {
    const fromCache = typeof getEventsForDate === 'function'
      ? (getEventsForDate(currentDate) || [])
      : []

    return fromCache.map(ev => ({
      ...ev,
      start: ev.start instanceof Date ? ev.start : new Date(ev.start),
      end: ev.end instanceof Date ? ev.end : new Date(ev.end),
      isImported: Boolean(ev.source)
    }))
  }, [getEventsForDate, currentDate, events])
  
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
  const renderAllDayEvent = (event) => (
    <AllDayEvent
      key={event.clientKey || event.id}
      event={event}
      onOpen={openEventModal}
      style={{
        height: `${ALL_DAY_EVENT_HEIGHT}px`,
        marginBottom: `${ALL_DAY_EVENT_GAP}px`
      }}
    />
  );
  
  useEffect(() => {
    const hourCells = document.querySelectorAll('.day-hour-cell');
    const sortableInstances = [];
    
    hourCells.forEach(cell => {
      const sortable = Sortable.create(cell, {
        group: {
          name: 'tasks',
          pull: false,
          put: true
        },
        animation: 150,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag-active',
        dragoverClass: 'sortable-dragover',
        draggable: '.task-item',
        onStart: function() {
          document.body.classList.add('task-dragging');
        },
        onEnd: function() {
          document.body.classList.remove('task-dragging');
          document.querySelectorAll('.sortable-dragover').forEach(el => {
            el.classList.remove('sortable-dragover');
          });
          queueMicrotask(() => {
            try {
              document.querySelectorAll('.sortable-ghost, .task-ghost').forEach(el => {
                if (el && el.parentNode && !el.closest('.task-list')) {
                  el.parentNode.removeChild(el)
                }
              })
            } catch (_) {}
          })
        },
        onAdd: async function(evt) {
          if (evt.pullMode && evt.pullMode !== 'clone') {
            return
          }
          if (evt.item?.dataset?.converted === 'true') {
            return
          }
          if (evt.item) {
            evt.item.dataset.converted = 'true'
          }
          const taskId = evt.item.getAttribute('data-task-id') || evt.item.getAttribute('data-id');
          const hour = parseInt(evt.to.getAttribute('data-hour'), 10);
          
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
          if (evt.clone && evt.clone.parentNode) {
            evt.clone.parentNode.removeChild(evt.clone)
          }
          
          if (taskId && !isNaN(hour)) {
            const startDate = new Date(currentDate);
            startDate.setHours(hour, 0, 0, 0);
            
            const endDate = new Date(startDate);
            endDate.setHours(hour + 1, 0, 0, 0);
            
            try {
              await convertTodoToEvent(taskId, startDate, endDate, false);
            } catch (error) {
              console.error('Failed to convert todo to event:', error);
            }
          }
        },
        sort: false
      });
      
      sortableInstances.push(sortable);
    });
    
    return () => {
      sortableInstances.forEach(sortable => {
        if (sortable && sortable.destroy) sortable.destroy();
      });
    };
  }, [currentDate, convertTodoToEvent]);
  
  useEffect(() => {
    const allDaySection = document.querySelector('.day-all-day-section');
    if (!allDaySection) return;
    
    const sortable = Sortable.create(allDaySection, {
      group: {
        name: 'tasks',
        pull: false,
        put: true
      },
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag-active',
      draggable: '.task-item',
      onStart: function() {
        document.body.classList.add('task-dragging');
      },
      onEnd: function() {
        document.body.classList.remove('task-dragging');
        queueMicrotask(() => {
          try {
            document.querySelectorAll('.sortable-ghost, .task-ghost').forEach(el => {
              if (el && el.parentNode && !el.closest('.task-list')) {
                el.parentNode.removeChild(el)
              }
            })
          } catch (_) {}
        })
      },
      onAdd: async function(evt) {
        if (evt.pullMode && evt.pullMode !== 'clone') {
          return
        }
        if (evt.item?.dataset?.converted === 'true') {
          return
        }
        if (evt.item) {
          evt.item.dataset.converted = 'true'
        }
        const taskId = evt.item.getAttribute('data-task-id') || evt.item.getAttribute('data-id');
        
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
        if (evt.clone && evt.clone.parentNode) {
          evt.clone.parentNode.removeChild(evt.clone)
        }
        
        if (taskId) {
          const startDate = new Date(currentDate);
          startDate.setHours(0, 0, 0, 0);
          
          const endDate = addDays(startDate, 1);
          
          try {
            await convertTodoToEvent(taskId, startDate, endDate, true);
          } catch (error) {
            console.error('Failed to convert todo to event:', error);
          }
        }
      },
      sort: false
    });
    
    return () => {
      if (sortable && sortable.destroy) sortable.destroy();
    };
  }, [currentDate, convertTodoToEvent]);
  
  return (
    <div 
      ref={containerRef}
      className="view-container flex flex-col h-full"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* All-day events section - fixed at top, no scrolling */}
      {(() => {
        const requiredHeight = Math.max(
          ALL_DAY_SECTION_HEIGHT,
          Math.max(1, allDayEvents.length) * (ALL_DAY_EVENT_HEIGHT + ALL_DAY_EVENT_GAP) - ALL_DAY_EVENT_GAP
        );

        return (
          <div className="flex w-full border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-20 flex-shrink-0" style={{ minHeight: `${requiredHeight}px` }}>
            <div className="w-16 flex-shrink-0 text-center py-2 text-xs text-gray-500 border-r border-gray-200 dark:border-gray-700" style={{ minHeight: `${requiredHeight}px` }}>
              All-day
            </div>
            <div
              className="flex-1 p-2 day-all-day-section overflow-hidden border-r border-gray-200 dark:border-gray-700"
              style={{ 
                minHeight: `${requiredHeight}px`,
                height: `${requiredHeight}px`
              }}
              onDrop={handleAllDayEventDrop}
              onDragOver={handleAllDayDragOver}
              onDragLeave={handleDragLeave}
            >
              {allDayEvents.map(event => renderAllDayEvent(event))}
              {allDayEvents.length === 0 && (
                <div className="text-xs text-gray-400 italic">Drop tasks here for all-day events</div>
              )}
            </div>
          </div>
        );
      })()}
      
      <div className="relative flex flex-1 overflow-y-auto min-h-0">
        {/* Time labels */}
        <div className="w-16 flex-shrink-0 relative z-10 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700" style={{ height: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px`, minHeight: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px` }}>
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
        <div className="flex-1 relative" style={{ height: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px`, minHeight: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px` }}>
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
            className="relative w-full"
            style={{ height: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px`, minHeight: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px` }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              
              const elements = document.elementsFromPoint(e.clientX, e.clientY)
              const hourCell = elements.find(el => el.classList.contains('day-hour-cell'))
              
              if (hourCell) {
                const hour = parseInt(hourCell.getAttribute('data-hour'), 10)
                if (!isNaN(hour)) {
                  updateEventDragPreview(e, hourCell, hour)
                }
              }
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              
              const elements = document.elementsFromPoint(e.clientX, e.clientY)
              const hourCell = elements.find(el => el.classList.contains('day-hour-cell'))
              
              if (hourCell) {
                const hour = parseInt(hourCell.getAttribute('data-hour'), 10)
                if (!isNaN(hour)) {
                  handleEventDrop(e, hour)
                }
              }
              
              clearEventDragPreview()
            }}
          >
            {/* Hour cells for drag-to-drop and drag-to-create */}
            {hours.map((hour) => (
              <div
                key={hour}
                className="day-hour-cell absolute left-0 right-0"
                data-hour={hour}
                style={{
                  height: `${HOUR_HEIGHT}px`,
                  top: `${(hour - DAY_START_HOUR) * HOUR_HEIGHT}px`
                }}
                onMouseDown={(e) => handleCellMouseDown(e, hour)}
                onMouseMove={(e) => handleCellMouseMove(e, hour)}
                onDoubleClick={(e) => handleCellDoubleClick(e, hour)}
                onDrop={(e) => handleEventDrop(e, hour)}
                onDragOver={(e) => handleHourCellDragOver(e, hour)}
                onDragLeave={handleDragLeave}
              />
            ))}
            
            {/* Drag preview */}
            {isDragging && dragStart !== null && dragEnd !== null && (
              <div
                className="absolute left-0 right-0 bg-blue-200 dark:bg-blue-700 opacity-50 pointer-events-none rounded"
                style={{
                  top: `${Math.min(dragStart, dragEnd) * HOUR_HEIGHT}px`,
                  height: `${Math.abs(dragEnd - dragStart) * HOUR_HEIGHT}px`,
                  marginLeft: '8px',
                  marginRight: '8px'
                }}
              />
            )}

            {/* Events for this day (only regular events, not all-day) */}
            {calculateTimeGridLayout(regularEvents).map(({ event, column, columns }) => (
              <DayEvent 
                key={event.clientKey || event.id || `${(event.start instanceof Date ? event.start : new Date(event.start)).getTime()}-${column}-${columns}`} 
                event={event} 
                hourHeight={HOUR_HEIGHT} 
                dayStartHour={DAY_START_HOUR}
                position={{ column, columns, gap: TIMED_EVENT_GAP }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DailyView
