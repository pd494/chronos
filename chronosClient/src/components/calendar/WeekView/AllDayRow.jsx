import { format, isSameDay, isToday } from 'date-fns'
import { useEffect, useRef } from 'react'
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
  const { activeTodo, lockedCellId, isOverCalendar } = useDndKit()

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
  const showDndKitPreview = isOverCalendar && isLockedOnThisCell && activeTodo
  const shouldShowPreview = showDndKitPreview || showNativePreview

  const showDragoverStyle = isDndKitHovering && isOverCalendar && !lockedCellId

  const previewSource = showDndKitPreview ? activeTodo : todoDragPreview
  const overlayHiddenRef = useRef(false)

  useEffect(() => {
    if (showDndKitPreview && activeTodo && !overlayHiddenRef.current) {
      overlayHiddenRef.current = true
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('chronos-todo-overlay-hide'))
      }
    }
    if (!showDndKitPreview) {
      overlayHiddenRef.current = false
    }
  }, [showDndKitPreview, activeTodo])

  return (
    <div
      ref={setNodeRef}
      key={dayIndex}
      className={`flex-1 relative border-r border-gray-200 dark:border-gray-700 overflow-hidden p-1
        ${showDragoverStyle ? 'bg-blue-500/15 outline outline-2 outline-dashed outline-blue-400/50' : ''}`}
      data-date={format(day, 'yyyy-MM-dd')}
      data-all-day="true"
      style={{
        minHeight: `${maxRequiredHeight}px`,
        height: `${maxRequiredHeight}px`,
        paddingLeft: '7px'
      }}
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
        const previewKey = `${previewSource?.id || previewSource?.todoId || previewSource?.title || 'todo'}-${format(day, 'yyyy-MM-dd')}`
        
        return (
          <div
            key={previewKey}
            className="relative flex items-center gap-2 rounded-lg pr-2 py-1 text-xs font-medium pointer-events-none"
            style={{
              backgroundColor: colors.background,
              color: colors.text,
              opacity: 0.9,
              paddingLeft: '8px',
              borderRadius: '8px',
              boxShadow: '0 0 0 1px rgba(148, 163, 184, 0.35)'
            }}
          >
            <div
              className="absolute"
              style={{
                left: '6px',
                top: '2px',
                bottom: '2px',
                width: '4px',
                borderRadius: '9999px',
                backgroundColor: colors.border
              }}
            />
            <span className="font-medium flex items-center gap-1.5 flex-1 min-w-0 ml-1">
              <span className="truncate flex-1 min-w-0">{previewSource.title}</span>
              <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap flex-shrink-0">All day</span>
            </span>
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
  // Get dnd-kit context to check if a preview should be included in height calc
  const { activeTodo, lockedCellId, isOverCalendar } = useDndKit()

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

        // Check if this day has a preview (either dnd-kit or native)
        const droppableId = `week-all-day-${format(day, 'yyyy-MM-dd')}`
        const showDndKitPreview = isOverCalendar && lockedCellId === droppableId && activeTodo
        const showNativePreview = todoDragPreview?.isAllDay && isSameDay(todoDragPreview.start, day)
        const hasPreview = showDndKitPreview || showNativePreview

        const eventCount = eventsForDay.length + (hasPreview ? 1 : 0)
        return Math.max(1, eventCount) * (ALL_DAY_EVENT_HEIGHT + ALL_DAY_EVENT_GAP) - ALL_DAY_EVENT_GAP
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
