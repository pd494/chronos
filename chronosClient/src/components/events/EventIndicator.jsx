import { format, differenceInCalendarDays, startOfDay } from 'date-fns'
import { useState } from 'react'
import { useCalendar } from '../../context/CalendarContext'

const EventIndicator = ({ event, isMonthView }) => {
  const { openEventModal, selectedEvent, updateEvent, isEventChecked } = useCalendar()
  const isSelected = selectedEvent?.id === event.id
  const [isDragging, setIsDragging] = useState(false)
  const spansMultipleDays = (() => {
    if (!event?.start || !event?.end) return false
    try {
      const startDay = startOfDay(new Date(event.start))
      const endDay = startOfDay(new Date(event.end))
      return differenceInCalendarDays(endDay, startDay) >= 1
    } catch (_) {
      return false
    }
  })()

  const treatAsAllDay = event.isAllDay || spansMultipleDays

  const handleClick = (e) => {
    if (isDragging) return
    e.stopPropagation()
    
    // Store the clicked event element for modal placement
    const rect = e.currentTarget.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    window.lastClickedEvent = e.currentTarget;
    window.lastClickedCalendarDay = e.currentTarget;
    window.lastClickedEventId = event.id;
    window.lastCalendarAnchorRect = {
      top: rect.top + scrollTop,
      bottom: rect.bottom + scrollTop,
      left: rect.left + scrollLeft,
      right: rect.right + scrollLeft,
      width: rect.width,
      height: rect.height,
      eventId: event.id
    };
    
    openEventModal(event)
  }

  const handleDragStart = (e) => {
    e.stopPropagation()
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('event', JSON.stringify(event))
    e.dataTransfer.setData('eventId', event.id)
    try { e.dataTransfer.setData('text/plain', ' ') } catch (_) {}
    
    // Mark this specific element as being dragged
    e.currentTarget.setAttribute('data-dragging', 'true')
    
    // Create custom drag preview so the ghost doesn't stretch across the viewport
    const rect = e.currentTarget.getBoundingClientRect()
    const dragPreview = e.currentTarget.cloneNode(true)
    dragPreview.style.opacity = '0.85'
    dragPreview.style.position = 'absolute'
    dragPreview.style.top = '-1000px'
    dragPreview.style.left = '-1000px'
    dragPreview.style.width = `${rect.width}px`
    dragPreview.style.height = `${rect.height}px`
    dragPreview.style.boxSizing = 'border-box'
    dragPreview.style.pointerEvents = 'none'
    document.body.appendChild(dragPreview)
    const rawOffsetX = (e.clientX ?? rect.left) - rect.left
    const rawOffsetY = (e.clientY ?? rect.top) - rect.top
    const offsetX = Math.max(1, Math.min(rect.width - 1, rawOffsetX))
    const offsetY = Math.max(1, Math.min(rect.height - 1, rawOffsetY))
    try { e.dataTransfer.setDragImage(dragPreview, offsetX, offsetY) } catch (_) {}
    setTimeout(() => {
      if (dragPreview.parentNode) {
        dragPreview.parentNode.removeChild(dragPreview)
      }
    }, 0)
  }

  const handleDragEnd = (e) => {
    setIsDragging(false)
    // Remove dragging marker
    e.currentTarget.removeAttribute('data-dragging')
    // Remove all dragover classes
    document.querySelectorAll('.event-dragover').forEach(el => {
      el.classList.remove('event-dragover')
    })
  }
  
  const formattedTime = format(new Date(event.start), 'h:mma').toLowerCase();
  const responseStatus = typeof event.viewerResponseStatus === 'string'
    ? event.viewerResponseStatus.toLowerCase()
    : (event.isInvitePending ? 'needsaction' : null)
  const isPendingInvite = responseStatus === 'needsaction'
  const isTentative = responseStatus === 'tentative'
  const isDeclined = responseStatus === 'declined'
  const isCheckedOff = isEventChecked(event.id)
  
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
  const bgStyle = (isHexColor && treatAsAllDay) ? {
    backgroundColor: lightenHexColor(eventColor, 70)
  } : {};
  
  const lineStyle = isHexColor ? {
    backgroundColor: eventColor
  } : {};
  
  const textStyle = isHexColor ? {
    color: darkenHexColor(eventColor, 40)
  } : {};

  const baseTitleStyle = isHexColor ? { ...textStyle } : { color: 'rgb(55, 65, 81)' }
  const visuallyDeclined = isDeclined || isCheckedOff

  const titleStyle = (() => {
    if (visuallyDeclined) {
      return { ...baseTitleStyle, color: 'rgba(71, 85, 105, 0.6)' }
    }
    if (isPendingInvite || isTentative) {
      return { ...baseTitleStyle, color: '#475569' }
    }
    return baseTitleStyle
  })()

  const timeStyle = (isPendingInvite || isTentative || visuallyDeclined)
    ? { color: 'rgba(71, 85, 105, 0.55)' }
    : {}
  const baseOpacity = (() => {
    if (visuallyDeclined) {
      return treatAsAllDay ? 0.6 : 0.55
    }
    if ((isPendingInvite || isTentative) && isMonthView) return 0.9
    return 1
  })()

  return (
    <div
      draggable={!isDragging}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`text-xs mb-1 flex items-center gap-1 px-1 py-0.5 transition-opacity calendar-event calendar-event-hover ${isMonthView ? (isHexColor ? (treatAsAllDay ? 'rounded-md' : '') : `${treatAsAllDay ? getBgColorClass(eventColor) + ' bg-opacity-70' : ''} ${treatAsAllDay ? 'rounded-md' : ''}`) : ''} ${
        (isPendingInvite || isTentative) && isMonthView ? 'pending-month-invite' : ''
      } ${visuallyDeclined && isMonthView ? 'declined-month-event' : ''}`}
      onClick={handleClick}
      data-event-id={event.id}
      data-active={isSelected ? 'true' : 'false'}
      style={{ 
        maxWidth: '100%', 
        minWidth: 0,
        cursor: isDragging ? 'grabbing' : 'pointer',
        opacity: isDragging ? 0.5 : baseOpacity,
        ...(isMonthView && isHexColor && treatAsAllDay ? bgStyle : {}),
        ...(isSelected ? { boxShadow: '0 0 0 2px rgba(23, 97, 199, 0.4)', borderRadius: '8px' } : {}),
        ...((isPendingInvite || isTentative) && isMonthView ? { backgroundColor: 'rgba(248, 250, 252, 0.9)', color: '#475569' } : {})
      }}
    >
      {isMonthView ? (
        <>
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <div 
              className={`${isHexColor ? '' : getColorClass(eventColor)} rounded-sm`}
              style={{ 
                width: '3.2px', 
                height: '14px',
                flex: '0 0 3.2px',
                ...(isHexColor ? lineStyle : {})
              }}
            ></div>
            
            <div
              className="flex-1 truncate overflow-hidden text-ellipsis font-medium min-w-0"
              style={{
                ...titleStyle
              }}
            >
              {event.title}
            </div>
          </div>
          
          {!treatAsAllDay && (
            <div
              className="text-gray-600 dark:text-gray-700 flex-shrink-0 whitespace-nowrap text-right font-medium pl-1"
              style={{ minWidth: '48px', ...timeStyle }}
            >
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
