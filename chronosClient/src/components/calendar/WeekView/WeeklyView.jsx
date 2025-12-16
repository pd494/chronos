import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { isSameDay } from 'date-fns'
import { useCalendar } from '../../../context/CalendarContext/CalendarContext'
import { useTaskContext } from '../../../context/TaskContext/context'
import { useSettings } from '../../../context/SettingsContext'
import { generateHours, isAllDayEvent } from './constants'
import { useWeekScroll } from './useWeekScroll'
import { useWeekDragToCreate } from './useWeekDragToCreate'
import { useWeekEventDrag } from './useWeekEventDrag'
import { useWeekTodoDrag } from './useWeekTodoDrag'
import WeekHeader from './WeekHeader'
import AllDayRow from './AllDayRow'
import WeekTimeGrid from './WeekTimeGrid'

const WeeklyView = () => {
  const {
    currentDate,
    view,
    events,
    getDaysInWeek,
    navigateToNext,
    navigateToPrevious,
    selectDate,
    openEventModal,
    getEventsForDate,
    updateEvent,
    showEventModal
  } = useCalendar()

  const { convertTodoToEvent } = useTaskContext()
  const { settings } = useSettings()

  const [days, setDays] = useState(getDaysInWeek(currentDate))
  const scrollContainerRef = useRef(null)
  const timelineRef = useRef(null)
  const hours = useMemo(() => generateHours(), [])

  useEffect(() => {
    let weekDays = getDaysInWeek(currentDate)
    if (settings?.hide_weekends === true) {
      weekDays = weekDays.filter(d => {
        const dayOfWeek = d.getDay()
        return dayOfWeek !== 0 && dayOfWeek !== 6
      })
    }
    setDays(weekDays)
  }, [currentDate, getDaysInWeek, settings?.hide_weekends])

  const { handleWheel, handleTouchStart, handleTouchMove, handleTouchEnd } = useWeekScroll({
    scrollContainerRef, timelineRef, view, currentDate, navigateToNext, navigateToPrevious
  })

  const dragToCreate = useWeekDragToCreate({ openEventModal, showEventModal })
  const eventDrag = useWeekEventDrag({ updateEvent })
  const todoDrag = useWeekTodoDrag({ convertTodoToEvent })

  const handleCombinedDropOnHourCell = useCallback(async (e, targetDay, targetHour, hourCellElement = null) => {
    if (document.body.classList.contains('task-dragging')) {
      await todoDrag.handleTodoDropOnHourCell(e, targetDay, targetHour)
    } else {
      eventDrag.handleEventDropOnHourCell(e, targetDay, targetHour, hourCellElement)
    }
  }, [eventDrag, todoDrag])

  const handleCombinedDropOnAllDay = useCallback(async (e, targetDay) => {
    if (document.body.classList.contains('task-dragging')) {
      await todoDrag.handleTodoDropOnAllDay(e, targetDay)
    } else {
      eventDrag.handleAllDayEventDrop(e, targetDay)
    }
  }, [eventDrag, todoDrag])

  const handleAllDayCellClick = useCallback((e, day) => {
    const defaultColor = settings?.default_event_color || 'blue'
    const wantsAllDay = settings?.default_new_event_is_all_day !== false

    const startDate = new Date(day)
    const endDate = new Date(day)

    if (wantsAllDay) {
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(23, 59, 59, 999)
    } else {
      const startTime = String(settings?.default_event_start_time || '09:00')
      const parts = startTime.split(':').map(Number)
      const hh = Number.isFinite(parts[0]) ? parts[0] : 9
      const mm = Number.isFinite(parts[1]) ? parts[1] : 0
      startDate.setHours(hh, mm, 0, 0)
      const defaultMinutesRaw = Number(settings?.default_event_duration) || 60
      const defaultMinutes = Math.max(30, Math.min(360, defaultMinutesRaw))
      endDate.setTime(startDate.getTime() + defaultMinutes * 60 * 1000)
    }

    const newEvent = { id: `temp-${Date.now()}`, title: '', start: startDate, end: endDate, color: defaultColor, isAllDay: wantsAllDay }
    window.prefilledEventDates = { startDate, endDate, title: '', color: defaultColor, isAllDay: wantsAllDay }
    openEventModal(newEvent, true)
  }, [openEventModal, settings?.default_event_color, settings?.default_new_event_is_all_day, settings?.default_event_start_time, settings?.default_event_duration])

  const weekEvents = useMemo(() => {
    if (!Array.isArray(days) || days.length === 0) return []
    const collected = new Map()
    for (const day of days) {
      const dailyEvents = typeof getEventsForDate === 'function' ? (getEventsForDate(day) || []) : []
      for (const ev of dailyEvents) {
        if (!ev || !ev.id) continue
        if (!collected.has(ev.id)) {
          const start = ev.start instanceof Date ? ev.start : new Date(ev.start)
          const end = ev.end instanceof Date ? ev.end : new Date(ev.end)
          collected.set(ev.id, { ...ev, start, end, isImported: Boolean(ev.source) })
        }
      }
    }
    return Array.from(collected.values())
  }, [days, getEventsForDate, events])

  const allDayEvents = useMemo(() => weekEvents.filter(isAllDayEvent), [weekEvents])
  const regularEvents = useMemo(() => weekEvents.filter(ev => !isAllDayEvent(ev)), [weekEvents])

  return (
    <div
      className="flex flex-col h-full min-h-0 flex-1 relative overflow-hidden"
      onWheel={handleWheel}
      onDragEnter={() => { if (document.body.classList.contains('task-dragging')) document.body.classList.add('calendar-drag-focus') }}
      onDragOver={() => { if (document.body.classList.contains('task-dragging')) document.body.classList.add('calendar-drag-focus') }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          document.body.classList.remove('calendar-drag-focus')
          todoDrag.clearTodoDragPreview()
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <WeekHeader days={days} currentDate={currentDate} selectDate={selectDate} />

      <AllDayRow
        days={days}
        allDayEvents={allDayEvents}
        currentDate={currentDate}
        todoDragPreview={todoDrag.todoDragPreview}
        openEventModal={openEventModal}
        handleAllDayCellClick={handleAllDayCellClick}
        handleCombinedDropOnAllDay={handleCombinedDropOnAllDay}
        handleAllDayDragOver={eventDrag.handleAllDayDragOver}
        handleAllDayTodoDragOver={todoDrag.handleAllDayTodoDragOver}
        handleDragLeave={eventDrag.handleDragLeave}
      />

      <WeekTimeGrid
        scrollContainerRef={scrollContainerRef}
        timelineRef={timelineRef}
        days={days}
        hours={hours}
        currentDate={currentDate}
        regularEvents={regularEvents}
        dragPreviewEvent={eventDrag.dragPreviewEvent}
        isDragging={dragToCreate.isDragging}
        dragStart={dragToCreate.dragStart}
        dragEnd={dragToCreate.dragEnd}
        dragDay={dragToCreate.dragDay}
        persistedDragPreview={dragToCreate.persistedDragPreview}
        todoDragPreview={todoDrag.todoDragPreview}
        handleCellMouseDown={dragToCreate.handleCellMouseDown}
        handleCellMouseMove={dragToCreate.handleCellMouseMove}
        handleGridMouseUp={dragToCreate.handleGridMouseUp}
        handleCellDoubleClick={dragToCreate.handleCellDoubleClick}
        handleCombinedDropOnHourCell={handleCombinedDropOnHourCell}
        handleHourCellDragOver={eventDrag.handleHourCellDragOver}
        handleHourCellTodoDragOver={todoDrag.handleHourCellTodoDragOver}
        handleDragLeave={eventDrag.handleDragLeave}
        updateEventDragPreviewForWeek={eventDrag.updateEventDragPreviewForWeek}
        clearEventDragPreview={eventDrag.clearEventDragPreview}
        clearTodoDragPreview={todoDrag.clearTodoDragPreview}
      />
    </div>
  )
}

export default WeeklyView
