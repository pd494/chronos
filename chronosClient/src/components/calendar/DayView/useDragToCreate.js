import { useState, useRef, useCallback, useEffect } from 'react'
import { HOUR_HEIGHT, DRAG_DISTANCE_THRESHOLD, snapHourValue } from './constants'
import { useSettings } from '../../../context/SettingsContext'

export const useDragToCreate = ({ 
  currentDate, 
  openEventModal, 
  showEventModal,
  clearEventDragPreview 
}) => {
  const { settings } = useSettings()
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
      let endHour = Math.max(savedDragStart, savedDragEnd)
      if (endHour === startHour) endHour = startHour + 0.25

      const startDate = new Date(currentDate)
      startDate.setHours(Math.floor(startHour), Math.round((startHour % 1) * 60), 0, 0)

      const endDate = new Date(currentDate)
      endDate.setHours(Math.floor(endHour), Math.round((endHour % 1) * 60), 0, 0)
      if (endDate <= startDate) endDate.setTime(startDate.getTime() + 15 * 60 * 1000)

      const defaultColor = settings?.default_event_color || 'blue'

      setPersistedDragPreview({ startHour, endHour, startDate, endDate })

      window.prefilledEventDates = {
        startDate,
        endDate,
        title: '',
        color: defaultColor,
        isAllDay: false
      }
      openEventModal(null, true)
    }
  }, [isDragging, dragStart, dragEnd, isEventResizing, currentDate, openEventModal, settings?.default_event_color])

  const handleCellDoubleClick = useCallback((e, hour) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const relativeY = e.clientY - rect.top
    const minutePercentage = (relativeY % HOUR_HEIGHT) / HOUR_HEIGHT
    const minutes = Math.floor(minutePercentage * 60)

    const startDate = new Date(currentDate)
    startDate.setHours(hour, minutes, 0, 0)

    const endDate = new Date(startDate)
    const defaultMinutesRaw = Number(settings?.default_event_duration) || 60
    const defaultMinutes = Math.max(30, Math.min(360, defaultMinutesRaw))
    endDate.setTime(startDate.getTime() + defaultMinutes * 60 * 1000)

    const defaultColor = settings?.default_event_color || 'blue'

    window.prefilledEventDates = {
      startDate,
      endDate,
      title: '',
      color: defaultColor,
      isAllDay: false
    }
    openEventModal(null, true)
  }, [currentDate, openEventModal, settings?.default_event_duration, settings?.default_event_color])

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
