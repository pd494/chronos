import { format, differenceInMinutes, isSameDay } from 'date-fns'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useCalendar } from '../../context/CalendarContext/CalendarContext'
import { useAuth } from '../../context/AuthContext'
import { getEventColors, normalizeToPaletteColor } from '../../lib/eventColors'
import { FiVideo, FiRepeat } from 'react-icons/fi'

const isRecurringCalendarEvent = (event) => {
  if (!event) return false
  if (event.recurringEventId || event.parentRecurrenceId) return true
  if (Array.isArray(event.recurrence) && event.recurrence.length) return true
  if (event.recurrenceMeta?.enabled) return true
  if (typeof event.recurrenceRule === 'string' && event.recurrenceRule.trim().length > 0) return true
  return false
}

const truncateDescription = (description, sentenceLimit = 2) => {
  if (!description || typeof description !== 'string') return ''
  const plainText = description
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plainText) return ''
  const sentences = plainText.split(/(?<=[.!?])\s+/)
  const limited = sentences.slice(0, sentenceLimit).join(' ').trim()
  if (!limited) return ''
  const needsEllipsis = sentences.length > sentenceLimit
  if (!needsEllipsis) return limited
  const endsWithPunctuation = /[.!?]$/.test(limited)
  return `${endsWithPunctuation ? limited : `${limited}.`} ...`
}

const DESCRIPTION_MIN_HEIGHT = 80

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

