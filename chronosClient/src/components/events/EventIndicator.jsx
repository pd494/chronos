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
  
  // Map color names to CSS variable names
  const getColorClass = (color) => {
    if (color === 'purple') return 'bg-violet-500';
    if (color === 'red') return 'bg-rose-500';
    if (color === 'green') return 'bg-emerald-500';
    if (color === 'teal') return 'bg-teal-500';
    if (color === 'cyan') return 'bg-cyan-500';
    if (color === 'amber') return 'bg-amber-500';
    if (color === 'lime') return 'bg-lime-500';
    if (color === 'indigo') return 'bg-indigo-500';
    if (color === 'yellow') return 'bg-yellow-500';
    return `bg-${color}-500`;
  }
  
  return (
    <div
      className={`text-xs mb-1 flex items-center space-x-1 px-1 py-0.5 cursor-pointer overflow-hidden`}
      onClick={handleClick}
      style={{ maxWidth: '100%', minWidth: 0 }}
    >
      {isMonthView ? (
        <>
          {/* Colored line indicator */}
          <div className={`w-1.5 h-3 flex-shrink-0 ${getColorClass(event.color || 'blue')} rounded-sm`}></div>
          
          {/* Event title with ellipsis */}
          <div className="flex-grow truncate overflow-hidden text-ellipsis" style={{ minWidth: '30px' }}>
            {event.title}
          </div>
          
          {/* Responsive time display */}
          <div className="text-gray-500 flex-shrink-0 min-w-0 whitespace-nowrap text-right" style={{ minWidth: '45px' }}>
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