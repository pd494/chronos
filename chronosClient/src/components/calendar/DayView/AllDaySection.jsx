import { addDays } from 'date-fns'
import { useDroppable } from '@dnd-kit/core'
import AllDayEvent from '../../events/AllDayEvent'
import { getEventColors } from '../../../lib/eventColors'
import { ALL_DAY_SECTION_HEIGHT, ALL_DAY_EVENT_HEIGHT, ALL_DAY_EVENT_GAP } from './constants'
import { useDndKit } from '../../DndKitProvider'

const AllDaySection = ({
  allDayEvents,
  todoDragPreview,
  currentDate,
  openEventModal,
  getDraggedTodoMeta,
  handleTodoDropOnAllDay,
  handleAllDayEventDrop,
  handleAllDayDragOver,
  handleAllDayTodoDragOver,
  handleDragLeave
}) => {
  // Get dnd-kit context for drag state
  const { activeTodo, lockedCellId, isOverCalendar } = useDndKit()

  // Make this section a droppable target
  const droppableId = `day-all-day-${currentDate.toISOString().split('T')[0]}`
  const { setNodeRef, isOver, active } = useDroppable({
    id: droppableId,
    data: {
      type: 'all-day-cell',
      date: currentDate,
      isAllDay: true,
    },
  })

  // Show visual feedback when dnd-kit is dragging over
  const isDndKitHovering = isOver && active?.data?.current?.type === 'task'

  // Only show preview when "locked in" on this cell
  const isLockedOnThisCell = lockedCellId === droppableId
  const showDndKitPreview = isOverCalendar && isLockedOnThisCell && activeTodo
  const showNativePreview = todoDragPreview?.isAllDay && !isDndKitHovering
  const shouldShowPreview = showDndKitPreview || showNativePreview

  // Show highlight on hover (before lock-in)
  const showDragoverStyle = isDndKitHovering && !showDndKitPreview

  // Calculate required height - include extra slot when preview is showing
  const EXTRA_BOTTOM_SPACE = 10
  const eventCount = allDayEvents.length + (shouldShowPreview ? 1 : 0)
  const requiredHeight = Math.max(
    ALL_DAY_SECTION_HEIGHT,
    Math.max(1, eventCount) * (ALL_DAY_EVENT_HEIGHT + ALL_DAY_EVENT_GAP) - ALL_DAY_EVENT_GAP
  ) + EXTRA_BOTTOM_SPACE

  const renderAllDayEvent = (event) => (
    <AllDayEvent
      key={event.clientKey || event.id}
      event={event}
      onOpen={openEventModal}
      view="day"
      style={{
        height: `${ALL_DAY_EVENT_HEIGHT}px`,
        marginBottom: `${ALL_DAY_EVENT_GAP}px`
      }}
    />
  )

  // Render the todo preview
  const renderTodoPreview = () => {
    const previewSource = showDndKitPreview ? activeTodo : todoDragPreview
    if (!previewSource) return null

    const colors = getEventColors(previewSource.color || 'blue')
    
    return (
      <div
        className="relative flex items-center gap-2 rounded-lg pr-2 py-1 text-xs font-medium pointer-events-none"
        style={{
          backgroundColor: colors.background,
          color: colors.text,
          opacity: 0.9,
          paddingLeft: '18px',
          borderRadius: '8px'
        }}
      >
        <div
          className="absolute"
          style={{
            left: '8px',
            top: '2px',
            bottom: '2px',
            width: '4px',
            borderRadius: '9999px',
            backgroundColor: colors.border
          }}
        />
        <span className="font-medium flex items-center gap-1.5 flex-1 min-w-0">
          <span className="truncate flex-1 min-w-0">{previewSource.title}</span>
          <span className="text-[11px] text-slate-600 whitespace-nowrap flex-shrink-0">All day</span>
        </span>
      </div>
    )
  }

  return (
    <div
      className="flex w-full border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-20 flex-shrink-0"
      style={{ minHeight: `${requiredHeight}px` }}
    >
      <div
        className="w-16 flex-shrink-0 text-center py-2 text-xs text-gray-500 border-r border-gray-200 dark:border-gray-700"
        style={{ minHeight: `${requiredHeight}px` }}
      >
        All-day
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 p-2 day-all-day-section overflow-hidden border-r border-gray-200 dark:border-gray-700 transition-colors duration-200 
          ${showDragoverStyle ? 'bg-blue-500/15 outline outline-2 outline-dashed outline-blue-400/50' : ''}
          [&.sortable-dragover]:bg-blue-500/15 [&.sortable-dragover]:outline [&.sortable-dragover]:outline-2 [&.sortable-dragover]:outline-dashed [&.sortable-dragover]:outline-blue-400/50 [&.sortable-dragover]:animate-day-cell-pulse`}
        style={{
          minHeight: `${requiredHeight}px`,
          height: `${requiredHeight}px`,
          paddingLeft: '14px'
        }}
        onDrop={async (e) => {
          const isTodoDrag = document.body.classList.contains('task-dragging') || !!getDraggedTodoMeta()
          if (isTodoDrag) {
            await handleTodoDropOnAllDay(e)
          } else {
            handleAllDayEventDrop(e)
          }
        }}
        onDragOver={(e) => {
          handleAllDayDragOver(e)
          handleAllDayTodoDragOver(e)
        }}
        onDragLeave={handleDragLeave}
      >
        {allDayEvents.map(event => renderAllDayEvent(event))}
        {shouldShowPreview && renderTodoPreview()}
        {allDayEvents.length === 0 && !shouldShowPreview && (
          <div className="text-xs text-gray-400 italic">Drop tasks here for all-day events</div>
        )}
      </div>
    </div>
  )
}

export default AllDaySection
