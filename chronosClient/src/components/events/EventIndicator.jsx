import { format } from 'date-fns'
import { useCalendar } from '../../context/CalendarContext'

const EventIndicator = ({ event, isMonthView }) => {
  const { openEventModal } = useCalendar()
  
  const handleClick = (e) => {
    e.stopPropagation()
    openEventModal(event)
  }
  
  // Format time with fixed length
  const formattedTime = format(new Date(event.start), 'h:mma').toLowerCase();
  
  return (
    <div
      className={`text-xs mb-1 flex items-center space-x-1 px-1 py-0.5 cursor-pointer`}
      onClick={handleClick}
      style={{ maxWidth: '100%' }}
    >
      {isMonthView ? (
        <>
          {/* Colored line indicator */}
          <div className={`w-1.5 h-3 flex-shrink-0 bg-${event.color}-500 rounded-sm`}></div>
          
          {/* Event title with ellipsis */}
          <div className="flex-grow truncate">
            {event.title}
          </div>
          
          {/* Fixed-width time */}
          <div className="text-gray-500 flex-shrink-0 w-12 text-right">
            {formattedTime}
          </div>
        </>
      ) : (
        <span>{event.title}</span>
      )}
    </div>
  )
}

export default EventIndicator