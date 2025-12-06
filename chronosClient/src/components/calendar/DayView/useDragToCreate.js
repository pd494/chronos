import { useState, useRef, useCallback, useEffect } from 'react'
import { HOUR_HEIGHT, DRAG_DISTANCE_THRESHOLD, snapHourValue } from './constants'

export const useDragToCreate = ({ 
  currentDate, 
  openEventModal, 
  showEventModal,
  clearEventDragPreview 
}) => {
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState(null)
  const [dragEnd, setDragEnd] = useState(null)
  const [persistedDragPreview, setPersistedDragPreview] = useState(null)
  const [isEventResizing, setIsEventResizing] = useState(false)
  const hasDraggedRef = useRef(false)
  const dragTimeoutRef = useRef(null)
  const dragInitialHourRef = useRef(null)
  const isEventResizeActiveRef = useRef(false)

  const cancelDragCreatePreview = useCallback(() => {
    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
    hasDraggedRef.current = false
    dragInitialHourRef.current = null
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current)
      dragTimeoutRef.current = null
    }
    clearEventDragPreview()
  }, [clearEventDragPreview])

  useEffect(() => {
    const handleResizeStart = () => {
      isEventResizeActiveRef.current = true
      setIsEventResizing(true)
      cancelDragCreatePreview()
    }
    const handleResizeEnd = () => {
      isEventResizeActiveRef.current = false
      setIsEventResizing(false)
    }
    window.addEventListener('chronos-event-resize-start', handleResizeStart)
    window.addEventListener('chronos-event-resize-end', handleResizeEnd)
    return () => {
      window.removeEventListener('chronos-event-resize-start', handleResizeStart)
      window.removeEventListener('chronos-event-resize-end', handleResizeEnd)
    }
  }, [cancelDragCreatePreview])

  const handleCellMouseDown = useCallback((e, hour) => {
    if (e.button !== 0) return
    if (isEventResizeActiveRef.current || (typeof window !== 'undefined' && window.__chronosEventResizing)) return
    if (document.body.classList.contains('task-dragging')) return

    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const minutePercentage = (relativeY % HOUR_HEIGHT) / HOUR_HEIGHT
    const minutes = Math.floor(minutePercentage * 60)
    const preciseHour = hour + (minutes / 60)
    const snappedHour = snapHourValue(preciseHour)

    setDragStart(snappedHour)
    setDragEnd(snappedHour)
    hasDraggedRef.current = false
    dragInitialHourRef.current = preciseHour

    dragTimeoutRef.current = setTimeout(() => {
      setIsDragging(true)
    }, 500)
  }, [])

  const handleCellMouseMove = useCallback((e, hour) => {
    if (dragStart === null) return
    if (isEventResizeActiveRef.current || (typeof window !== 'undefined' && window.__chronosEventResizing)) return
    if (document.body.classList.contains('task-dragging')) return

    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const minutePercentage = (relativeY % HOUR_HEIGHT) / HOUR_HEIGHT
    const minutes = Math.floor(minutePercentage * 60)
    const preciseHour = hour + (minutes / 60)
    const snappedHour = snapHourValue(preciseHour)

    const startRaw = dragInitialHourRef.current ?? dragStart ?? preciseHour
    const distanceMoved = Math.abs(preciseHour - startRaw)
    const shouldActivateDrag = isDragging || distanceMoved >= DRAG_DISTANCE_THRESHOLD

    if (!isDragging && shouldActivateDrag) {
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current)
        dragTimeoutRef.current = null
      }
      setIsDragging(true)
    }

    if (shouldActivateDrag) {
      hasDraggedRef.current = true
      setDragEnd(snappedHour)
    }
  }, [dragStart, isDragging])

  const handleGridMouseUp = useCallback(() => {
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current)
      dragTimeoutRef.current = null
    }

    if (isEventResizeActiveRef.current || isEventResizing) return
    if (!isDragging && dragStart === null) return

    const wasDragging = hasDraggedRef.current && isDragging
    const savedDragStart = dragStart
    const savedDragEnd = dragEnd

    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
    hasDraggedRef.current = false
    dragInitialHourRef.current = null

    if (wasDragging && savedDragStart !== null && savedDragEnd !== null) {
      const startHour = Math.min(savedDragStart, savedDragEnd)
      const endHour = Math.max(savedDragStart, savedDragEnd)

      const startDate = new Date(currentDate)
      startDate.setHours(Math.floor(startHour), Math.round((startHour % 1) * 60), 0, 0)

      const endDate = new Date(currentDate)
      endDate.setHours(Math.floor(endHour), Math.round((endHour % 1) * 60), 0, 0)

      setPersistedDragPreview({ startHour, endHour, startDate, endDate })

      openEventModal(null, true)
      window.prefilledEventDates = {
        startDate,
        endDate,
        title: '',
        color: 'blue',
        isAllDay: false
      }
    }
  }, [isDragging, dragStart, dragEnd, isEventResizing, currentDate, openEventModal])

  const handleCellDoubleClick = useCallback((e, hour) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const minutePercentage = (relativeY % HOUR_HEIGHT) / HOUR_HEIGHT
    const minutes = Math.floor(minutePercentage * 60)

    const startDate = new Date(currentDate)
    startDate.setHours(hour, minutes, 0, 0)

    const endDate = new Date(startDate)
    endDate.setHours(startDate.getHours() + 1, startDate.getMinutes(), 0, 0)

    openEventModal(null, true)
    window.prefilledEventDates = {
      startDate,
      endDate,
      title: '',
      color: 'blue',
      isAllDay: false
    }
  }, [currentDate, openEventModal])

  useEffect(() => {
    const handleMouseUp = () => handleGridMouseUp()
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [handleGridMouseUp])

  useEffect(() => {
    if (!showEventModal && persistedDragPreview) {
      setPersistedDragPreview(null)
    }
  }, [showEventModal, persistedDragPreview])

  return {
    isDragging,
    dragStart,
    dragEnd,
    persistedDragPreview,
    isEventResizing,
    handleCellMouseDown,
    handleCellMouseMove,
    handleCellDoubleClick
  }
}
