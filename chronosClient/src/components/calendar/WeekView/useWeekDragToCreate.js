import { useState, useRef, useCallback, useEffect } from 'react'
import { isSameDay, format } from 'date-fns'
import { HOUR_HEIGHT, DAY_START_HOUR, DRAG_DISTANCE_THRESHOLD, snapHourValue } from './constants'

export const useWeekDragToCreate = ({ openEventModal, showEventModal }) => {
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState(null)
  const [dragEnd, setDragEnd] = useState(null)
  const [dragDay, setDragDay] = useState(null)
  const [persistedDragPreview, setPersistedDragPreview] = useState(null)

  const hasDraggedRef = useRef(false)
  const dragInitialDayHourRef = useRef(null)
  const dragTimeoutRef = useRef(null)
  const dragColumnRef = useRef(null)
  const dragStartCellRef = useRef(null)

  useEffect(() => {
    if (!showEventModal && persistedDragPreview) {
      setPersistedDragPreview(null)
    }
  }, [showEventModal, persistedDragPreview])

  const handleCellMouseDown = useCallback((e, day, hour) => {
    if (e.button !== 0) return
    if (typeof window !== 'undefined' && window.__chronosEventResizing) return
    if (document.body.classList.contains('task-dragging')) return

    dragColumnRef.current = e.currentTarget.closest('.week-day-column')
    dragStartCellRef.current = e.currentTarget
    window.lastClickedCalendarDay = e.currentTarget
    window.lastClickedEvent = null
    window.lastClickedEventId = null

    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const minutePercentage = (relativeY % HOUR_HEIGHT) / HOUR_HEIGHT
    const minutes = Math.floor(minutePercentage * 60)
    const preciseHour = hour + (minutes / 60)
    const snappedHour = snapHourValue(preciseHour)

    setDragDay(day)
    setDragStart(snappedHour)
    setDragEnd(snappedHour)
    hasDraggedRef.current = false
    dragInitialDayHourRef.current = { day, rawHour: preciseHour }

    dragTimeoutRef.current = setTimeout(() => {
      setIsDragging(true)
    }, 500)
  }, [])

  const handleCellMouseMove = useCallback((e, day, hour) => {
    if (!dragDay || dragStart === null) return
    if (typeof window !== 'undefined' && window.__chronosEventResizing) return
    if (document.body.classList.contains('task-dragging')) return

    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const minutePercentage = (relativeY % HOUR_HEIGHT) / HOUR_HEIGHT
    const minutes = Math.floor(minutePercentage * 60)
    const preciseHour = hour + (minutes / 60)
    const snappedHour = snapHourValue(preciseHour)

    const movedToDifferentDay = !isSameDay(dragDay, day)
    const startRaw = dragInitialDayHourRef.current?.rawHour ?? dragStart ?? preciseHour
    const distanceMoved = Math.abs((preciseHour ?? 0) - startRaw)

    const shouldActivateDrag = isDragging || movedToDifferentDay || distanceMoved >= DRAG_DISTANCE_THRESHOLD

    if (!isDragging && shouldActivateDrag) {
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current)
        dragTimeoutRef.current = null
      }
      setIsDragging(true)
    }

    if (shouldActivateDrag) {
      hasDraggedRef.current = true
      if (movedToDifferentDay) setDragDay(day)
      setDragEnd(snappedHour)
    }
  }, [dragDay, dragStart, isDragging])

  const handleGridMouseUp = useCallback(() => {
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current)
      dragTimeoutRef.current = null
    }

    if (!isDragging && !dragDay && !hasDraggedRef.current) return

    const wasDragging = hasDraggedRef.current
    const savedDragDay = dragDay
    const savedDragStart = dragStart
    const savedDragEnd = dragEnd

    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
    setDragDay(null)
    hasDraggedRef.current = false
    dragInitialDayHourRef.current = null

    if (wasDragging) {
      const startVal = Math.min(savedDragStart, savedDragEnd)
      let endVal = Math.max(savedDragStart, savedDragEnd)
      if (endVal === startVal) endVal = startVal + 0.5

      const eventStartHour = Math.floor(startVal)
      const eventStartMinute = Math.floor((startVal - eventStartHour) * 60)
      const eventEndHour = Math.floor(endVal)
      const eventEndMinute = Math.floor((endVal - eventEndHour) * 60)

      const startDate = new Date(savedDragDay)
      startDate.setHours(eventStartHour, eventStartMinute, 0, 0)
      const endDate = new Date(savedDragDay)
      endDate.setHours(eventEndHour, eventEndMinute, 0, 0)
      if (endDate <= startDate) endDate.setTime(startDate.getTime() + 30 * 60 * 1000)

      const newEvent = { id: `temp-${Date.now()}`, title: '', start: startDate, end: endDate, color: 'blue', isAllDay: false }

      const scrollTop = window.pageYOffset || document.documentElement.scrollTop
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft
      const columnEl = dragColumnRef.current

      if (columnEl) {
        const columnRect = columnEl.getBoundingClientRect()
        const columnTop = columnRect.top + scrollTop
        const columnLeft = columnRect.left + scrollLeft
        const startOffset = Math.max(0, (startVal - DAY_START_HOUR) * HOUR_HEIGHT)
        const endOffset = Math.max(startOffset + 1, (endVal - DAY_START_HOUR) * HOUR_HEIGHT)
        const height = Math.max(endOffset - startOffset, HOUR_HEIGHT / 2)

        window.lastCalendarAnchorRect = {
          top: columnTop + startOffset, bottom: columnTop + startOffset + height,
          left: columnLeft, right: columnLeft + columnRect.width,
          width: columnRect.width, height, eventId: newEvent.id
        }
      }

      window.prefilledEventDates = { startDate, endDate, title: '', color: 'blue', isAllDay: false, fromDayClick: true }
      setPersistedDragPreview({ day: savedDragDay, startHour: startVal, endHour: endVal, startDate, endDate })
      openEventModal(newEvent, true)
    }

    dragColumnRef.current = null
    dragStartCellRef.current = null
  }, [isDragging, dragDay, dragStart, dragEnd, openEventModal])

  const handleCellDoubleClick = useCallback((e, day, hour) => {
    if (e.button !== 0) return
    const startDate = new Date(day)
    startDate.setHours(hour, 0, 0, 0)
    const endDate = new Date(day)
    endDate.setHours(hour + 1, 0, 0, 0)

    const newEvent = { id: `temp-${Date.now()}`, title: '', start: startDate, end: endDate, color: 'blue', isAllDay: false }
    window.prefilledEventDates = { startDate, endDate, title: '', color: 'blue', isAllDay: false, fromDayClick: true }

    const scrollTop = window.pageYOffset || document.documentElement.scrollTop
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft
    const columnEl = e.currentTarget.closest('.week-day-column')

    if (columnEl) {
      const columnRect = columnEl.getBoundingClientRect()
      const startOffset = Math.max(0, (hour - DAY_START_HOUR) * HOUR_HEIGHT)
      const height = HOUR_HEIGHT
      window.lastCalendarAnchorRect = {
        top: columnRect.top + scrollTop + startOffset, bottom: columnRect.top + scrollTop + startOffset + height,
        left: columnRect.left + scrollLeft, right: columnRect.right + scrollLeft,
        width: columnRect.width, height, eventId: newEvent.id
      }
    }

    openEventModal(newEvent, true)
  }, [openEventModal])

  return {
    isDragging, dragStart, dragEnd, dragDay, persistedDragPreview,
    handleCellMouseDown, handleCellMouseMove, handleGridMouseUp, handleCellDoubleClick
  }
}
