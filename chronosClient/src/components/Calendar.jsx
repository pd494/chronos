import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import CalendarHeader from './shared/CalendarHeader';
import WeekdayHeader  from './shared/WeekdayHeader';
import CalendarWeek   from './weekly/CalendarWeek';
import { useTaskContext } from '../context/TaskContext';
import { WeekView } from '../../ui-experiments/apps/experiment-06/components/event-calendar/week-view';
import './Calendar.css';

// ─── constants ────────────────────────────────────────────────────────────
const BUFFER_WEEKS = 10;
const WEEK_HEIGHT  = 100;

// helpers
const getStartOfWeek = (d) => {
  const res  = new Date(d);
  res.setDate(res.getDate() - res.getDay());
  return res;
};
const addDays  = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addWeeks = (d, n) => addDays(d, n * 7);
const key      = (d) => d.toISOString().split('T')[0];

const Calendar = () => {
  const today            = new Date();
  const todayWeekStart   = getStartOfWeek(today);
  const startingWeekIdx  = BUFFER_WEEKS; // today appears immediately

  const [visibleWeekRange, setVisibleWeekRange] = useState({
    startDate: addWeeks(todayWeekStart, -startingWeekIdx),
    endDate:   addWeeks(todayWeekStart,  BUFFER_WEEKS),
  });

  const [currentDisplayMonth, setCurrentDisplayMonth] = useState(
    today.toLocaleString('default', { month: 'long', year: 'numeric' })
  );

  const contentRef        = useRef(null);
  const lastScrollTopRef  = useRef(startingWeekIdx * WEEK_HEIGHT);
  const isUpdatingRef     = useRef(false);
  const { events }        = useTaskContext();

  // ── initial jump to today ───────────────────────────────────────────────
  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.scrollTop = startingWeekIdx * WEEK_HEIGHT;
  }, []);

  // ── scroll handler (unchanged, but no timers) ───────────────────────────
  const throttle = (fn, limit) => {
    let busy = false;
    return (...args) => {
      if (busy) return;
      busy = true;
      fn.apply(null, args);
      setTimeout(() => (busy = false), limit);
    };
  };

  const updateHeaderMonth = (topIdx, visible) => {
    const centerIdx   = topIdx + Math.floor(visible / 2);
    const centerDate  = addWeeks(visibleWeekRange.startDate, centerIdx);
    setCurrentDisplayMonth(
      centerDate.toLocaleString('default', { month: 'long', year: 'numeric' })
    );
  };

  const onScroll = throttle(() => {
    if (!contentRef.current || isUpdatingRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
    const dir = scrollTop > lastScrollTopRef.current ? 'down' : 'up';
    lastScrollTopRef.current = scrollTop;

    const topIdx      = Math.floor(scrollTop / WEEK_HEIGHT);
    const visibleRows = Math.ceil(clientHeight / WEEK_HEIGHT);
    updateHeaderMonth(topIdx, visibleRows);

    const bufferPx = 3 * WEEK_HEIGHT;

    if (dir === 'up' && scrollTop < bufferPx) {
      isUpdatingRef.current = true;
      setVisibleWeekRange((prev) => ({
        startDate: addWeeks(prev.startDate, -BUFFER_WEEKS),
        endDate:   prev.endDate,
      }));
      requestAnimationFrame(() => {
        contentRef.current.scrollTop += BUFFER_WEEKS * WEEK_HEIGHT;
        isUpdatingRef.current = false;
      });
    }

    if (
      dir === 'down' &&
      scrollHeight - scrollTop - clientHeight < bufferPx
    ) {
      isUpdatingRef.current = true;
      setVisibleWeekRange((prev) => ({
        startDate: prev.startDate,
        endDate:   addWeeks(prev.endDate, BUFFER_WEEKS),
      }));
      isUpdatingRef.current = false;
    }
  }, 100);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  // ── generate continuous weeks ───────────────────────────────────────────
  const { weeks, monthLabels } = useMemo(() => {
    const days = [];
    const labels = {};
    for (
      let d = new Date(visibleWeekRange.startDate);
      d <= visibleWeekRange.endDate;
      d = addDays(d, 1)
    ) {
      const isFirst = d.getDate() === 1;
      if (isFirst) {
        labels[key(d)] = {
          text: d.toLocaleString('default', { month: 'long' }),
          position: d.getDay(),
        };
      }
      const evts = events.filter((e) => {
        const t = new Date(e.startTime);
        return (
          t.getDate() === d.getDate() &&
          t.getMonth() === d.getMonth() &&
          t.getFullYear() === d.getFullYear()
        );
      });
      days.push({
        day: d.getDate(),
        date: key(d),
        month: d.getMonth(),
        year: d.getFullYear(),
        isToday: key(d) === key(today),
        events: evts,
      });
    }
    const out = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return { weeks: out, monthLabels: labels };
  }, [visibleWeekRange, events]);

  // ── navigation helpers (prev / next month) ─────────────────────────────
  const scrollByWeeks = (w) => {
    if (contentRef.current)
      contentRef.current.scrollBy({ top: w * WEEK_HEIGHT, behavior: 'smooth' });
  };

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div className="calendar-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <CalendarHeader
        currentMonth={currentDisplayMonth}
        onPrevMonth={() => scrollByWeeks(-4)}
        onNextMonth={() => scrollByWeeks(4)}
        onMonthSelect={(d) => {
          const diff = Math.round(
            (getStartOfWeek(d) - getStartOfWeek(today)) / (7 * 864e5)
          );
          if (contentRef.current)
            contentRef.current.scrollTo({
              top: (BUFFER_WEEKS + diff) * WEEK_HEIGHT,
              behavior: 'smooth',
            });
        }}
      />
      <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        <div style={{ width: '50%', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
          <WeekdayHeader />
          <div
            ref={contentRef}
            style={{ overflowY: 'auto', overflowX: 'hidden', flexGrow: 1 }}
          >
            {weeks.map((week, i) => (
              <div key={i} style={{ height: WEEK_HEIGHT }}>
                <CalendarWeek
                  week={week}
                  weekIndex={i}
                  monthLabels={monthLabels}
                />
              </div>
            ))}
          </div>
        </div>
        <div style={{ width: '50%', overflowY: 'auto' }}>
          <WeekView
            currentDate={today}
            events={events}
            onEventSelect={(e) => console.log('select', e)}
            onEventCreate={(t) => console.log('create', t)}
          />
        </div>
      </div>
    </div>
  );
};

export default Calendar;
