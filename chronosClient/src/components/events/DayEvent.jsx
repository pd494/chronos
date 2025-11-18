import { format, differenceInMinutes } from 'date-fns'
import { useState } from 'react'
import { useCalendar } from '../../context/CalendarContext'
import { getEventColors } from '../../lib/eventColors'

const DayEvent = ({ event, hourHeight, dayStartHour, position }) => {
  const { openEventModal, selectedEvent, updateEvent } = useCalendar()
  const [isDragging, setIsDragging] = useState(false)
  
  const startDate = new Date(event.start)
  const endDate = new Date(event.end)
  
  const startHour = startDate.getHours()
  const startMinute = startDate.getMinutes()
  const endHour = endDate.getHours()
  const endMinute = endDate.getMinutes()
  
  // Calculate position and height
  const top = (startHour - dayStartHour) * hourHeight + (startMinute / 60) * hourHeight
  const duration = differenceInMinutes(endDate, startDate)
  const height = (duration / 60) * hourHeight
  const isSelected = selectedEvent?.id === event.id

  const handleClick = (e) => {
    if (isDragging) return
    e.stopPropagation()

    const rect = e.currentTarget.getBoundingClientRect()
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft

    window.lastClickedEvent = e.currentTarget
    window.lastClickedEventId = event.id
    window.lastClickedCalendarDay = null
    window.lastCalendarAnchorRect = {
      top: rect.top + scrollTop,
      bottom: rect.bottom + scrollTop,
      left: rect.left + scrollLeft,
      right: rect.right + scrollLeft,
      width: rect.width,
      height: rect.height,
      eventId: event.id
    }

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
    
    // Create custom drag preview that mirrors the grid dimensions
    const rect = e.currentTarget.getBoundingClientRect()
    const dragPreview = e.currentTarget.cloneNode(true)
    dragPreview.style.opacity = '0.85'
    dragPreview.style.position = 'absolute'
    dragPreview.style.top = '-1000px'
    dragPreview.style.left = '-1000px'
    dragPreview.style.width = `${rect.width}px`
    dragPreview.style.height = `${Math.max(rect.height, 24)}px`
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
  
  // Format time for display - restore 12-hour format
  const formatTime = (date) => {
    return format(date, 'h:mm a')
  }
  
  // Get standardized colors
  const colors = getEventColors(event.color || 'blue')
  
  const columns = position?.columns || 1
  const columnIndex = position?.column || 0
  const gap = position?.gap ?? 0
  const widthPercent = 100 / columns
  const leftPercent = widthPercent * columnIndex
  const totalGap = gap * (columns - 1)
  const widthCalc = columns > 1
    ? `calc(${widthPercent}% - ${(totalGap) / columns}px)`
    : `calc(${widthPercent}% - 8px)`
  const leftCalc = columns > 1
    ? `calc(${leftPercent}% + ${columnIndex * gap}px)`
    : '8px'

  const responseStatus = typeof event.viewerResponseStatus === 'string'
    ? event.viewerResponseStatus.toLowerCase()
    : (event.isInvitePending ? 'needsaction' : null)
  const isPendingInvite = responseStatus === 'needsaction'
  const isTentative = responseStatus === 'tentative'
  const isDeclined = responseStatus === 'declined'
  const stripedClass = (isPendingInvite || isTentative) ? 'pending-invite-block' : ''
  const declinedClass = isDeclined ? 'declined-event-block' : ''
  const titleColor = isDeclined ? 'rgba(71, 85, 105, 0.6)' : colors.text
  const timeColor = isDeclined ? 'rgba(71, 85, 105, 0.6)' : colors.text
  const backgroundColor = isDeclined ? 'rgba(148, 163, 184, 0.225)' : colors.background

  return (
    <div
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`absolute rounded-lg p-2 overflow-hidden text-sm z-10 group event-draggable calendar-event-hover ${stripedClass} ${declinedClass}`}
      style={{
        cursor: isDragging ? 'grabbing' : 'pointer',
        top: `${top}px`,
        height: `${height}px`,
        minHeight: '25px',
        left: leftCalc,
        width: widthCalc,
        backgroundColor,
        zIndex: 20 + columnIndex,
        boxShadow: isSelected ? '0 0 0 2px rgba(52, 120, 246, 0.6)' : undefined,
        opacity: isDragging ? 0.25 : ((isPendingInvite || isTentative) ? 0.9 : 1),
        border: (isPendingInvite || isTentative) ? '1px dashed rgba(148, 163, 184, 0.9)' : undefined,
        filter: (isPendingInvite || isTentative) ? 'saturate(0.9)' : undefined
      }}
      onClick={handleClick}
      data-event-id={event.id}
      data-active={isSelected ? 'true' : 'false'}
    >
      {/* Vertical line */}
      <div 
        className="absolute left-0 top-0 bottom-0 w-1" 
        style={{ 
          backgroundColor: colors.border,
        }}
      ></div>
      
      <div className="ml-3"> {/* Add margin to accommodate for the vertical line */}
        <div 
          className="font-medium truncate mb-0.5" 
          style={{ 
            color: titleColor
          }}
        >
          {event.title}
        </div>
        <div 
          className="text-xs"
          style={{ 
            color: timeColor
          }}
        >
          {formatTime(startDate)}
        </div>
      </div>
    </div>
  )
}

export default DayEvent
