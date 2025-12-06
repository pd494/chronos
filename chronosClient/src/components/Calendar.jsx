import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import CalendarHeader from './shared/CalendarHeader';
import WeekdayHeader from './shared/WeekdayHeader';
import CalendarWeek from './weekly/CalendarWeek';
import { useTaskContext } from '../context/TaskContext/context';
import { WeekView } from '../../ui-experiments/apps/experiment-06/components/event-calendar/week-view';
import './Calendar.css';

// Constants for the calendar
const BUFFER_WEEKS = 10; // Number of weeks to render above/below visible area
const WEEK_HEIGHT = 100; // Height of each week row in pixels

// Helper to get the start of the week (Sunday)
const getStartOfWeek = (date) => {
  const result = new Date(date);
  const dayOfWeek = result.getDay(); // 0 = Sunday, 1 = Monday, ...
  const diff = result.getDate() - dayOfWeek;
  return new Date(result.setDate(diff));
};

// Helper to add days to a date
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Helper to add weeks to a date
const addWeeks = (date, weeks) => {
  return addDays(date, weeks * 7);
};

// Helper to format date as ISO string for keys
const formatDateKey = (date) => {
  return date.toISOString().split('T')[0];
};

const Calendar = () => {
  // Start from today's date as our reference point
  const today = new Date();
  
  // Current reference date (center of our calendar)
  const [referenceDate] = useState(today);
  
  // Calculate week start that contains today
  const todayWeekStart = getStartOfWeek(today);
  
  // Define a starting week index that puts today's week at BUFFER_WEEKS position
  // This will make our calendar start with today's week visible
  const startingWeekIndex = BUFFER_WEEKS;
  
  // Track visible weeks range - set the visible range to start at a point that puts today in view
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
  
  const { events, addTaskToCalendar } = useTaskContext();
  
  // Initialize calendar with current date centered and scroll directly to today
  useLayoutEffect(() => {
    // Set initial month in header
    setCurrentDisplayMonth(today.toLocaleString('default', { month: 'long', year: 'numeric' }));
    
    // Reset the visible weeks range to ensure today's week is at the BUFFER_WEEKS position
    setVisibleWeekRange({
      startDate: addWeeks(todayWeekStart, -startingWeekIndex),
      endDate: addWeeks(todayWeekStart, BUFFER_WEEKS)
    });

    // This function forcibly scrolls the calendar to today
    const scrollToToday = () => {
      if (contentRef.current) {
        // Scroll to the starting position where today's week should be visible
        contentRef.current.scrollTop = startingWeekIndex * WEEK_HEIGHT;
        lastScrollTopRef.current = startingWeekIndex * WEEK_HEIGHT;
        console.log('Calendar forcibly scrolled to today at position:', startingWeekIndex * WEEK_HEIGHT);
      }
    };

    // Schedule multiple scroll attempts with increasing delays
    // This approach handles race conditions with rendering
    const timers = [];
    [0, 100, 300, 500, 1000].forEach(delay => {
      timers.push(setTimeout(scrollToToday, delay));
    });
    
    // Clean up all timers
    return () => timers.forEach(timer => clearTimeout(timer));
  }, []);

  // Handle scroll to implement truly fluid infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current || isUpdatingRef.current) return;
      
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      const scrollDirection = scrollTop > lastScrollTopRef.current ? 'down' : 'up';
      lastScrollTopRef.current = scrollTop;
      
      // Calculate which week is at the top of the viewport
      const topWeekIndex = Math.floor(scrollTop / WEEK_HEIGHT);
      const visibleWeeksCount = Math.ceil(clientHeight / WEEK_HEIGHT);
      
      // Update current month display based on visible weeks
      updateCurrentMonthDisplay(topWeekIndex, visibleWeeksCount);
      
      // Check if we need to add more weeks at the top or bottom
      const bufferThreshold = 3 * WEEK_HEIGHT; // Start loading when within 3 weeks of edge
      
      // When scrolling up and approaching the top
      if (scrollDirection === 'up' && scrollTop < bufferThreshold) {
        // Add more weeks at the top
        isUpdatingRef.current = true;
        
        setVisibleWeekRange(prev => {
          const newStartDate = addWeeks(prev.startDate, -BUFFER_WEEKS);
          return {
            startDate: newStartDate,
            endDate: prev.endDate
          };
        });
        
        // Maintain scroll position after adding content
        setTimeout(() => {
          if (contentRef.current) {
            contentRef.current.scrollTop = scrollTop + (BUFFER_WEEKS * WEEK_HEIGHT);
            isUpdatingRef.current = false;
          }
        }, 0);
      }
      
      // When scrolling down and approaching the bottom
      if (scrollDirection === 'down' && scrollHeight - scrollTop - clientHeight < bufferThreshold) {
        // Add more weeks at the bottom
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
    };
    
    // Throttle the scroll handler for better performance
    const throttledHandleScroll = throttle(handleScroll, 100);

    const container = contentRef.current;
    if (container) {
      container.addEventListener('scroll', throttledHandleScroll);
      return () => container.removeEventListener('scroll', throttledHandleScroll);
    }
  }, [visibleWeekRange]);
  
  // Simple throttle function to limit scroll event handling
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
  };
  
  // Update the month displayed in the header based on visible weeks
  const updateCurrentMonthDisplay = (topWeekIndex, visibleWeeksCount) => {
    if (!contentRef.current) return;
    
    // Calculate the date at the center of the viewport
    const centralWeekIndex = topWeekIndex + Math.floor(visibleWeeksCount / 2);
    const weeksFromStart = centralWeekIndex;
    const centralDate = addWeeks(visibleWeekRange.startDate, weeksFromStart);
    
    // Set the month display based on the central date
    const monthYearString = centralDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    setCurrentDisplayMonth(monthYearString);
  };

  // Generate weeks for the visible range
  const generateWeeks = useCallback(() => {
    if (!visibleWeekRange.startDate || !visibleWeekRange.endDate) return { weeks: [], monthLabels: {} };
    
    // Generate all days between start and end date
    const allDays = [];
    const currentDate = new Date(visibleWeekRange.startDate);
    const monthLabels = {};
    
    // Continue until we reach the end date
    while (currentDate <= visibleWeekRange.endDate) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const day = currentDate.getDate();
      const dayOfWeek = currentDate.getDay();
      const dateString = formatDateKey(currentDate);
      
      // Mark the first day of each month for labels
      if (day === 1) {
        const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long' });
        monthLabels[dateString] = { 
          text: monthName,
          position: dayOfWeek // 0-6, position in the week
        };
      }
      
      // Determine if this is the current month
      const isCurrentMonth = month === referenceDate.getMonth() && year === referenceDate.getFullYear();
      
      // Determine if this is today
      const isToday = dateString === formatDateKey(new Date()); // Using current date
      
      // Add this day to our array
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
      });
      
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Organize days into weeks
    const weeks = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }
    
    return { weeks, monthLabels };
  }, [visibleWeekRange, events, referenceDate]);
  
  // Get the continuous calendar data
  const { weeks, monthLabels } = useMemo(() => generateWeeks(), [generateWeeks]);

  // After weeks are generated, scroll to today's week
  useLayoutEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = startingWeekIndex * WEEK_HEIGHT;
    }
  }, [weeks]);

  // Navigation handlers - smoother scrolling
  const handlePrevMonth = () => {
    if (contentRef.current) {
      // Scroll smoothly to previous month (approximately 4 weeks up)
      contentRef.current.scrollBy({ 
        top: -4 * WEEK_HEIGHT, 
        behavior: 'smooth' 
      });
    }
  };

  const handleNextMonth = () => {
    if (contentRef.current) {
      // Scroll smoothly to next month (approximately 4 weeks down)
      contentRef.current.scrollBy({ 
        top: 4 * WEEK_HEIGHT, 
        behavior: 'smooth' 
      });
    }
  };

  const handleMonthSelect = (date) => {
    // Logic for month selection dropdown
    if (contentRef.current && date) {
      // Calculate weeks between reference date and selected date
      const refWeekStart = getStartOfWeek(referenceDate);
      const targetWeekStart = getStartOfWeek(date);
      const weeksDiff = Math.round((targetWeekStart - refWeekStart) / (7 * 24 * 60 * 60 * 1000));
      
      // Scroll to the selected month
      const targetPosition = (BUFFER_WEEKS + weeksDiff) * WEEK_HEIGHT;
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
            onEventSelect={(event) => console.log('Event selected:', event)}
            onEventCreate={(startTime) => console.log('Create event at:', startTime)}
          />
        </div>
      </div>
    </div>
  );
};

export default Calendar;