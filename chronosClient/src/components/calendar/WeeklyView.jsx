import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { format, isSameDay, isToday, getHours, getMinutes, getDay, addDays, differenceInMinutes } from 'date-fns'
import { useCalendar } from '../../context/CalendarContext'
import { useTaskContext } from '../../context/TaskContext'
import WeekEvent from '../events/WeekEvent'
import AllDayEvent from '../events/AllDayEvent'
import './WeeklyView.css'
import { calculateTimeGridLayout } from '../../lib/eventLayout'
import { getEventColors } from '../../lib/eventColors'

const HOUR_HEIGHT = 60 // Height of one hour in pixels
const DAY_START_HOUR = 0 // Start displaying from 12 AM
const DAY_END_HOUR = 23 // End displaying at 11 PM
const ALL_DAY_SECTION_HEIGHT = 40 // Height of the all-day events section
const ALL_DAY_EVENT_HEIGHT = 30
const ALL_DAY_EVENT_GAP = 4
const TIMED_EVENT_GAP = 4
const DRAG_DISTANCE_THRESHOLD = 0.12 // ~7 minutes of travel before drag activates
// This offset fixes the day alignment issue when dragging
// The offset is +1 to shift events one day forward (compensating for the one-day-behind issue)
// When integrating with external calendars (Google, Outlook, etc.):
// 1. Imported events should be tagged with a 'source' property
// 2. You may need to set this to 0 if imported events already show on the correct day
// 3. If you change timezone handling, review this offset
const DAY_OFFSET = 0

