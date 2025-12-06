import { useState, useRef, useCallback, useEffect } from 'react'
import { addDays } from 'date-fns'
import { buildHourlyRange, cleanupDragArtifacts } from './constants'

export const useWeekTodoDrag = ({ convertTodoToEvent }) => {
  const [todoDragPreview, setTodoDragPreview] = useState(null)
  const pendingTodoConversionRef = useRef(null)

  const getDraggedTodoMeta = useCallback(() => {
    if (typeof window === 'undefined') return null
    return window.__chronosDraggedTodoMeta || null
  }, [])

  const clearTodoDragPreview = useCallback(() => setTodoDragPreview(null), [])

  const setTodoDropPreview = useCallback((startDate, endDate, isAllDay = false) => {
    if (typeof window !== 'undefined' && window.__chronosTodoOverlayActive) return
    const meta = getDraggedTodoMeta()
    const metaColor = typeof meta?.color === 'string' ? meta.color.toLowerCase() : meta?.color
    setTodoDragPreview({
      start: startDate, end: endDate, isAllDay,
      title: meta?.title || 'New task', color: metaColor || 'blue'
    })
  }, [getDraggedTodoMeta])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handler = (evt) => { if (evt?.detail?.active) setTodoDragPreview(null) }
    window.addEventListener('chronos-todo-overlay-state', handler)
    return () => window.removeEventListener('chronos-todo-overlay-state', handler)
  }, [])

  const handleTodoDropOnHourCell = useCallback(async (e, targetDay, targetHour) => {
    const isTodoDrag = document.body.classList.contains('task-dragging') || !!getDraggedTodoMeta()
    if (!isTodoDrag) return
    e.preventDefault()
    e.stopPropagation()
    clearTodoDragPreview()
    if (pendingTodoConversionRef.current) return

    const draggedTodoMeta = getDraggedTodoMeta()
    if (!draggedTodoMeta) return
    const taskId = draggedTodoMeta.taskId
    if (!taskId) return

    pendingTodoConversionRef.current = taskId
    const { start: startDate, end: endDate } = buildHourlyRange(targetDay, targetHour)

    try {
      await convertTodoToEvent(taskId, startDate, endDate, false)
      clearTodoDragPreview()
      cleanupDragArtifacts()
    } catch (error) {
      console.error('Failed to convert todo to event:', error)
    } finally {
      setTimeout(() => { pendingTodoConversionRef.current = null }, 500)
    }
  }, [convertTodoToEvent, getDraggedTodoMeta, clearTodoDragPreview])

  const handleTodoDropOnAllDay = useCallback(async (e, targetDay) => {
    const isTodoDrag = document.body.classList.contains('task-dragging') || !!getDraggedTodoMeta()
    if (!isTodoDrag) return
    e.preventDefault()
    e.stopPropagation()
    clearTodoDragPreview()
    if (pendingTodoConversionRef.current) return

    const draggedTodoMeta = getDraggedTodoMeta()
    if (!draggedTodoMeta) return
    const taskId = draggedTodoMeta.taskId
    if (!taskId) return

    pendingTodoConversionRef.current = taskId
    const startDate = new Date(targetDay)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + 1)

    try {
      await convertTodoToEvent(taskId, startDate, endDate, true)
      clearTodoDragPreview()
      cleanupDragArtifacts()
    } catch (error) {
      console.error('Failed to convert todo to event:', error)
    } finally {
      setTimeout(() => { pendingTodoConversionRef.current = null }, 500)
    }
  }, [convertTodoToEvent, getDraggedTodoMeta, clearTodoDragPreview])

  const handleHourCellTodoDragOver = useCallback((e, day, hour) => {
    if (document.body.classList.contains('task-dragging')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      const { start, end } = buildHourlyRange(day, hour)
      setTodoDropPreview(start, end, false)
    }
  }, [setTodoDropPreview])

  const handleAllDayTodoDragOver = useCallback((e, day) => {
    if (document.body.classList.contains('task-dragging')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      const startDate = new Date(day)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 1)
      setTodoDropPreview(startDate, endDate, true)
    }
  }, [setTodoDropPreview])

  return {
    todoDragPreview,
    getDraggedTodoMeta,
    clearTodoDragPreview,
    setTodoDropPreview,
    handleTodoDropOnHourCell,
    handleTodoDropOnAllDay,
    handleHourCellTodoDragOver,
    handleAllDayTodoDragOver
  }
}
