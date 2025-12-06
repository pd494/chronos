import { addDays } from 'date-fns'
import AllDayEvent from '../../events/AllDayEvent'
import { getEventColors } from '../../../lib/eventColors'
import { ALL_DAY_SECTION_HEIGHT, ALL_DAY_EVENT_HEIGHT, ALL_DAY_EVENT_GAP } from './constants'

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
  const EXTRA_BOTTOM_SPACE = 10
  const requiredHeight = Math.max(
    ALL_DAY_SECTION_HEIGHT,
    Math.max(1, allDayEvents.length) * (ALL_DAY_EVENT_HEIGHT + ALL_DAY_EVENT_GAP) - ALL_DAY_EVENT_GAP
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
        className="flex-1 p-2 day-all-day-section overflow-hidden border-r border-gray-200 dark:border-gray-700 transition-colors duration-200 [&.sortable-dragover]:bg-blue-500/15 [&.sortable-dragover]:outline [&.sortable-dragover]:outline-2 [&.sortable-dragover]:outline-dashed [&.sortable-dragover]:outline-blue-400/50 [&.sortable-dragover]:animate-day-cell-pulse"
        style={{ minHeight: `${requiredHeight}px`, height: `${requiredHeight}px` }}
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
        {todoDragPreview?.isAllDay && (() => {
          const colors = getEventColors(todoDragPreview.color || 'blue')
          return (
            <div
              className="flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium pointer-events-none"
              style={{
                backgroundColor: colors.background,
                border: `1px dashed ${colors.border}`,
                color: colors.text,
                opacity: 0.9
              }}
            >
              <div
                className="h-3 w-1 rounded-full"
                style={{ backgroundColor: colors.border }}
              />
              <span className="truncate">{todoDragPreview.title}</span>
              <span className="text-[11px] text-slate-600">All day</span>
            </div>
          )
        })()}
        {allDayEvents.length === 0 && (
          <div className="text-xs text-gray-400 italic">Drop tasks here for all-day events</div>
        )}
      </div>
    </div>
  )
}

export default AllDaySection
