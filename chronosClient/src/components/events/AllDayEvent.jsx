import { useState, useEffect } from 'react'
import { format, differenceInCalendarDays, startOfDay } from 'date-fns'
import { getEventColors, normalizeToPaletteColor } from '../../lib/eventColors'
import { useAuth } from '../../context/AuthContext'
import { useCalendar } from '../../context/CalendarContext/CalendarContext'
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

const AllDayEvent = ({ event, onOpen, className = '', style = {}, view = 'week' }) => {
  const { user } = useAuth()
  const { isEventChecked } = useCalendar()
  const [isDragging, setIsDragging] = useState(false)
  const resolveFreshDrop = () => {
    if (!event?._freshDrop) return false
    if (typeof window === 'undefined') return true
    const key = String(event?.id || event?.clientKey || event?.todoId || '')
    if (!key) return true
    if (!window.__chronosPlayedDrop) window.__chronosPlayedDrop = new Set()
    if (window.__chronosPlayedDrop.has(key)) return false
    window.__chronosPlayedDrop.add(key)
    return true
  }
  const [showDropAnim, setShowDropAnim] = useState(() => resolveFreshDrop())
  const [previewColor, setPreviewColor] = useState(null)
  
  // Clear animation after it plays
  useEffect(() => {
    if (showDropAnim) {
      const timer = setTimeout(() => setShowDropAnim(false), 500)
      return () => clearTimeout(timer)
    }
  }, [showDropAnim])

  useEffect(() => {
    setShowDropAnim(resolveFreshDrop())
  }, [event?._freshDrop, event?.id])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handlePreview = (e) => {
      const detail = e.detail || {}
      if (!detail) return
      const matches = String(detail.eventId) === String(event.id)
      if (!matches && !detail.all) return
      if (detail.color) setPreviewColor(detail.color)
      else setPreviewColor(null)
    }
    const handleClear = (e) => {
      const detail = e.detail || {}
      if (detail.all || String(detail.eventId) === String(event.id)) {
        setPreviewColor(null)
      }
    }
    window.addEventListener('chronos:event-color-preview', handlePreview)
    window.addEventListener('chronos:event-color-preview-clear', handleClear)
    return () => {
      window.removeEventListener('chronos:event-color-preview', handlePreview)
      window.removeEventListener('chronos:event-color-preview-clear', handleClear)
    }
  }, [event.id])

  const palette = getEventColors(normalizeToPaletteColor(previewColor || event.color || 'blue'))

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
      ? hexToRgba(palette.text, 0.65)
      : palette.text
  const titleStyle = {
    color: titleColor
  }
  const titleTextStyle = {
    textDecoration: (isDeclined || visuallyChecked) ? 'line-through' : undefined,
    display: 'inline-block'
  }
  const backgroundColor = isDeclined
    ? hexToRgba(palette.background, 0.45)
    : visuallyChecked
      ? lightenHexColor(palette.background, 25)
      : palette.background
  
  const now = new Date()
  const isPast = new Date(event.end) < now
  const pastOpacity = 0.7
  const eventOpacity = isDragging
    ? 0.5
    : (showPendingStyling
        ? 0.9
        : (visuallyChecked
            ? 0.7
            : (isPast ? pastOpacity : 1)))

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

  const indicatorColor = isDeclined
    ? 'rgba(148, 163, 184, 0.8)'
    : (palette.border || palette.text)

  const indicatorLeft = view === 'day' ? '3px' : '2px'

  const pendingInviteClasses = showPendingStyling
    ? "relative overflow-hidden border border-dashed border-slate-300 bg-slate-50/90 text-slate-600 saturate-75 after:content-[''] after:absolute after:inset-0 after:bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.3)_0px,rgba(255,255,255,0.3)_8px,transparent_8px,transparent_16px)] after:pointer-events-none after:opacity-85"
    : ''
  const declinedLineClasses = isDeclined && view === 'month'
    ? "relative after:content-[''] after:absolute after:left-1 after:right-1 after:top-1/2 after:border-t after:border-slate-400/80 after:-translate-y-1/2"
    : ''
  const dropAnimationClass = showDropAnim ? 'animate-event-drop-pop' : ''
  const hoverClasses = 'transition-opacity duration-150 hover:opacity-80 hover:brightness-95'

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className={[
        'pl-0 pr-2 py-1 cursor-pointer text-xs relative flex items-center gap-2 event-draggable rounded-lg',
        hoverClasses,
        pendingInviteClasses,
        declinedLineClasses,
        dropAnimationClass,
        className,
      ].filter(Boolean).join(' ')}
      data-event-view={view}
      style={{
        backgroundColor,
        color: titleColor,
        opacity: eventOpacity,
        border: showPendingStyling ? '1px dashed rgba(148, 163, 184, 0.9)' : undefined,
        filter: showPendingStyling ? 'saturate(0.9)' : undefined,
        overflow: 'hidden',
        paddingLeft: '8px',
        borderRadius: '8px',
        ...style
      }}
      data-event-id={event.id}
    >
      {/* Vertical line indicator */}
      <div 
        className="absolute"
        style={{ 
          backgroundColor: indicatorColor,
          width: '4px',
          top: '2px',
          bottom: '2px',
          left: indicatorLeft,
          borderRadius: '9999px'
        }}
      ></div>
      
      <span className="font-medium flex items-center gap-1.5 flex-1 min-w-0 ml-1" style={titleStyle}>
        <span className="truncate flex-1 min-w-0" style={titleTextStyle}>{event.title}</span>
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
