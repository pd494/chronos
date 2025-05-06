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
  
  // Format time for display
  const formatTime = (date) => {
    return format(date, 'h:mm')
  }
  
  return (
    <div
      className={`absolute left-1 right-1 rounded p-1 overflow-hidden cursor-pointer event-${event.color} text-${event.color} text-xs z-10`}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        minHeight: '20px'
      }}
      onClick={handleClick}
    >
      <div className="font-medium truncate">
        {event.title}
      </div>
      <div className="text-xs">
        {formatTime(startDate)}—{formatTime(endDate)}
      </div>
    </div>
  )
}

export default WeekEvent