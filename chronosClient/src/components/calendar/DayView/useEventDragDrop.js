import { useState, useRef, useCallback, useEffect } from 'react'
import { snapHourMinutePair, cleanupDragArtifacts } from './constants'

export const useEventDragDrop = ({ currentDate, updateEvent }) => {
  const activeDropCellRef = useRef(null)
  const [dragPreviewEvent, setDragPreviewEvent] = useState(null)
  const cancelDragRef = useRef(false)

  const setDropTarget = useCallback((cell) => {
    if (activeDropCellRef.current === cell) return
    if (activeDropCellRef.current) {
      activeDropCellRef.current.classList.remove('event-dragover')
    }
    if (cell) {
      cell.classList.add('event-dragover')
    }
    activeDropCellRef.current = cell || null
  }, [])

  const clearDropTarget = useCallback(() => {
    if (activeDropCellRef.current) {
      activeDropCellRef.current.classList.remove('event-dragover')
      activeDropCellRef.current = null
    }
  }, [])

  const emitDragPreviewUpdate = useCallback((startDate, endDate) => {
    if (typeof window === 'undefined') return
    const dragMeta = window.__chronosDraggedEventMeta || null
    if (!dragMeta?.id) return
    window.dispatchEvent(new CustomEvent('chronos-drag-preview', {
      detail: {
        id: dragMeta.id,
        start: startDate ? startDate.toISOString() : null,
        end: endDate ? endDate.toISOString() : null
      }
    }))
  }, [])

  const clearEventDragPreview = useCallback(() => {
    clearDropTarget()
    setDragPreviewEvent(null)
    emitDragPreviewUpdate(null, null)
  }, [clearDropTarget, emitDragPreviewUpdate])

  const updateEventDragPreview = useCallback((e, hourCell, hour) => {
    cancelDragRef.current = false
    if (!hourCell) {
      clearEventDragPreview()
      return
    }
    setDropTarget(hourCell)
    const rect = hourCell.getBoundingClientRect()
    const relativeY = Math.min(rect.height, Math.max(0, e.clientY - rect.top))
    const minutePercentage = rect.height ? relativeY / rect.height : 0
    const minutes = Math.floor(minutePercentage * 60)
    const { hour: snappedHour, minutes: snappedMinutes } = snapHourMinutePair(hour, minutes)
    const dragMeta = typeof window !== 'undefined' ? window.__chronosDraggedEventMeta : null
    if (!dragMeta) {
      clearEventDragPreview()
      return
    }
    const durationMs = dragMeta.durationMs || 60 * 60 * 1000
    const newStart = new Date(currentDate)
    newStart.setHours(snappedHour, snappedMinutes, 0, 0)
    const newEnd = new Date(newStart.getTime() + durationMs)
    
    setDragPreviewEvent({
      id: dragMeta.id,
      title: dragMeta.title,
      color: dragMeta.color,
      start: newStart,
      end: newEnd
    })
    emitDragPreviewUpdate(newStart, newEnd)
  }, [currentDate, setDropTarget, clearEventDragPreview, emitDragPreviewUpdate])

  const resetPreviewIfNoTarget = useCallback(() => {
    clearEventDragPreview()
    document.body.classList.remove('calendar-drag-focus')
    queueMicrotask(() => {
      ['.sortable-ghost', '.task-ghost', '.sortable-drag', '.task-drag'].forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          if (!el.closest('.task-list')) {
            el.parentNode?.removeChild(el)
          }
        })
      })
    })
  }, [clearEventDragPreview])

  const handleEventDrop = useCallback((e, hour, hourCellElement = null) => {
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
      const durationMs = (draggedEvent.isAllDay || rawDurationMs >= 23 * ONE_HOUR)
        ? ONE_HOUR
        : rawDurationMs

      const cellElement = hourCellElement || e.currentTarget
      const rect = cellElement.getBoundingClientRect()
      const relativeY = Math.min(rect.height, Math.max(0, e.clientY - rect.top))
      const minutePercentage = rect.height ? relativeY / rect.height : 0
      const minutes = Math.floor(minutePercentage * 60)
      const { hour: snappedHour, minutes: snappedMinutes } = snapHourMinutePair(hour, minutes)

      const newStart = new Date(currentDate)
      newStart.setHours(snappedHour, snappedMinutes, 0, 0)
      const newEnd = new Date(newStart.getTime() + durationMs)

      updateEvent(draggedEvent.id, {
        ...draggedEvent,
        start: newStart,
        end: newEnd,
        isAllDay: false,
      })
    } catch (error) {
      console.error('Error dropping event onto day hour cell:', error)
    }

    clearEventDragPreview()
  }, [currentDate, updateEvent, clearEventDragPreview])

  const handleAllDayEventDrop = useCallback((e) => {
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

      const newStart = new Date(currentDate)
      newStart.setHours(0, 0, 0, 0)
      const msInDay = 24 * 60 * 60 * 1000
      let newEnd

      if (draggedEvent.isAllDay) {
        const daySpan = Math.max(1, Math.round(durationMs / msInDay) || 1)
        newEnd = new Date(newStart.getTime() + daySpan * msInDay)
      } else {
        newEnd = new Date(newStart.getTime() + msInDay)
      }

      updateEvent(draggedEvent.id, {
        ...draggedEvent,
        start: newStart,
        end: newEnd,
        isAllDay: true,
      })
    } catch (error) {
      console.error('Error dropping all-day event in daily view:', error)
    }

    clearEventDragPreview()
    cleanupDragArtifacts()
  }, [currentDate, updateEvent, clearEventDragPreview])

  const handleHourCellDragOver = useCallback((e, hour) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    updateEventDragPreview(e, e.currentTarget, hour)
  }, [updateEventDragPreview])

  const handleAllDayDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    clearDropTarget()
    clearEventDragPreview()
  }, [clearDropTarget, clearEventDragPreview])

  const handleDragLeave = useCallback(() => {
    const isTodoDrag = document.body.classList.contains('task-dragging') || 
      (typeof window !== 'undefined' && window.__chronosDraggedTodoMeta)
    if (!isTodoDrag) {
      resetPreviewIfNoTarget()
    }
  }, [resetPreviewIfNoTarget])

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
    setDropTarget,
    clearDropTarget,
    clearEventDragPreview,
    updateEventDragPreview,
    resetPreviewIfNoTarget,
    handleEventDrop,
    handleAllDayEventDrop,
    handleHourCellDragOver,
    handleAllDayDragOver,
    handleDragLeave
  }
}
