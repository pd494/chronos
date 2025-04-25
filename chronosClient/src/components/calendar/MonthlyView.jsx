import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { format, isSameMonth, isSameDay, isToday, startOfWeek, addDays, addWeeks, startOfMonth } from 'date-fns';
import { useCalendar } from '../../context/CalendarContext';
import EventIndicator from '../events/EventIndicator';

// --- Helper Functions (can be moved to utils) ---
const getStartOfWeekLocal = (date, weekStartsOn = 0) => { // 0 = Sunday, 1 = Monday
  return startOfWeek(date, { weekStartsOn });
};

const formatDateKey = (date) => {
  return date.toISOString().split('T')[0]; // Use YYYY-MM-DD for keys
};
// --- End Helper Functions ---


// --- Constants ---
const BUFFER_WEEKS = 156; // 3 years * 52 weeks = 156 weeks buffer (3 years in past/future)
const WEEKS_PER_VIEW = 5; // Show exactly 5 weeks per view as in the screenshot
// --- End Constants ---


const MonthlyView = () => {
  const {
    currentDate, // This will now represent the 'focused' date
    selectDate,
    getEventsForDate,
    // navigateToNext/Previous might be replaced by scroll-based navigation
    // setCurrentDate // Need a way to update the central date if needed
    setHeaderDisplayDate // Get the setter from context
  } = useCalendar();

  // Reference date determines the initial center of the scroll - always use today's date on refresh
  const [referenceDate, setReferenceDate] = useState(new Date());

  // State to track the range of weeks currently rendered
  const [visibleWeekRange, setVisibleWeekRange] = useState(() => {
      const start = addWeeks(getStartOfWeekLocal(referenceDate), -BUFFER_WEEKS);
      const end = addWeeks(getStartOfWeekLocal(referenceDate), BUFFER_WEEKS);
      return { startDate: start, endDate: end };
  });

  // State to track which weeks are actually visible in the viewport
  const [visibleWeeks, setVisibleWeeks] = useState([]);

  // Ref for the scrollable container
  const scrollContainerRef = useRef(null);
  const isUpdatingRef = useRef(false); // Prevent scroll handler during DOM updates
  const lastScrollTopRef = useRef(0);
  const scheduledUpdateRef = useRef(null); // For throttling scroll updates

  // State to track the month predominantly in view for styling/header
  const [displayMonthDate, setDisplayMonthDate] = useState(referenceDate);

  // --- Generate Weeks based on visibleWeekRange ---
  const weeks = useMemo(() => {
    const allWeeks = [];
    let currentWeekStart = visibleWeekRange.startDate;

    while (currentWeekStart <= visibleWeekRange.endDate) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        const day = addDays(currentWeekStart, i);
        week.push(day);
      }
      allWeeks.push({ weekStart: formatDateKey(currentWeekStart), days: week });
      currentWeekStart = addWeeks(currentWeekStart, 1);
    }
    return allWeeks;
  }, [visibleWeekRange]);

  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  // Reference to track container dimensions
  const containerRef = useRef(null);
  
  // State to track cell size for square aspect ratio
  const [cellSize, setCellSize] = useState(0);
  
  // Calculate row height based on 5 rows per view
  const [rowHeight, setRowHeight] = useState(0);
  
  // Update cell dimensions when container size changes
  useEffect(() => {
    const updateDimensions = () => {
      if (scrollContainerRef.current) {
        // Get container width and divide by 7 columns to get cell width
        const containerWidth = scrollContainerRef.current.clientWidth;
        const newCellSize = Math.floor(containerWidth / 7);
        setCellSize(newCellSize);
        
        // Set row height equal to cell width to make cells square
        setRowHeight(newCellSize);

        // Ensure parent container has correct height for 5 rows
        const parentContainer = scrollContainerRef.current.parentElement;
        if (parentContainer) {
          parentContainer.style.height = `${newCellSize * WEEKS_PER_VIEW}px`;
        }
      }
    };
    
    // Initial update
    updateDimensions();
    
    // Add resize listener
    window.addEventListener('resize', updateDimensions);
    
    // Cleanup
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);
  
  // Calculate total height for the grid based on rendered weeks
  const totalGridHeight = weeks.length * rowHeight;
  
  // Function to scroll to today's date
  const scrollToToday = useCallback(() => {
    if (!scrollContainerRef.current) return;
    
    // Find the week containing today
    const today = new Date();
    const todayWeekIndex = weeks.findIndex(week => 
      week.days.some(day => isSameDay(day, today))
    );
    
    if (todayWeekIndex !== -1) {
      // Scroll to position the week with today in the middle of the viewport
      const scrollPosition = todayWeekIndex * rowHeight - 
        (scrollContainerRef.current.clientHeight / 2) + (rowHeight / 2);
      
      scrollContainerRef.current.scrollTo({
        top: Math.max(0, scrollPosition),
        behavior: 'smooth'
      });
    }
  }, [weeks, rowHeight]);
  
  // Scroll to today on initial render
  useEffect(() => {
    scrollToToday();
  }, [scrollToToday]);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || isUpdatingRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const scrollDirection = scrollTop > lastScrollTopRef.current ? 'down' : 'up';
    // Update lastScrollTopRef immediately, unless an update is pending which might adjust it
    if (!isUpdatingRef.current) {
        lastScrollTopRef.current = scrollTop;
    }

    // --- Update Display Month based on scroll position ---
    // Calculate the index of the week closest to the top of the viewport
    const topWeekIndex = Math.max(0, Math.floor(scrollTop / rowHeight));
    // We always show exactly 5 weeks per view
    const visibleWeeksCount = WEEKS_PER_VIEW;
    // Use the middle visible week to determine the display month
    const middleVisibleWeekIndex = Math.min(topWeekIndex + Math.floor(visibleWeeksCount / 2), weeks.length - 1);
    
    if (weeks[middleVisibleWeekIndex]) {
        // Use the first day of the middle visible week to determine the display month
        const middleWeekFirstDay = weeks[middleVisibleWeekIndex].days[0];
        if (middleWeekFirstDay.getMonth() !== displayMonthDate.getMonth() || 
            middleWeekFirstDay.getFullYear() !== displayMonthDate.getFullYear()) {
            setDisplayMonthDate(middleWeekFirstDay);
            // *** Call context function to update the header ***
            if (setHeaderDisplayDate) { 
                setHeaderDisplayDate(middleWeekFirstDay);
            }
        }
    }
    // --- End Update Display Month ---

    // --- Add more weeks at the top or bottom if needed ---
    // Near the top of the scroll area - add more weeks at the top
    if (scrollDirection === 'up' && scrollTop < rowHeight * 2) {
      isUpdatingRef.current = true;
      setVisibleWeekRange(prev => {
        const newStartDate = addWeeks(prev.startDate, -Math.ceil(BUFFER_WEEKS / 4));
        return { startDate: newStartDate, endDate: prev.endDate };
      });
    }
    
    // Near the bottom of the scroll area - add more weeks at the bottom
    if (scrollDirection === 'down' && scrollTop + clientHeight > scrollHeight - rowHeight * 2) {
      isUpdatingRef.current = true;
      setVisibleWeekRange(prev => {
        const newEndDate = addWeeks(prev.endDate, Math.ceil(BUFFER_WEEKS / 4));
        return { startDate: prev.startDate, endDate: newEndDate };
      });
    }
    
    // Update which weeks are visible in the viewport
    const startWeekIndex = Math.floor(scrollTop / rowHeight);
    const endWeekIndex = Math.min(startWeekIndex + WEEKS_PER_VIEW, weeks.length - 1);
    const newVisibleWeeks = weeks.slice(startWeekIndex, endWeekIndex + 1);
    setVisibleWeeks(newVisibleWeeks);

    // Simple throttle: If an update is already scheduled, do nothing
    if (scheduledUpdateRef.current) return;

    scheduledUpdateRef.current = setTimeout(() => {
        // ... rest of the handleScroll function remains the same ...
    }, 100);
  }, [weeks, displayMonthDate, setHeaderDisplayDate]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
    }
    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, [handleScroll]);

  return (
    // Removed outer containerRef, scroll happens inside the grid container
    <div className="view-container flex flex-col h-full"> {/* Ensure parent takes full height */}
      <div className="calendar-container p-4 flex flex-col flex-grow"> {/* Allow content to grow */}
        {/* Day names */}
        <div className="grid grid-cols-7 mb-2 flex-shrink-0"> {/* Prevent header from shrinking */}
          {dayNames.map((day) => (
            <div
              key={day}
              className="text-center text-sm text-gray-500 dark:text-gray-400 font-medium py-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid: fluid scroll over weeks */}
        <div
          className="overflow-y-auto flex-grow relative bg-gray-200 dark:bg-gray-700" // Allow grid to take remaining space and scroll
          ref={scrollContainerRef}
          style={{ height: `${rowHeight * WEEKS_PER_VIEW}px`, scrollbarWidth: 'thin' }}
        >
          {/* Use a single container div for positioning weeks absolutely or relatively */}
          <div className="relative" style={{ height: `${totalGridHeight}px` }}>
              {weeks.map(({ weekStart, days: week }, weekIndex) => (
                <div
                  key={weekStart}
                  className="grid grid-cols-7"
                  style={{
                      height: `${rowHeight}px`
                  }}
                >
                  {week.map((day) => {
                    const dayEvents = getEventsForDate(day) || []; // Ensure it's an array
                    // *** Use displayMonthDate for determining the 'current' month for styling ***
                    const isCurrentMonth = day.getMonth() === displayMonthDate.getMonth();
                    const isSelected = isSameDay(day, currentDate); // currentDate is the selected/focused date
                    const isTodayDate = isToday(day);

                    // Determine month label display (show on first day of month)
                    const isFirstDayOfMonth = day.getDate() === 1;
                    const monthLabel = isFirstDayOfMonth ? format(day, 'MMM') : null;


                    return (
                      <div
                        key={formatDateKey(day)}
                        className={`calendar-day bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-800 relative p-1 flex flex-col min-h-0 ${/* Removed min-h-[100px] */ ''} 
                           text-gray-900 dark:text-white cursor-pointer group`} // All cells white with thinner borders
                        style={{ height: `${cellSize}px`, width: `${cellSize}px` }} // Make cells square
                        onClick={() => selectDate(day)} // selectDate updates the highlighted day
                      >
                        <div className="flex justify-between items-start text-xs mb-1">
                           {/* Month Label */}
                           {monthLabel && (
                              <span className="font-semibold text-blue-600 dark:text-blue-400">
                                {monthLabel}
                              </span>
                           )}
                           <span className="flex-grow"></span> {/* Spacer */}
                           {/* Day Number */}
                           <div
                              className={`h-6 w-6 flex items-center justify-center rounded-full text-sm font-medium
                                 ${isTodayDate ? 'bg-purple-200 text-purple-800' : 'text-gray-500 dark:text-gray-400'}
                                 ${isSelected && !isTodayDate ? 'bg-gray-100 dark:bg-gray-700' : ''}
                              `}
                           >
                              {format(day, 'd')}
                           </div>
                        </div>

                        {/* Events for this day */}
                        <div className="mt-1 overflow-hidden text-ellipsis flex-1 space-y-0.5"> {/* Allow events to take remaining space */}
                           {dayEvents.slice(0, 3).map(event => ( // Show up to 3 events as in screenshot
                              <EventIndicator key={event.id} event={event} isMonthView />
                           ))}
                           {dayEvents.length > 3 && (
                              <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                 {dayEvents.length - 3} more
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
