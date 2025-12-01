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
import { getEventColors, normalizeToPaletteColor } from '../../lib/eventColors';
import Sortable from 'sortablejs';
import './MonthlyView.css';

// ─── Constants ────────────────────────────────────────────────────────────
// Use a large week buffer so the month view feels effectively infinite
// in both directions while still keeping rendering performant.
const BUFFER_WEEKS     = 1040; // ~20 years either side (~40 years total range)
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
  const [todoPreviewDate, setTodoPreviewDate] = useState(null);

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
      color: 'blue'
    }, true)
  }, [rangeSelection, openEventModal])

  const getDraggedTodoMeta = useCallback(() => {
    if (typeof window === 'undefined') return null
    return window.__chronosDraggedTodoMeta || null
  }, [])

  const clearTodoPreview = useCallback(() => setTodoPreviewDate(null), [])

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

  // Clear month todo preview whenever the floating todo pill is active
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handler = (evt) => {
      if (evt?.detail?.active) {
        clearTodoPreview()
      }
    }
    window.addEventListener('chronos-todo-overlay-state', handler)
    return () => window.removeEventListener('chronos-todo-overlay-state', handler)
  }, [clearTodoPreview])

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
  const handleEventDrop = useCallback(async (e, targetDate) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Remove dragover class immediately
    e.currentTarget.classList.remove('event-dragover')
    document.querySelectorAll('.event-dragover').forEach(el => {
      el.classList.remove('event-dragover')
    })
    
    const eventData = e.dataTransfer.getData('event')
    if (!eventData) return
    
    try {
      const draggedEvent = JSON.parse(eventData)
      const oldStart = new Date(draggedEvent.start)
      const oldEnd = new Date(draggedEvent.end)
      
      // Calculate the day difference (preserve time of day)
      const oldStartDay = startOfDay(oldStart)
      const targetDay = startOfDay(targetDate)
      const dayDiff = targetDay.getTime() - oldStartDay.getTime()
      
      // Create new start and end dates (preserving original time)
      const newStart = new Date(oldStart.getTime() + dayDiff)
      const newEnd = new Date(oldEnd.getTime() + dayDiff)
      
      console.log('Dragging event:', draggedEvent.title, 'from', oldStart, 'to', newStart)
      
      // Update the event with new dates
      await updateEvent(draggedEvent.id, {
        start: newStart,
        end: newEnd,
        isAllDay: draggedEvent.isAllDay
      })
    } catch (error) {
      console.error('Error dropping event:', error)
    } finally {
      if (typeof window !== 'undefined') {
        if (window.__chronosDraggedEventMeta?.id) {
          window.__chronosDraggedEventMeta = null
        }
      }
      document.querySelectorAll('[data-dragging]').forEach(el => {
        el.removeAttribute('data-dragging')
      })
      document.querySelectorAll('.event-dragover').forEach(el => {
        el.classList.remove('event-dragover')
      })
    }
  }, [updateEvent])

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    
    // Handle todo drags
    if (document.body.classList.contains('task-dragging')) {
      e.dataTransfer.dropEffect = 'copy';
      const dayCell = e.currentTarget;
      const dateStr = dayCell.getAttribute('data-date');
      if (dateStr) {
        const overlayActive = typeof window !== 'undefined' && window.__chronosTodoOverlayActive;
        if (overlayActive) {
          // While the pill is visible, keep the inline preview hidden
          clearTodoPreview();
        } else {
          setTodoPreviewDate(dateStr);
        }
      }
      dayCell.classList.add('event-dragover');
      document.body.classList.add('calendar-drag-focus');
      return;
    }
    
    // Handle event drags
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('event-dragover');
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.currentTarget.classList.remove('event-dragover');
    
    if (document.body.classList.contains('task-dragging')) {
      // Don't clear preview immediately - let the next dragover set it
      // Only clear when truly leaving the calendar area
      const relatedTarget = e.relatedTarget;
      if (!relatedTarget || !relatedTarget.closest('.calendar-day')) {
        clearTodoPreview();
      }
    }
  }, [clearTodoPreview])

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

  // Track pending todo drop to prevent duplicate conversions
  const pendingTodoConversionRef = useRef(null);
  
  // Handle todo drop via native drop event (more reliable than Sortable onAdd)
  const handleTodoDrop = useCallback(async (e, targetDate) => {
    // Only handle todo drags, not event drags
    const meta = getDraggedTodoMeta();
    const isTodoDrag = document.body.classList.contains('task-dragging') || !!meta;
    if (!isTodoDrag) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    // Clear the visual preview immediately so we don't show
    // both the preview and the real event at the same time.
    clearTodoPreview();

    const dateStr = formatDateKey(targetDate);
    
    // Prevent duplicate conversions using a more robust check
    if (pendingTodoConversionRef.current) {
      return;
    }
    
    // Get task info from the global drag state (or fall back to DOM if missing)
    const draggedTodoMeta = meta || getDraggedTodoMeta() || {};
    
    // Get task ID from the global meta (most reliable)
    let taskId = draggedTodoMeta.taskId;
    let draggedElement = null;
    
    // Fallback: try to find from DOM elements
    if (!taskId) {
      draggedElement = document.querySelector('[data-task-id][data-dragging="true"]') ||
                       document.querySelector('.task-drag') ||
                       document.querySelector('.sortable-drag') ||
                       document.querySelector('[data-is-clone="true"]');
      taskId = draggedElement?.getAttribute('data-task-id') || draggedElement?.getAttribute('data-id');
    }
    
    if (!taskId) {
      return;
    }
    
    // Set the lock before async operation
    pendingTodoConversionRef.current = taskId;
    
    const [year, month, day] = dateStr.split('-').map(Number);
    const startDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endDate = addDays(startDate, 1);
    
    try {
      await convertTodoToEvent(taskId, startDate, endDate, true);
      document.body.classList.remove('calendar-drag-focus');
      
      // Clean up any clone elements left behind
      document.querySelectorAll('[data-is-clone="true"]').forEach(el => {
        try { el.parentNode?.removeChild(el); } catch (_) {}
      });
      document.querySelectorAll('.event-dragover').forEach(el => {
        el.classList.remove('event-dragover');
      });
    } catch (error) {
      console.error('Failed to convert todo to event:', error);
    } finally {
      // Clear the lock after a short delay to prevent race conditions
      setTimeout(() => {
        pendingTodoConversionRef.current = null;
      }, 500);
    }
  }, [convertTodoToEvent, clearTodoPreview, getDraggedTodoMeta]);

  // Combined drop handler for both events and todos
  const handleCombinedDrop = useCallback(async (e, targetDate) => {
    const isTodoDrag = document.body.classList.contains('task-dragging') || !!getDraggedTodoMeta();
    if (isTodoDrag) {
      await handleTodoDrop(e, targetDate);
    } else {
      await handleEventDrop(e, targetDate);
    }
  }, [handleTodoDrop, handleEventDrop, getDraggedTodoMeta]);

  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return (
    <div
      className="view-container flex flex-col h-full"
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
          clearTodoPreview()
        }
      }}
    >
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
          
          const eventColorName = normalizeToPaletteColor(span.event.color || 'blue')
          const colors = getEventColors(eventColorName)
          const isAllDay = span.event.isAllDay
          const lineColor = colors.border || colors.text
          const bgStyle = { backgroundColor: isPreview ? getEventColors('blue').background : colors.background }
          const textColor = colors.text
          const startTimeLabel = (!isPreview && span.event.start && !span.event.originalIsAllDay)
            ? format(new Date(span.event.start), 'h:mma').toLowerCase()
            : null
          
          const handleSpanDragStart = (e) => {
            if (isPreview) return
            e.stopPropagation()
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('event', JSON.stringify(span.event))
            e.dataTransfer.setData('eventId', span.event.id)
            e.currentTarget.setAttribute('data-dragging', 'true')
          }
          
          const handleSpanDragEnd = (e) => {
            e.currentTarget.removeAttribute('data-dragging')
            document.querySelectorAll('.event-dragover').forEach(el => {
              el.classList.remove('event-dragover')
            })
          }
          
          return (
            <div
              key={`${weekStart}-${span.id || 'preview'}-${lane}`}
              className={`month-multiday-span ${isAllDay ? 'all-day' : 'timed'} ${extraClass}`}
              draggable={!isPreview}
              onDragStart={handleSpanDragStart}
              onDragEnd={handleSpanDragEnd}
              style={{
                top: `${spanTop}px`,
                left: spanLeft,
                width: spanWidth,
                cursor: isPreview ? 'default' : 'grab',
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
                  className="month-event-line"
                  style={{ backgroundColor: lineColor }}
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
                // Rely on the date pill highlight only; avoid tinting the whole day background.
                const showSelectedHighlight = false;
                const firstOfMonth = day.getDate() === 1;
                // Only apply offset if this day has multi-day events above it
                const dayIndex = differenceInCalendarDays(startOfDay(day), startOfDay(days[0]))
                const dayHasMultiDayEvents = spanLayout.spans.some(span => {
                  return dayIndex >= span.startIndex && dayIndex <= span.endIndex
                }) || (previewSpan && dayIndex >= previewSpan.startIndex && dayIndex <= previewSpan.endIndex)
                const eventListOffset = dayHasMultiDayEvents
                  ? stackedMultiDayHeight + MULTI_DAY_EVENT_GAP
                  : 0
                const dateKey = formatDateKey(day)
                const isTodoPreviewActive = todoPreviewDate === dateKey
                const draggedTodoMeta = getDraggedTodoMeta()
                const previewColor = normalizeToPaletteColor(draggedTodoMeta?.color || 'blue')
                const previewEvent = isTodoPreviewActive ? {
                  id: `todo-preview-${dateKey}`,
                  title: (draggedTodoMeta?.title || 'New task'),
                  start: startOfDay(day),
                  end: addDays(startOfDay(day), 1),
                  isAllDay: true,
                  color: previewColor
                } : null
                const visibleEvents = events.slice(0, isTodoPreviewActive ? 2 : 3)
                const remainingCount = events.length - visibleEvents.length
                return (
                  <div
                    key={dateKey}
                    onDoubleClick={() => {
                      const startDate = new Date(day);
                      startDate.setHours(0, 0, 0, 0);
                      const endDate = new Date(day);
                      endDate.setDate(endDate.getDate() + 1);
                      endDate.setHours(0, 0, 0, 0);

                      openEventModal(null, true);
                      window.prefilledEventDates = {
                        startDate,
                        endDate,
                        title: '',
                        color: 'blue',
                        isAllDay: true,
                        fromDayClick: true
                      };
                    }}
                    style={{
                      height: `${rowHeight}px`,
                      boxSizing: 'border-box'
                    }}
                    className={`calendar-day bg-white dark:bg-gray-800 border-r border-b border-gray-100 dark:border-gray-800 relative p-1 flex flex-col ${showSelectedHighlight ? 'selected calendar-selected-surface' : ''}`}
                    data-date={formatDateKey(day)}
                    onDrop={(e) => handleCombinedDrop(e, day)}
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
                      {isTodoPreviewActive && previewEvent && (
                        <EventIndicator
                          key={previewEvent.id}
                          event={previewEvent}
                          isMonthView
                        />
                      )}
                      {visibleEvents.map((ev) => (
                        <EventIndicator
                          key={ev.clientKey || ev.id}
                          event={ev}
                          isMonthView
                        />
                      ))}
                      {remainingCount > 0 && (
                        <button
                          type="button"
                          className="text-xs font-medium text-gray-500 dark:text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 pl-2"
                          style={{ marginLeft: '-4.5px' }}
                          onClick={() => {
                            selectDate(day);
                            setView('day');
                          }}
                        >
                          {remainingCount} more
                        </button>
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
