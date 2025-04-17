import React, { useState, useEffect, useRef } from 'react';
import { useTaskContext } from '../../context/TaskContext';
import ContextMenu from '../shared/ContextMenu';
import './MonthView.css';

const MonthView = () => {
  const { events, updateCategory, categories } = useTaskContext();
  const [months, setMonths] = useState([]);
  const [visibleMonthsRange, setVisibleMonthsRange] = useState({ start: 0, end: 2 });
  const [currentDisplayMonth, setCurrentDisplayMonth] = useState('');
  const containerRef = useRef(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Event handlers for context menu
  const handleContextMenu = (e, event) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY
    });
    setSelectedEvent(event);
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
    setSelectedEvent(null);
  };

  const handleSelectColor = (colorId) => {
    if (selectedEvent && selectedEvent.category) {
      updateCategory(selectedEvent.category, { color: colorId });
    }
    handleCloseContextMenu();
  };

  const handleSelectEmoji = (emoji) => {
    if (selectedEvent && selectedEvent.category) {
      updateCategory(selectedEvent.category, { emoji: emoji });
    }
    handleCloseContextMenu();
  };

  // Close context menu when clicking anywhere else
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu) {
        handleCloseContextMenu();
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [contextMenu]);

  // Initialize with current month and adjacent months
  useEffect(() => {
    const today = new Date();
    const currentMonthIndex = today.getMonth();
    const currentYear = today.getFullYear();

    // Generate initial months (previous, current, next)
    const initialMonths = [];
    for (let i = -1; i <= 3; i++) {
      const monthDate = new Date(currentYear, currentMonthIndex + i, 1);
      initialMonths.push(generateMonthData(monthDate));
    }

    setMonths(initialMonths);
  }, []);

  // Handle scroll to implement infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;

      // Add months at the top when scrolling up
      if (scrollTop < 200 && visibleMonthsRange.start > 0) {
        const firstVisibleMonth = months[0];
        const prevMonthDate = new Date(
          firstVisibleMonth.year,
          firstVisibleMonth.month - 1,
          1
        );
        const newMonthData = generateMonthData(prevMonthDate);

        setMonths((prevMonths) => [newMonthData, ...prevMonths]);
        setVisibleMonthsRange((prev) => ({ start: prev.start - 1, end: prev.end }));

        // Maintain scroll position
        containerRef.current.scrollTop = scrollTop + 200;
      }

      // Add months at the bottom when scrolling down
      if (scrollHeight - scrollTop - clientHeight < 200 && visibleMonthsRange.end < 24) {
        const lastVisibleMonth = months[months.length - 1];
        const nextMonthDate = new Date(lastVisibleMonth.year, lastVisibleMonth.month + 1, 1);
        const newMonthData = generateMonthData(nextMonthDate);

        setMonths((prevMonths) => [...prevMonths, newMonthData]);
        setVisibleMonthsRange((prev) => ({ start: prev.start, end: prev.end + 1 }));
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [months, visibleMonthsRange]);

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
        const monthName = currentDate.toLocaleString('default', { month: 'long' });
        monthLabels[allDays.length] = { 
          text: `${monthName} ${year}`,
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

  // Get the continuous calendar data
  const { weeks, monthLabels } = generateContinuousCalendar();

  // Calculate which month name to display in the header
  useEffect(() => {
    if (weeks.length === 0) return;
    
    // Get the visible weeks based on scroll position
    const calculateVisibleMonth = () => {
      if (!containerRef.current) return;
      
      const { scrollTop, clientHeight } = containerRef.current;
      const weekHeight = 100; // Approximate height of a week row in pixels
      
      // Calculate which weeks are visible
      const startWeekIndex = Math.floor(scrollTop / weekHeight);
      const visibleWeeksCount = Math.ceil(clientHeight / weekHeight);
      const endWeekIndex = startWeekIndex + visibleWeeksCount;
      
      // Count days by month in the visible area
      const monthDayCounts = {};
      
      for (let i = startWeekIndex; i < endWeekIndex && i < weeks.length; i++) {
        if (weeks[i]) {
          weeks[i].forEach(day => {
            const monthKey = `${day.year}-${day.month}`;
            if (!monthDayCounts[monthKey]) {
              monthDayCounts[monthKey] = {
                count: 0,
                name: new Date(day.year, day.month, 1).toLocaleString('default', { 
                  month: 'long', 
                  year: 'numeric' 
                })
              };
            }
            monthDayCounts[monthKey].count++;
          });
        }
      }
      
      // Find the month with the most visible days
      let maxCount = 0;
      let dominantMonth = '';
      
      Object.keys(monthDayCounts).forEach(monthKey => {
        if (monthDayCounts[monthKey].count > maxCount) {
          maxCount = monthDayCounts[monthKey].count;
          dominantMonth = monthDayCounts[monthKey].name;
        }
      });
      
      setCurrentDisplayMonth(dominantMonth);
    };
    
    calculateVisibleMonth();
    
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', calculateVisibleMonth);
      return () => container.removeEventListener('scroll', calculateVisibleMonth);
    }
  }, [weeks]);

  return (
    <div className="month-view-container" ref={containerRef}>
      <div className="calendar-top-bar">
        <div className="calendar-title">
          <span className="month-name">{currentDisplayMonth}</span>
          <button className="month-dropdown-button">▾</button>
        </div>
        <div className="calendar-controls">
          <button className="nav-button">‹</button>
          <button className="nav-button">›</button>
        </div>
      </div>
      <div className="calendar-header">
        <div className="weekday">Sun</div>
        <div className="weekday">Mon</div>
        <div className="weekday">Tue</div>
        <div className="weekday">Wed</div>
        <div className="weekday">Thu</div>
        <div className="weekday">Fri</div>
        <div className="weekday">Sat</div>
      </div>
      
      <div className="calendar-grid">
        {weeks.map((week, weekIndex) => (
          <div key={`week-${weekIndex}`} className="week">
            {week.map((day, dayIndex) => {
              // Check if this day is the first of a month
              const monthLabel = monthLabels[weekIndex * 7 + dayIndex];
              const isFirstOfMonth = day.day === 1;
              return (
                <div 
                  key={`day-${weekIndex}-${dayIndex}`}
                  className={`day ${!day.isCurrentMonth ? 'other-month' : ''}`}
                >
                  {/* Month label for the first day of month */}
                  {monthLabel && (
                    <div className="month-indicator" style={{ display: 'block' }}>
                      {monthLabel.text}
                    </div>
                  )}
                  <div className="day-number">
                    {isFirstOfMonth ? (
                      <span>
                        {/* Force the month name to be on its own line */}
                        <span
                          className="month-label"
                          style={{ display: 'block' }}
                        >
                          {new Date(day.year, day.month, 1).toLocaleString('default', {
                            month: 'long'
                          })}
                        </span>
                        <span className="first-day-number">
                          {day.day}
                        </span>
                      </span>
                    ) : (
                      day.day
                    )}
                  </div>
                  <div className="events-container">
                    {day.events &&
                      day.events.slice(0, 4).map(event => (
                        <div 
                          key={`${event.id}-${day.date}`} 
                          className="event" 
                          style={{ backgroundColor: event.color }}
                          onContextMenu={(e) => handleContextMenu(e, event)}
                        >
                          <div className="event-title">
                            {event.emoji && <span className="event-emoji">{event.emoji}</span>}
                            {event.title}
                          </div>
                        </div>
                      ))}
                    {day.events && day.events.length > 4 && (
                      <div className="more-events">{day.events.length - 4} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {contextMenu && selectedEvent && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onSelectColor={handleSelectColor}
          onSelectEmoji={handleSelectEmoji}
          selectedColor={selectedEvent.color}
        />
      )}
    </div>
  );
};

export default MonthView;
