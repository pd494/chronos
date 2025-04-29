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
  startOfWeek,
  addDays,
  addWeeks,
} from 'date-fns';
import { useCalendar } from '../../context/CalendarContext';
import EventIndicator from '../events/EventIndicator';

// ─── Constants ────────────────────────────────────────────────────────────
const BUFFER_WEEKS     = 156; // 3 y either side
const WEEKS_PER_VIEW   = 5;   // always render 5 rows
const ABOVE            = Math.floor(WEEKS_PER_VIEW / 2); // 2 when view = 5
const BELOW            = WEEKS_PER_VIEW - 1 - ABOVE;     // 2

// ─── Helpers ──────────────────────────────────────────────────────────────
const getStartOfWeekLocal = (date, weekStartsOn = 0) =>
  startOfWeek(date, { weekStartsOn });

const formatDateKey = (date) => date.toISOString().split('T')[0];

// ─── Component ────────────────────────────────────────────────────────────
const MonthlyView = () => {
  const {
    currentDate,
    selectDate,
    getEventsForDate,
    setHeaderDisplayDate,
  } = useCalendar();

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

  const scrollContainerRef = useRef(null);

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
      const w = scrollContainerRef.current.clientWidth;
      const s = Math.floor(w / 7);
      setCellSize(s);
      setRowHeight(s);
      // lock parent height to 5 rows
      const p = scrollContainerRef.current.parentElement;
      if (p) p.style.height = `${s * WEEKS_PER_VIEW}px`;
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

  // ── scroll handling (unchanged, trimmed for brevity) ────────────────────
  // … keep your existing handleScroll logic here …

  // UI --------------------------------------------------------------------
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return (
    <div className="view-container flex flex-col h-full">
      <div className="calendar-container p-4 flex flex-col flex-grow">
        {/* weekday header */}
        <div className="grid grid-cols-7 mb-2 flex-shrink-0">
          {dayNames.map((d) => (
            <div key={d} className="text-center text-sm text-gray-500 dark:text-gray-400 font-medium py-2">
              {d}
            </div>
          ))}
        </div>

        {/* scrollable grid */}
        <div
          ref={scrollContainerRef}
          className="overflow-y-auto flex-grow relative bg-gray-200 dark:bg-gray-700"
          style={{ height: `${rowHeight * WEEKS_PER_VIEW}px`, scrollbarWidth: 'thin' }}
        >
          <div className="relative" style={{ height: `${weeks.length * rowHeight}px` }}>
            {weeks.map(({ weekStart, days }) => (
              <div key={weekStart} className="grid grid-cols-7" style={{ height: `${rowHeight}px` }}>
                {days.map((day) => {
                  const events       = getEventsForDate(day) || [];
                  const isSelected   = isSameDay(day, currentDate);
                  const isTodayDate  = isToday(day);
                  const firstOfMonth = day.getDate() === 1;
                  return (
                    <div
                      key={formatDateKey(day)}
                      onClick={() => selectDate(day)}
                      style={{ height: `${cellSize}px`, width: `${cellSize}px` }}
                      className="calendar-day bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-800 relative p-1 flex flex-col cursor-pointer group"
                    >
                      <div className="flex justify-between items-start text-xs mb-1">
                        {firstOfMonth && (
                          <span className="font-semibold text-blue-600 dark:text-blue-400">
                            {format(day, 'MMM')}
                          </span>
                        )}
                        <span className="flex-grow" />
                        <div
                          className={`h-6 w-6 flex items-center justify-center rounded-full text-sm font-medium
                            ${isTodayDate ? 'bg-purple-200 text-purple-800' : 'text-gray-500 dark:text-gray-400'}
                            ${isSelected && !isTodayDate ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
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
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthlyView;
