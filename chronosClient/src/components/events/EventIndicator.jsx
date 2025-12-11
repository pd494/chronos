import { format, differenceInCalendarDays, startOfDay } from 'date-fns'
import { useState, useEffect } from 'react'
import { useCalendar } from '../../context/CalendarContext/CalendarContext'
import { normalizeToPaletteColor, getEventColors } from '../../lib/eventColors'

const EventIndicator = ({ event, isMonthView }) => {
  const { openEventModal, selectedEvent, updateEvent, isEventChecked } = useCalendar()
  const isSelected = selectedEvent?.id === event.id
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

  useEffect(() => {
    setShowDropAnim(resolveFreshDrop())
  }, [event?._freshDrop, event?.id])

  // Clear animation after it plays
  useEffect(() => {
    if (showDropAnim) {
      const timer = setTimeout(() => setShowDropAnim(false), 500)
      return () => clearTimeout(timer)
    }
  }, [showDropAnim])
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
    try { e.dataTransfer.setData('text/plain', ' ') } catch (_) { }

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
    try { e.dataTransfer.setDragImage(dragPreview, offsetX, offsetY) } catch (_) { }
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
  const isTodoEvent = Boolean(event.todoId || event.todo_id)
  const shouldShowDropAnim = showDropAnim

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

  const paletteName = normalizeToPaletteColor(previewColor || event.color || 'blue')
  const palette = getEventColors(paletteName)
  const lineStyle = { backgroundColor: palette.border }
  const textStyle = { color: palette.text }

  const baseTitleStyle = { color: palette.text }
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

  const titleTextStyle = {
    textDecoration: visuallyDeclined ? 'line-through' : undefined,
    display: 'inline-block'
  }

  const timeStyle = (isPendingInvite || isTentative || visuallyDeclined)
    ? { color: 'rgba(71, 85, 105, 0.55)' }
    : {}
  const now = new Date()
  const isPast = (() => {
    try {
      const rawEnd = event.end || event.endTime || event.start
      if (!rawEnd) return false
      const endDate = rawEnd instanceof Date ? rawEnd : new Date(rawEnd)
      return endDate < now
    } catch (_) {
      return false
    }
  })()

  const baseOpacity = (() => {
    if (visuallyDeclined) {
      return treatAsAllDay ? 0.6 : 0.55
    }
    if ((isPendingInvite || isTentative) && isMonthView) return 0.9
    if (isPast) return 0.7
    return 1
  })()

  const pendingMonthClasses = (isPendingInvite || isTentative) && isMonthView
    ? "relative overflow-hidden border border-dashed border-slate-300 bg-slate-50/90 text-slate-600 saturate-50 after:content-[''] after:absolute after:inset-[2px] after:border after:border-dotted after:border-slate-300 after:rounded-md after:pointer-events-none"
    : ''
  const declinedMonthClasses = isDeclined && isMonthView
    ? "relative after:content-[''] after:absolute after:left-1 after:right-1 after:top-1/2 after:border-t after:border-slate-400/80 after:-translate-y-1/2"
    : ''
  const dropAnimationClass = shouldShowDropAnim ? 'animate-event-drop-pop' : ''
  const hoverClasses = 'transition-opacity duration-150 hover:opacity-80 hover:brightness-95'

  return (
    <div
      draggable={!isDragging}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={[
        'relative text-xs mb-1 flex items-center gap-1 px-1 py-0.5',
        hoverClasses,
        isMonthView && treatAsAllDay ? 'rounded-md' : '',
        pendingMonthClasses,
        declinedMonthClasses,
        dropAnimationClass,
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
      data-event-id={event.id}
      data-active={isSelected ? 'true' : 'false'}
      style={{
        maxWidth: '100%',
        minWidth: 0,
        cursor: isDragging ? 'grabbing' : 'pointer',
        opacity: isDragging ? 0.5 : baseOpacity,
        animation: shouldShowDropAnim ? 'eventDropPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : undefined,
        ...(isMonthView && treatAsAllDay ? { backgroundColor: palette.background, borderRadius: '5px', paddingLeft: '0px', paddingRight: '8px' } : {}),
        ...(isMonthView && !treatAsAllDay ? { paddingLeft: '0px' } : {}),
        ...(isSelected ? { boxShadow: '0 0 0 2px rgba(23, 97, 199, 0.4)', borderRadius: '7px' } : {}),
        ...((isPendingInvite || isTentative) && isMonthView ? { backgroundColor: 'rgba(248, 250, 252, 0.9)', color: '#475569' } : {})
      }}
    >
      {isMonthView ? (
        <>
          <div className="flex items-center min-w-0 flex-1" style={{ gap: '5px' }}>
            <div
              className="w-[3px] min-h-[14px] rounded-full ml-0.5 flex-shrink-0"
              style={{ ...lineStyle, height: 'calc(100% - 4px)' }}
            ></div>

            <div
              className="flex-1 truncate overflow-hidden text-ellipsis font-medium min-w-0"
              style={{
                ...titleStyle
              }}
            >
              <span style={titleTextStyle}>{event.title}</span>
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