const DayEvent = ({ event, hourHeight, dayStartHour, dayEndHour, position }) => {
  const { openEventModal, selectedEvent, updateEvent, isEventChecked } = useCalendar()
  const { user } = useAuth()
  const [isDragging, setIsDragging] = useState(false)
  const [previewTimes, setPreviewTimes] = useState(null)
  const [resizePreview, setResizePreview] = useState(null)
  const [isResizing, setIsResizing] = useState(false)
  const [dragEnabled, setDragEnabled] = useState(true)
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
  const [isHovered, setIsHovered] = useState(false)
  const [previewColor, setPreviewColor] = useState(null)
  const resizingDataRef = useRef(null)
  const resizingPreviewRef = useRef(null)

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

  // Ensure we're working with proper Date objects
  const startDate = event.start instanceof Date ? event.start : new Date(event.start)
  const endDate = event.end instanceof Date ? event.end : new Date(event.end)
  const previewStart = previewTimes?.start ?? startDate
  const previewEnd = resizePreview?.end ?? previewTimes?.end ?? endDate
  const positionStart = startDate
  const positionEnd = resizePreview?.end ?? endDate

  const startHour = startDate.getHours()
  const startMinute = startDate.getMinutes()
  const endHour = endDate.getHours()
  const endMinute = endDate.getMinutes()

  // Calculate position and height - use original position, not preview
  const top = (positionStart.getHours() - dayStartHour) * hourHeight + (positionStart.getMinutes() / 60) * hourHeight
  const duration = Math.max(5, differenceInMinutes(positionEnd, positionStart))
  // Add gap between back-to-back events
  const eventGap = 4
  const height = Math.max(20, (duration / 60) * hourHeight - eventGap)
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
    if (!dragEnabled || isResizing) {
      e.preventDefault()
      return
    }
    e.stopPropagation()
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.dropEffect = 'move'
    e.dataTransfer.setData('event', JSON.stringify(event))
    e.dataTransfer.setData('eventId', event.id)
    try { e.dataTransfer.setData('text/plain', '') } catch (_) { }
    const rect = e.currentTarget.getBoundingClientRect()
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

    const dragPreview = document.createElement('div')
    dragPreview.style.position = 'absolute'
    dragPreview.style.top = '-9999px'
    dragPreview.style.width = '1px'
    dragPreview.style.height = '1px'
    dragPreview.style.opacity = '0'
    document.body.appendChild(dragPreview)
    try {
      e.dataTransfer.setDragImage(dragPreview, 0, 0)
    } catch (_) { }
    setTimeout(() => {
      if (dragPreview.parentNode) dragPreview.parentNode.removeChild(dragPreview)
    }, 0)

    // Let drag events pass through to the grid the same way week view does
    requestAnimationFrame(() => {
      e.currentTarget.style.pointerEvents = 'none'
    })
  }

  const handleResizeMouseMove = useCallback((moveEvent) => {
    const data = resizingDataRef.current
    if (!data) return
    const { columnRect, startAbsoluteMinutes } = data
    const clampedY = Math.min(columnRect.height, Math.max(0, moveEvent.clientY - columnRect.top))
    const rawMinutes = dayStartHour * 60 + (clampedY / hourHeight) * 60
    const minMinutes = Math.max(startAbsoluteMinutes + 5, dayStartHour * 60)
    const maxMinutes = (dayEndHour + 1) * 60
    const clampedMinutes = Math.min(Math.max(minMinutes, rawMinutes), maxMinutes)
    const durationMinutes = clampedMinutes - startAbsoluteMinutes
    const newEnd = new Date(startDate.getTime() + Math.max(5, durationMinutes) * 60000)
    setResizePreview({
      start: startDate,
      end: newEnd
    })
    resizingPreviewRef.current = newEnd
  }, [dayEndHour, dayStartHour, hourHeight, startDate])

  const handleResizeMouseUp = useCallback(() => {
    window.removeEventListener('mousemove', handleResizeMouseMove)
    window.removeEventListener('mouseup', handleResizeMouseUp)
    setIsResizing(false)
    setDragEnabled(true)
    if (typeof window !== 'undefined') {
      window.__chronosEventResizing = false
      window.__chronosResizingEventId = null
      window.dispatchEvent(new CustomEvent('chronos-event-resize-end', { detail: { id: event.id } }))
    }
    const finalEnd = resizingPreviewRef.current
    resizingPreviewRef.current = null
    resizingDataRef.current = null
    setResizePreview(null)
    if (finalEnd && finalEnd.getTime() !== endDate.getTime()) {
      updateEvent(event.id, {
        end: finalEnd
      })
    }
  }, [endDate, event.id, handleResizeMouseMove, updateEvent])

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleResizeMouseMove)
      window.removeEventListener('mouseup', handleResizeMouseUp)
      if (typeof window !== 'undefined' && window.__chronosEventResizing && window.__chronosResizingEventId === event.id) {
        window.__chronosEventResizing = false
        window.__chronosResizingEventId = null
        window.dispatchEvent(new CustomEvent('chronos-event-resize-end', { detail: { id: event.id } }))
      }
    }
  }, [event.id, handleResizeMouseMove, handleResizeMouseUp])

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

  const colors = getEventColors(normalizeToPaletteColor(previewColor || event.color || 'blue'))

  const columns = position?.columns || 1
  const columnIndex = position?.column || 0
  const stackIndex = position?.stackIndex || 0

  // Google Calendar style: overlapping with staggered slices.
  // When there's only one event column, let it span the full width.
  const isSingleColumn = columns <= 1
  const sliceWidthPercent = isSingleColumn ? 100 : 70
  const offsetPercent = isSingleColumn ? 0 : 20
  const padding = 6
  const maxLeft = Math.max(0, 100 - sliceWidthPercent)
  const rawLeft = columnIndex * offsetPercent
  const leftPos = Math.min(rawLeft, maxLeft)
  const widthCalc = `calc(${sliceWidthPercent}% - ${padding}px)`
  const leftCalc = `calc(${leftPos}% + ${padding / 2}px)`

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
  const pendingInviteClasses = showPendingStyling
    ? "relative overflow-hidden border border-dashed border-slate-300 bg-slate-50/90 text-slate-600 saturate-75 after:content-[''] after:absolute after:inset-0 after:bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.3)_0px,rgba(255,255,255,0.3)_8px,transparent_8px,transparent_16px)] after:pointer-events-none after:opacity-85"
    : ''
  const declinedClass = ''
  const dropAnimationClass = showDropAnim ? 'animate-event-drop-pop' : ''
  const hoverClasses = 'transition-opacity duration-150 hover:opacity-80 hover:brightness-95'
  const compactFontSize = columns >= 4 ? 10 : (columns >= 3 ? 11 : 12)
  const titleColor = isDeclined
    ? 'rgba(71, 85, 105, 0.6)'
    : visuallyChecked
      ? hexToRgba(colors.text, 0.6)
      : hexToRgba(colors.text, 0.9)
  const timeColor = 'rgba(55, 65, 81, 0.7)'
  const titleStyle = {
    color: titleColor,
    fontSize: `${compactFontSize}px`
  }
  const titleTextStyle = {
    textDecoration: (isDeclined || visuallyChecked) ? 'line-through' : undefined,
    display: 'inline-block'
  }

  const backgroundColor = isDeclined
    ? (colors.background.startsWith('#') ? hexToRgba(colors.background, 0.45) : colors.background)
    : visuallyChecked
      ? lightenHexColor(colors.background, 25)
      : colors.background

  const now = new Date()
  const isPast = previewEnd < now
  const pastOpacity = 0.7
  // Keep the original card fully visible while dragging; ghost handles preview
  const eventOpacity = isDragging
    ? 1
    : (showPendingStyling
      ? 0.9
      : (visuallyChecked
        ? 0.7
        : (isPast ? pastOpacity : 1)))

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
  // No longer showing day change in original event - ghost preview handles this
  const showRecurringIcon = isRecurringCalendarEvent(event)
  const truncatedDescription = truncateDescription(event.description)
  const showDescription = Boolean(truncatedDescription && height >= DESCRIPTION_MIN_HEIGHT)

  const laneBaseZ = 20 + columnIndex * 100
  const laneStackZ = laneBaseZ + stackIndex
  const activeZ = laneBaseZ + 1000
  const resolvedZIndex = (isDragging || isResizing || isHovered) ? activeZ : laneStackZ

  return (
    <div
      draggable={!isResizing && dragEnabled}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={[
        'absolute rounded-lg p-1 overflow-visible text-sm z-10 group event-draggable',
        hoverClasses,
        pendingInviteClasses,
        declinedClass,
        dropAnimationClass,
      ].filter(Boolean).join(' ')}
      data-event-view="day"
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      data-event-id={event.id}
      data-active={isSelected ? 'true' : 'false'}
      style={{
        cursor: isDragging ? 'grabbing' : 'pointer',
        top: `${top}px`,
        height: `${height}px`,
        maxHeight: `${height}px`,
        left: leftCalc,
        width: widthCalc,
        minWidth: '64px',
        backgroundColor,
        zIndex: resolvedZIndex,
        boxShadow: isSelected ? '0 0 0 2px rgba(23, 97, 199, 0.6)' : undefined,
        opacity: eventOpacity,
        border: showPendingStyling ? '1px dashed rgba(148, 163, 184, 0.9)' : undefined,
        filter: showPendingStyling ? 'saturate(0.9)' : undefined,
        overflow: 'hidden',
        userSelect: 'none',
        animation: showDropAnim ? 'eventDropPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : undefined,
      }}
    >
      {/* Vertical line - rounded and floating */}
      <div
        className="absolute top-0.5 bottom-0.5 w-1 rounded-full pointer-events-none"
        style={{
          left: '1px',
          backgroundColor: colors.border,
          zIndex: 3
        }}
      ></div>
      <div
        className="ml-2"
        style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
      >
        <div
          className="font-medium mb-0.5 flex items-start gap-1.5"
          style={{
            color: titleColor
          }}
        >
          <span
            className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis"
            style={{ ...titleStyle, marginLeft: '2px' }}
          >
            <span style={titleTextStyle}>{event.title}</span>
          </span>
          {showRecurringIcon && (
            <FiRepeat className="flex-shrink-0 mt-0.5" size={14} />
          )}
        </div>
        <div
          className="text-xs leading-tight"
          data-event-time="true"
          style={{
            color: timeColor,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'visible',
            textOverflow: 'unset'
          }}
        >
          {`${formatTime(previewStart)} – ${formatTime(previewEnd)}`}
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
          if (showDescription) {
            return (
              <div
                className="text-xs mt-1 break-words whitespace-normal opacity-80"
                style={{
                  color: timeColor,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {truncatedDescription}
              </div>
            );
          }

          return null;
        })()}
      </div>
      <div
        className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize"
        onDragStart={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onMouseDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
          const columnEl = e.currentTarget.closest('[data-day-column="true"]')
          if (!columnEl) return
          const columnRect = columnEl.getBoundingClientRect()
          const startAbsoluteMinutes = startHour * 60 + startMinute
          resizingDataRef.current = {
            columnRect,
            startAbsoluteMinutes
          }
          setResizePreview({
            start: startDate,
            end: endDate
          })
          setIsResizing(true)
          setDragEnabled(false)
          if (typeof window !== 'undefined') {
            window.__chronosEventResizing = true
            window.__chronosResizingEventId = event.id
            window.dispatchEvent(new CustomEvent('chronos-event-resize-start', { detail: { id: event.id } }))
          }
          window.addEventListener('mousemove', handleResizeMouseMove)
          window.addEventListener('mouseup', handleResizeMouseUp)
        }}
      >
        <div
          className="mx-auto h-[2px] rounded-full w-8 bg-white/70 pointer-events-none"
          style={{ opacity: isResizing ? 1 : 0.35 }}
        />
      </div>
    </div>
  )
}

export default DayEvent
