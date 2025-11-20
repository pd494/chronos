import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  format,
  isSameDay,
  isToday,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  endOfMonth,
  startOfDay,
  addDays,
  addWeeks,
  addMonths,
  subMonths,
  differenceInCalendarDays,
} from 'date-fns';
import { useCalendar } from '../../context/CalendarContext';
import { useTaskContext } from '../../context/TaskContext';
import EventIndicator from '../events/EventIndicator';
import { getEventColors } from '../../lib/eventColors';
import Sortable from 'sortablejs';
import './MonthlyView.css';

// ─── Constants ────────────────────────────────────────────────────────────
const BUFFER_WEEKS     = 260; // ~5 years either side (10 years total range)
const WEEKS_PER_VIEW   = 6;   // always render 6 rows (standard month view)
const ABOVE            = Math.floor(WEEKS_PER_VIEW / 2); // 3 when view = 6
const BELOW            = WEEKS_PER_VIEW - 1 - ABOVE;     // 2

// ─── Helpers ──────────────────────────────────────────────────────────────
const DIRECTIONAL_MONTHS = 24; // prefetch 2 years in scroll direction
const getStartOfWeekLocal = (date, weekStartsOn = 0) =>
  startOfWeek(date, { weekStartsOn });

const MULTI_DAY_LANE_HEIGHT = 24;
const MULTI_DAY_TOP_OFFSET = 35;
const MULTI_DAY_EVENT_GAP = 2;

