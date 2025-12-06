import { format } from 'date-fns'
import { getEventColors, normalizeToPaletteColor } from '../../../lib/eventColors'
import { MULTI_DAY_TOP_OFFSET, MULTI_DAY_LANE_HEIGHT } from './constants'

const MultiDaySpan = ({ span, lane, weekStart, isPreview = false, openEventModal }) => {
  const previewStretch = '((100% / 7) * 0.1)'
  const spanLeft = isPreview
    ? `calc(${span.startIndex} * (100% / 7) + 4px - (${previewStretch} / 2))`
    : `calc(${span.startIndex} * (100% / 7) + 4px)`
  const spanWidth = isPreview
    ? `calc(${span.length} * (100% / 7) - 8px + ${previewStretch})`
    : `calc(${span.length} * (100% / 7) - 8px)`
  const spanTop = MULTI_DAY_TOP_OFFSET + lane * MULTI_DAY_LANE_HEIGHT

  const eventColorName = normalizeToPaletteColor(span.event?.color || 'blue')
  const colors = getEventColors(eventColorName)
  const isAllDay = span.event?.isAllDay
  const lineColor = colors.border || colors.text
  const textColor = colors.text
  const startTimeLabel = (!isPreview && span.event?.start && !span.event?.originalIsAllDay)
    ? format(new Date(span.event.start), 'h:mma').toLowerCase()
    : null

  const handleSpanDragStart = (e) => {
    if (isPreview) return
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('event', JSON.stringify(span.event))
    e.dataTransfer.setData('eventId', span.event.id)
    e.currentTarget.setAttribute('data-dragging', 'true')
  }

  const handleSpanDragEnd = (e) => {
    e.currentTarget.removeAttribute('data-dragging')
    document.querySelectorAll('.event-dragover').forEach(el => el.classList.remove('event-dragover'))
  }

  return (
    <div
      key={`${weekStart}-${span.id || 'preview'}-${lane}`}
      className={`absolute h-5 flex items-center px-1 text-xs z-[5] overflow-hidden whitespace-nowrap gap-1 transition-none leading-4
        ${isAllDay ? 'rounded-[15px]' : 'rounded'}
        ${isPreview ? 'border border-dashed border-blue-400/40 pointer-events-none rounded-lg opacity-75' : 'cursor-grab hover:opacity-70'}
        ${isPreview ? '' : '[&[data-dragging=true]]:cursor-grabbing [&[data-dragging=true]]:opacity-40'}`}
      draggable={!isPreview}
      onDragStart={handleSpanDragStart}
      onDragEnd={handleSpanDragEnd}
      style={{
        top: `${spanTop}px`,
        left: spanLeft,
        width: spanWidth,
        backgroundColor: isPreview ? getEventColors('blue').background : colors.background
      }}
      onMouseDown={(e) => isPreview ? undefined : e.stopPropagation()}
      onClick={(e) => {
        if (isPreview) return
        e.stopPropagation()
        openEventModal(span.event)
      }}
    >
      {!isPreview && (
        <div className="w-[3px] h-3.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: lineColor }} />
      )}
      <div className="flex items-center gap-1 flex-grow min-w-0">
        <span className="truncate font-medium flex-grow min-w-[30px]" style={{ color: textColor }}>
          {isPreview ? 'New Event' : (span.event?.title || 'Untitled')}
        </span>
        {startTimeLabel && (
          <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap flex-shrink-0">
            {startTimeLabel}
          </span>
        )}
      </div>
    </div>
  )
}

export default MultiDaySpan
