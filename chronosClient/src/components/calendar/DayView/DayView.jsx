import { useRef, useMemo, useCallback, useEffect } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useCalendar } from '../../../context/CalendarContext/CalendarContext'
import { useTaskContext } from '../../../context/TaskContext/context'
import { generateHours, isAllDayEvent } from './constants'
import { useScrollBehavior } from './useScrollBehavior'
import { useEventDragDrop } from './useEventDragDrop'
import { useTodoDragDrop } from './useTodoDragDrop'
import { useDragToCreate } from './useDragToCreate'
import AllDaySection from './AllDaySection'
import TimeGrid from './TimeGrid'
import { format } from 'date-fns'

const DayView = () => {
  const {
    currentDate,
    view,
    events,
    navigateToNext,
    navigateToPrevious,
    openEventModal,
    getEventsForDate,
    updateEvent,
    showEventModal
  } = useCalendar()

  const { convertTodoToEvent } = useTaskContext()

  const scrollContainerRef = useRef(null)
  const timelineRef = useRef(null)
  const hours = useMemo(() => generateHours(), [])

  const { handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd } = useScrollBehavior({
    scrollContainerRef,
    timelineRef,
    view,
    currentDate,
    navigateToNext,
    navigateToPrevious
  })

  const eventDrag = useEventDragDrop({ currentDate, updateEvent })
  const todoDrag = useTodoDragDrop({ currentDate, convertTodoToEvent })
  const dragToCreate = useDragToCreate({
    currentDate,
    openEventModal,
    showEventModal,
    clearEventDragPreview: eventDrag.clearEventDragPreview
  })

  const handleCombinedDropOnHourCell = useCallback(async (e, hour, hourCellElement = null) => {
    const isTodoDrag = document.body.classList.contains('task-dragging') || !!todoDrag.getDraggedTodoMeta()
    if (isTodoDrag) {
      await todoDrag.handleTodoDropOnHourCell(e, hour)
    } else {
      eventDrag.handleEventDrop(e, hour, hourCellElement)
    }
    todoDrag.clearTodoDragPreview()
  }, [eventDrag, todoDrag])

  const dayEvents = useMemo(() => {
    const fromCache = typeof getEventsForDate === 'function' ? (getEventsForDate(currentDate) || []) : []
    return fromCache.map(ev => ({
      ...ev,
      start: ev.start instanceof Date ? ev.start : new Date(ev.start),
      end: ev.end instanceof Date ? ev.end : new Date(ev.end),
      isImported: Boolean(ev.source)
    }))
  }, [getEventsForDate, currentDate, events])

  useEffect(() => {
    if (!todoDrag.pendingTodoPreviewRef.current) return
    const match = dayEvents.some(ev => {
      const evTodo = ev?.todoId || ev?.todo_id
      return evTodo && String(evTodo) === String(todoDrag.pendingTodoPreviewRef.current)
    })
    if (match) {
      todoDrag.pendingTodoPreviewRef.current = null
      todoDrag.clearTodoDragPreview()
      todoDrag.hideTodoOverlay()
    }
  }, [dayEvents, todoDrag])

  const allDayEvents = useMemo(() => dayEvents.filter(isAllDayEvent), [dayEvents])
  const regularEvents = useMemo(() => dayEvents.filter(ev => !isAllDayEvent(ev)), [dayEvents])

  // Wrapper droppable to catch edge drags near sidebar
  const dateStr = format(currentDate, 'yyyy-MM-dd')
  const { setNodeRef: setWrapperRef } = useDroppable({
    id: `day-view-wrapper-${dateStr}`,
    data: {
      type: 'hour-cell',
      date: currentDate,
      hour: 9, // Default to 9am if dropped on wrapper
      isAllDay: false,
    },
  })

  return (
    <div
      ref={setWrapperRef}
      className="flex flex-col h-full min-h-0 flex-1 relative overflow-hidden"
      onWheel={handleWheel}
      onDragEnter={() => {
        if (document.body.classList.contains('task-dragging')) {
          document.body.classList.add('calendar-drag-focus')
        }
      }}
      onDragOver={() => {
        if (document.body.classList.contains('task-dragging')) {
          document.body.classList.add('calendar-drag-focus')
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          document.body.classList.remove('calendar-drag-focus')
          const isTodoDrag = document.body.classList.contains('task-dragging') || !!todoDrag.getDraggedTodoMeta()
          if (!isTodoDrag) todoDrag.clearTodoDragPreview()
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <AllDaySection
        allDayEvents={allDayEvents}
        todoDragPreview={todoDrag.todoDragPreview}
        currentDate={currentDate}
        openEventModal={openEventModal}
        getDraggedTodoMeta={todoDrag.getDraggedTodoMeta}
        handleTodoDropOnAllDay={todoDrag.handleTodoDropOnAllDay}
        handleAllDayEventDrop={eventDrag.handleAllDayEventDrop}
        handleAllDayDragOver={eventDrag.handleAllDayDragOver}
        handleAllDayTodoDragOver={todoDrag.handleAllDayTodoDragOver}
        handleDragLeave={eventDrag.handleDragLeave}
      />

      <TimeGrid
        scrollContainerRef={scrollContainerRef}
        timelineRef={timelineRef}
        currentDate={currentDate}
        regularEvents={regularEvents}
        hours={hours}
        isDragging={dragToCreate.isDragging}
        dragStart={dragToCreate.dragStart}
        dragEnd={dragToCreate.dragEnd}
        persistedDragPreview={dragToCreate.persistedDragPreview}
        isEventResizing={dragToCreate.isEventResizing}
        dragPreviewEvent={eventDrag.dragPreviewEvent}
        todoDragPreview={todoDrag.todoDragPreview}
        pendingTodoPreviewRef={todoDrag.pendingTodoPreviewRef}
        handleCellMouseDown={dragToCreate.handleCellMouseDown}
        handleCellMouseMove={dragToCreate.handleCellMouseMove}
        handleCellDoubleClick={dragToCreate.handleCellDoubleClick}
        handleCombinedDropOnHourCell={handleCombinedDropOnHourCell}
        handleHourCellDragOver={eventDrag.handleHourCellDragOver}
        handleHourCellTodoDragOver={todoDrag.handleHourCellTodoDragOver}
        handleDragLeave={eventDrag.handleDragLeave}
        updateEventDragPreview={eventDrag.updateEventDragPreview}
        clearEventDragPreview={eventDrag.clearEventDragPreview}
        clearTodoDragPreview={todoDrag.clearTodoDragPreview}
      />
    </div>
  )
}

export default DayView
