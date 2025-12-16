import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import CalendarHeader from './shared/CalendarHeader';
import WeekdayHeader from './shared/WeekdayHeader';
import CalendarWeek from './weekly/CalendarWeek';
import { useTaskContext } from '../context/TaskContext/context';
import { WeekView } from '../../ui-experiments/apps/experiment-06/components/event-calendar/week-view';
import './Calendar.css';

const BUFFER_WEEKS = 10
const WEEK_HEIGHT = 100

const getStartOfWeek = (date) => {
  const result = new Date(date);
  const dayOfWeek = result.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = result.getDate() - dayOfWeek;
  return new Date(result.setDate(diff));
}

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

const addWeeks = (date, weeks) => {
  return addDays(date, weeks * 7);
}

const formatDateKey = (date) => {
  return date.toISOString().split('T')[0];
};

const Calendar = () => {
  const today = new Date()
  const [referenceDate] = useState(today)
  const todayWeekStart = getStartOfWeek(today)
  const startingWeekIndex = BUFFER_WEEKS
  const [visibleWeekRange, setVisibleWeekRange] = useState({
    startDate: addWeeks(todayWeekStart, -startingWeekIndex),
    endDate: addWeeks(todayWeekStart, BUFFER_WEEKS)
  });
  
  const [currentDisplayMonth, setCurrentDisplayMonth] = useState(
    today.toLocaleString('default', { month: 'long', year: 'numeric' })
  );
  
  const contentRef = useRef(null);
  
  const lastScrollTopRef = useRef(0);
  
  const isUpdatingRef = useRef(false);
  
  const { events, addTaskToCalendar } = useTaskContext()
  
  useLayoutEffect(() => {
    setCurrentDisplayMonth(today.toLocaleString('default', { month: 'long', year: 'numeric' }))
    setVisibleWeekRange({
      startDate: addWeeks(todayWeekStart, -startingWeekIndex),
      endDate: addWeeks(todayWeekStart, BUFFER_WEEKS)
    })

    const scrollToToday = () => {
      if (contentRef.current) {
        contentRef.current.scrollTop = startingWeekIndex * WEEK_HEIGHT;
        lastScrollTopRef.current = startingWeekIndex * WEEK_HEIGHT;
      }
    }

    const timers = [];
    const delays = [0, 100, 300, 500, 1000];
    delays.forEach((delay) => timers.push(setTimeout(scrollToToday, delay)));
    
    return () => timers.forEach(timer => clearTimeout(timer))
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current || isUpdatingRef.current) return;
      
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current
      const scrollDirection = scrollTop > lastScrollTopRef.current ? 'down' : 'up'
      lastScrollTopRef.current = scrollTop
      
      const topWeekIndex = Math.floor(scrollTop / WEEK_HEIGHT)
      const visibleWeeksCount = Math.ceil(clientHeight / WEEK_HEIGHT)
      
      updateCurrentMonthDisplay(topWeekIndex, visibleWeeksCount)
      
      const bufferThreshold = 3 * WEEK_HEIGHT
      
      if (scrollDirection === 'up' && scrollTop < bufferThreshold) {
        isUpdatingRef.current = true;
        
        setVisibleWeekRange(prev => {
          const newStartDate = addWeeks(prev.startDate, -BUFFER_WEEKS);
          return {
            startDate: newStartDate,
            endDate: prev.endDate
          };
        })
        
        setTimeout(() => {
          if (contentRef.current) {
            contentRef.current.scrollTop = scrollTop + (BUFFER_WEEKS * WEEK_HEIGHT);
            isUpdatingRef.current = false;
          }
        }, 0);
      }
      
      if (scrollDirection === 'down' && scrollHeight - scrollTop - clientHeight < bufferThreshold) {
        isUpdatingRef.current = true;
        
        setVisibleWeekRange(prev => {
          const newEndDate = addWeeks(prev.endDate, BUFFER_WEEKS);
          return {
            startDate: prev.startDate,
            endDate: newEndDate
          };
        });
        
        isUpdatingRef.current = false;
      }
    }
    
    const throttledHandleScroll = throttle(handleScroll, 100)

    const container = contentRef.current;
    if (container) {
      container.addEventListener('scroll', throttledHandleScroll);
      return () => container.removeEventListener('scroll', throttledHandleScroll);
    }
  }, [visibleWeekRange])
  
  const throttle = (func, limit) => {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
  
  const updateCurrentMonthDisplay = (topWeekIndex, visibleWeeksCount) => {
    if (!contentRef.current) return
    
    const centralWeekIndex = topWeekIndex + Math.floor(visibleWeeksCount / 2)
    const weeksFromStart = centralWeekIndex
    const centralDate = addWeeks(visibleWeekRange.startDate, weeksFromStart)
    
    const monthYearString = centralDate.toLocaleString('default', { month: 'long', year: 'numeric' })
    setCurrentDisplayMonth(monthYearString)
  }

  const generateWeeks = useCallback(() => {
    if (!visibleWeekRange.startDate || !visibleWeekRange.endDate) return { weeks: [], monthLabels: {} }
    
    const allDays = []
    const currentDate = new Date(visibleWeekRange.startDate)
    const monthLabels = {}
    
    while (currentDate <= visibleWeekRange.endDate) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const day = currentDate.getDate();
      const dayOfWeek = currentDate.getDay()
      const dateString = formatDateKey(currentDate)
      
      if (day === 1) {
        const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long' });
        monthLabels[dateString] = { 
          text: monthName,
          position: dayOfWeek // 0-6, position in the week
        };
      }
      
      const isCurrentMonth = month === referenceDate.getMonth() && year === referenceDate.getFullYear()
      const isToday = dateString === formatDateKey(new Date())
      
      allDays.push({
        day,
        date: dateString,
        month,
        year,
        isCurrentMonth,
        isToday,
        events: events.filter(event => {
          const eventDate = new Date(event.startTime);
          return eventDate.getDate() === day && 
                 eventDate.getMonth() === month && 
                 eventDate.getFullYear() === year;
        })
      })
      
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    const weeks = []
    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }
    
    return { weeks, monthLabels };
  }, [visibleWeekRange, events, referenceDate])
  
  const { weeks, monthLabels } = useMemo(() => generateWeeks(), [generateWeeks])

  useLayoutEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = startingWeekIndex * WEEK_HEIGHT;
    }
  }, [weeks])

  const handlePrevMonth = () => {
    if (contentRef.current) {
      contentRef.current.scrollBy({ 
        top: -4 * WEEK_HEIGHT, 
        behavior: 'smooth' 
      });
    }
  }

  const handleNextMonth = () => {
    if (contentRef.current) {
      contentRef.current.scrollBy({ 
        top: 4 * WEEK_HEIGHT, 
        behavior: 'smooth' 
      });
    }
  }

  const handleMonthSelect = (date) => {
    if (contentRef.current && date) {
      const refWeekStart = getStartOfWeek(referenceDate)
      const targetWeekStart = getStartOfWeek(date)
      const weeksDiff = Math.round((targetWeekStart - refWeekStart) / (7 * 24 * 60 * 60 * 1000))
      
      const targetPosition = (BUFFER_WEEKS + weeksDiff) * WEEK_HEIGHT
      contentRef.current.scrollTo({
        top: targetPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <CalendarHeader 
        currentMonth={currentDisplayMonth} 
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onMonthSelect={handleMonthSelect}
      />
      <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
        <div style={{ width: '50%', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
          <WeekdayHeader />
          <div 
            className="calendar-content" 
            ref={contentRef} 
            style={{ 
              overflowY: 'auto', 
              overflowX: 'hidden',
              flexGrow: 1,
              WebkitOverflowScrolling: 'touch', // For smoother scrolling on iOS
            }}
          >
            <div className="calendar-grid">
              {weeks.map((week, weekIndex) => (
                <div 
                  key={`week-${weekIndex}`} 
                  style={{ height: `${WEEK_HEIGHT}px` }}
                >
                  <CalendarWeek 
                    week={week} 
                    weekIndex={weekIndex} 
                    monthLabels={monthLabels} 
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ width: '50%', overflowY: 'auto' }}>
          <WeekView 
            currentDate={new Date()}
            events={events}
            onEventSelect={() => {}}
            onEventCreate={() => {}}
          />
        </div>
      </div>
    </div>
  );
};

export default Calendar;
