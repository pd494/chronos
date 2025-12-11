import { format, isSameDay, isToday } from 'date-fns'
import { useDroppable } from '@dnd-kit/core'
import AllDayEvent from '../../events/AllDayEvent'
import { getEventColors } from '../../../lib/eventColors'
import { ALL_DAY_SECTION_HEIGHT, ALL_DAY_EVENT_HEIGHT, ALL_DAY_EVENT_GAP, DAY_OFFSET } from './constants'
import { useDndKit } from '../../DndKitProvider'

const EXTRA_ALL_DAY_BOTTOM_SPACE = 8

// Individual droppable all-day cell for each day
const DroppableAllDayCell = ({
  day,
  dayIndex,
  eventsForDay,
  todoDragPreview,
  maxRequiredHeight,
  openEventModal,
  handleAllDayCellClick,
  handleCombinedDropOnAllDay,
  handleAllDayDragOver,
  handleAllDayTodoDragOver,
  handleDragLeave,
  renderAllDayEvent
}) => {
  const { activeTodo, lockedCellId } = useDndKit()

  const droppableId = `week-all-day-${format(day, 'yyyy-MM-dd')}`
  const { setNodeRef, isOver, active } = useDroppable({
    id: droppableId,
    data: {
      type: 'all-day-cell',
      date: day,
      isAllDay: true,
    },
  })

  const isDndKitHovering = isOver && active?.data?.current?.type === 'task'

  // Only show preview when "locked in" on this cell
  const isLockedOnThisCell = lockedCellId === droppableId
  const showNativePreview = todoDragPreview?.isAllDay && isSameDay(todoDragPreview.start, day)
  const showDndKitPreview = isLockedOnThisCell && activeTodo
  const shouldShowPreview = showDndKitPreview || showNativePreview

  // Show highlight on hover (before lock-in)
  const showDragoverStyle = isDndKitHovering && !showDndKitPreview

  const previewSource = showDndKitPreview ? activeTodo : todoDragPreview

  return (
    <div
      ref={setNodeRef}
      key={dayIndex}
      className={`flex-1 relative border-r border-gray-200 dark:border-gray-700 overflow-hidden p-1
        ${showDragoverStyle ? 'bg-blue-500/15 outline outline-2 outline-dashed outline-blue-400/50' : ''}`}
      data-date={format(day, 'yyyy-MM-dd')}
      data-all-day="true"
      style={{ minHeight: `${maxRequiredHeight}px`, height: `${maxRequiredHeight}px` }}
      onClick={(e) => handleAllDayCellClick(e, day)}
      onDrop={(e) => handleCombinedDropOnAllDay(e, day)}
      onDragOver={(e) => {
        handleAllDayDragOver(e)
        handleAllDayTodoDragOver(e, day)
      }}
      onDragLeave={handleDragLeave}
    >
      {eventsForDay.map((event, idx) => renderAllDayEvent(event, idx))}
      {shouldShowPreview && previewSource && (() => {
        const colors = getEventColors(previewSource.color || 'blue')
        return (
          <div
            className="flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium pointer-events-none"
            style={{ backgroundColor: colors.background, border: `1px dashed ${colors.border}`, color: colors.text, opacity: 0.9 }}
          >
            <div className="h-3 w-1 rounded-full" style={{ backgroundColor: colors.border }} />
            <span className="truncate">{previewSource.title}</span>
            <span className="text-[11px] text-slate-600">All day</span>
          </div>
        )
      })()}
    </div>
  )
}

const AllDayRow = ({
  days,
  allDayEvents,
  currentDate,
  todoDragPreview,
  openEventModal,
  handleAllDayCellClick,
  handleCombinedDropOnAllDay,
  handleAllDayDragOver,
  handleAllDayTodoDragOver,
  handleDragLeave
}) => {
  const maxRequiredHeight =
    Math.max(
      ALL_DAY_SECTION_HEIGHT,
      ...days.map(day => {
        const eventsForDay = allDayEvents.filter(event => {
          if (!event.isImported && DAY_OFFSET !== 0) {
            const adjustedDay = new Date(day)
            adjustedDay.setDate(adjustedDay.getDate() - DAY_OFFSET)
            return isSameDay(event.start, adjustedDay)
          }
          return isSameDay(event.start, day)
        })
        return Math.max(1, eventsForDay.length) * (ALL_DAY_EVENT_HEIGHT + ALL_DAY_EVENT_GAP) - ALL_DAY_EVENT_GAP
      })
    ) + EXTRA_ALL_DAY_BOTTOM_SPACE

  const renderAllDayEvent = (event, indexKey) => (
    <AllDayEvent
      key={event.clientKey || event.id || `${event.start.getTime()}-${event.title}-${indexKey}`}
      event={event}
      onOpen={openEventModal}
      style={{ height: `${ALL_DAY_EVENT_HEIGHT}px`, marginBottom: `${ALL_DAY_EVENT_GAP}px` }}
    />
  )

  return (
    <div className="flex w-full border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 z-20 flex-shrink-0" style={{ minHeight: `${maxRequiredHeight}px` }}>
      <div className="w-16 flex-shrink-0 text-center py-2 text-xs text-gray-500 border-r border-gray-200 dark:border-gray-700" style={{ minHeight: `${maxRequiredHeight}px` }}>
        All-day
      </div>
      <div className="flex flex-1 border-r border-gray-200 dark:border-gray-700" style={{ minHeight: `${maxRequiredHeight}px` }}>
        {days.map((day, dayIndex) => {
          const eventsForDay = allDayEvents.filter(event => {
            if (!event.isImported && DAY_OFFSET !== 0) {
              const adjustedDay = new Date(day)
              adjustedDay.setDate(adjustedDay.getDate() - DAY_OFFSET)
              return isSameDay(event.start, adjustedDay)
            }
            return isSameDay(event.start, day)
          })

          return (
            <DroppableAllDayCell
              key={dayIndex}
              day={day}
              dayIndex={dayIndex}
              eventsForDay={eventsForDay}
              todoDragPreview={todoDragPreview}
              maxRequiredHeight={maxRequiredHeight}
              openEventModal={openEventModal}
              handleAllDayCellClick={handleAllDayCellClick}
              handleCombinedDropOnAllDay={handleCombinedDropOnAllDay}
              handleAllDayDragOver={handleAllDayDragOver}
              handleAllDayTodoDragOver={handleAllDayTodoDragOver}
              handleDragLeave={handleDragLeave}
              renderAllDayEvent={renderAllDayEvent}
            />
          )
        })}
      </div>
    </div>
  )
}

export default AllDayRow
