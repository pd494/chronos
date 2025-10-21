import { format } from 'date-fns'
import { useCalendar } from '../../context/CalendarContext'

const EventIndicator = ({ event, isMonthView }) => {
  const { openEventModal } = useCalendar()
  
  const handleClick = (e) => {
    e.stopPropagation()
    openEventModal(event)
  }
  
  const formattedTime = format(new Date(event.start), 'h:mma').toLowerCase();
  
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
  
  const getBgColorClass = (color) => {
    if (color === 'purple') return 'bg-violet-200 dark:bg-violet-700';
    if (color === 'red') return 'bg-rose-200 dark:bg-rose-700';
    if (color === 'green') return 'bg-emerald-200 dark:bg-emerald-700';
    if (color === 'teal') return 'bg-teal-200 dark:bg-teal-700';
    if (color === 'cyan') return 'bg-cyan-200 dark:bg-cyan-700';
    if (color === 'amber') return 'bg-amber-200 dark:bg-amber-700';
    if (color === 'lime') return 'bg-lime-200 dark:bg-lime-700';
    if (color === 'indigo') return 'bg-indigo-200 dark:bg-indigo-700';
    if (color === 'yellow') return 'bg-yellow-200 dark:bg-yellow-700';
    if (color === 'orange') return 'bg-orange-200 dark:bg-orange-700';
    return `bg-${color}-200 dark:bg-${color}-700`;
  }
  
  return (
    <div
      className={`text-xs mb-1 flex items-center space-x-1 px-1 py-0.5 cursor-pointer overflow-hidden ${isMonthView ? `${getBgColorClass(event.color || 'blue')} ${event.isAllDay ? 'bg-opacity-70' : 'bg-opacity-70'} rounded-md` : ''}`}
      onClick={handleClick}
      style={{ 
        maxWidth: '100%', 
        minWidth: 0
      }}
    >
      {isMonthView ? (
        <>
          {/* Colored line indicator */}
          <div 
            className={`${getColorClass(event.color || 'blue')} rounded-sm`}
            style={{ 
              width: '3.2px', 
              height: '14px',
              flex: '0 0 3.2px'
            }}
          ></div>
          
          <div className="flex-grow truncate overflow-hidden text-ellipsis text-gray-700 dark:text-gray-800 font-medium" style={{ minWidth: '30px' }}>
            {event.title}
          </div>
          
          {!event.isAllDay && (
            <div className="text-gray-600 dark:text-gray-700 flex-shrink-0 min-w-0 whitespace-nowrap text-right font-medium" style={{ minWidth: '45px' }}>
              {formattedTime}
            </div>
          )}
        </>
      ) : (
        <span>{event.title}</span>
      )}
    </div>
  )
}

export default EventIndicator