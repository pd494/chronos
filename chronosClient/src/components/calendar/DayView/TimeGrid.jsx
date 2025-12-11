import { format, differenceInMinutes } from 'date-fns'
import DayEvent from '../../events/DayEvent'
import { calculateTimeGridLayout } from '../../../lib/eventLayout'
import { getEventColors } from '../../../lib/eventColors'
import {
  HOUR_HEIGHT,
  DAY_START_HOUR,
  DAY_END_HOUR,
  TIMED_EVENT_GAP,
  cleanupDragArtifacts
} from './constants'
import DroppableHourCell from './DroppableHourCell'

const TimeGrid = ({
  scrollContainerRef,
  timelineRef,
  currentDate,
  regularEvents,
  hours,
  isDragging,
  dragStart,
  dragEnd,
  persistedDragPreview,
  isEventResizing,
  dragPreviewEvent,
  todoDragPreview,
  pendingTodoPreviewRef,
  handleCellMouseDown,
  handleCellMouseMove,
  handleCellDoubleClick,
  handleCombinedDropOnHourCell,
  handleHourCellDragOver,
  handleHourCellTodoDragOver,
  handleDragLeave,
  updateEventDragPreview,
  clearEventDragPreview,
  clearTodoDragPreview
}) => {
  const gridHeight = (DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_HEIGHT

  return (
    <div ref={scrollContainerRef} className="relative flex flex-1 overflow-y-auto min-h-0 scrollbar-hide">
      {/* Time labels */}
      <div
        className="w-16 flex-shrink-0 relative z-10 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700"
        style={{ height: `${gridHeight}px`, minHeight: `${gridHeight}px` }}
      >
        {hours.map((hour) => (
          <div key={hour} className="relative" style={{ height: `${HOUR_HEIGHT}px` }}>
            <span className="absolute left-2 text-xs text-gray-500" style={{ top: hour === 0 ? '4px' : '-10px' }}>
              {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
            </span>
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="flex-1 relative" style={{ height: `${gridHeight}px`, minHeight: `${gridHeight}px` }}>
        {/* Horizontal time grid lines */}
        {hours.map((hour) => (
          <div
            key={hour}
            className="absolute left-0 right-0 h-px bg-gray-200 dark:bg-gray-700 pointer-events-none z-0"
            style={{ top: `${(hour - DAY_START_HOUR) * HOUR_HEIGHT}px` }}
          />
        ))}

        {/* Current time indicator */}
        <div
          ref={timelineRef}
          className="absolute left-0 right-0 h-0.5 bg-red-500 z-10 before:content-[''] before:absolute before:left-0 before:-top-1 before:w-2.5 before:h-2.5 before:bg-red-500 before:rounded-full"
        />

        {/* Day column */}
        <div
          className="relative w-full"
          data-day-column="true"
          style={{ height: `${gridHeight}px`, minHeight: `${gridHeight}px` }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = document.body.classList.contains('task-dragging') ? 'copy' : 'move'
            const elements = document.elementsFromPoint(e.clientX, e.clientY)
            const hourCell = elements.find(el => el.classList.contains('day-hour-cell'))
            if (hourCell) {
              const hour = parseInt(hourCell.getAttribute('data-hour'), 10)
              if (!isNaN(hour)) {
                updateEventDragPreview(e, hourCell, hour)
                handleHourCellTodoDragOver(e, hour)
              }
            }
          }}
          onDrop={async (e) => {
            e.preventDefault()
            e.stopPropagation()
            const elements = document.elementsFromPoint(e.clientX, e.clientY)
            const hourCell = elements.find(el => el.classList.contains('day-hour-cell'))
            if (hourCell) {
              const hour = parseInt(hourCell.getAttribute('data-hour'), 10)
              if (!isNaN(hour)) {
                await handleCombinedDropOnHourCell(e, hour, hourCell)
              }
            }
            clearEventDragPreview()
            const stillTodo = document.body.classList.contains('task-dragging') || pendingTodoPreviewRef.current
            if (!stillTodo) clearTodoDragPreview()
            cleanupDragArtifacts()
            document.body.classList.remove('calendar-drag-focus')
          }}
        >
          {/* Hour cells */}
          {hours.map((hour) => (
            <DroppableHourCell
              key={hour}
              hour={hour}
              currentDate={currentDate}
              hourHeight={HOUR_HEIGHT}
              dayStartHour={DAY_START_HOUR}
              regularEvents={regularEvents}
              handleCellMouseDown={handleCellMouseDown}
              handleCellMouseMove={handleCellMouseMove}
              handleCellDoubleClick={handleCellDoubleClick}
              handleCombinedDropOnHourCell={handleCombinedDropOnHourCell}
              handleHourCellDragOver={handleHourCellDragOver}
              handleHourCellTodoDragOver={handleHourCellTodoDragOver}
              handleDragLeave={handleDragLeave}
              clearTodoDragPreview={clearTodoDragPreview}
              pendingTodoPreviewRef={pendingTodoPreviewRef}
            />
          ))}

          {/* Drag-to-create preview */}
          {(isDragging && !isEventResizing && dragStart !== null && dragEnd !== null || persistedDragPreview) && (() => {
            const colors = getEventColors('blue')
            const startHourVal = persistedDragPreview ? persistedDragPreview.startHour : Math.min(dragStart, dragEnd)
            const endHourVal = persistedDragPreview ? persistedDragPreview.endHour : Math.max(dragStart, dragEnd)
            const previewTop = startHourVal * HOUR_HEIGHT
            const previewHeight = Math.max((endHourVal - startHourVal) * HOUR_HEIGHT, HOUR_HEIGHT / 4)
            const previewStartDate = persistedDragPreview ? persistedDragPreview.startDate : (() => {
              const d = new Date(currentDate)
              d.setHours(Math.floor(startHourVal), Math.round((startHourVal % 1) * 60), 0, 0)
              return d
            })()
            const previewEndDate = persistedDragPreview ? persistedDragPreview.endDate : (() => {
              const d = new Date(currentDate)
              d.setHours(Math.floor(endHourVal), Math.round((endHourVal % 1) * 60), 0, 0)
              return d
            })()

            return (
              <div
                className="absolute rounded-lg p-1 overflow-hidden text-sm pointer-events-none"
                style={{ top: `${previewTop}px`, minHeight: `${previewHeight}px`, left: '4px', right: '4px', backgroundColor: colors.background, opacity: 0.9, zIndex: 50 }}
              >
                <div className="absolute top-0.5 bottom-0.5 w-1 rounded-full pointer-events-none" style={{ left: '1px', backgroundColor: colors.border, zIndex: 3 }} />
                <div className="ml-2">
                  <div className="font-medium text-xs" style={{ color: colors.text, marginLeft: '2px' }}>New Event</div>
                  <div className="text-xs" style={{ color: 'rgba(55, 65, 81, 0.7)', fontWeight: 500 }}>
                    {format(previewStartDate, 'h:mm a')} – {format(previewEndDate, 'h:mm a')}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Regular events */}
          {calculateTimeGridLayout(regularEvents).map(({ event, column, columns, stackIndex, stackCount }) => (
            <DayEvent
              key={event.clientKey || event.id || `${(event.start instanceof Date ? event.start : new Date(event.start)).getTime()}-${column}-${columns}`}
              event={event}
              hourHeight={HOUR_HEIGHT}
              dayStartHour={DAY_START_HOUR}
              dayEndHour={DAY_END_HOUR}
              position={{ column, columns, stackIndex, stackCount, gap: TIMED_EVENT_GAP }}
            />
          ))}

          {/* Todo drag preview */}
          {todoDragPreview && !todoDragPreview.isAllDay && (() => {
            const previewStart = todoDragPreview.start
            const previewEnd = todoDragPreview.end
            const colors = getEventColors(todoDragPreview.color || 'blue')
            const previewTop = (previewStart.getHours() - DAY_START_HOUR) * HOUR_HEIGHT + (previewStart.getMinutes() / 60) * HOUR_HEIGHT
            const previewDuration = Math.max(5, differenceInMinutes(previewEnd, previewStart))
            const previewHeight = (previewDuration / 60) * HOUR_HEIGHT

            return (
              <div
                className="absolute rounded-lg p-1 overflow-hidden text-sm pointer-events-none shadow-sm"
                style={{ top: `${previewTop}px`, minHeight: `${previewHeight}px`, left: '4px', right: '4px', backgroundColor: colors.background, opacity: 1, boxShadow: '0 0 0 1px rgba(148, 163, 184, 0.5)', zIndex: 9997 }}
              >
                <div className="absolute top-0 bottom-0 w-1 rounded-full pointer-events-none" style={{ left: '2px', backgroundColor: colors.border, zIndex: 3 }} />
                <div className="ml-3">
                  <div className="font-medium text-xs truncate" style={{ color: colors.text }}>{todoDragPreview.title}</div>
                  <div className="text-xs" style={{ color: 'rgba(55, 65, 81, 0.75)' }}>
                    {format(previewStart, 'h:mm a')} - {format(previewEnd, 'h:mm a')}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Event drag preview ghost */}
          {dragPreviewEvent && (() => {
            const colors = getEventColors(dragPreviewEvent.color || 'blue')
            const previewStart = dragPreviewEvent.start
            const previewEnd = dragPreviewEvent.end
            const previewTop = (previewStart.getHours() - DAY_START_HOUR) * HOUR_HEIGHT + (previewStart.getMinutes() / 60) * HOUR_HEIGHT
            const previewDuration = Math.max(5, differenceInMinutes(previewEnd, previewStart))
            const previewHeight = (previewDuration / 60) * HOUR_HEIGHT

            return (
              <div
                className="absolute rounded-lg p-1 overflow-hidden text-sm pointer-events-none"
                style={{ top: `${previewTop}px`, minHeight: `${previewHeight}px`, left: '4px', right: '4px', backgroundColor: colors.background, opacity: 1, zIndex: 50 }}
              >
                <div className="absolute top-0 bottom-0 w-1 rounded-full pointer-events-none" style={{ left: '2px', backgroundColor: colors.border, zIndex: 3 }} />
                <div className="ml-3">
                  <div className="font-medium text-xs" style={{ color: colors.text }}>{dragPreviewEvent.title || 'Event'}</div>
                  <div className="text-xs" style={{ color: 'rgba(55, 65, 81, 0.7)' }}>
                    {format(previewStart, 'h:mm a')} - {format(previewEnd, 'h:mm a')}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

export default TimeGrid