// Helper to convert hex color to rgba with alpha (matching AllDayEvent.jsx)
const hexToRgba = (hex, alpha) => {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return hex
  const normalized = hex.replace('#', '')
  const r = parseInt(normalized.substring(0, 2), 16)
  const g = parseInt(normalized.substring(2, 4), 16)
  const b = parseInt(normalized.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const cloneDay = (day) => new Date(day.getFullYear(), day.getMonth(), day.getDate());

const normalizeDay = (value) => {
  if (!value) return null
  if (value instanceof Date) {
    return startOfDay(value)
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed)
}

const RANGE_DRAG_DELAY = 120
const RANGE_DRAG_THRESHOLD = 6
const INITIAL_RANGE_SELECTION = { active: false, committed: false, finalized: false, start: null, end: null }

const computeWeekSpanLayout = (weekDays, getEventsForDate) => {
  const weekStart = startOfDay(weekDays[0])
  const weekEvents = new Map()
  weekDays.forEach((day) => {
    const events = getEventsForDate(day) || []
    events.forEach((event) => {
      if (event?.id && !weekEvents.has(event.id)) {
        weekEvents.set(event.id, event)
      }
    })
  })

  const spans = []
  weekEvents.forEach((event) => {
    const start = normalizeDay(event.start)
    if (!start) return
    const rawEnd = event.end ? new Date(event.end) : null
    if (!rawEnd || Number.isNaN(rawEnd.getTime())) return
    const endBoundary = startOfDay(rawEnd)
    const inclusiveEnd = event.isAllDay
      ? addDays(endBoundary, -1)
      : startOfDay(new Date(rawEnd.getTime() - 1))
    if (inclusiveEnd < start) return
    const totalDays = differenceInCalendarDays(inclusiveEnd, start) + 1
    
    // Only show as multi-day span if it's explicitly all-day OR spans multiple calendar days
    const isMultiDay = event.isAllDay || totalDays > 1
    if (!isMultiDay || totalDays <= 1) return

    const startIndex = Math.max(0, differenceInCalendarDays(start, weekStart))
    const endIndex = Math.min(
      6,
      differenceInCalendarDays(inclusiveEnd, weekStart)
    )
    if (endIndex < 0 || startIndex > 6) return
    const clampedStart = Math.max(0, startIndex)
    const clampedEnd = Math.max(clampedStart, endIndex)
    spans.push({
      id: event.id,
      event: {
        ...event,
        isAllDay: isMultiDay, // Treat multi-day events as all-day for styling
        originalIsAllDay: Boolean(event.isAllDay)
      },
      startIndex: clampedStart,
      endIndex: clampedEnd,
      length: clampedEnd - clampedStart + 1
    })
  })

  spans.sort((a, b) => {
    if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex
    if (a.length !== b.length) return b.length - a.length
    return String(a.id).localeCompare(String(b.id))
  })

  const laneEnd = []
  spans.forEach((span) => {
    let lane = 0
    while (laneEnd[lane] !== undefined && laneEnd[lane] >= span.startIndex) {
      lane += 1
    }
    laneEnd[lane] = span.endIndex
    span.lane = lane
  })

  return {
    spans,
    laneCount: laneEnd.length,
    multiDayIds: new Set(spans.map((span) => span.id))
  }
}

// ─── Component ────────────────────────────────────────────────────────────
const MonthlyView = () => {
  const {
    currentDate,
    selectDate,
    getEventsForDate,
    setHeaderDisplayDate,
    fetchEventsForRange,
    initialLoading,
    openEventModal,
    showEventModal,
    setView,
    updateEvent,
  } = useCalendar();

  const { convertTodoToEvent } = useTaskContext();

  const [referenceDate] = useState(new Date());   // today, fixed
  const todayWeekIndex  = ABOVE + BUFFER_WEEKS;   // week offset to today

  const [visibleWeekRange, setVisibleWeekRange] = useState(() => {
    const thisWeek = getStartOfWeekLocal(referenceDate);
    return {
      startDate: addWeeks(thisWeek, -ABOVE - BUFFER_WEEKS),
      endDate:   addWeeks(thisWeek,  BELOW + BUFFER_WEEKS),
    };
  });

  const [displayMonthDate, setDisplayMonthDate] = useState(referenceDate);
  const [rowHeight, setRowHeight] = useState(0);
  const [cellSize, setCellSize]   = useState(0);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 }); // Only render ~20 weeks at a time
  const [rangeSelection, setRangeSelection] = useState(INITIAL_RANGE_SELECTION);
  const rangeStartClientRef = useRef(null);
  const rangeDelayTimerRef = useRef(null);

  const normalizedSelection = useMemo(() => {
    if (!rangeSelection.committed || !rangeSelection.start || !rangeSelection.end) return null
    const start =
      rangeSelection.start <= rangeSelection.end
        ? startOfDay(rangeSelection.start)
        : startOfDay(rangeSelection.end)
    const end =
      rangeSelection.start >= rangeSelection.end
        ? startOfDay(rangeSelection.start)
        : startOfDay(rangeSelection.end)
    return { start, end }
  }, [rangeSelection.committed, rangeSelection.start, rangeSelection.end])

  const cancelRangeSelection = useCallback(() => {
    document.body.classList.remove('month-range-selecting')
    document.body.style.overflow = ''
    document.body.style.userSelect = ''
    setRangeSelection(INITIAL_RANGE_SELECTION)
    rangeStartClientRef.current = null
    if (rangeDelayTimerRef.current) {
      clearTimeout(rangeDelayTimerRef.current)
      rangeDelayTimerRef.current = null
    }
  }, [])

  const finalizeRangeSelection = useCallback(() => {
    if (!rangeSelection.committed || !rangeSelection.start || !rangeSelection.end) {
      cancelRangeSelection()
      return
    }
    const start =
      rangeSelection.start <= rangeSelection.end
        ? rangeSelection.start
        : rangeSelection.end
    const end =
      rangeSelection.start >= rangeSelection.end
        ? rangeSelection.start
        : rangeSelection.end
    const startDate = startOfDay(start)
    const endDate = startOfDay(addDays(end, 1))
    document.body.style.overflow = ''
    document.body.style.userSelect = ''
    document.body.classList.remove('month-range-selecting')
    // Don't cancel selection, just mark it as finalized so preview stays visible
    setRangeSelection(prev => ({ ...prev, active: false, finalized: true }))
    openEventModal({
      start: startDate,
      end: endDate,
      isAllDay: true,
      title: 'New Event',
      color: '#1761C7'
    }, true)
  }, [rangeSelection, openEventModal])

  useEffect(() => {
    if (!rangeSelection.active) return
    const handleMouseUp = () => finalizeRangeSelection()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        cancelRangeSelection()
      }
    }
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [rangeSelection.active, finalizeRangeSelection, cancelRangeSelection])

  // Clear range preview when modal closes
  useEffect(() => {
    if (!showEventModal && rangeSelection.finalized) {
      cancelRangeSelection()
    }
  }, [showEventModal, rangeSelection.finalized, cancelRangeSelection])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handler = () => cancelRangeSelection()
    window.addEventListener('chronos:month-range-reset', handler)
    return () => {
      window.removeEventListener('chronos:month-range-reset', handler)
    }
  }, [cancelRangeSelection])

  useEffect(() => {
    return () => {
      document.body.classList.remove('month-range-selecting')
      document.body.style.overflow = ''
      document.body.style.userSelect = ''
    }
  }, [])

  const scrollContainerRef = useRef(null);
  const headerRef = useRef(null);
  const requestedRangesRef = useRef(new Set());
  const lastScrollTopRef = useRef(0);
  const lastScrollTsRef = useRef(0);
  const lastHeaderMonthRef = useRef(null);
  const hasUserScrolledRef = useRef(false);

  // ── build weeks for current range ───────────────────────────────────────
  const weeks = useMemo(() => {
    const all = [];
    let cur   = visibleWeekRange.startDate;
    while (cur <= visibleWeekRange.endDate) {
      const days = Array.from({ length: 7 }, (_, i) => addDays(cur, i));
      all.push({ weekStart: formatDateKey(cur), days });
      cur = addWeeks(cur, 1);
    }
    return all;
  }, [visibleWeekRange]);

  // ── resize listener keeps square cells ──────────────────────────────────
  useEffect(() => {
    const update = () => {
      if (!scrollContainerRef.current) return;
      const containerHeight = scrollContainerRef.current.clientHeight;
      
      // Calculate row height to fit exactly 6 weeks
      const rowHeightFromContainer = containerHeight / WEEKS_PER_VIEW;
      
      // Make cells perfect squares: width = height
      const cellSize = rowHeightFromContainer;
      
      setCellSize(cellSize);
      setRowHeight(cellSize);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);


  // ── jump to today once row height is known ──────────────────────────────
  useEffect(() => {
    if (!scrollContainerRef.current || rowHeight === 0) return;
    const top =
      todayWeekIndex * rowHeight
      - scrollContainerRef.current.clientHeight / 2
      + rowHeight / 2;
    scrollContainerRef.current.scrollTop = Math.max(0, top);
  }, [rowHeight, todayWeekIndex]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || rowHeight === 0) return;

    let fetchTimeout = null;

    const handleScroll = (evt) => {
      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      
      const startWeek = Math.max(0, Math.floor(scrollTop / rowHeight));
      const endWeek = Math.min(weeks.length, Math.ceil((scrollTop + containerHeight) / rowHeight));
      
      const bufferSize = 10;
      setVisibleRange({
        start: Math.max(0, startWeek - bufferSize),
        end: Math.min(weeks.length, endWeek + bufferSize)
      });

      if (weeks.length) {
        const clampedStart = Math.min(startWeek, weeks.length - 1);
        const clampedEnd = Math.max(clampedStart + 1, endWeek);

        if (clampedStart >= 0 && clampedEnd > clampedStart) {
          const visibleWeeksList = weeks.slice(clampedStart, clampedEnd);
          if (visibleWeeksList.length) {
            const monthTallies = new Map();
            visibleWeeksList.forEach(({ days }) => {
              days.forEach((day) => {
                const key = `${day.getFullYear()}-${day.getMonth()}`;
                if (!monthTallies.has(key)) {
                  monthTallies.set(key, {
                    count: 1,
                    representativeDate: new Date(day.getFullYear(), day.getMonth(), 1)
                  });
                } else {
                  const data = monthTallies.get(key);
                  data.count += 1;
                }
              });
            });

            const totalDaysVisible = visibleWeeksList.length * 7;
            let leadingMonth = null;
            monthTallies.forEach((value, key) => {
              if (!leadingMonth || value.count > leadingMonth.count) {
                leadingMonth = { key, ...value };
              }
            });

            let newHeaderDate = null;
            if (leadingMonth && leadingMonth.count >= totalDaysVisible / 2) {
              newHeaderDate = leadingMonth.representativeDate;
            } else {
              const allVisibleDays = [];
              visibleWeeksList.forEach(({ days }) => allVisibleDays.push(...days));
              if (allVisibleDays.length) {
                newHeaderDate = allVisibleDays[Math.floor(allVisibleDays.length / 2)];
              }
            }

            if (newHeaderDate) {
              const newKey = `${newHeaderDate.getFullYear()}-${newHeaderDate.getMonth()}`;
              if (lastHeaderMonthRef.current !== newKey) {
                lastHeaderMonthRef.current = newKey;
                setDisplayMonthDate(newHeaderDate);
                setHeaderDisplayDate(newHeaderDate);
              }
            }
          }
        }
      }

      // Directional+velocity predictive prefetch
      const now = performance.now();
      const prevTop = lastScrollTopRef.current;
      const prevTs = lastScrollTsRef.current || now;
      const deltaY = scrollTop - prevTop;
      const dt = Math.max(1, now - prevTs);
      lastScrollTopRef.current = scrollTop;
      lastScrollTsRef.current = now;
      const fastScroll = Math.abs(deltaY) > rowHeight * 2; // moved more than ~2 weeks quickly
      const isUserScroll = Boolean(evt?.isTrusted);
      if (isUserScroll) {
        hasUserScrolledRef.current = true;
      }

      if (isUserScroll && !initialLoading && weeks[startWeek] && weeks[endWeek - 1]) {
        const rangeStart = weeks[startWeek].days[0];
        const rangeEnd = weeks[endWeek - 1].days[6];

        // Normal neighborhood prefetch (±3 months)
        const normStart = startOfWeek(startOfMonth(subMonths(rangeStart, 3)));
        const normEnd = endOfWeek(endOfMonth(addMonths(rangeEnd, 3)));
        const normKey = `${normStart.getTime()}_${normEnd.getTime()}`;
        if (!requestedRangesRef.current.has(normKey)) {
          requestedRangesRef.current.add(normKey);
          fetchEventsForRange(normStart, normEnd, true).catch(() => {});
        }

        // Directional extended prefetch when scrolling fast
        // When scrolling up, always prefetch previous 24 months block
        if (deltaY < 0) {
          const upStart = startOfWeek(startOfMonth(subMonths(rangeStart, DIRECTIONAL_MONTHS)));
          const upEnd = endOfWeek(endOfMonth(subMonths(rangeStart, 1)));
          const upKey = `${upStart.getTime()}_${upEnd.getTime()}`;
          if (!requestedRangesRef.current.has(upKey)) {
            requestedRangesRef.current.add(upKey);
            fetchEventsForRange(upStart, upEnd, true).catch(() => {});
          }
        }
        // When scrolling down, prefetch next 24 months block
        if (deltaY > 0) {
          const downStart = startOfWeek(startOfMonth(addMonths(rangeEnd, 1)));
          const downEnd = endOfWeek(endOfMonth(addMonths(rangeEnd, DIRECTIONAL_MONTHS)));
          const downKey = `${downStart.getTime()}_${downEnd.getTime()}`;
          if (!requestedRangesRef.current.has(downKey)) {
            requestedRangesRef.current.add(downKey);
            fetchEventsForRange(downStart, downEnd, true).catch(() => {});
          }
        }
      }

      if (fetchTimeout) clearTimeout(fetchTimeout);
      fetchTimeout = setTimeout(() => {
        // Debounced backup prefetch also handled above; no-op here
      }, 500); 
    };

    handleScroll(); 
    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (fetchTimeout) clearTimeout(fetchTimeout);
    };
  }, [rowHeight, weeks.length, weeks, fetchEventsForRange, setHeaderDisplayDate]);

  useEffect(() => {
    if (initialLoading) {
      requestedRangesRef.current.clear();
    }
  }, [initialLoading]);

  useEffect(() => {
    if (!displayMonthDate || initialLoading) return;
    if (!hasUserScrolledRef.current) return;
    const yearPrefetchStart = startOfWeek(startOfMonth(subMonths(displayMonthDate, 12)));
    const yearPrefetchEnd = endOfWeek(endOfMonth(addMonths(displayMonthDate, 12)));
    const key = `year_${yearPrefetchStart.getTime()}_${yearPrefetchEnd.getTime()}`;
    if (!requestedRangesRef.current.has(key)) {
      requestedRangesRef.current.add(key);
      fetchEventsForRange(yearPrefetchStart, yearPrefetchEnd, true).catch(() => {});
    }
  }, [displayMonthDate, initialLoading, fetchEventsForRange]);

  useEffect(() => () => {
    requestedRangesRef.current.clear();
  }, []);

  // Handle event drop for dragging events to different days
  const handleEventDrop = useCallback((e, targetDate) => {
    e.preventDefault()
    e.stopPropagation()
    
    const eventData = e.dataTransfer.getData('event')
    if (!eventData) return
    
    try {
      const draggedEvent = JSON.parse(eventData)
      const oldStart = new Date(draggedEvent.start)
      const oldEnd = new Date(draggedEvent.end)
      
      // Calculate time difference
      const timeDiff = targetDate.getTime() - new Date(oldStart.getFullYear(), oldStart.getMonth(), oldStart.getDate()).getTime()
      
      // Create new start and end dates
      const newStart = new Date(oldStart.getTime() + timeDiff)
      const newEnd = new Date(oldEnd.getTime() + timeDiff)
      
      // Update the event
      updateEvent(draggedEvent.id, {
        ...draggedEvent,
        start: newStart,
        end: newEnd
      })
    } catch (error) {
      console.error('Error dropping event:', error)
    }
    
    // Remove dragover class
    e.currentTarget.classList.remove('event-dragover')
  }, [updateEvent])

  const handleDragOver = useCallback((e) => {
    // Only handle event drags, not todo drags (which are handled by Sortable)
    // Sortable adds 'task-dragging' class to body when dragging todos
    if (document.body.classList.contains('task-dragging')) {
      // This is a todo drag handled by Sortable, don't interfere
      return;
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    e.currentTarget.classList.add('event-dragover')
  }, [])

  const handleDragLeave = useCallback((e) => {
    // Only handle event drags, not todo drags
    if (document.body.classList.contains('task-dragging')) {
      return;
    }
    e.currentTarget.classList.remove('event-dragover')
  }, [])

  const handleRangeMouseDown = useCallback((day, event) => {
    if (event.button !== 0) return
    if (event.target.closest('[data-event-id]') || event.target.closest('.month-multiday-span')) {
      return
    }
    event.preventDefault()
    cancelRangeSelection()
    const cloned = cloneDay(day)
    const startCoords = { x: event.clientX, y: event.clientY }
    rangeStartClientRef.current = startCoords
    
    let isActive = false
    
    const handleGlobalMouseMove = (moveEvent) => {
      const dx = Math.abs(moveEvent.clientX - startCoords.x)
      const dy = Math.abs(moveEvent.clientY - startCoords.y)
      if (dx > RANGE_DRAG_THRESHOLD || dy > RANGE_DRAG_THRESHOLD) {
        if (!isActive) {
          isActive = true
          document.body.classList.add('month-range-selecting')
          document.body.style.overflow = 'hidden'
          document.body.style.userSelect = 'none'
        setRangeSelection({
          active: true,
          committed: false,
          finalized: false,
          start: cloned,
          end: cloned
        })
          // Clear the delay timer since we've activated
          if (rangeDelayTimerRef.current) {
            clearTimeout(rangeDelayTimerRef.current)
            rangeDelayTimerRef.current = null
          }
        }
      }
    }
    
    const handleGlobalMouseUp = () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
      if (rangeDelayTimerRef.current) {
        clearTimeout(rangeDelayTimerRef.current)
        rangeDelayTimerRef.current = null
      }
      if (!isActive) {
        cancelRangeSelection()
      }
    }
    
    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    
    rangeDelayTimerRef.current = window.setTimeout(() => {
      // After delay, if we haven't activated yet, cancel (it was just a click)
      if (!isActive) {
        window.removeEventListener('mousemove', handleGlobalMouseMove)
        window.removeEventListener('mouseup', handleGlobalMouseUp)
        cancelRangeSelection()
      }
    }, RANGE_DRAG_DELAY)
  }, [cancelRangeSelection])

  const handleRangeMouseEnter = useCallback((day) => {
    setRangeSelection((prev) => {
      if (!prev.active) return prev
      const cloned = cloneDay(day)
      const moved =
        prev.committed ||
        !isSameDay(cloned, prev.start) ||
        (rangeStartClientRef.current &&
          Math.abs(cloneDay(cloned) - cloneDay(prev.start)) >= RANGE_DRAG_THRESHOLD)
      return {
        ...prev,
        end: cloned,
        committed: prev.committed || moved
      }
    })
  }, [])

  const handleRangeMouseMove = useCallback((day, event) => {
    setRangeSelection((prev) => {
      if (!prev.active) return prev
      const cloned = cloneDay(day)
      const coords = rangeStartClientRef.current
      const thresholdMet = coords
        ? (Math.abs((event?.clientX ?? coords.x) - coords.x) > RANGE_DRAG_THRESHOLD ||
          Math.abs((event?.clientY ?? coords.y) - coords.y) > RANGE_DRAG_THRESHOLD)
        : false
      const moved = prev.committed || thresholdMet || !isSameDay(cloned, prev.start)
      if (!moved && isSameDay(prev.end, cloned)) {
        return prev
      }
      return {
        ...prev,
        end: cloned,
        committed: prev.committed || thresholdMet || !isSameDay(cloned, prev.start)
      }
    })
  }, [])

  // Initialize Sortable for droppable day cells
  const sortableInstancesRef = useRef([]);
  
  useEffect(() => {
    // Clean up previous instances first
    sortableInstancesRef.current.forEach(sortable => {
      if (sortable && sortable.destroy) {
        try {
          sortable.destroy();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });
    sortableInstancesRef.current = [];
    
    // Small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      const dayCells = document.querySelectorAll('.calendar-day');
      
      dayCells.forEach(cell => {
        // Skip if already has Sortable instance
        if (cell.sortableInstance) {
          return;
        }
        
        const sortable = Sortable.create(cell, {
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
            // Clean up any dragover classes
            document.querySelectorAll('.event-dragover').forEach(el => {
              el.classList.remove('event-dragover');
            });
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
            
            // Find the actual calendar-day element (evt.to might be a child)
            const targetDay = evt.to.closest('.calendar-day') || evt.to;
            const dateStr = targetDay.getAttribute('data-date');
            
            if (!dateStr) {
              console.error('Could not find data-date attribute on drop target');
              return;
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
            
            if (taskId && dateStr) {
              const [year, month, day] = dateStr.split('-').map(Number);
              // Use local date to match the calendar display
              const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
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
        
        // Store reference on the element to prevent duplicate initialization
        cell.sortableInstance = sortable;
        sortableInstancesRef.current.push(sortable);
      });
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      sortableInstancesRef.current.forEach(sortable => {
        if (sortable && sortable.destroy) {
          try {
            sortable.destroy();
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      });
      sortableInstancesRef.current = [];
      // Clear references from DOM elements
      document.querySelectorAll('.calendar-day').forEach(cell => {
        delete cell.sortableInstance;
      });
    };
  }, [weeks, convertTodoToEvent]);

  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return (
    <div className="view-container flex flex-col h-full">
      <div className="calendar-container p-4 flex flex-col flex-grow overflow-hidden">
        <div className="grid grid-cols-7 mb-2 flex-shrink-0">
          {dayNames.map((d) => (
            <div key={d} className="text-center text-sm text-gray-500 dark:text-gray-400 font-medium py-2">
              {d}
            </div>
          ))}
        </div>

        <div
          ref={scrollContainerRef}
          className="overflow-y-auto flex-grow relative bg-white dark:bg-gray-800"
          style={{ 
            height: 'calc(100% - 60px)', 
            scrollbarWidth: 'none'
          }}
        >
          <div className="relative" style={{ height: `${weeks.length * rowHeight}px` }}>
      {weeks.slice(visibleRange.start, visibleRange.end).map(({ weekStart, days }, index) => {
        const actualIndex = visibleRange.start + index;
        const spanLayout = computeWeekSpanLayout(days, getEventsForDate)
        const previewSpan = (rangeSelection.active || rangeSelection.finalized) && normalizedSelection
          ? (() => {
              const weekStartDay = startOfDay(days[0])
              const weekEndDay = startOfDay(days[6])
              if (normalizedSelection.end < weekStartDay || normalizedSelection.start > weekEndDay) {
                return null
              }
              const startIndex = Math.max(0, differenceInCalendarDays(normalizedSelection.start, weekStartDay))
              const endIndex = Math.min(6, differenceInCalendarDays(normalizedSelection.end, weekStartDay))
              if (endIndex < 0 || startIndex > 6) return null
              return {
                startIndex,
                endIndex,
                length: Math.max(1, endIndex - startIndex + 1)
              }
            })()
          : null
        const totalLanes = spanLayout.laneCount + (previewSpan ? 1 : 0)
        const spanLayerHeight = totalLanes
          ? MULTI_DAY_TOP_OFFSET + totalLanes * MULTI_DAY_LANE_HEIGHT
          : 0
        const stackedMultiDayHeight = totalLanes ? totalLanes * MULTI_DAY_LANE_HEIGHT : 0

        const renderSpan = (span, lane, extraClass = '', isPreview = false) => {
          const previewStretch = '((100% / 7) * 0.1)'
          const spanLeft = isPreview
            ? `calc(${span.startIndex} * (100% / 7) + 4px - (${previewStretch} / 2))`
            : `calc(${span.startIndex} * (100% / 7) + 4px)`
          const spanWidth = isPreview
            ? `calc(${span.length} * (100% / 7) - 8px + ${previewStretch})`
            : `calc(${span.length} * (100% / 7) - 8px)`
          const spanTop = MULTI_DAY_TOP_OFFSET + lane * MULTI_DAY_LANE_HEIGHT
          
          // Use existing color system from getEventColors
          const eventColorName = span.event.color || 'blue'
          const colors = getEventColors(eventColorName)
          const isAllDay = span.event.isAllDay
          const isHexColor = eventColorName && eventColorName.startsWith('#')
          
          // Helper functions for color manipulation
          const lightenHexColor = (hex, percent) => {
            if (typeof hex !== 'string' || !hex.startsWith('#')) return hex
            const normalized = hex.replace('#', '')
            const r = parseInt(normalized.substring(0, 2), 16)
            const g = parseInt(normalized.substring(2, 4), 16)
            const b = parseInt(normalized.substring(4, 6), 16)
            const lightenedR = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)))
            const lightenedG = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)))
            const lightenedB = Math.min(255, Math.floor(b + (255 - b) * (percent / 100)))
            return `#${lightenedR.toString(16).padStart(2, '0')}${lightenedG.toString(16).padStart(2, '0')}${lightenedB.toString(16).padStart(2, '0')}`
          }
          
          const darkenHexColor = (hex, percent) => {
            if (typeof hex !== 'string' || !hex.startsWith('#')) return hex
            const normalized = hex.replace('#', '')
            const r = parseInt(normalized.substring(0, 2), 16)
            const g = parseInt(normalized.substring(2, 4), 16)
            const b = parseInt(normalized.substring(4, 6), 16)
            const darkenedR = Math.floor(r * (1 - percent / 100))
            const darkenedG = Math.floor(g * (1 - percent / 100))
            const darkenedB = Math.floor(b * (1 - percent / 100))
            return `#${darkenedR.toString(16).padStart(2, '0')}${darkenedG.toString(16).padStart(2, '0')}${darkenedB.toString(16).padStart(2, '0')}`
          }
          
          // Get background color for hex colors (matching EventIndicator)
          const getBgStyle = () => {
            if (isPreview) return { backgroundColor: getEventColors('blue').background }
            if (isHexColor) {
              return { backgroundColor: lightenHexColor(eventColorName, 70) }
            }
            return { backgroundColor: colors.background }
          }
          
          // Get text color - match EventIndicator exactly (same color for all events)
          const getTextColor = () => {
            if (isHexColor) return darkenHexColor(eventColorName, 40)
            return 'rgb(55, 65, 81)'
          }
          
          const lineColor = isHexColor ? eventColorName : (colors.border || colors.text)
          const bgStyle = getBgStyle()
          const textColor = getTextColor()
          const startTimeLabel = (!isPreview && span.event.start && !span.event.originalIsAllDay)
            ? format(new Date(span.event.start), 'h:mma').toLowerCase()
            : null
          
          return (
            <div
              key={`${weekStart}-${span.id || 'preview'}-${lane}`}
              className={`month-multiday-span ${isAllDay ? 'all-day' : 'timed'} ${extraClass}`}
              style={{
                top: `${spanTop}px`,
                left: spanLeft,
                width: spanWidth,
                ...bgStyle
              }}
              onMouseDown={(e) => isPreview ? undefined : e.stopPropagation()}
              onClick={(e) => {
                if (isPreview) return
                e.stopPropagation()
                openEventModal(span.event)
              }}
            >
              {/* Left border line for all multi-day events */}
              {!isPreview && (
                <div 
                  style={{ 
                    width: '3.2px', 
                    height: '14px',
                    backgroundColor: lineColor,
                    borderRadius: '2px',
                    flexShrink: 0
                  }}
                />
              )}
              
              {/* Event title + optional start time */}
              <div className="flex items-center gap-1 flex-grow min-w-0">
                <span 
                  className="truncate font-medium flex-grow" 
                  style={{ 
                    color: textColor,
                    minWidth: '30px'
                  }}
                >
                  {isPreview ? 'New Event' : (span.event.title || 'Untitled')}
                </span>
                {startTimeLabel && (
                  <span 
                    className="text-[11px] font-semibold text-slate-600 whitespace-nowrap flex-shrink-0"
                  >
                    {startTimeLabel}
                  </span>
                )}
              </div>
            </div>
          )
        }

        return (
          <div
            key={weekStart}
            className="absolute left-0 right-0"
            style={{
              height: `${rowHeight}px`,
              top: `${actualIndex * rowHeight}px`
            }}
          >
            <div className="month-week-span-layer" style={{ height: `${spanLayerHeight}px` }}>
              {spanLayout.spans.map((span) => renderSpan(span, span.lane))}
              {previewSpan && renderSpan({ ...previewSpan, id: 'preview', event: {} }, spanLayout.laneCount, (rangeSelection.committed || rangeSelection.finalized) ? 'month-range-preview' : 'month-range-preview hidden', true)}
            </div>
            <div className="grid grid-cols-7 relative" style={{ height: `${rowHeight}px` }}>
              {days.map((day) => {
                const events = (getEventsForDate(day) || []).filter(event => !spanLayout.multiDayIds.has(event.id));
                const isSelected = isSameDay(day, currentDate);
                const isTodayDate = isToday(day);
                const showSelectedHighlight = isSelected && !isTodayDate;
                const firstOfMonth = day.getDate() === 1;
                // Only apply offset if this day has multi-day events above it
                const dayIndex = differenceInCalendarDays(startOfDay(day), startOfDay(days[0]))
                const dayHasMultiDayEvents = spanLayout.spans.some(span => {
                  return dayIndex >= span.startIndex && dayIndex <= span.endIndex
                }) || (previewSpan && dayIndex >= previewSpan.startIndex && dayIndex <= previewSpan.endIndex)
                const eventListOffset = dayHasMultiDayEvents
                  ? stackedMultiDayHeight + MULTI_DAY_EVENT_GAP
                  : 0
                return (
                  <div
                    key={formatDateKey(day)}
                    onDoubleClick={() => {
                      const startDate = new Date(day);
                      startDate.setHours(12, 0, 0, 0);
                      const endDate = new Date(day);
                      endDate.setHours(13, 0, 0, 0);

                      openEventModal({
                        start: startDate,
                        end: endDate,
                        title: 'New Event',
                        color: '#1761C7'
                      }, true);
                    }}
                    style={{
                      height: `${rowHeight}px`,
                      boxSizing: 'border-box'
                    }}
                    className={`calendar-day bg-white dark:bg-gray-800 border-r border-b border-gray-100 dark:border-gray-800 relative p-1 flex flex-col ${showSelectedHighlight ? 'selected calendar-selected-surface' : ''}`}
                    data-date={formatDateKey(day)}
                    onDrop={(e) => handleEventDrop(e, day)}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onMouseDown={(e) => handleRangeMouseDown(day, e)}
                    onMouseEnter={() => handleRangeMouseEnter(day)}
                    onMouseMove={(e) => handleRangeMouseMove(day, e)}
                  >
                    <div className="flex justify-between items-start text-xs mb-1">
                      {firstOfMonth && (
                        <span className="font-semibold text-blue-600 dark:text-blue-400">
                          {format(day, 'MMM')}
                        </span>
                      )}
                      <span className="flex-grow" />
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          selectDate(day);
                          setView('day');
                        }}
                        className={`h-6 w-6 flex items-center justify-center rounded-full text-sm font-medium cursor-pointer transition-colors
                          ${isTodayDate ? 'bg-purple-200 text-purple-800' : 'text-gray-500 dark:text-gray-400'}
                          ${isSelected && !isTodayDate ? 'bg-gray-100 dark:bg-gray-700' : ''}
                          ${!isTodayDate ? 'hover:bg-gray-200 dark:hover:bg-gray-600' : ''}`}
                      >
                        {format(day, 'd')}
                      </div>
                    </div>

                    <div
                      className="mt-1 overflow-hidden flex-1 space-y-0.5"
                      style={eventListOffset ? { marginTop: `${eventListOffset}px` } : undefined}
                    >
                      {events.slice(0, 3).map((ev) => (
                        <EventIndicator
                          key={ev.clientKey || ev.id}
                          event={ev}
                          isMonthView
                        />
                      ))}
                      {events.length > 3 && (
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          {events.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthlyView;
