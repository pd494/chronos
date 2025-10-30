import { format, differenceInMinutes } from 'date-fns'
import { useCalendar } from '../../context/CalendarContext'

const WeekEvent = ({ event, hourHeight, dayStartHour, position }) => {
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
  
  // Check if color is a hex code (starts with #)
  const isHexColor = eventColor.startsWith('#')
  
  // Function to darken a hex color for text/border
  const darkenHexColor = (hex, percent = 40) => {
    // Remove # if present
    hex = hex.replace('#', '')
    
    // Parse RGB
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    
    // Darken
    const darkenedR = Math.floor(r * (1 - percent / 100))
    const darkenedG = Math.floor(g * (1 - percent / 100))
    const darkenedB = Math.floor(b * (1 - percent / 100))
    
    // Convert back to hex
    return `#${darkenedR.toString(16).padStart(2, '0')}${darkenedG.toString(16).padStart(2, '0')}${darkenedB.toString(16).padStart(2, '0')}`
  }
  
  // Map color names to CSS variable names
  const getColorVar = (color, shade) => {
    if (color === 'purple') return `var(--color-violet-${shade})`;
    if (color === 'red') return `var(--color-rose-${shade})`;
    if (color === 'green') return `var(--color-emerald-${shade})`;
    return `var(--color-${color}-${shade})`;
  }
  
  // Function to lighten a hex color for better appearance
  const lightenHexColor = (hex, percent = 30) => {
    hex = hex.replace('#', '')
    const r = parseInt(hex.substring(0, 2), 16)
    const g = parseInt(hex.substring(2, 4), 16)
    const b = parseInt(hex.substring(4, 6), 16)
    const lightenedR = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)))
    const lightenedG = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)))
    const lightenedB = Math.min(255, Math.floor(b + (255 - b) * (percent / 100)))
    return `#${lightenedR.toString(16).padStart(2, '0')}${lightenedG.toString(16).padStart(2, '0')}${lightenedB.toString(16).padStart(2, '0')}`
  }
  
  // Get the background and text colors
  const backgroundColor = isHexColor ? lightenHexColor(eventColor, 30) : getColorVar(eventColor, '500')
  const textColor = isHexColor ? darkenHexColor(eventColor, 30) : getColorVar(eventColor, '900')
  const borderColor = textColor
  
  const columns = position?.columns || 1
  const columnIndex = position?.column || 0
  const gap = position?.gap ?? 0
  const widthPercent = 100 / columns
  const leftPercent = widthPercent * columnIndex
  const totalGap = gap * (columns - 1)
  const widthCalc = columns > 1
    ? `calc(${widthPercent}% - ${(totalGap) / columns}px)`
    : `calc(${widthPercent}% - 2px)`
  const leftCalc = columns > 1
    ? `calc(${leftPercent}% + ${columnIndex * gap}px)`
    : '2px'

  return (
    <div
      className="absolute rounded-lg p-1 overflow-hidden cursor-pointer 
                  text-sm z-10 group"
      onClick={handleClick}
      style={{
        top: `${top}px`,
        height: `${height}px`,
        minHeight: '20px',
        left: leftCalc,
        width: widthCalc,
        backgroundColor: backgroundColor,
        zIndex: 20 + columnIndex
      }}
    >
      {/* Vertical line */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-1" 
        style={{ 
          backgroundColor: borderColor,
        }}
      ></div>
      
      <div className="ml-3"> {/* Add margin to accommodate for the vertical line */}
        <div 
          className="font-medium truncate mb-0.5" 
          style={{ 
            color: textColor // Darker version of the event color
          }}
        >
          {event.title}
        </div>
        <div 
          className="text-xs"
          style={{ 
            color: textColor // Darker version of the event color
          }}
        >
          {formatTime(startDate)}
        </div>
      </div>
    </div>
  )
}

export default WeekEvent
