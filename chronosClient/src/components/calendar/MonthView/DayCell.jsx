import { useRef, useEffect } from 'react'
import { format, isToday, isSameDay, startOfDay, addDays, differenceInCalendarDays } from 'date-fns'
import { useDroppable } from '@dnd-kit/core'
import EventIndicator from '../../events/EventIndicator'
import { normalizeToPaletteColor } from '../../../lib/eventColors'
import { formatDateKey, MULTI_DAY_EVENT_GAP } from './constants'
import { useDndKit } from '../../DndKitProvider'

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

  // Get dnd-kit context for detecting when dragging over this cell
  const { activeTodo, isOverCalendar, lockedCellId } = useDndKit()

  // Make this cell a droppable target using dnd-kit
  const droppableId = `month-cell-${dateKey}`
  const { setNodeRef, isOver, active } = useDroppable({
    id: droppableId,
    data: {
      type: 'calendar-cell',
      date: day,
      dateKey,
      isAllDay: true,
    },
  })

  // Check if THIS cell is being hovered by dnd-kit
  const isDndKitHovering = isOver && active?.data?.current?.type === 'task'

  // Only show the event marker when user has "locked in" on this specific cell
  const isLockedOnThisCell = lockedCellId === droppableId

  // Don't show preview if there's already an event for this todo (prevents flicker)
  const todoIdBeingDragged = activeTodo?.id
  const alreadyHasEventForTodo = todoIdBeingDragged && events.some(
    ev => String(ev.todoId) === String(todoIdBeingDragged) || ev._freshDrop
  )
  const showDndKitEventMarker = isLockedOnThisCell && activeTodo && !alreadyHasEventForTodo

  // Native drag preview (fallback for non-dnd-kit)
  const isNativeTodoPreview = todoPreviewDate === dateKey && !isOverCalendar

  // Get the todo meta for preview
  const nativeDraggedTodoMeta = getDraggedTodoMeta()

  // Create the preview event for the event marker
  const previewColor = normalizeToPaletteColor(
    (showDndKitEventMarker ? activeTodo?.color : nativeDraggedTodoMeta?.color) || 'blue'
  )
  const previewTitle = showDndKitEventMarker ? activeTodo?.title : nativeDraggedTodoMeta?.title

  const previewEvent = (showDndKitEventMarker || isNativeTodoPreview) ? {
    id: `todo-preview-${dateKey}`,
    title: previewTitle || 'New task',
    start: startOfDay(day),
    end: addDays(startOfDay(day), 1),
    isAllDay: true,
    color: previewColor,
    _isPreview: true  // Mark as preview for potential styling
  } : null

  const ghostsRef = useRef([])
  const prevEventsRef = useRef(events)

  useEffect(() => {
    const handleEventDeleted = () => { ghostsRef.current = [] }
    window.addEventListener('eventDeleted', handleEventDeleted)
    return () => window.removeEventListener('eventDeleted', handleEventDeleted)
  }, [])

  // Build map of current events by clientKey
  const currentByKey = new Map()
  // Also track todoIds in current events to detect resolved events
  const currentTodoIds = new Set()
  for (const e of events) {
    const key = e.clientKey || e.id
    if (key) currentByKey.set(key, e)
    const eTodoId = e.todoId || e.todo_id
    if (eTodoId) currentTodoIds.add(String(eTodoId))
  }

  // Find events that were in prev but are missing from current
  const dropped = prevEventsRef.current.filter(e => {
    const key = e.clientKey || e.id
    return key && !currentByKey.has(key)
  })

  const updatedGhosts = []
  for (const g of ghostsRef.current) {
    const key = g.clientKey || g.id
    const gTodoId = g.todoId || g.todo_id
    // Don't keep ghost if current events already have this event OR an event with the same todoId
    // (meaning the optimistic event has been resolved)
    if (!currentByKey.has(key) && g.isOptimistic && (!gTodoId || !currentTodoIds.has(String(gTodoId)))) {
      updatedGhosts.push(g)
    }
  }

  const existingGhostKeys = new Set(updatedGhosts.map(g => g.clientKey || g.id))
  for (const d of dropped) {
    const key = d.clientKey || d.id
    const dTodoId = d.todoId || d.todo_id
    // Don't add ghost if an event with the same todoId exists (it has been resolved)
    if (key && !existingGhostKeys.has(key) && d.isOptimistic && (!dTodoId || !currentTodoIds.has(String(dTodoId)))) {
      updatedGhosts.push(d)
    }
  }

  ghostsRef.current = updatedGhosts
  prevEventsRef.current = events

  const effectiveEvents = [...events, ...updatedGhosts]

  // Show fewer events when preview is active to make room
  const hasPreview = showDndKitEventMarker || isNativeTodoPreview
  const visibleEvents = effectiveEvents.slice(0, hasPreview ? 2 : 3)
  const remainingCount = effectiveEvents.length - visibleEvents.length

  const showDragoverStyle = isDndKitHovering && isOverCalendar && !lockedCellId

  return (
    <div
      ref={setNodeRef}
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
        ${showDragoverStyle ? 'bg-violet-500/15 shadow-[inset_0_0_0_2px_rgba(139,92,246,0.4)]' : ''}
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
        {/* Show event marker preview when dragging over this cell */}
        {previewEvent && (
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
