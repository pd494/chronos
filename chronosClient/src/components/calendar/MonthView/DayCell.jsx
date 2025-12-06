import { format, isToday, isSameDay, startOfDay, addDays, differenceInCalendarDays } from 'date-fns'
import EventIndicator from '../../events/EventIndicator'
import { normalizeToPaletteColor } from '../../../lib/eventColors'
import { formatDateKey, MULTI_DAY_EVENT_GAP } from './constants'

const DayCell = ({
  day,
  rowHeight,
  currentDate,
  events,
  spanLayout,
  previewSpan,
  stackedMultiDayHeight,
  todoPreviewDate,
  getDraggedTodoMeta,
  selectDate,
  setView,
  openEventModal,
  handleCombinedDrop,
  handleDragOver,
  handleDragLeave,
  handleRangeMouseDown,
  handleRangeMouseEnter,
  handleRangeMouseMove,
  days
}) => {
  const isSelected = isSameDay(day, currentDate)
  const isTodayDate = isToday(day)
  const firstOfMonth = day.getDate() === 1
  const dayIndex = differenceInCalendarDays(startOfDay(day), startOfDay(days[0]))
  const dayHasMultiDayEvents = spanLayout.spans.some(span => dayIndex >= span.startIndex && dayIndex <= span.endIndex) ||
    (previewSpan && dayIndex >= previewSpan.startIndex && dayIndex <= previewSpan.endIndex)
  const eventListOffset = dayHasMultiDayEvents ? stackedMultiDayHeight + MULTI_DAY_EVENT_GAP : 0
  const dateKey = formatDateKey(day)
  const isTodoPreviewActive = todoPreviewDate === dateKey
  const draggedTodoMeta = getDraggedTodoMeta()
  const previewColor = normalizeToPaletteColor(draggedTodoMeta?.color || 'blue')
  const previewEvent = isTodoPreviewActive ? {
    id: `todo-preview-${dateKey}`,
    title: (draggedTodoMeta?.title || 'New task'),
    start: startOfDay(day),
    end: addDays(startOfDay(day), 1),
    isAllDay: true,
    color: previewColor
  } : null
  const visibleEvents = events.slice(0, isTodoPreviewActive ? 2 : 3)
  const remainingCount = events.length - visibleEvents.length

  return (
    <div
      key={dateKey}
      onDoubleClick={() => {
        const startDate = new Date(day)
        startDate.setHours(0, 0, 0, 0)
        const endDate = new Date(day)
        endDate.setDate(endDate.getDate() + 1)
        endDate.setHours(0, 0, 0, 0)
        openEventModal(null, true)
        window.prefilledEventDates = { startDate, endDate, title: '', color: 'blue', isAllDay: true, fromDayClick: true }
      }}
      style={{ height: `${rowHeight}px`, boxSizing: 'border-box' }}
      className={`month-day-cell bg-white dark:bg-gray-800 border-r border-b border-gray-100 dark:border-gray-800 relative p-1 flex flex-col transition-colors duration-200
        [&.event-dragover]:bg-violet-500/15 [&.event-dragover]:shadow-[inset_0_0_0_2px_rgba(139,92,246,0.4)]
        [&.sortable-dragover]:bg-blue-500/15 [&.sortable-dragover]:outline [&.sortable-dragover]:outline-2 [&.sortable-dragover]:outline-dashed [&.sortable-dragover]:outline-blue-400/50 [&.sortable-dragover]:animate-month-cell-pulse`}
      data-date={dateKey}
      onDrop={(e) => handleCombinedDrop(e, day)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onMouseDown={(e) => handleRangeMouseDown(day, e)}
      onMouseEnter={() => handleRangeMouseEnter(day)}
      onMouseMove={(e) => handleRangeMouseMove(day, e)}
    >
      <div className="flex justify-between items-start text-xs mb-1">
        {firstOfMonth && (
          <span className="font-semibold text-blue-600 dark:text-blue-400">{format(day, 'MMM')}</span>
        )}
        <span className="flex-grow" />
        <div
          onClick={(e) => {
            e.stopPropagation()
            selectDate(day)
            setView('day')
          }}
          className={`h-6 w-6 flex items-center justify-center rounded-full text-sm font-medium cursor-pointer transition-colors
            ${isTodayDate ? 'bg-purple-200 text-purple-800' : 'text-gray-500 dark:text-gray-400'}
            ${isSelected && !isTodayDate ? 'bg-gray-100 dark:bg-gray-700' : ''}
            ${!isTodayDate ? 'hover:bg-gray-200 dark:hover:bg-gray-600' : ''}`}
        >
          {format(day, 'd')}
        </div>
      </div>

      <div className="mt-1 overflow-hidden flex-1 space-y-0.5" style={eventListOffset ? { marginTop: `${eventListOffset}px` } : undefined}>
        {isTodoPreviewActive && previewEvent && (
          <EventIndicator key={previewEvent.id} event={previewEvent} isMonthView />
        )}
        {visibleEvents.map((ev) => (
          <EventIndicator key={ev.clientKey || ev.id} event={ev} isMonthView />
        ))}
        {remainingCount > 0 && (
          <button
            type="button"
            className="text-xs font-medium text-gray-500 dark:text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 pl-2"
            style={{ marginLeft: '-4.5px' }}
            onClick={() => { selectDate(day); setView('day') }}
          >
            {remainingCount} more
          </button>
        )}
      </div>
    </div>
  )
}

export default DayCell
