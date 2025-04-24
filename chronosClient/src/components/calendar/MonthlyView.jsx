import { useState, useRef, useEffect } from 'react'
import { format, isSameMonth, isSameDay, isToday } from 'date-fns'
import { useCalendar } from '../../context/CalendarContext'
import EventIndicator from '../events/EventIndicator'

const MonthlyView = () => {
  const {
    currentDate,
    getDaysInMonth,
    selectDate,
    getEventsForDate,
    navigateToNext,
    navigateToPrevious
  } = useCalendar()
  
  const [days, setDays] = useState(getDaysInMonth(currentDate))
  const containerRef = useRef(null)
  const touchStartY = useRef(null)
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollThreshold = 50
  
  useEffect(() => {
    setDays(getDaysInMonth(currentDate))
  }, [currentDate, getDaysInMonth])
  
  // Handle scroll for infinite scrolling
  const handleWheel = (e) => {
    if (isScrolling) return
    
    if (e.deltaY > scrollThreshold) {
      setIsScrolling(true)
      navigateToNext()
      setTimeout(() => setIsScrolling(false), 500)
    } else if (e.deltaY < -scrollThreshold) {
      setIsScrolling(true)
      navigateToPrevious()
      setTimeout(() => setIsScrolling(false), 500)
    }
  }
  
  // Handle touch for mobile scrolling
  const handleTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY
  }
  
  const handleTouchMove = (e) => {
    if (!touchStartY.current || isScrolling) return
    
    const touchY = e.touches[0].clientY
    const diff = touchStartY.current - touchY
    
    if (diff > scrollThreshold) {
      setIsScrolling(true)
      navigateToNext()
      touchStartY.current = null
      setTimeout(() => setIsScrolling(false), 500)
    } else if (diff < -scrollThreshold) {
      setIsScrolling(true)
      navigateToPrevious()
      touchStartY.current = null
      setTimeout(() => setIsScrolling(false), 500)
    }
  }
  
  const handleTouchEnd = () => {
    touchStartY.current = null
  }
  
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  
  return (
    <div 
      ref={containerRef}
      className="view-container"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="calendar-container p-4">
        {/* Day names */}
        <div className="grid grid-cols-7 mb-2">
          {dayNames.map((day) => (
            <div
              key={day}
              className="text-center text-sm text-gray-500 font-medium py-2"
            >
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar grid */}
        <div 
          className="grid grid-cols-7 auto-rows-fr gap-px bg-gray-200 dark:bg-gray-700 overflow-hidden h-auto"
          style={{ minHeight: 'calc(100vh - 200px)' }}
        >
          {days.map((day) => {
            const dayEvents = getEventsForDate(day)
            const isCurrentMonth = isSameMonth(day, currentDate)
            const isSelected = isSameDay(day, currentDate)
            const isTodayDate = isToday(day)
            
            return (
              <div
                key={day.toISOString()}
                className={`calendar-day bg-white dark:bg-gray-800 relative p-2 min-h-[100px] cursor-pointer flex flex-col
                  ${!isCurrentMonth ? 'text-gray-400 dark:text-gray-500' : ''}
                `}
                onClick={() => selectDate(day)}
              >
                <div className="flex justify-between items-start">
                  <div
                    className={`h-8 w-8 flex items-center justify-center
                      ${isTodayDate ? 'today' : ''}
                      ${isSelected && !isTodayDate ? 'selected' : ''}
                    `}
                  >
                    {format(day, 'd')}
                  </div>
                </div>
                
                {/* Events for this day */}
                <div className="mt-1 overflow-y-auto max-h-[80px] flex-1">
                  {dayEvents.slice(0, 3).map(event => (
                    <EventIndicator key={event.id} event={event} isMonthView />
                  ))}
                  
                  {dayEvents.length > 3 && (
                    <div className="text-xs font-medium text-gray-500 mt-1">
                      + {dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default MonthlyView