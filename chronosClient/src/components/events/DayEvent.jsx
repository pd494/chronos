import { format, differenceInMinutes, isSameDay } from 'date-fns'
import { useState, useEffect } from 'react'
import { useCalendar } from '../../context/CalendarContext'
import { useAuth } from '../../context/AuthContext'
import { getEventColors } from '../../lib/eventColors'
import { FiVideo, FiRepeat } from 'react-icons/fi'

const isRecurringCalendarEvent = (event) => {
  if (!event) return false
  if (event.recurringEventId || event.parentRecurrenceId) return true
  if (Array.isArray(event.recurrence) && event.recurrence.length) return true
  if (event.recurrenceMeta?.enabled) return true
  if (typeof event.recurrenceRule === 'string' && event.recurrenceRule.trim().length > 0) return true
  return false
}

const DayEvent = ({ event, hourHeight, dayStartHour, position }) => {
  const { openEventModal, selectedEvent, updateEvent } = useCalendar()
  const { user } = useAuth()
  const [isDragging, setIsDragging] = useState(false)
  const [previewTimes, setPreviewTimes] = useState(null)
  
  const startDate = new Date(event.start)
  const endDate = new Date(event.end)
  const displayStart = previewTimes?.start ?? startDate
  const displayEnd = previewTimes?.end ?? endDate
  
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
    const rawDurationMs = Math.max(5 * 60 * 1000, endDate.getTime() - startDate.getTime())
    const ONE_HOUR = 60 * 60 * 1000
    const durationMs = (event.isAllDay || rawDurationMs >= 23 * ONE_HOUR)
      ? ONE_HOUR
      : rawDurationMs
    if (typeof window !== 'undefined') {
      window.__chronosDraggedEventMeta = {
        id: event.id,
        durationMs,
        title: event.title,
        color: event.color || 'blue',
        start: startDate.toISOString()
      }
      const startPointX = e.clientX ?? (rect.left + rect.width / 2)
      const startPointY = e.clientY ?? (rect.top + rect.height / 2)
      window.__chronosDragAxis = null
      window.__chronosDragStartPoint = { x: startPointX, y: startPointY }
    }
    
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
    
    // Disable pointer events on the original element after drag image is set
    requestAnimationFrame(() => {
      e.currentTarget.style.pointerEvents = 'none'
    })
    
    setTimeout(() => {
      if (dragPreview.parentNode) {
        dragPreview.parentNode.removeChild(dragPreview)
      }
    }, 0)
  }

  const handleDragEnd = (e) => {
    setIsDragging(false)
    // Remove dragging marker and restore pointer events
    e.currentTarget.removeAttribute('data-dragging')
    e.currentTarget.style.pointerEvents = ''
    if (typeof window !== 'undefined') {
      if (window.__chronosDraggedEventMeta?.id === event.id) {
        window.__chronosDraggedEventMeta = null
      }
      window.__chronosDragAxis = null
      window.__chronosDragStartPoint = null
      window.dispatchEvent(new CustomEvent('chronos-drag-preview', {
        detail: { id: event.id, start: null, end: null }
      }))
    }
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
  
  // Don't show pending invite styling if current user is the organizer
  const isCurrentUserOrganizer = event.organizerEmail === user?.email
  const showPendingStyling = (isPendingInvite || isTentative) && !isCurrentUserOrganizer
  const stripedClass = showPendingStyling ? 'pending-invite-block' : ''
  const declinedClass = isDeclined ? 'declined-event-block' : ''
  const titleColor = isDeclined ? 'rgba(71, 85, 105, 0.6)' : colors.text
  const timeColor = isDeclined ? 'rgba(71, 85, 105, 0.6)' : colors.text
  const hexToRgba = (hex, alpha) => {
    if (typeof hex !== 'string' || !hex.startsWith('#')) return hex
    const normalized = hex.replace('#', '')
    if (normalized.length === 3) {
      const r = parseInt(normalized[0] + normalized[0], 16)
      const g = parseInt(normalized[1] + normalized[1], 16)
      const b = parseInt(normalized[2] + normalized[2], 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
    const r = parseInt(normalized.substring(0, 2), 16)
    const g = parseInt(normalized.substring(2, 4), 16)
    const b = parseInt(normalized.substring(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  const backgroundColor = isDeclined 
    ? 'rgba(148, 163, 184, 0.225)' 
    : (colors.background.startsWith('#') ? hexToRgba(colors.background, 0.7) : colors.background)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (evt) => {
      const { id, start, end } = evt.detail || {}
      if (id !== event.id) return
      if (start && end) {
        setPreviewTimes({
          start: new Date(start),
          end: new Date(end)
        })
      } else {
        setPreviewTimes(null)
      }
    }
    window.addEventListener('chronos-drag-preview', handler)
    return () => window.removeEventListener('chronos-drag-preview', handler)
  }, [event.id])

  const isPreviewing = Boolean(previewTimes)
  const dayChanged = previewTimes ? !isSameDay(displayStart, startDate) : false
  const showRecurringIcon = isRecurringCalendarEvent(event)

  return (
    <div
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`absolute rounded-lg p-2 overflow-visible text-sm z-10 group event-draggable calendar-event-hover ${stripedClass} ${declinedClass}`}
      style={{
        cursor: isDragging ? 'grabbing' : 'pointer',
        top: `${top}px`,
        minHeight: `${height}px`,
        left: leftCalc,
        width: widthCalc,
        backgroundColor,
        zIndex: 20 + columnIndex,
        boxShadow: isSelected ? '0 0 0 2px rgba(23, 97, 199, 0.6)' : undefined,
        opacity: isDragging ? 0.25 : (showPendingStyling ? 0.9 : 1),
        border: showPendingStyling ? '1px dashed rgba(148, 163, 184, 0.9)' : undefined,
        filter: showPendingStyling ? 'saturate(0.9)' : undefined
      }}
      onClick={handleClick}
      data-event-id={event.id}
      data-active={isSelected ? 'true' : 'false'}
    >
      {/* Vertical line - rounded and floating */}
      <div 
        className="absolute left-1 top-1 bottom-1 w-1 rounded-full" 
        style={{ 
          backgroundColor: colors.border
        }}
      ></div>
      
      <div className="ml-3.5"> {/* Add margin to accommodate for the vertical line */}
        <div 
          className="font-medium mb-0.5 flex items-start gap-1.5" 
          style={{ 
            color: titleColor
          }}
        >
          <span className="break-words whitespace-normal flex-1 min-w-0">{event.title}</span>
          {showRecurringIcon && (
            <FiRepeat className="flex-shrink-0 mt-0.5" size={14} />
          )}
        </div>
        <div 
          className="text-xs leading-tight"
          data-event-time="true"
          style={{ 
            color: timeColor,
            fontWeight: isPreviewing ? 600 : 500
          }}
        >
          {`${formatTime(displayStart)} – ${formatTime(displayEnd)}`}
          {isPreviewing && (
            <>
              <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                New time
              </span>
              {dayChanged && (
                <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                  {format(displayStart, 'EEE')}
                </span>
              )}
            </>
          )}
        </div>
        {(() => {
          // Check for meeting links in various fields (hangoutLink, conferenceData, location)
          let meetingLink = '';
          
          // Check hangoutLink first (Google Meet)
          if (event.hangoutLink) {
            meetingLink = event.hangoutLink;
          }
          // Check conferenceData.hangoutLink
          else if (event.conferenceData?.hangoutLink) {
            meetingLink = event.conferenceData.hangoutLink;
          }
          // Check conferenceData.entryPoints
          else if (event.conferenceData?.entryPoints) {
            const videoEntry = event.conferenceData.entryPoints.find(
              ep => ep.entryPointType === 'video' && ep.uri
            );
            if (videoEntry?.uri) {
              meetingLink = videoEntry.uri;
            }
          }
          // Check location for meeting links
          else if (event.location) {
            const location = event.location;
            if (location.includes('meet.google.com') || location.includes('zoom.us') || location.includes('zoom.com') || location.includes('teams.microsoft.com')) {
              meetingLink = location;
            }
          }
          
          // If we found a meeting link, display it with icon and shortened format
          if (meetingLink) {
            let displayLink = meetingLink;
            
            // Shorten Zoom links
            if (meetingLink.includes('zoom.us') || meetingLink.includes('zoom.com')) {
              displayLink = 'zoom.us';
            }
            // Shorten Google Meet links
            else if (meetingLink.includes('meet.google.com')) {
              displayLink = 'meet.google.com';
            }
            
            return (
              <div 
                className="text-xs mt-1 opacity-80 flex items-start gap-1"
                style={{ 
                  color: timeColor
                }}
              >
                <FiVideo className="flex-shrink-0 mt-0.5" size={14} />
                <span className="break-all">{displayLink}</span>
              </div>
            );
          }
          
          // Otherwise, show description if it exists
          if (event.description) {
            return (
              <div 
                className="text-xs mt-1 break-words whitespace-normal opacity-80"
                style={{ 
                  color: timeColor
                }}
              >
                {event.description}
              </div>
            );
          }
          
          return null;
        })()}
      </div>
    </div>
  )
}

export default DayEvent