const SNAP_INTERVAL_MINUTES = 15
const MAX_SNAP_MINUTES = (DAY_END_HOUR * 60) + SNAP_INTERVAL_MINUTES
const clampSnapMinutes = (minutes) => Math.max(0, Math.min(minutes, MAX_SNAP_MINUTES))
const snapMinutesToLatestHalfHour = (totalMinutes) => {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return 0
  return clampSnapMinutes(Math.round(totalMinutes / SNAP_INTERVAL_MINUTES) * SNAP_INTERVAL_MINUTES)
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
const buildHourlyRange = (day, hour) => {
  const start = new Date(day)
  start.setHours(hour, 0, 0, 0)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return { start, end }
}
const WeeklyView = () => {
  const {
    currentDate,
    events,
    getDaysInWeek,
    navigateToNext,
    navigateToPrevious,
    selectDate,
    openEventModal,
    getEventsForDate,
    updateEvent
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
  const [todoDragPreview, setTodoDragPreview] = useState(null) // Preview while dragging a todo into the week grid
  
  const hasDraggedRef = useRef(false)
  const dragInitialDayHourRef = useRef(null)
  const dragTimeoutRef = useRef(null)
  
  const hourCellsRef = useRef({});
  const allDayCellsRef = useRef({});
  const dragColumnRef = useRef(null);
  const dragStartCellRef = useRef(null);
  const cleanupDragArtifacts = useCallback(() => {
    try {
      document.body.classList.remove('calendar-drag-focus');
      ['.sortable-ghost', '.task-ghost', '.sortable-drag', '.task-drag', '[data-is-clone="true"]'].forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (!el.closest('.task-list')) {
            el.parentNode?.removeChild(el);
          }
        });
      });
    } catch (_) {}
  }, []);

  const getDraggedTodoMeta = useCallback(() => {
    if (typeof window === 'undefined') return null
    return window.__chronosDraggedTodoMeta || null
  }, [])

  const clearTodoDragPreview = useCallback(() => setTodoDragPreview(null), [])

  const setTodoDropPreview = useCallback((startDate, endDate, isAllDay = false) => {
    const meta = getDraggedTodoMeta()
    setTodoDragPreview({
      start: startDate,
      end: endDate,
      isAllDay,
      title: meta?.title || 'New task',
      color: meta?.color || '#a78bfa'
    })
  }, [getDraggedTodoMeta])
  
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

    // Don't start drag-to-create if an event is being resized
    if (typeof window !== 'undefined' && window.__chronosEventResizing) {
      return
    }
    
    // Don't start drag-to-create if a todo drag is in progress
    if (document.body.classList.contains('task-dragging')) {
      return
    }

    dragColumnRef.current = e.currentTarget.closest('.week-day-column');
    dragStartCellRef.current = e.currentTarget;
    window.lastClickedCalendarDay = e.currentTarget;
    window.lastClickedEvent = null;
    window.lastClickedEventId = null;
    
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const minutePercentage = (relativeY % HOUR_HEIGHT) / HOUR_HEIGHT
    const minutes = Math.floor(minutePercentage * 60)
    const preciseHour = hour + (minutes / 60)
    const snappedHour = snapHourValue(preciseHour)

    // Store drag info but don't show preview yet
    setDragDay(day)
    setDragStart(snappedHour)
    setDragEnd(snappedHour)
    hasDraggedRef.current = false
    dragInitialDayHourRef.current = { day, rawHour: preciseHour }
    
    // Delay showing drag preview by 500ms
    dragTimeoutRef.current = setTimeout(() => {
      setIsDragging(true)
    }, 500)
  }

  const handleCellMouseMove = (e, day, hour) => {
    if (!dragDay || dragStart === null) return

    // Don't continue drag-to-create if an event is being resized
    if (typeof window !== 'undefined' && window.__chronosEventResizing) {
      return
    }
    
    // Don't continue drag-to-create if a todo drag is in progress
    if (document.body.classList.contains('task-dragging')) {
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const minutePercentage = (relativeY % HOUR_HEIGHT) / HOUR_HEIGHT
    const minutes = Math.floor(minutePercentage * 60)
    const preciseHour = hour + (minutes / 60)
    const snappedHour = snapHourValue(preciseHour)

    const movedToDifferentDay = !isSameDay(dragDay, day)
    const startRaw = dragInitialDayHourRef.current?.rawHour ?? dragStart ?? preciseHour
    const distanceMoved = Math.abs((preciseHour ?? 0) - startRaw)

    const shouldActivateDrag =
      isDragging ||
      movedToDifferentDay ||
      distanceMoved >= DRAG_DISTANCE_THRESHOLD

    if (!isDragging && shouldActivateDrag) {
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current)
        dragTimeoutRef.current = null
      }
      setIsDragging(true)
    }

    if (shouldActivateDrag) {
      hasDraggedRef.current = true
      if (movedToDifferentDay) {
        setDragDay(day)
      }
      setDragEnd(snappedHour)
    }
  }

  const handleGridMouseUp = () => {
    // Clear the timeout if mouse up happens before drag starts
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current)
      dragTimeoutRef.current = null
    }
    
    if (!isDragging && !dragDay && !hasDraggedRef.current) return;
    
    // Reset drag state immediately to prevent scroll issues
    const wasDragging = hasDraggedRef.current;
    const savedDragDay = dragDay;
    const savedDragStart = dragStart;
    const savedDragEnd = dragEnd;
    
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
        color: 'blue',
        isAllDay: false // Explicitly set to false for timed events from week view drag
      };
      
      console.log('Opening modal for DRAGGED event:', {
        startDate: startDate.toLocaleTimeString(),
        endDate: endDate.toLocaleTimeString(),
        isAllDay: false
      });

      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
      const columnEl = dragColumnRef.current;

      if (columnEl) {
        const columnRect = columnEl.getBoundingClientRect();
        const columnTop = columnRect.top + scrollTop;
        const columnLeft = columnRect.left + scrollLeft;
        const startValue = Math.min(savedDragStart, savedDragEnd);
        const endValue = Math.max(savedDragStart, savedDragEnd);
        const startOffset = Math.max(0, (startValue - DAY_START_HOUR) * HOUR_HEIGHT);
        const endOffset = Math.max(startOffset + 1, (endValue - DAY_START_HOUR) * HOUR_HEIGHT);
        const height = Math.max(endOffset - startOffset, HOUR_HEIGHT / 2);
        
        window.lastCalendarAnchorRect = {
          top: columnTop + startOffset,
          bottom: columnTop + startOffset + height,
          left: columnLeft,
          right: columnLeft + columnRect.width,
          width: columnRect.width,
          height,
          eventId: newEvent.id
        };
      } else if (dragStartCellRef.current) {
        const rect = dragStartCellRef.current.getBoundingClientRect();
        window.lastCalendarAnchorRect = {
          top: rect.top + scrollTop,
          bottom: rect.bottom + scrollTop,
          left: rect.left + scrollLeft,
          right: rect.right + scrollLeft,
          width: rect.width,
          height: rect.height,
          eventId: newEvent.id
        };
      } else {
        window.lastCalendarAnchorRect = null;
      }
      window.lastClickedCalendarDay = null;
      window.lastClickedEvent = null;
      window.lastClickedEventId = newEvent.id;
      window.lastDragPosition = null;
      
      // Store the exact times for the modal to use
      window.prefilledEventDates = {
        startDate,
        endDate,
        title: 'New Event',
        color: '#1761C7',
        isAllDay: false, // Explicitly set to false for timed events
        fromDayClick: true
      };
      
      openEventModal(newEvent, true);

    } else {
      // It was a click, not a drag. Do nothing for now, 
      // as double-click will handle event creation from a click.
      console.log('Click detected on hour cell, no action taken (awaiting double-click implementation).');
    }

    dragColumnRef.current = null;
    dragStartCellRef.current = null;
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
      color: 'blue',
      isAllDay: false // Explicitly set to false for timed events from double-click
    };
    
    // Store the exact times for the modal to use
    window.prefilledEventDates = {
      startDate,
      endDate,
      title: 'New Event',
      color: 'blue',
      isAllDay: false,
      fromDayClick: true
    };
    
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const columnEl = e.currentTarget.closest('.week-day-column');

    if (columnEl) {
      const columnRect = columnEl.getBoundingClientRect();
      const columnTop = columnRect.top + scrollTop;
      const columnLeft = columnRect.left + scrollLeft;
      const startValue = startHour + (startMinute / 60);
      const endValue = endHour + (endMinute / 60);
      const startOffset = Math.max(0, (startValue - DAY_START_HOUR) * HOUR_HEIGHT);
      const endOffset = Math.max(startOffset + 1, (endValue - DAY_START_HOUR) * HOUR_HEIGHT);
      const height = Math.max(endOffset - startOffset, HOUR_HEIGHT / 2);

      window.lastCalendarAnchorRect = {
        top: columnTop + startOffset,
        bottom: columnTop + startOffset + height,
        left: columnLeft,
        right: columnLeft + columnRect.width,
        width: columnRect.width,
        height,
        eventId: newEvent.id
      };
      window.lastClickedCalendarDay = columnEl;
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      window.lastCalendarAnchorRect = {
        top: rect.top + scrollTop,
        bottom: rect.bottom + scrollTop,
        left: rect.left + scrollLeft,
        right: rect.right + scrollLeft,
        width: rect.width,
        height: rect.height,
        eventId: newEvent.id
      };
      window.lastClickedCalendarDay = e.currentTarget;
    }

    window.lastClickedEvent = null;
    window.lastClickedEventId = newEvent.id;
    window.lastDragPosition = null;

    console.log('Opening modal for DOUBLE-CLICK event:', {
      startDate: startDate.toLocaleTimeString(),
      endDate: endDate.toLocaleTimeString()
    });
    openEventModal(newEvent, true); // true indicates it's a new event for the modal
  };

  // Handle event drop onto a specific hour cell (with minute precision)
  // Track pending todo drop to prevent duplicate conversions
  const pendingTodoConversionRef = useRef(null);

  const handleEventDropOnHourCell = (e, targetDay, targetHour, hourCellElement = null) => {
    e.preventDefault();
    e.stopPropagation();

    const eventData = e.dataTransfer.getData('event');
    if (!eventData) return;

    try {
      const draggedEvent = JSON.parse(eventData);
      const oldStart = new Date(draggedEvent.start);
      const oldEnd = new Date(draggedEvent.end);

      // Duration preserved for normal events, but if the source was all‑day
      // (or effectively a 24h+ span), convert to a 60‑minute timed block.
      const rawDurationMs = Math.max(1, oldEnd.getTime() - oldStart.getTime());
      const ONE_HOUR = 60 * 60 * 1000;
      const durationMs = (draggedEvent.isAllDay || rawDurationMs >= 23 * ONE_HOUR)
        ? ONE_HOUR
        : rawDurationMs;

      // Compute minute precision from cursor inside the hour cell
      // Use the actual hour cell element if provided, otherwise fall back to currentTarget
      const cellElement = hourCellElement || e.currentTarget;
      const rect = cellElement.getBoundingClientRect();
      const relativeY = Math.min(rect.height, Math.max(0, e.clientY - rect.top));
      const minutePercentage = rect.height ? relativeY / rect.height : 0;
      const minutes = Math.floor(minutePercentage * 60);
      const { hour: snappedHour, minutes: snappedMinutes } = snapHourMinutePair(targetHour, minutes);

      const axis = resolveDragAxis(e);
      let dropDay = new Date(targetDay);
      let hourForDrop = snappedHour;
      let minuteForDrop = snappedMinutes;
      // Always respect the drop target day/time for better accuracy across days
      const newStart = new Date(dropDay);
      newStart.setHours(hourForDrop, minuteForDrop, 0, 0);
      const newEnd = new Date(newStart.getTime() + durationMs);

      updateEvent(draggedEvent.id, {
        ...draggedEvent,
        start: newStart,
        end: newEnd,
        isAllDay: false
      });
    } catch (error) {
      console.error('Error dropping event on hour cell:', error);
    }

    clearEventDragPreview();
  };

  // Handle todo drop on hour cell
  const handleTodoDropOnHourCell = async (e, targetDay, targetHour, _hourCellElement = null) => {
    if (!document.body.classList.contains('task-dragging')) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Clear preview immediately to prevent ghost behind modal
    clearTodoDragPreview();
    
    // Prevent duplicate conversions
    if (pendingTodoConversionRef.current) return;
    
    const draggedTodoMeta = getDraggedTodoMeta();
    if (!draggedTodoMeta) return;
    
    const taskId = draggedTodoMeta.taskId;
    if (!taskId) return;
    
    pendingTodoConversionRef.current = taskId;
    const { start: startDate, end: endDate } = buildHourlyRange(targetDay, targetHour);
    
    try {
      await convertTodoToEvent(taskId, startDate, endDate, false);
      clearTodoDragPreview();
      cleanupDragArtifacts();
    } catch (error) {
      console.error('Failed to convert todo to event:', error);
    } finally {
      setTimeout(() => {
        pendingTodoConversionRef.current = null;
      }, 500);
    }
  };

  // Combined drop handler for hour cells
  const handleCombinedDropOnHourCell = async (e, targetDay, targetHour, hourCellElement = null) => {
    if (document.body.classList.contains('task-dragging')) {
      await handleTodoDropOnHourCell(e, targetDay, targetHour, hourCellElement);
    } else {
      handleEventDropOnHourCell(e, targetDay, targetHour, hourCellElement);
    }
  };

  const handleAllDayEventDrop = (e, targetDay) => {
    e.preventDefault();
    e.stopPropagation();

    const eventData = e.dataTransfer.getData('event');
    if (!eventData) return;

    try {
      const draggedEvent = JSON.parse(eventData);
      const oldStart = new Date(draggedEvent.start);
      const oldEnd = new Date(draggedEvent.end);
      const durationMs = Math.max(30 * 60 * 1000, oldEnd.getTime() - oldStart.getTime());

      const newStart = new Date(targetDay);
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
        isAllDay: true
      });
    } catch (error) {
      console.error('Error dropping all-day event:', error);
    }

    clearEventDragPreview();
  };

  // Handle todo drop on all-day section
  const handleTodoDropOnAllDay = async (e, targetDay) => {
    if (!document.body.classList.contains('task-dragging')) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Clear preview immediately to prevent ghost behind modal
    clearTodoDragPreview();
    
    if (pendingTodoConversionRef.current) return;
    
    const draggedTodoMeta = getDraggedTodoMeta();
    if (!draggedTodoMeta) return;
    
    const taskId = draggedTodoMeta.taskId;
    if (!taskId) return;
    
    pendingTodoConversionRef.current = taskId;
    
    const startDate = new Date(targetDay);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    
    try {
      await convertTodoToEvent(taskId, startDate, endDate, true);
      clearTodoDragPreview();
      cleanupDragArtifacts();
    } catch (error) {
      console.error('Failed to convert todo to event:', error);
    } finally {
      setTimeout(() => {
        pendingTodoConversionRef.current = null;
      }, 500);
    }
  };

  // Combined drop handler for all-day section
  const handleCombinedDropOnAllDay = async (e, targetDay) => {
    if (document.body.classList.contains('task-dragging')) {
      await handleTodoDropOnAllDay(e, targetDay);
    } else {
      handleAllDayEventDrop(e, targetDay);
    }
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

  const resolveDragAxis = (pointerEvent) => {
    if (typeof window === 'undefined') return null
    let axis = window.__chronosDragAxis || null
    const startPoint = window.__chronosDragStartPoint
    if (!startPoint) return axis
    if (axis) return axis
    if (!pointerEvent) return null
    const currentX = pointerEvent.clientX ?? startPoint.x
    const currentY = pointerEvent.clientY ?? startPoint.y
    const deltaX = Math.abs(currentX - startPoint.x)
    const deltaY = Math.abs(currentY - startPoint.y)
    if (Math.max(deltaX, deltaY) < 8) {
      return null
    }
    axis = deltaY >= deltaX ? 'vertical' : 'horizontal'
    window.__chronosDragAxis = axis
    return axis
  }

  const updateEventDragPreviewForWeek = (e, hourCell, day, hour) => {
    if (!hourCell || !day) {
      emitDragPreviewUpdate(null, null)
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
    const axis = resolveDragAxis(e)
    const originalStart = dragMeta.start ? new Date(dragMeta.start) : null
    const durationMs = dragMeta.durationMs || 60 * 60 * 1000
    let previewDay = new Date(day)
    let hourForPreview = snappedHour
    let minuteForPreview = snappedMinutes
    if (axis === 'vertical' && originalStart) {
      previewDay = new Date(originalStart)
    } else if (axis === 'horizontal' && originalStart) {
      hourForPreview = originalStart.getHours()
      minuteForPreview = originalStart.getMinutes()
    }
    const previewStart = new Date(previewDay)
    previewStart.setHours(hourForPreview, minuteForPreview, 0, 0)
    const previewEnd = new Date(previewStart.getTime() + durationMs)
    emitDragPreviewUpdate(previewStart, previewEnd)
  };

  const clearEventDragPreview = () => emitDragPreviewUpdate(null, null);
  const resetPreviewIfNoTarget = () => {
    clearEventDragPreview();
  };

  const handleHourCellDragOver = (e, day, hour) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const isTodoDrag = document.body.classList.contains('task-dragging')
    if (isTodoDrag) {
      document.body.classList.add('calendar-drag-focus')
    }
    resolveDragAxis(e);
    updateEventDragPreviewForWeek(e, e.currentTarget, day, hour);

    // Show todo preview if dragging a task
    if (isTodoDrag) {
      const { start: startDate, end: endDate } = buildHourlyRange(day, hour)
      setTodoDropPreview(startDate, endDate, false)
    }
  };

  const handleAllDayDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (document.body.classList.contains('task-dragging')) {
      document.body.classList.add('calendar-drag-focus')
    }
    clearEventDragPreview();

    if (document.body.classList.contains('task-dragging')) {
      const dateStr = e.currentTarget?.getAttribute('data-date') || format(currentDate, 'yyyy-MM-dd')
      const [year, month, day] = dateStr.split('-').map(Number)
      const startDate = new Date(year, month - 1, day, 0, 0, 0, 0)
      startDate.setHours(0, 0, 0, 0)
      const endDate = addDays(startDate, 1)
      setTodoDropPreview(startDate, endDate, true)
    }
  };

  const handleDragLeave = () => {
    resetPreviewIfNoTarget();
    clearTodoDragPreview();
  };
  
  // Handle creating an all-day event
  const handleAllDayCellClick = (e, day) => {
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

    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const target = e?.currentTarget;
    if (target) {
      const rect = target.getBoundingClientRect();
      window.lastCalendarAnchorRect = {
        top: rect.top + scrollTop,
        bottom: rect.bottom + scrollTop,
        left: rect.left + scrollLeft,
        right: rect.right + scrollLeft,
        width: rect.width,
        height: rect.height,
        eventId: newEvent.id
      };
      window.lastClickedCalendarDay = target;
    } else {
      window.lastCalendarAnchorRect = null;
      window.lastClickedCalendarDay = null;
    }
    window.lastClickedEvent = null;
    window.lastClickedEventId = newEvent.id;
    window.lastDragPosition = null;
    
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
  const renderAllDayEvent = (event, indexKey) => (
    <AllDayEvent
      key={event.clientKey || event.id || `${event.start.getTime()}-${event.title}-${indexKey}`}
      event={event}
      onOpen={openEventModal}
      style={{
        height: `${ALL_DAY_EVENT_HEIGHT}px`,
        marginBottom: `${ALL_DAY_EVENT_GAP}px`,
      }}
    />
  );
  
  // Handle todo drag over hour cells for preview
  const handleHourCellTodoDragOver = (e, day, hour) => {
    if (document.body.classList.contains('task-dragging')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const { start, end } = buildHourlyRange(day, hour)
      setTodoDropPreview(start, end, false);
    }
  };

  // Handle todo drag over all-day section for preview
  const handleAllDayTodoDragOver = (e, day) => {
    if (document.body.classList.contains('task-dragging')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      
      const startDate = new Date(day);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 1);
      setTodoDropPreview(startDate, endDate, true);
    }
  };
  
  return (
    <div 
      ref={containerRef}
      className="view-container flex flex-col h-full"
      onWheel={handleWheel}
      onDragEnter={() => {
        if (document.body.classList.contains('task-dragging')) {
          document.body.classList.add('calendar-drag-focus')
        }
      }}
      onDragOver={() => {
        if (document.body.classList.contains('task-dragging')) {
          document.body.classList.add('calendar-drag-focus')
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          document.body.classList.remove('calendar-drag-focus')
          clearTodoDragPreview()
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex w-full border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
        <div className="w-16 text-center py-2 text-gray-500 border-r border-gray-200 dark:border-gray-700">
          GMT-7
        </div>
        {days.map((day, index) => {
          const dayNumber = format(day, 'd')
          const dayName = format(day, 'EEE')
          const isCurrentDay = isToday(day)
          const isSelectedDay = isSameDay(day, currentDate);
          
          return (
            <div 
              key={index}
              className={`flex-1 p-2 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${isCurrentDay ? 'font-semibold' : ''}`}
              onClick={() => selectDate(day)}
            >
              <div className="text-sm">{dayName} {dayNumber}</div>
            </div>
          )
        })}
      </div>
      
      {/* All-day events section - fixed */}
      {(() => {
        // Calculate the maximum height needed across all days
        const maxRequiredHeight = Math.max(
          ALL_DAY_SECTION_HEIGHT,
          ...days.map(day => {
            const eventsForDay = allDayEvents.filter(event => {
              if (!event.isImported && DAY_OFFSET !== 0) {
                const adjustedDay = new Date(day);
                adjustedDay.setDate(adjustedDay.getDate() - DAY_OFFSET);
                return isSameDay(event.start, adjustedDay);
              }
              return isSameDay(event.start, day);
            });
            return Math.max(1, eventsForDay.length) * (ALL_DAY_EVENT_HEIGHT + ALL_DAY_EVENT_GAP) - ALL_DAY_EVENT_GAP;
          })
        );

        return (
          <div className="flex w-full border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-20 flex-shrink-0" style={{ minHeight: `${maxRequiredHeight}px` }}>
            <div className="w-16 flex-shrink-0 text-center py-2 text-xs text-gray-500 border-r border-gray-200 dark:border-gray-700" style={{ minHeight: `${maxRequiredHeight}px` }}>
              All-day
            </div>
            <div className="flex flex-1 border-r border-gray-200 dark:border-gray-700" style={{ minHeight: `${maxRequiredHeight}px` }}>
              {days.map((day, dayIndex) => {
                const eventsForDay = allDayEvents.filter(event => {
                  if (!event.isImported && DAY_OFFSET !== 0) {
                    const adjustedDay = new Date(day);
                    adjustedDay.setDate(adjustedDay.getDate() - DAY_OFFSET);
                    return isSameDay(event.start, adjustedDay);
                  }
                  return isSameDay(event.start, day);
                });
                const isSelectedDay = isSameDay(day, currentDate);
                const isCurrentDay = isToday(day);

                const requiredHeight = Math.max(
                  ALL_DAY_SECTION_HEIGHT,
                  Math.max(1, eventsForDay.length) * (ALL_DAY_EVENT_HEIGHT + ALL_DAY_EVENT_GAP) - ALL_DAY_EVENT_GAP
                );

                return (
                  <div 
                    key={dayIndex}
                    className="flex-1 relative border-r border-gray-200 dark:border-gray-700 droppable-cell overflow-hidden"
                    data-date={format(day, 'yyyy-MM-dd')}
                    data-all-day="true"
                    style={{ 
                      minHeight: `${maxRequiredHeight}px`,
                      height: `${maxRequiredHeight}px`,
                      padding: '4px'
                    }}
                    onClick={(e) => handleAllDayCellClick(e, day)}
                    onDrop={(e) => handleCombinedDropOnAllDay(e, day)}
                    onDragOver={(e) => {
                      handleAllDayDragOver(e);
                      handleAllDayTodoDragOver(e, day);
                    }}
                    onDragLeave={handleDragLeave}
                  >
                    {eventsForDay.map((event, idx) => renderAllDayEvent(event, idx))}
                    {todoDragPreview?.isAllDay && isSameDay(todoDragPreview.start, day) && (() => {
                      const colors = getEventColors(todoDragPreview.color || 'blue')
                      return (
                        <div
                          className="flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium pointer-events-none"
                          style={{
                            backgroundColor: colors.background,
                            border: `1px dashed ${colors.border}`,
                            color: colors.text,
                            opacity: 0.9
                          }}
                        >
                          <div
                            className="h-3 w-1 rounded-full"
                            style={{ backgroundColor: colors.border }}
                          />
                          <span className="truncate">{todoDragPreview.title}</span>
                          <span className="text-[11px] text-slate-600">
                            All day
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                );
              })}
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
        
        {/* Week grid */}
        <div className="flex-1 relative" style={{ height: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px`, minHeight: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px` }}>
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
            className="grid grid-cols-7" 
            style={{ height: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px`, minHeight: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px` }}
            onMouseUp={handleGridMouseUp}
            onMouseLeave={handleGridMouseUp}
          >
              {days.map((day, dayIndex) => {
                const isSelectedDay = isSameDay(day, currentDate);
                const isCurrentDay = isToday(day);
                const showSelection = false;
                return (
                  <div
                    key={dayIndex}
                    className={`relative border-r border-gray-200 dark:border-gray-700 h-full week-day-column ${showSelection ? 'calendar-selected-column' : ''}`}
                    data-week-column="true"
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'

                    const elements = document.elementsFromPoint(e.clientX, e.clientY)
                    const hourCell = elements.find(el => el.classList.contains('hour-cell'))

                    if (hourCell) {
                      const hour = parseInt(hourCell.getAttribute('data-hour'), 10)
                      if (!isNaN(hour)) {
                        updateEventDragPreviewForWeek(e, hourCell, day, hour)
                      }
                    } else {
                      clearEventDragPreview()
                    }
                  }}
                  onDrop={async (e) => {
                    e.preventDefault()
                    e.stopPropagation()

                    const elements = document.elementsFromPoint(e.clientX, e.clientY)
                    const hourCell = elements.find(el => el.classList.contains('hour-cell'))

                    if (hourCell) {
                      const hour = parseInt(hourCell.getAttribute('data-hour'), 10)
                      if (!isNaN(hour)) {
                        await handleCombinedDropOnHourCell(e, day, hour, hourCell)
                      }
                    }

                    clearEventDragPreview()
                    clearTodoDragPreview()
                    cleanupDragArtifacts()
                    document.body.classList.remove('calendar-drag-focus')
                  }}
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
                    onDrop={(e) => handleCombinedDropOnHourCell(e, day, hour, e.currentTarget)}
                    onDragOver={(e) => {
                      handleHourCellDragOver(e, day, hour);
                      handleHourCellTodoDragOver(e, day, hour);
                    }}
                    onDragLeave={(e) => {
                      handleDragLeave(e);
                      if (document.body.classList.contains('task-dragging')) {
                        const relatedTarget = e.relatedTarget;
                        if (!relatedTarget || !relatedTarget.closest('.hour-cell')) {
                          clearTodoDragPreview();
                        }
                      }
                    }}
                  />
                ))}
                
                {/* Drag selection indicator */}
                {isDragging && dragDay && isSameDay(dragDay, day) && (
                  <div
                    className="absolute left-0 right-0 bg-blue-200 dark:bg-blue-700 opacity-50 pointer-events-none rounded"
                    style={{
                      top: `${(Math.min(dragStart, dragEnd) - DAY_START_HOUR) * HOUR_HEIGHT}px`,
                      height: `${Math.abs(dragEnd - dragStart) * HOUR_HEIGHT || HOUR_HEIGHT/4}px`,
                      left: '2px',
                      right: '2px',
                      borderRadius: '6px',
                      zIndex: 10
                    }}
                  />
                )}

                {/* Preview while dragging a todo into this day/hour slot */}
                {todoDragPreview && !todoDragPreview.isAllDay && isSameDay(todoDragPreview.start, day) && (() => {
                  const colors = getEventColors(todoDragPreview.color || 'blue')
                  const previewStart = todoDragPreview.start
                  const previewEnd = todoDragPreview.end
                  const previewTop = (previewStart.getHours() - DAY_START_HOUR) * HOUR_HEIGHT + (previewStart.getMinutes() / 60) * HOUR_HEIGHT
                  const previewDuration = Math.max(5, differenceInMinutes(previewEnd, previewStart))
                  const previewHeight = (previewDuration / 60) * HOUR_HEIGHT
                  return (
                    <div
                      className="absolute rounded-lg p-1 overflow-hidden text-sm pointer-events-none shadow-sm"
                      style={{
                        top: `${previewTop}px`,
                        minHeight: `${previewHeight}px`,
                        left: '2px',
                        right: '2px',
                        backgroundColor: colors.background,
                        opacity: 1,
                        boxShadow: '0 0 0 1px rgba(148, 163, 184, 0.5)',
                        zIndex: 9997
                      }}
                    >
                      <div 
                        className="absolute top-0 bottom-0 w-1 rounded-full pointer-events-none" 
                        style={{ 
                          left: '2px',
                          backgroundColor: colors.border,
                          zIndex: 3
                        }}
                      />
                      <div className="ml-3">
                        <div className="font-medium text-xs truncate" style={{ color: colors.text }}>
                          {todoDragPreview.title}
                        </div>
                        <div className="text-xs" style={{ color: 'rgba(55, 65, 81, 0.75)' }}>
                          {format(previewStart, 'h:mm a')} - {format(previewEnd, 'h:mm a')}
                        </div>
                      </div>
                    </div>
                  )
                })()}

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
                      key={event.clientKey || event.id || `${(event.start instanceof Date ? event.start : new Date(event.start)).getTime()}-${column}-${columns}`}
                      event={{
                        ...event,
                        color: event.color || 'blue'
                      }}
                      hourHeight={HOUR_HEIGHT}
                      dayStartHour={DAY_START_HOUR}
                      dayEndHour={DAY_END_HOUR}
                      position={{ column, columns, gap: TIMED_EVENT_GAP }}
                    />
                  ));
                })()}
              </div>
            );})}
          </div>
        </div>
      </div>
    </div>
  )
}

export default WeeklyView
