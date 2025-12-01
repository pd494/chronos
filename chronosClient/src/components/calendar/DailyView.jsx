import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { format, getHours, getMinutes, addDays, differenceInMinutes } from 'date-fns'
import { useCalendar } from '../../context/CalendarContext'
import { useTaskContext } from '../../context/TaskContext'
import DayEvent from '../events/DayEvent'
import AllDayEvent from '../events/AllDayEvent'
import { calculateTimeGridLayout } from '../../lib/eventLayout'
import { getEventColors } from '../../lib/eventColors'
import './DailyView.css'

const HOUR_HEIGHT = 55 // Height of one hour in pixels (zoomed out ~15% from default)
const TIME_FOCUS_RATIO = 0.6 // Position current time ~60% down the viewport
const DAY_START_HOUR = 0 // Start displaying from 12 AM
const DAY_END_HOUR = 23 // End displaying at 11 PM
const ALL_DAY_SECTION_HEIGHT = 40 // Height of the all-day events section
const ALL_DAY_EVENT_HEIGHT = 30
const ALL_DAY_EVENT_GAP = 4
const TIMED_EVENT_GAP = 4
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
const DRAG_DISTANCE_THRESHOLD = 0.08 // ~5 minutes to start the preview

const DailyView = () => {
  const {
    currentDate,
    view,
    events,
    navigateToNext,
    navigateToPrevious,
    openEventModal,
    getEventsForDate,
    updateEvent,
    showEventModal
  } = useCalendar()
  
  const { convertTodoToEvent } = useTaskContext()
  
  const scrollContainerRef = useRef(null)
  const touchStartX = useRef(null)
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollThreshold = 50
  const timelineRef = useRef(null)
  
  // State for drag-to-create event functionality
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState(null)
  const [dragEnd, setDragEnd] = useState(null)
  const [persistedDragPreview, setPersistedDragPreview] = useState(null) // Keeps preview visible while modal is open
  const hasDraggedRef = useRef(false)
  const dragTimeoutRef = useRef(null)
  const dragInitialHourRef = useRef(null)
  const activeDropCellRef = useRef(null)
  const [isEventResizing, setIsEventResizing] = useState(false)
  const isEventResizeActiveRef = useRef(false)
  const [dragPreviewEvent, setDragPreviewEvent] = useState(null) // Ghost preview for dragged event
  const [todoDragPreview, setTodoDragPreview] = useState(null) // Preview while dragging a todo onto the calendar
  const cleanupDragArtifacts = useCallback(() => {
    try {
      document.body.classList.remove('calendar-drag-focus');
      ['.sortable-ghost', '.task-ghost', '.sortable-drag', '.task-drag', '[data-is-clone="true"]'].forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (!el.closest('.task-list')) {
            el.parentNode?.removeChild(el)
          }
        })
      })
    } catch (_) {}
  }, [])
  
  const scrollToCurrentTime = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const now = new Date()
    const currentHour = getHours(now)
    const currentMinute = getMinutes(now)
    const withinDay = currentHour >= DAY_START_HOUR && currentHour <= DAY_END_HOUR
    const rawPosition = withinDay
      ? ((currentHour - DAY_START_HOUR) * HOUR_HEIGHT) + ((currentMinute / 60) * HOUR_HEIGHT)
      : 60
    const centeredPosition = rawPosition - (container.clientHeight * TIME_FOCUS_RATIO) + (HOUR_HEIGHT / 2)
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
    container.scrollTop = Math.max(0, Math.min(centeredPosition, maxScroll))
  }, [])

  useEffect(() => {
    // run after paint so heights are settled
    const raf = requestAnimationFrame(() => {
      scrollToCurrentTime()
      // second pass to catch late layout shifts
      requestAnimationFrame(scrollToCurrentTime)
    })
    return () => cancelAnimationFrame(raf)
  }, [scrollToCurrentTime, view, currentDate])
  
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
  const handleEventDrop = (e, hour, hourCellElement = null) => {
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
      const cellElement = hourCellElement || e.currentTarget;
      const rect = cellElement.getBoundingClientRect();
      const relativeY = Math.min(rect.height, Math.max(0, e.clientY - rect.top));
      const minutePercentage = rect.height ? relativeY / rect.height : 0;
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
    clearTodoDragPreview();
  };

  // Track pending todo drop to prevent duplicate conversions
  const pendingTodoConversionRef = useRef(null);

  // Handle todo drop on hour cell
  const handleTodoDropOnHourCell = async (e, hour, _hourCellElement = null) => {
    const isTodoDrag = document.body.classList.contains('task-dragging') || !!getDraggedTodoMeta();
    if (!isTodoDrag) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    if (pendingTodoConversionRef.current) return;
    
    const draggedTodoMeta = getDraggedTodoMeta();
    if (!draggedTodoMeta) return;
    
    const taskId = draggedTodoMeta.taskId;
    if (!taskId) return;
    
    pendingTodoConversionRef.current = taskId;
    const { start: startDate, end: endDate } = buildHourlyRange(currentDate, hour);
    
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
  const handleCombinedDropOnHourCell = async (e, hour, hourCellElement = null) => {
    const isTodoDrag = document.body.classList.contains('task-dragging') || !!getDraggedTodoMeta();
    if (isTodoDrag) {
      await handleTodoDropOnHourCell(e, hour, hourCellElement);
    } else {
      handleEventDrop(e, hour, hourCellElement);
    }
  };

  // Handle todo drop on all-day section
  const handleTodoDropOnAllDay = async (e) => {
    const isTodoDrag = document.body.classList.contains('task-dragging') || !!getDraggedTodoMeta();
    if (!isTodoDrag) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    if (pendingTodoConversionRef.current) return;
    
    const draggedTodoMeta = getDraggedTodoMeta();
    if (!draggedTodoMeta) return;
    
    const taskId = draggedTodoMeta.taskId;
    if (!taskId) return;
    
    pendingTodoConversionRef.current = taskId;
    
    const startDate = new Date(currentDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = addDays(startDate, 1);
    
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

  // Handle todo drag over hour cells for preview
  const handleHourCellTodoDragOver = (e, hour) => {
    if (document.body.classList.contains('task-dragging')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const { start, end } = buildHourlyRange(currentDate, hour)
      setTodoDropPreview(start, end, false);
    }
  };

  // Handle todo drag over all-day section for preview
  const handleAllDayTodoDragOver = (e) => {
    if (document.body.classList.contains('task-dragging')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      
      const startDate = new Date(currentDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = addDays(startDate, 1);
      setTodoDropPreview(startDate, endDate, true);
    }
  };

  const setDropTarget = (cell) => {
    if (activeDropCellRef.current === cell) return;
    if (activeDropCellRef.current) {
      activeDropCellRef.current.classList.remove('event-dragover');
    }
    if (cell) {
      cell.classList.add('event-dragover');
    }
    activeDropCellRef.current = cell || null;
  };

  const clearDropTarget = () => {
    if (activeDropCellRef.current) {
      activeDropCellRef.current.classList.remove('event-dragover');
      activeDropCellRef.current = null;
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
  const updateEventDragPreview = (e, hourCell, hour) => {
    if (!hourCell) {
      clearEventDragPreview()
      return
    }
    setDropTarget(hourCell);
    const rect = hourCell.getBoundingClientRect()
    const relativeY = Math.min(rect.height, Math.max(0, e.clientY - rect.top))
    const minutePercentage = rect.height ? relativeY / rect.height : 0
    const minutes = Math.floor(minutePercentage * 60)
    const { hour: snappedHour, minutes: snappedMinutes } = snapHourMinutePair(hour, minutes)
    const dragMeta = typeof window !== 'undefined' ? window.__chronosDraggedEventMeta : null
    if (!dragMeta) {
      clearEventDragPreview();
      return
    }
    const durationMs = dragMeta.durationMs || 60 * 60 * 1000
    const newStart = new Date(currentDate)
    newStart.setHours(snappedHour, snappedMinutes, 0, 0)
    const newEnd = new Date(newStart.getTime() + durationMs)
    
    // Set ghost preview state for rendering
    setDragPreviewEvent({
      id: dragMeta.id,
      title: dragMeta.title,
      color: dragMeta.color,
      start: newStart,
      end: newEnd
    })
    
    emitDragPreviewUpdate(newStart, newEnd)
  };

  const clearEventDragPreview = () => {
    clearDropTarget();
    setDragPreviewEvent(null);
    emitDragPreviewUpdate(null, null);
  };
  const resetPreviewIfNoTarget = () => {
    clearEventDragPreview();
    document.body.classList.remove('calendar-drag-focus');
    // Remove any lingering drag artifacts so the cursor resets
    queueMicrotask(() => {
      ['.sortable-ghost', '.task-ghost', '.sortable-drag', '.task-drag'].forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (!el.closest('.task-list')) {
            el.parentNode?.removeChild(el)
          }
        })
      })
    })
  };

  const getDraggedTodoMeta = useCallback(() => {
    if (typeof window === 'undefined') return null
    return window.__chronosDraggedTodoMeta || null
  }, [])

  const clearTodoDragPreview = useCallback(() => {
    setTodoDragPreview(null)
  }, [])

  const setTodoDropPreview = useCallback((startDate, endDate, isAllDay = false) => {
    if (typeof window !== 'undefined' && window.__chronosTodoOverlayActive) {
      return
    }
    const meta = getDraggedTodoMeta()
    const metaColor = typeof meta?.color === 'string' ? meta.color.toLowerCase() : meta?.color
    setTodoDragPreview({
      start: startDate,
      end: endDate,
      isAllDay,
      title: meta?.title || 'New task',
      color: metaColor || 'blue'
    })
  }, [getDraggedTodoMeta])

  // When the floating todo pill is active, immediately clear any
  // inline todo previews so they never appear at the same time.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handler = (evt) => {
      if (evt?.detail?.active) {
        setTodoDragPreview(null)
      }
    }
    window.addEventListener('chronos-todo-overlay-state', handler)
    return () => window.removeEventListener('chronos-todo-overlay-state', handler)
  }, [])

  const cancelDragCreatePreview = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
    hasDraggedRef.current = false;
    dragInitialHourRef.current = null;
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
      dragTimeoutRef.current = null;
    }
    clearEventDragPreview();
  }, [clearEventDragPreview]);

  useEffect(() => {
    const handleResizeStart = () => {
      isEventResizeActiveRef.current = true;
      setIsEventResizing(true);
      cancelDragCreatePreview();
    };
    const handleResizeEnd = () => {
      isEventResizeActiveRef.current = false;
      setIsEventResizing(false);
    };
    window.addEventListener('chronos-event-resize-start', handleResizeStart);
    window.addEventListener('chronos-event-resize-end', handleResizeEnd);
    return () => {
      window.removeEventListener('chronos-event-resize-start', handleResizeStart);
      window.removeEventListener('chronos-event-resize-end', handleResizeEnd);
    };
  }, [cancelDragCreatePreview]);

  const handleHourCellDragOver = (e, hour) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const isTodoDrag = document.body.classList.contains('task-dragging')
    if (isTodoDrag) {
      document.body.classList.add('calendar-drag-focus')
      const { start, end } = buildHourlyRange(currentDate, hour)
      setTodoDropPreview(start, end, false)
    }
    updateEventDragPreview(e, e.currentTarget, hour);
  };
  const handleAllDayDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearDropTarget();
    clearEventDragPreview();

    if (document.body.classList.contains('task-dragging')) {
      document.body.classList.add('calendar-drag-focus')
      const startDate = new Date(currentDate)
      startDate.setHours(0, 0, 0, 0)
      const endDate = addDays(startDate, 1)
      setTodoDropPreview(startDate, endDate, true)
    }
  };

  const handleDragLeave = () => {
    resetPreviewIfNoTarget();
    clearTodoDragPreview();
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
    document.body.classList.remove('calendar-drag-focus');
    queueMicrotask(() => {
      ['.sortable-ghost', '.task-ghost', '.sortable-drag', '.task-drag'].forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (!el.closest('.task-list')) {
            el.parentNode?.removeChild(el)
          }
        })
      })
    })
  };

  const handleCellMouseDown = (e, hour) => {
    if (e.button !== 0) return
    
    // Don't start drag-to-create if an event is being resized or if a todo drag is in progress
    if (isEventResizeActiveRef.current || (typeof window !== 'undefined' && window.__chronosEventResizing)) {
      return
    }
    
    // Don't start drag-to-create if a todo drag is in progress
    if (document.body.classList.contains('task-dragging')) {
      return
    }
    
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
    
    // Don't continue drag-to-create if an event is being resized
    if (isEventResizeActiveRef.current || (typeof window !== 'undefined' && window.__chronosEventResizing)) {
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
    
    if (isEventResizeActiveRef.current || isEventResizing) return;
    
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
      
      // Persist the drag preview while modal is open
      setPersistedDragPreview({
        startHour,
        endHour,
        startDate,
        endDate
      });
      
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
  
  // Clear persisted drag preview when modal closes
  useEffect(() => {
    if (!showEventModal && persistedDragPreview) {
      setPersistedDragPreview(null)
    }
  }, [showEventModal])
  
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
  

  
  return (
    <div 
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
              onDrop={async (e) => {
                const isTodoDrag = document.body.classList.contains('task-dragging') || !!getDraggedTodoMeta();
                if (isTodoDrag) {
                  await handleTodoDropOnAllDay(e);
                } else {
                  handleAllDayEventDrop(e);
                }
              }}
              onDragOver={(e) => {
                handleAllDayDragOver(e);
                handleAllDayTodoDragOver(e);
              }}
              onDragLeave={handleDragLeave}
            >
              {allDayEvents.map(event => renderAllDayEvent(event))}
              {todoDragPreview?.isAllDay && (() => {
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
              {allDayEvents.length === 0 && (
                <div className="text-xs text-gray-400 italic">Drop tasks here for all-day events</div>
              )}
            </div>
          </div>
        );
      })()}
      
      <div
        ref={scrollContainerRef}
        className="relative flex flex-1 overflow-y-auto min-h-0"
      >
        {/* Time labels */}
        <div className="w-16 flex-shrink-0 relative z-10 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700" style={{ height: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px`, minHeight: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px` }}>
          {hours.map((hour) => (
            <div 
              key={hour} 
              className="relative"
              style={{ height: `${HOUR_HEIGHT}px` }}
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
            data-day-column="true"
            style={{ height: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px`, minHeight: `${(DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT}px` }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = document.body.classList.contains('task-dragging') ? 'copy' : 'move'
              
              const elements = document.elementsFromPoint(e.clientX, e.clientY)
              const hourCell = elements.find(el => el.classList.contains('day-hour-cell'))
              
              if (hourCell) {
                const hour = parseInt(hourCell.getAttribute('data-hour'), 10)
                if (!isNaN(hour)) {
                  updateEventDragPreview(e, hourCell, hour)
                  handleHourCellTodoDragOver(e, hour)
                }
              }
            }}
            onDrop={async (e) => {
              e.preventDefault()
              e.stopPropagation()
              
              const elements = document.elementsFromPoint(e.clientX, e.clientY)
              const hourCell = elements.find(el => el.classList.contains('day-hour-cell'))
              
              if (hourCell) {
                const hour = parseInt(hourCell.getAttribute('data-hour'), 10)
                if (!isNaN(hour)) {
                  await handleCombinedDropOnHourCell(e, hour)
                }
              }
              
              clearEventDragPreview()
              clearTodoDragPreview()
              cleanupDragArtifacts()
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
                onDrop={(e) => handleCombinedDropOnHourCell(e, hour, e.currentTarget)}
                onDragOver={(e) => {
                  handleHourCellDragOver(e, hour);
                  handleHourCellTodoDragOver(e, hour);
                }}
                onDragLeave={(e) => {
                  handleDragLeave(e);
                  if (document.body.classList.contains('task-dragging')) {
                    const relatedTarget = e.relatedTarget;
                    if (!relatedTarget || !relatedTarget.closest('.day-hour-cell')) {
                      clearTodoDragPreview();
                    }
                  }
                }}
              />
            ))}
            
            {/* Drag preview - actual event marker UI (shows during drag AND while modal is open) */}
            {(isDragging && !isEventResizing && dragStart !== null && dragEnd !== null || persistedDragPreview) && (() => {
              const colors = getEventColors('blue')
              const startHourVal = persistedDragPreview ? persistedDragPreview.startHour : Math.min(dragStart, dragEnd)
              const endHourVal = persistedDragPreview ? persistedDragPreview.endHour : Math.max(dragStart, dragEnd)
              const previewTop = startHourVal * HOUR_HEIGHT
              const previewHeight = Math.max((endHourVal - startHourVal) * HOUR_HEIGHT, HOUR_HEIGHT / 4)
              
              // Calculate preview times
              const previewStartDate = persistedDragPreview ? persistedDragPreview.startDate : (() => {
                const d = new Date(currentDate)
                d.setHours(Math.floor(startHourVal), Math.round((startHourVal % 1) * 60), 0, 0)
                return d
              })()
              const previewEndDate = persistedDragPreview ? persistedDragPreview.endDate : (() => {
                const d = new Date(currentDate)
                d.setHours(Math.floor(endHourVal), Math.round((endHourVal % 1) * 60), 0, 0)
                return d
              })()
              
              return (
                <div
                  className="absolute rounded-lg p-1 overflow-hidden text-sm pointer-events-none"
                  style={{
                    top: `${previewTop}px`,
                    minHeight: `${previewHeight}px`,
                    left: '4px',
                    right: '4px',
                    backgroundColor: colors.background,
                    opacity: 0.9,
                    zIndex: 50
                  }}
                >
                  <div 
                    className="absolute top-0.5 bottom-0.5 w-1 rounded-full pointer-events-none" 
                    style={{ 
                      left: '1px',
                      backgroundColor: colors.border,
                      zIndex: 3
                    }}
                  />
                  <div className="ml-2">
                    <div className="font-medium text-xs" style={{ color: colors.text, marginLeft: '2px' }}>
                      New Event
                    </div>
                    <div className="text-xs" style={{ color: 'rgba(55, 65, 81, 0.7)', fontWeight: 500 }}>
                      {format(previewStartDate, 'h:mm a')} – {format(previewEndDate, 'h:mm a')}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Events for this day (only regular events, not all-day) */}
            {calculateTimeGridLayout(regularEvents).map(({ event, column, columns, stackIndex, stackCount }) => (
              <DayEvent 
                key={event.clientKey || event.id || `${(event.start instanceof Date ? event.start : new Date(event.start)).getTime()}-${column}-${columns}`} 
                event={event} 
                hourHeight={HOUR_HEIGHT} 
                dayStartHour={DAY_START_HOUR}
                dayEndHour={DAY_END_HOUR}
                position={{ column, columns, stackIndex, stackCount, gap: TIMED_EVENT_GAP }}
              />
            ))}

            {/* Preview while dragging a todo onto an hour cell */}
            {todoDragPreview && !todoDragPreview.isAllDay && (() => {
              const previewStart = todoDragPreview.start
              const previewEnd = todoDragPreview.end
              const colors = getEventColors(todoDragPreview.color || 'blue')
              const previewTop = (previewStart.getHours() - DAY_START_HOUR) * HOUR_HEIGHT + (previewStart.getMinutes() / 60) * HOUR_HEIGHT
              const previewDuration = Math.max(5, differenceInMinutes(previewEnd, previewStart))
              const previewHeight = (previewDuration / 60) * HOUR_HEIGHT
              
              return (
                <div
                  className="absolute rounded-lg p-1 overflow-hidden text-sm pointer-events-none shadow-sm"
                  style={{
                    top: `${previewTop}px`,
                    minHeight: `${previewHeight}px`,
                    left: '4px',
                    right: '4px',
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
            
            {/* Ghost preview showing where dragged event will be placed */}
            {dragPreviewEvent && (() => {
              const colors = getEventColors(dragPreviewEvent.color || 'blue')
              const previewStart = dragPreviewEvent.start
              const previewEnd = dragPreviewEvent.end
              const previewTop = (previewStart.getHours() - DAY_START_HOUR) * HOUR_HEIGHT + (previewStart.getMinutes() / 60) * HOUR_HEIGHT
              const previewDuration = Math.max(5, differenceInMinutes(previewEnd, previewStart))
              const previewHeight = (previewDuration / 60) * HOUR_HEIGHT
              
              return (
                <div
                  className="absolute rounded-lg p-1 overflow-hidden text-sm pointer-events-none"
                  style={{
                    top: `${previewTop}px`,
                    minHeight: `${previewHeight}px`,
                    left: '4px',
                    right: '4px',
                    backgroundColor: colors.background,
                    opacity: 0.7,
                    border: `2px dashed ${colors.border}`,
                    zIndex: 50
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
                    <div className="font-medium text-xs" style={{ color: colors.text }}>
                      {dragPreviewEvent.title || 'Event'}
                    </div>
                    <div className="text-xs" style={{ color: 'rgba(55, 65, 81, 0.7)' }}>
                      {format(previewStart, 'h:mm a')} - {format(previewEnd, 'h:mm a')}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DailyView
