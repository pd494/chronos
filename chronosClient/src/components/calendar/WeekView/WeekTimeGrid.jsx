import { format, isSameDay, isToday, differenceInMinutes } from 'date-fns'
import WeekEvent from '../../events/WeekEvent'
import { calculateTimeGridLayout } from '../../../lib/eventLayout'
import { getEventColors } from '../../../lib/eventColors'
import {
  HOUR_HEIGHT, DAY_START_HOUR, DAY_END_HOUR, TIMED_EVENT_GAP, DAY_OFFSET, cleanupDragArtifacts
} from './constants'
import DroppableWeekHourCell from './DroppableWeekHourCell'

const WeekTimeGrid = ({
  scrollContainerRef,
  timelineRef,
  days,
  hours,
  currentDate,
  regularEvents,
  dragPreviewEvent,
  isDragging,
  dragStart,
  dragEnd,
  dragDay,
  persistedDragPreview,
  todoDragPreview,
  handleCellMouseDown,
  handleCellMouseMove,
  handleGridMouseUp,
  handleCellDoubleClick,
  handleCombinedDropOnHourCell,
  handleHourCellDragOver,
  handleHourCellTodoDragOver,
  handleDragLeave,
  updateEventDragPreviewForWeek,
  clearEventDragPreview,
  clearTodoDragPreview,
  use24HourTime = false,
  gridStartHour = DAY_START_HOUR,
  gridEndHour = DAY_END_HOUR
}) => {
  const displayStartHour = Math.max(0, Math.min(gridStartHour, 23))
  const displayEndHour = Math.max(displayStartHour, Math.min(gridEndHour, 23))
  const visibleHours = hours.filter(h => h >= displayStartHour && h <= displayEndHour)
  const gridHeight = (displayEndHour - displayStartHour + 1) * HOUR_HEIGHT

  const formatHour = (hour) => {
    if (use24HourTime) {
      return `${String(hour).padStart(2, '0')}:00`
    }
    return hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`
  }

  const formatTimeRange = (start, end) => {
    const pattern = use24HourTime ? 'HH:mm' : 'h:mm a'
    return `${format(start, pattern)} – ${format(end, pattern)}`
  }

  return (
    <div ref={scrollContainerRef} className="relative flex flex-1 overflow-y-auto min-h-0 scrollbar-hide">
      {/* Time labels */}
      <div className="w-16 flex-shrink-0 relative z-10 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700" style={{ height: `${gridHeight}px`, minHeight: `${gridHeight}px` }}>
        {visibleHours.map((hour) => (
          <div key={hour} className="relative" style={{ height: `${HOUR_HEIGHT}px` }}>
            <span className="absolute left-2 text-xs text-gray-500" style={{ top: hour === displayStartHour ? '4px' : '-10px' }}>
              {formatHour(hour)}
            </span>
          </div>
        ))}
      </div>

      {/* Week grid */}
      <div className="flex-1 relative" style={{ height: `${gridHeight}px`, minHeight: `${gridHeight}px` }}>
        {/* Horizontal time grid lines */}
        {visibleHours.map((hour) => (
          <div
            key={hour}
            className="absolute left-0 right-0 h-px bg-gray-200 dark:bg-gray-700 pointer-events-none z-0"
            style={{ top: `${(hour - displayStartHour) * HOUR_HEIGHT}px` }}
          />
        ))}

        {/* Current time indicator */}
        {days.some(day => isToday(day)) && (
          <div
            ref={timelineRef}
            className="absolute left-0 right-0 h-0.5 bg-red-500 z-10 before:content-[''] before:absolute before:left-0 before:-top-1 before:w-2.5 before:h-2.5 before:bg-red-500 before:rounded-full"
          />
        )}

        {/* Day columns */}
        <div
          className="grid"
          style={{ height: `${gridHeight}px`, minHeight: `${gridHeight}px`, gridTemplateColumns: `repeat(${Math.max(1, days?.length || 1)}, minmax(0, 1fr))` }}
          onMouseUp={handleGridMouseUp}
          onMouseLeave={handleGridMouseUp}
        >
          {days.map((day, dayIndex) => (
            <div
              key={dayIndex}
              className="relative border-r border-gray-200 dark:border-gray-700 h-full week-day-column"
              data-week-column="true"
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                const elements = document.elementsFromPoint(e.clientX, e.clientY)
                const hourCell = elements.find(el => el.classList.contains('hour-cell'))
                if (hourCell) {
                  const hour = parseInt(hourCell.getAttribute('data-hour'), 10)
                  if (!isNaN(hour)) updateEventDragPreviewForWeek(e, hourCell, day, hour)
                } else {
                  clearEventDragPreview()
                }
              }}
              onDrop={async (e) => {
                e.preventDefault()
                e.stopPropagation()
                const elements = document.elementsFromPoint(e.clientX, e.clientY)
                const hourCell = elements.find(el => el.classList.contains('hour-cell'))
                if (hourCell) {
                  const hour = parseInt(hourCell.getAttribute('data-hour'), 10)
                  if (!isNaN(hour)) await handleCombinedDropOnHourCell(e, day, hour, hourCell)
                }
                clearEventDragPreview()
                clearTodoDragPreview()
                cleanupDragArtifacts()
                document.body.classList.remove('calendar-drag-focus')
              }}
            >
              {/* Hour cells */}
              {visibleHours.map((hour) => (
                <DroppableWeekHourCell
                  key={hour}
                  day={day}
                  hour={hour}
                  hourHeight={HOUR_HEIGHT}
                  dayStartHour={displayStartHour}
                  regularEvents={regularEvents}
                  handleCellMouseDown={handleCellMouseDown}
                  handleCellMouseMove={handleCellMouseMove}
                  handleCellDoubleClick={handleCellDoubleClick}
                  handleCombinedDropOnHourCell={handleCombinedDropOnHourCell}
                  handleHourCellDragOver={handleHourCellDragOver}
                  handleHourCellTodoDragOver={handleHourCellTodoDragOver}
                  handleDragLeave={handleDragLeave}
                  clearTodoDragPreview={clearTodoDragPreview}
                />
              ))}

              {/* Drag-to-create preview */}
              {((isDragging && dragDay && isSameDay(dragDay, day)) || (persistedDragPreview && isSameDay(persistedDragPreview.day, day))) && (() => {
                const colors = getEventColors('blue')
                const startHourVal = persistedDragPreview && isSameDay(persistedDragPreview.day, day)
                  ? persistedDragPreview.startHour : Math.min(dragStart, dragEnd)
                const endHourVal = persistedDragPreview && isSameDay(persistedDragPreview.day, day)
                  ? persistedDragPreview.endHour : Math.max(dragStart, dragEnd)
                const previewTop = (startHourVal - displayStartHour) * HOUR_HEIGHT
                const previewHeight = Math.max((endHourVal - startHourVal) * HOUR_HEIGHT, HOUR_HEIGHT / 4)
                const previewStartDate = persistedDragPreview && isSameDay(persistedDragPreview.day, day)
                  ? persistedDragPreview.startDate : (() => { const d = new Date(day); d.setHours(Math.floor(startHourVal), Math.round((startHourVal % 1) * 60), 0, 0); return d })()
                const previewEndDate = persistedDragPreview && isSameDay(persistedDragPreview.day, day)
                  ? persistedDragPreview.endDate : (() => { const d = new Date(day); d.setHours(Math.floor(endHourVal), Math.round((endHourVal % 1) * 60), 0, 0); return d })()

                return (
                  <div className="absolute rounded-lg p-1 text-sm pointer-events-none" style={{ top: `${previewTop}px`, minHeight: `${previewHeight}px`, left: '2px', right: '2px', backgroundColor: colors.background, opacity: 0.9, zIndex: 50 }}>
                    <div className="absolute top-0.5 bottom-0.5 w-1 rounded-full pointer-events-none" style={{ left: '1px', backgroundColor: colors.border, zIndex: 3 }} />
                    <div className="ml-2">
                      <div className="font-medium text-xs" style={{ color: colors.text, marginLeft: '2px' }}>New Event</div>
                      <div className="text-xs" style={{ color: 'rgba(55, 65, 81, 0.7)', fontWeight: 500 }}>
                        {formatTimeRange(previewStartDate, previewEndDate)}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Todo drag preview */}
              {todoDragPreview && !todoDragPreview.isAllDay && isSameDay(todoDragPreview.start, day) && (() => {
                const colors = getEventColors(todoDragPreview.color || 'blue')
                const previewStart = todoDragPreview.start
                const previewEnd = todoDragPreview.end
                const previewKey = `${previewStart.getTime()}-${previewEnd.getTime()}`
                const previewTop = (previewStart.getHours() - displayStartHour) * HOUR_HEIGHT + (previewStart.getMinutes() / 60) * HOUR_HEIGHT
                const previewDuration = Math.max(5, differenceInMinutes(previewEnd, previewStart))
                const previewHeight = (previewDuration / 60) * HOUR_HEIGHT

                return (
                  <div
                    key={previewKey}
                    className="absolute rounded-lg p-1 text-sm pointer-events-none shadow-sm"
                    style={{ top: `${previewTop}px`, minHeight: `${previewHeight}px`, left: '2px', right: '2px', backgroundColor: colors.background, opacity: 1, boxShadow: '0 0 0 1px rgba(148, 163, 184, 0.5)', zIndex: 9997 }}
                  >
                    <div className="absolute top-0 bottom-0 w-1 rounded-full pointer-events-none" style={{ left: '2px', backgroundColor: colors.border, zIndex: 3 }} />
                    <div className="ml-3">
                      <div className="font-medium text-xs" style={{ color: colors.text }}>{todoDragPreview.title}</div>
                      <div className="text-xs" style={{ color: 'rgba(55, 65, 81, 0.75)' }}>
                        {formatTimeRange(previewStart, previewEnd)}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Event drag preview ghost */}
              {dragPreviewEvent && isSameDay(dragPreviewEvent.start, day) && (() => {
                const colors = getEventColors(dragPreviewEvent.color || 'blue')
                const previewStart = dragPreviewEvent.start
                const previewEnd = dragPreviewEvent.end
                const previewTop = (previewStart.getHours() - displayStartHour) * HOUR_HEIGHT + (previewStart.getMinutes() / 60) * HOUR_HEIGHT
                const previewDuration = Math.max(5, differenceInMinutes(previewEnd, previewStart))
                const previewHeight = (previewDuration / 60) * HOUR_HEIGHT

                return (
                  <div
                    className="absolute rounded-lg p-1 text-sm pointer-events-none"
                    style={{ top: `${previewTop}px`, minHeight: `${previewHeight}px`, left: '2px', right: '2px', backgroundColor: colors.background, opacity: 1, zIndex: 60 }}
                  >
                    <div className="absolute top-0 bottom-0 w-1 rounded-full pointer-events-none" style={{ left: '2px', backgroundColor: colors.border, zIndex: 3 }} />
                    <div className="ml-3">
                      <div className="font-medium text-xs" style={{ color: colors.text }}>{dragPreviewEvent.title || 'Event'}</div>
                      <div className="text-xs" style={{ color: 'rgba(55, 65, 81, 0.75)' }}>
                        {formatTimeRange(previewStart, previewEnd)}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Regular events */}
              {(() => {
                const dayEvents = regularEvents.filter(event => {
                  if (!event.isImported && DAY_OFFSET !== 0) {
                    const adjustedDay = new Date(day)
                    adjustedDay.setDate(adjustedDay.getDate() - DAY_OFFSET)
                    return isSameDay(event.start, adjustedDay)
                  }
                  return isSameDay(event.start, day)
                })
                const layouts = calculateTimeGridLayout(dayEvents)
                return layouts.map(({ event, column, columns, stackIndex, stackCount }) => (
                  <WeekEvent
                    key={event.clientKey || event.id || `${(event.start instanceof Date ? event.start : new Date(event.start)).getTime()}-${column}-${columns}`}
                    event={{ ...event, color: event.color || 'blue' }}
                    hourHeight={HOUR_HEIGHT}
                    dayStartHour={displayStartHour}
                    dayEndHour={DAY_END_HOUR}
                    position={{ column, columns, stackIndex, stackCount, gap: TIMED_EVENT_GAP }}
                  />
                ))
              })()}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default WeekTimeGrid
