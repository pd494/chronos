import React, { useState, useEffect, useRef } from 'react';
import CalendarHeader from './shared/CalendarHeader';
import WeekdayHeader from './shared/WeekdayHeader';
import CalendarWeek from './weekly/CalendarWeek';
import { useTaskContext } from '../context/TaskContext';
import './Calendar.css';

const Calendar = () => {
  const [months, setMonths] = useState([]);
  const [visibleMonthsRange, setVisibleMonthsRange] = useState({ start: 0, end: 2 });
  const [currentDisplayMonth, setCurrentDisplayMonth] = useState('');
  const contentRef = useRef(null);
  
  // Get events from context
  const { events, addTaskToCalendar } = useTaskContext();

  // Initialize with current month and adjacent months
  useEffect(() => {
    // Fix: Use today's actual date (April 14, 2025)
    const today = new Date(2025, 3, 14); // April is month 3 (0-indexed)
    const currentMonthIndex = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Generate initial months (previous, current, next)
    const initialMonths = [];
    for (let i = -12; i <= 12; i++) {
      const monthDate = new Date(currentYear, currentMonthIndex + i, 1);
      initialMonths.push(generateMonthData(monthDate));
    }
    
    setMonths(initialMonths);
    
    // Set initial visible range
    setVisibleMonthsRange({ start: 12, end: 12 + 3 });
    
    // After initial render, scroll to current month
    setTimeout(() => {
      if (contentRef.current) {
        // Calculate position to scroll to (approximately 12 months * 4 weeks * 100px height)
        contentRef.current.scrollTop = 12 * 4 * 100;
      }
    }, 100);
  }, []);

  // Handle scroll to implement infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!contentRef.current) return;
      
      const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
      
      // Add months at the top when scrolling up
      if (scrollTop < 200) {
        const firstVisibleMonth = months[0];
        const prevMonthDate = new Date(firstVisibleMonth.year, firstVisibleMonth.month - 1, 1);
        const newMonthData = generateMonthData(prevMonthDate);
        
        setMonths(prevMonths => [newMonthData, ...prevMonths]);
        setVisibleMonthsRange(prev => ({ start: prev.start - 1, end: prev.end }));
        
        // Maintain scroll position
        contentRef.current.scrollTop = scrollTop + 400; // Increased to handle larger jumps
      }
      
      // Add months at the bottom when scrolling down
      if (scrollHeight - scrollTop - clientHeight < 200) {
        const lastVisibleMonth = months[months.length - 1];
        const nextMonthDate = new Date(lastVisibleMonth.year, lastVisibleMonth.month + 1, 1);
        const newMonthData = generateMonthData(nextMonthDate);
        
        setMonths(prevMonths => [...prevMonths, newMonthData]);
        setVisibleMonthsRange(prev => ({ start: prev.start, end: prev.end + 1 }));
      }
    };

    const container = contentRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [months, visibleMonthsRange]);

  // Generate month data including days and calendar structure (for reference)
  const generateMonthData = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Get month name
    const monthName = date.toLocaleString('default', { month: 'long' });
    
    return {
      year,
      month,
      monthName
    };
  };

  // Generate continuous calendar data across all months
  const generateContinuousCalendar = () => {
    if (months.length === 0) return { weeks: [], monthLabels: {} };
    
    // Sort months chronologically
    const sortedMonths = [...months].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
    
    // Get the earliest and latest dates
    const firstMonth = sortedMonths[0];
    const lastMonth = sortedMonths[sortedMonths.length - 1];
    
    // Calculate start date (first day of the first month's first week)
    const startDate = new Date(firstMonth.year, firstMonth.month, 1);
    startDate.setDate(startDate.getDate() - startDate.getDay()); // Go back to Sunday
    
    // Calculate end date (last day of the last month's last week)
    const endDate = new Date(lastMonth.year, lastMonth.month + 1, 0); // Last day of month
    const daysToAdd = 6 - endDate.getDay(); // Days to Saturday
    endDate.setDate(endDate.getDate() + daysToAdd);
    
    // Generate all days between start and end date
    const allDays = [];
    const currentDate = new Date(startDate);
    const monthLabels = {};
    
    while (currentDate <= endDate) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const day = currentDate.getDate();
      const dayOfWeek = currentDate.getDay();
      const dateString = currentDate.toISOString().split('T')[0];
      
      // Mark the first day of each month for labels
      if (day === 1) {
        // Fix: Use the correct month name without the year
        const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long' });
        monthLabels[allDays.length] = { 
          text: `${monthName}`,
          position: dayOfWeek // 0-6, position in the week
        };
      }
      
      // Add this day to our array
      allDays.push({
        day,
        date: dateString,
        month,
        year,
        isCurrentMonth: sortedMonths.some(m => m.month === month && m.year === year),
        events: events.filter(event => event.date === dateString)
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
  };

  // Get the continuous calendar data
  const { weeks, monthLabels } = generateContinuousCalendar();

  // Calculate which month name to display in the header
  useEffect(() => {
    if (weeks.length === 0) return;
    
    // Get the visible weeks based on scroll position
    const calculateVisibleMonth = () => {
      if (!contentRef.current) return;
      
      const { scrollTop, clientHeight } = contentRef.current;
      const weekHeight = 190;
      
      // Calculate which weeks are visible
      const startWeekIndex = Math.floor(scrollTop / weekHeight);
      const visibleWeeksCount = Math.ceil(clientHeight / weekHeight);
      const endWeekIndex = Math.min(startWeekIndex + visibleWeeksCount, weeks.length);
      
      // Get ONLY the days that are actually visible in the viewport
      const visibleDays = [];
      for (let i = startWeekIndex; i < endWeekIndex; i++) {
        if (weeks[i]) {
          visibleDays.push(...weeks[i]);
        }
      }
      
      if (visibleDays.length === 0) return;
      
      // Group days by month and year
      const monthGroups = {};
      
      visibleDays.forEach(day => {
        const monthKey = `${day.year}-${day.month}`;
        if (!monthGroups[monthKey]) {
          monthGroups[monthKey] = {
            count: 0,
            name: new Date(day.year, day.month, 1).toLocaleString('default', { month: 'long' }) + ' ' + day.year,
            year: day.year,
            month: day.month,
            days: []
          };
        }
        monthGroups[monthKey].count++;
        monthGroups[monthKey].days.push(day);
      });
      
      // Convert to array and sort by count (descending)
      const sortedMonths = Object.values(monthGroups).sort((a, b) => b.count - a.count);
      
      // No months visible (shouldn't happen, but just in case)
      if (sortedMonths.length === 0) return;
      
      // If only one month is visible, use that
      if (sortedMonths.length === 1) {
        setCurrentDisplayMonth(sortedMonths[0].name);
        return;
      }
      
      // Multiple months visible - check if the second month has 15 or more days visible
      // If so, and it's the 'next' month chronologically, use that instead
      const primaryMonth = sortedMonths[0];
      const secondaryMonth = sortedMonths[1];
      
      if (secondaryMonth.count >= 15) {
        // Check if secondaryMonth is chronologically after primaryMonth
        const isNextMonth = (secondaryMonth.year > primaryMonth.year) || 
                           (secondaryMonth.year === primaryMonth.year && 
                            secondaryMonth.month > primaryMonth.month);
        
        if (isNextMonth) {
          // Apply the same month adjustment to the next month
          const adjustedDate = new Date(secondaryMonth.year, secondaryMonth.month - 1, 1);
          const adjustedMonthName = adjustedDate.toLocaleString('default', { month: 'long', year: 'numeric' });
          setCurrentDisplayMonth(adjustedMonthName);
          return;
        }
      }
      
      // Get the month one month back from the calculated month
      const adjustedDate = new Date(primaryMonth.year, primaryMonth.month - 1, 1);
      const adjustedMonthName = adjustedDate.toLocaleString('default', { month: 'long', year: 'numeric' });
      setCurrentDisplayMonth(adjustedMonthName);
    };
    
    calculateVisibleMonth();
    
    const container = contentRef.current;
    if (container) {
      container.addEventListener('scroll', calculateVisibleMonth);
      return () => container.removeEventListener('scroll', calculateVisibleMonth);
    }
  }, [weeks]);

  // Navigation handlers
  const handlePrevMonth = () => {
    // Logic to navigate to previous month
    if (contentRef.current) {
      contentRef.current.scrollTop -= 400; // Approximate scroll amount
    }
  };

  const handleNextMonth = () => {
    // Logic to navigate to next month
    if (contentRef.current) {
      contentRef.current.scrollTop += 400; // Approximate scroll amount
    }
  };

  const handleMonthSelect = () => {
    // Logic for month selection dropdown
    console.log('Month selection clicked');
  };

  return (
    <div className="calendar-container">
      <CalendarHeader 
        currentMonth={currentDisplayMonth} 
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onMonthSelect={handleMonthSelect}
      />
      <WeekdayHeader />
      <div className="calendar-content" ref={contentRef}>
        <div className="calendar-grid">
          {weeks.map((week, weekIndex) => (
            <CalendarWeek 
              key={`week-${weekIndex}`} 
              week={week} 
              weekIndex={weekIndex} 
              monthLabels={monthLabels} 
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Calendar;