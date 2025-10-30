import { format } from 'date-fns'
import { useCalendar } from '../../context/CalendarContext'

const EventIndicator = ({ event, isMonthView }) => {
  const { openEventModal } = useCalendar()
  
  const handleClick = (e) => {
    e.stopPropagation()
    
    // Store the clicked element position for modal placement
    window.lastClickedCalendarDay = e.currentTarget;
    
    openEventModal(event)
  }
  
  const formattedTime = format(new Date(event.start), 'h:mma').toLowerCase();
  
  const eventColor = event.color || 'blue';
  const isHexColor = eventColor.startsWith('#');
  
  // Function to lighten a hex color for background
  const lightenHexColor = (hex, percent = 70) => {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const lightenedR = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)));
    const lightenedG = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)));
    const lightenedB = Math.min(255, Math.floor(b + (255 - b) * (percent / 100)));
    return `#${lightenedR.toString(16).padStart(2, '0')}${lightenedG.toString(16).padStart(2, '0')}${lightenedB.toString(16).padStart(2, '0')}`;
  };
  
  // Function to darken a hex color for text
  const darkenHexColor = (hex, percent = 40) => {
    hex = hex.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const darkenedR = Math.floor(r * (1 - percent / 100));
    const darkenedG = Math.floor(g * (1 - percent / 100));
    const darkenedB = Math.floor(b * (1 - percent / 100));
    return `#${darkenedR.toString(16).padStart(2, '0')}${darkenedG.toString(16).padStart(2, '0')}${darkenedB.toString(16).padStart(2, '0')}`;
  };
  
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
  
  // For hex colors, use inline styles - only for all-day events
  const bgStyle = (isHexColor && event.isAllDay) ? {
    backgroundColor: lightenHexColor(eventColor, 70)
  } : {};
  
  const lineStyle = isHexColor ? {
    backgroundColor: eventColor
  } : {};
  
  const textStyle = isHexColor ? {
    color: darkenHexColor(eventColor, 40)
  } : {};

  return (
    <div
      className={`text-xs mb-1 flex items-center space-x-1 px-1 py-0.5 cursor-pointer overflow-hidden ${isMonthView ? (isHexColor ? (event.isAllDay ? 'rounded-md' : '') : `${event.isAllDay ? getBgColorClass(eventColor) + ' bg-opacity-70' : ''} ${event.isAllDay ? 'rounded-md' : ''}`) : ''}`}
      onClick={handleClick}
      style={{ 
        maxWidth: '100%', 
        minWidth: 0,
        ...(isMonthView && isHexColor && event.isAllDay ? bgStyle : {})
      }}
    >
      {isMonthView ? (
        <>
          {/* Colored line indicator */}
          <div 
            className={isHexColor ? 'rounded-sm' : `${getColorClass(eventColor)} rounded-sm`}
            style={{ 
              width: '3.2px', 
              height: '14px',
              flex: '0 0 3.2px',
              ...(isHexColor ? lineStyle : {})
            }}
          ></div>
          
          <div className="flex-grow truncate overflow-hidden text-ellipsis font-medium" style={{ minWidth: '30px', ...(isHexColor ? textStyle : { color: 'rgb(55, 65, 81)' }) }}>
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
