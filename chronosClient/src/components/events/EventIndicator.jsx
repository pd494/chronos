import { format } from 'date-fns'
import { useCalendar } from '../../context/CalendarContext'

const EventIndicator = ({ event, isMonthView }) => {
  const { openEventModal } = useCalendar()
  
  const handleClick = (e) => {
    e.stopPropagation()
    openEventModal(event)
  }
  
  return (
    <div
      className={`text-xs mb-1 truncate rounded px-1 py-0.5 event-${event.color} cursor-pointer`}
      onClick={handleClick}
    >
      {isMonthView ? (
        <>
          <span className={`font-medium text-${event.color}`}>
            {format(new Date(event.start), 'h:mma').toLowerCase()}
          </span>{' '}
          {event.title}
        </>
      ) : (
        <span>{event.title}</span>
      )}
    </div>
  )
}

export default EventIndicator