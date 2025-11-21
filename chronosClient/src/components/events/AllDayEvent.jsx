import { useState } from 'react'
import { format, differenceInCalendarDays, startOfDay } from 'date-fns'
import { getEventColors } from '../../lib/eventColors'
import { useAuth } from '../../context/AuthContext'
import { useCalendar } from '../../context/CalendarContext'
import { FiRepeat } from 'react-icons/fi'

const isRecurringCalendarEvent = (event) => {
  if (!event) return false
  if (event.recurringEventId || event.parentRecurrenceId) return true
  if (Array.isArray(event.recurrence) && event.recurrence.length) return true
  if (event.recurrenceMeta?.enabled) return true
  if (typeof event.recurrenceRule === 'string' && event.recurrenceRule.trim().length > 0) return true
  return false
}

const lightenHexColor = (hex, percent = 40) => {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return hex
  const normalized = hex.replace('#', '')
  const parse = (substr) => parseInt(substr, 16)
  const toHex = (value) => value.toString(16).padStart(2, '0')
  const adjust = (value) => Math.min(255, Math.floor(value + (255 - value) * (percent / 100)))

  if (normalized.length === 3) {
    const r = parse(normalized[0] + normalized[0])
    const g = parse(normalized[1] + normalized[1])
    const b = parse(normalized[2] + normalized[2])
    return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`
  }
  const r = parse(normalized.substring(0, 2))
  const g = parse(normalized.substring(2, 4))
  const b = parse(normalized.substring(4, 6))
  return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`
}

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

const AllDayEvent = ({ event, onOpen, className = '', style = {} }) => {
  const { user } = useAuth()
  const { isEventChecked } = useCalendar()
  const colors = getEventColors(event.color || 'blue')
  const [isDragging, setIsDragging] = useState(false)

  const handleClick = (e) => {
    if (isDragging) return
    e.stopPropagation()
    if (typeof onOpen === 'function') {
      onOpen(event)
    }
  }

  const handleDragStart = (e) => {
    e.stopPropagation()
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('event', JSON.stringify(event))
    e.dataTransfer.setData('eventId', event.id)
    try { e.dataTransfer.setData('text/plain', ' ') } catch (_) {}

    e.currentTarget.setAttribute('data-dragging', 'true')

    const rect = e.currentTarget.getBoundingClientRect()
    const dragPreview = e.currentTarget.cloneNode(true)
    dragPreview.style.opacity = '0.85'
    dragPreview.style.position = 'absolute'
    dragPreview.style.top = '-1000px'
    dragPreview.style.left = '-1000px'
    dragPreview.style.width = `${rect.width}px`
    dragPreview.style.height = `${Math.max(rect.height, 20)}px`
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
    e.currentTarget.removeAttribute('data-dragging')
    document.querySelectorAll('.event-dragover').forEach(el => {
      el.classList.remove('event-dragover')
    })
  }

  const responseStatus = typeof event.viewerResponseStatus === 'string'
    ? event.viewerResponseStatus.toLowerCase()
    : (event.isInvitePending ? 'needsaction' : null)
  const isPendingInvite = responseStatus === 'needsaction'
  const isTentative = responseStatus === 'tentative'
  const isDeclined = responseStatus === 'declined'
  const isCheckedOff = isEventChecked(event.id)
  const visuallyChecked = isCheckedOff && !isDeclined
  
  // Don't show pending invite styling if current user is the organizer
  const isCurrentUserOrganizer = event.organizerEmail === user?.email
  const showPendingStyling = (isPendingInvite || isTentative) && !isCurrentUserOrganizer

  const titleColor = isDeclined
    ? 'rgba(71, 85, 105, 0.6)'
    : visuallyChecked
      ? hexToRgba(colors.text, 0.65)
      : colors.text
  const titleStyle = {
    color: titleColor,
    textDecoration: (isDeclined || visuallyChecked) ? 'line-through' : undefined
  }
  const backgroundColor = isDeclined
    ? hexToRgba(colors.background, 0.45)
    : visuallyChecked
      ? lightenHexColor(colors.background, 25)
      : colors.background

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

  const showStartTime = spansMultipleDays && !event.isAllDay && event.start
  const formattedStartTime = showStartTime
    ? format(new Date(event.start), 'h:mma').toLowerCase()
    : null

  const showRecurringIcon = isRecurringCalendarEvent(event)

  const indicatorColor = (isDeclined || visuallyChecked)
    ? 'rgba(148, 163, 184, 0.8)'
    : (colors.border || colors.text)

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className={`rounded-md px-2 py-1 cursor-pointer text-xs relative flex items-center gap-2 event-draggable calendar-event-hover ${showPendingStyling ? 'pending-invite-block' : ''} ${(isDeclined || visuallyChecked) ? 'declined-event-block' : ''} ${className}`.trim()}
      data-event-view="week"
      style={{
        backgroundColor,
        color: titleColor,
        opacity: isDragging ? 0.5 : (showPendingStyling ? 0.9 : 1),
        border: showPendingStyling ? '1px dashed rgba(148, 163, 184, 0.9)' : undefined,
        filter: showPendingStyling ? 'saturate(0.9)' : undefined,
        ...style
      }}
      data-event-id={event.id}
    >
      {/* Vertical line indicator */}
      <div 
        className="absolute left-1 top-1 bottom-1 w-1 rounded-full" 
        style={{ 
          backgroundColor: indicatorColor
        }}
      ></div>
      
      <span className="font-medium flex items-center gap-1.5 flex-1 min-w-0 ml-2" style={titleStyle}>
        <span className="truncate flex-1 min-w-0">{event.title}</span>
        {formattedStartTime && (
          <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap flex-shrink-0">
            {formattedStartTime}
          </span>
        )}
        {showRecurringIcon && (
          <FiRepeat className="flex-shrink-0" size={14} />
        )}
      </span>
    </div>
  )
}

export default AllDayEvent
