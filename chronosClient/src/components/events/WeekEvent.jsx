import { format, differenceInMinutes } from 'date-fns'
import { useCalendar } from '../../context/CalendarContext'

const WeekEvent = ({ event, hourHeight, dayStartHour }) => {
  const { openEventModal } = useCalendar()
  
  // Ensure we're working with proper Date objects
  const startDate = event.start instanceof Date ? event.start : new Date(event.start)
  const endDate = event.end instanceof Date ? event.end : new Date(event.end)
  
  const startHour = startDate.getHours()
  const startMinute = startDate.getMinutes()
  const endHour = endDate.getHours()
  const endMinute = endDate.getMinutes()
  
  // Calculate position and height
  const top = (startHour - dayStartHour) * hourHeight + (startMinute / 60) * hourHeight
  const duration = differenceInMinutes(endDate, startDate)
  const height = (duration / 60) * hourHeight
  
  const handleClick = (e) => {
    e.stopPropagation()
    openEventModal(event)
  }
  
  // Format time for display - restore 12-hour format
  const formatTime = (date) => {
    return format(date, 'h:mm a')
  }
  
  // Get event color or default to blue
  const eventColor = event.color || 'blue'
  
  // Map color names to CSS variable names
  const getColorVar = (color, shade) => {
    if (color === 'purple') return `var(--color-violet-${shade})`;
    if (color === 'red') return `var(--color-rose-${shade})`;
    if (color === 'green') return `var(--color-emerald-${shade})`;
    return `var(--color-${color}-${shade})`;
  }
  
  return (
    <div
      className={`absolute left-1 right-1 rounded-lg p-1 overflow-hidden cursor-default 
                  text-sm z-10 group ${event.completed ? 'opacity-50 line-through' : ''}`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        minHeight: '20px',
        backgroundColor: getColorVar(eventColor, '500'),
        opacity: 0.8, // Make more translucent
      }}
      onClick={handleClick}
    >
      {/* Vertical line */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-1" 
        style={{ 
          backgroundColor: getColorVar(eventColor, '900'),
        }}
      ></div>
      
      <div className="ml-3"> {/* Add margin to accommodate for the vertical line */}
        <div 
          className="font-medium truncate mb-0.5" 
          style={{ 
            color: getColorVar(eventColor, '900') // Darker version of the event color
          }}
        >
          {event.title}
        </div>
        <div 
          className="text-xs"
          style={{ 
            color: getColorVar(eventColor, '900') // Darker version of the event color
          }}
        >
          {formatTime(startDate)}
        </div>
      </div>
    </div>
  )
}

export default WeekEvent