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
  addDays,
  addWeeks,
  addMonths,
  subMonths,
} from 'date-fns';
import { useCalendar } from '../../context/CalendarContext';
import { useTaskContext } from '../../context/TaskContext';
import EventIndicator from '../events/EventIndicator';
import Sortable from 'sortablejs';

// ─── Constants ────────────────────────────────────────────────────────────
const BUFFER_WEEKS     = 260; // ~5 years either side (10 years total range)
const WEEKS_PER_VIEW   = 6;   // always render 6 rows (standard month view)
const ABOVE            = Math.floor(WEEKS_PER_VIEW / 2); // 3 when view = 6
const BELOW            = WEEKS_PER_VIEW - 1 - ABOVE;     // 2

// ─── Helpers ──────────────────────────────────────────────────────────────
const DIRECTIONAL_MONTHS = 24; // prefetch 2 years in scroll direction
const getStartOfWeekLocal = (date, weekStartsOn = 0) =>
  startOfWeek(date, { weekStartsOn });

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
    setView,
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

  const scrollContainerRef = useRef(null);
  const headerRef = useRef(null);
  const requestedRangesRef = useRef(new Set());
  const lastScrollTopRef = useRef(0);
  const lastScrollTsRef = useRef(0);
  const lastHeaderMonthRef = useRef(null);

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

    const handleScroll = () => {
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

      if (!initialLoading && weeks[startWeek] && weeks[endWeek - 1]) {
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

  // Initialize Sortable for droppable day cells
  useEffect(() => {
    const dayCells = document.querySelectorAll('.calendar-day');
    const sortableInstances = [];
    
    dayCells.forEach(cell => {
      const sortable = Sortable.create(cell, {
        group: {
          name: 'tasks',
          pull: false,
          put: true
        },
        animation: 150,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag-active',
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
      
      sortableInstances.push(sortable);
    });
    
    return () => {
      sortableInstances.forEach(sortable => {
        if (sortable && sortable.destroy) sortable.destroy();
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
              return (
              <div 
                key={weekStart} 
                className="grid grid-cols-7 absolute left-0 right-0" 
                style={{ 
                  height: `${rowHeight}px`,
                  top: `${actualIndex * rowHeight}px`
                }}
              >
                {days.map((day) => {
                  const events       = getEventsForDate(day) || [];
                  const isSelected   = isSameDay(day, currentDate);
                  const isTodayDate  = isToday(day);
                  const firstOfMonth = day.getDate() === 1;
                  return (
                    <div
                      key={formatDateKey(day)}
                      onDoubleClick={() => {
                        // Double-click opens event modal prefilled for the specific day
                        const startDate = new Date(day);
                        startDate.setHours(12, 0, 0, 0);
                        const endDate = new Date(day);
                        endDate.setHours(13, 0, 0, 0);

                        openEventModal({
                          start: startDate,
                          end: endDate,
                          title: 'New Event',
                          color: '#3478F6'
                        }, true);
                      }}
                      style={{ height: `${rowHeight}px`, boxSizing: 'border-box' }}
                      className="calendar-day bg-white dark:bg-gray-800 border-r border-b border-gray-100 dark:border-gray-800 relative p-1 flex flex-col"
                      data-date={formatDateKey(day)}
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

                      <div className="mt-1 overflow-hidden flex-1 space-y-0.5">
                        {events.slice(0, 3).map((ev) => (
                          <EventIndicator key={ev.id} event={ev} isMonthView />
                        ))}
                        {events.length > 3 && (
                          <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                            {events.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )})}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthlyView;
