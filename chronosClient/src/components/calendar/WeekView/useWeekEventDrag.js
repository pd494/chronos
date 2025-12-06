import { useCallback, useEffect, useRef, useState } from 'react'
import { snapHourMinutePair, cleanupDragArtifacts } from './constants'

export const useWeekEventDrag = ({ updateEvent }) => {
  const [dragPreviewEvent, setDragPreviewEvent] = useState(null)
  const cancelDragRef = useRef(false)

  const emitDragPreviewUpdate = useCallback((startDate, endDate) => {
    if (typeof window === 'undefined') return
    const dragMeta = window.__chronosDraggedEventMeta || null
    if (!dragMeta?.id) return
    window.dispatchEvent(new CustomEvent('chronos-drag-preview', {
      detail: { id: dragMeta.id, start: startDate ? startDate.toISOString() : null, end: endDate ? endDate.toISOString() : null }
    }))
  }, [])

  const clearEventDragPreview = useCallback(() => {
    setDragPreviewEvent(null)
    emitDragPreviewUpdate(null, null)
  }, [emitDragPreviewUpdate])

  const resolveDragAxis = useCallback((pointerEvent) => {
    if (typeof window === 'undefined') return null
    let axis = window.__chronosDragAxis || null
    const startPoint = window.__chronosDragStartPoint
    if (!startPoint) return axis
    if (axis) return axis
    if (!pointerEvent) return null
    const currentX = pointerEvent.clientX ?? startPoint.x
    const currentY = pointerEvent.clientY ?? startPoint.y
    const deltaX = Math.abs(currentX - startPoint.x)
    const deltaY = Math.abs(currentY - startPoint.y)
    if (Math.max(deltaX, deltaY) < 8) return null
    axis = deltaY >= deltaX ? 'vertical' : 'horizontal'
    window.__chronosDragAxis = axis
    return axis
  }, [])

  const updateEventDragPreviewForWeek = useCallback((e, hourCell, day, hour) => {
    cancelDragRef.current = false
    if (!hourCell || !day) {
      emitDragPreviewUpdate(null, null)
      setDragPreviewEvent(null)
      return
    }
    const rect = hourCell.getBoundingClientRect()
    const relativeY = Math.min(rect.height, Math.max(0, e.clientY - rect.top))
    const minutePercentage = rect.height ? relativeY / rect.height : 0
    const minutes = Math.floor(minutePercentage * 60)
    const { hour: snappedHour, minutes: snappedMinutes } = snapHourMinutePair(hour, minutes)
    const dragMeta = typeof window !== 'undefined' ? window.__chronosDraggedEventMeta : null
    if (!dragMeta) {
      emitDragPreviewUpdate(null, null)
      setDragPreviewEvent(null)
      return
    }
    resolveDragAxis(e)
    const durationMs = dragMeta.durationMs || 60 * 60 * 1000
    const previewStart = new Date(day)
    previewStart.setHours(snappedHour, snappedMinutes, 0, 0)
    const previewEnd = new Date(previewStart.getTime() + durationMs)
    setDragPreviewEvent({
      id: dragMeta.id,
      title: dragMeta.title,
      color: dragMeta.color,
      start: previewStart,
      end: previewEnd
    })
    emitDragPreviewUpdate(previewStart, previewEnd)
  }, [emitDragPreviewUpdate, resolveDragAxis])

  const handleEventDropOnHourCell = useCallback((e, targetDay, targetHour, hourCellElement = null) => {
    e.preventDefault()
    e.stopPropagation()

    if (cancelDragRef.current) {
      cancelDragRef.current = false
      clearEventDragPreview()
      cleanupDragArtifacts()
      return
    }

    const eventData = e.dataTransfer.getData('event')
    if (!eventData) return

    try {
      const draggedEvent = JSON.parse(eventData)
      const oldStart = new Date(draggedEvent.start)
      const oldEnd = new Date(draggedEvent.end)
      const rawDurationMs = Math.max(1, oldEnd.getTime() - oldStart.getTime())
      const ONE_HOUR = 60 * 60 * 1000
      const durationMs = (draggedEvent.isAllDay || rawDurationMs >= 23 * ONE_HOUR) ? ONE_HOUR : rawDurationMs

      const cellElement = hourCellElement || e.currentTarget
      const rect = cellElement.getBoundingClientRect()
      const relativeY = Math.min(rect.height, Math.max(0, e.clientY - rect.top))
      const minutePercentage = rect.height ? relativeY / rect.height : 0
      const minutes = Math.floor(minutePercentage * 60)
      const { hour: snappedHour, minutes: snappedMinutes } = snapHourMinutePair(targetHour, minutes)

      const newStart = new Date(targetDay)
      newStart.setHours(snappedHour, snappedMinutes, 0, 0)
      const newEnd = new Date(newStart.getTime() + durationMs)

      updateEvent(draggedEvent.id, { ...draggedEvent, start: newStart, end: newEnd, isAllDay: false })
    } catch (error) {
      console.error('Error dropping event on hour cell:', error)
    }
    clearEventDragPreview()
  }, [updateEvent, clearEventDragPreview])

  const handleAllDayEventDrop = useCallback((e, targetDay) => {
    e.preventDefault()
    e.stopPropagation()

    if (cancelDragRef.current) {
      cancelDragRef.current = false
      clearEventDragPreview()
      cleanupDragArtifacts()
      return
    }

    const eventData = e.dataTransfer.getData('event')
    if (!eventData) return

    try {
      const draggedEvent = JSON.parse(eventData)
      const oldStart = new Date(draggedEvent.start)
      const oldEnd = new Date(draggedEvent.end)
      const durationMs = Math.max(30 * 60 * 1000, oldEnd.getTime() - oldStart.getTime())

      const newStart = new Date(targetDay)
      newStart.setHours(0, 0, 0, 0)
      const msInDay = 24 * 60 * 60 * 1000
      let newEnd
      if (draggedEvent.isAllDay) {
        const daySpan = Math.max(1, Math.round(durationMs / msInDay) || 1)
        newEnd = new Date(newStart.getTime() + daySpan * msInDay)
      } else {
        newEnd = new Date(newStart.getTime() + msInDay)
      }

      updateEvent(draggedEvent.id, { ...draggedEvent, start: newStart, end: newEnd, isAllDay: true })
    } catch (error) {
      console.error('Error dropping all-day event:', error)
    }
    clearEventDragPreview()
  }, [updateEvent, clearEventDragPreview])

  const handleHourCellDragOver = useCallback((e, day, hour) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (document.body.classList.contains('task-dragging')) {
      document.body.classList.add('calendar-drag-focus')
    }
    resolveDragAxis(e)
    updateEventDragPreviewForWeek(e, e.currentTarget, day, hour)
  }, [resolveDragAxis, updateEventDragPreviewForWeek])

  const handleAllDayDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (document.body.classList.contains('task-dragging')) {
      document.body.classList.add('calendar-drag-focus')
    }
    clearEventDragPreview()
  }, [clearEventDragPreview])

  const handleDragLeave = useCallback(() => {
    clearEventDragPreview()
  }, [clearEventDragPreview])

  useEffect(() => {
    const handleKeyDown = (evt) => {
      if (evt.key !== 'Escape') return
      cancelDragRef.current = true
      clearEventDragPreview()
      cleanupDragArtifacts()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clearEventDragPreview])

  return {
    dragPreviewEvent,
    clearEventDragPreview,
    updateEventDragPreviewForWeek,
    handleEventDropOnHourCell,
    handleAllDayEventDrop,
    handleHourCellDragOver,
    handleAllDayDragOver,
    handleDragLeave
  }
}
