import { useState, useRef, useCallback, useEffect } from 'react'
import { addDays } from 'date-fns'
import { buildHourlyRange, cleanupDragArtifacts } from './constants'

export const useTodoDragDrop = ({ currentDate, convertTodoToEvent }) => {
  const [todoDragPreview, setTodoDragPreview] = useState(null)
  const pendingTodoConversionRef = useRef(null)
  const pendingTodoPreviewRef = useRef(null)

  const getDraggedTodoMeta = useCallback(() => {
    if (typeof window === 'undefined') return null
    return window.__chronosDraggedTodoMeta || null
  }, [])

  const hideTodoOverlay = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chronos-todo-overlay-hide'))
    }
  }, [])

  const clearTodoDragPreview = useCallback(() => {
    setTodoDragPreview(null)
  }, [])

  const setTodoDropPreview = useCallback((startDate, endDate, isAllDay = false) => {
    if (typeof window !== 'undefined' && window.__chronosTodoOverlayActive) {
      return
    }
    hideTodoOverlay()
    const meta = getDraggedTodoMeta()
    const metaColor = typeof meta?.color === 'string' ? meta.color.toLowerCase() : meta?.color
    setTodoDragPreview({
      start: startDate,
      end: endDate,
      isAllDay,
      title: meta?.title || 'New task',
      color: metaColor || 'blue'
    })
  }, [getDraggedTodoMeta, hideTodoOverlay])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handler = (evt) => {
      if (evt?.detail?.active) {
        setTodoDragPreview(null)
      }
    }
    window.addEventListener('chronos-todo-overlay-state', handler)
    return () => window.removeEventListener('chronos-todo-overlay-state', handler)
  }, [])

  const handleTodoDropOnHourCell = useCallback(async (e, hour) => {
    const isTodoDrag = document.body.classList.contains('task-dragging') || !!getDraggedTodoMeta()
    if (!isTodoDrag) return

    e.preventDefault()
    e.stopPropagation()
    hideTodoOverlay()

    if (pendingTodoConversionRef.current) return

    const draggedTodoMeta = getDraggedTodoMeta()
    if (!draggedTodoMeta) return

    const taskId = draggedTodoMeta.taskId
    if (!taskId) return

    pendingTodoConversionRef.current = taskId
    pendingTodoPreviewRef.current = taskId
    const { start: startDate, end: endDate } = buildHourlyRange(currentDate, hour)

    try {
      await convertTodoToEvent(taskId, startDate, endDate, false)
      cleanupDragArtifacts()
    } catch (error) {
      console.error('Failed to convert todo to event:', error)
    } finally {
      setTimeout(() => {
        pendingTodoConversionRef.current = null
      }, 500)
    }
  }, [currentDate, convertTodoToEvent, getDraggedTodoMeta, hideTodoOverlay])

  const handleTodoDropOnAllDay = useCallback(async (e) => {
    const isTodoDrag = document.body.classList.contains('task-dragging') || !!getDraggedTodoMeta()
    if (!isTodoDrag) return

    e.preventDefault()
    e.stopPropagation()
    hideTodoOverlay()

    if (pendingTodoConversionRef.current) return

    const draggedTodoMeta = getDraggedTodoMeta()
    if (!draggedTodoMeta) return

    const taskId = draggedTodoMeta.taskId
    if (!taskId) return

    pendingTodoConversionRef.current = taskId
    pendingTodoPreviewRef.current = taskId

    const startDate = new Date(currentDate)
    startDate.setHours(0, 0, 0, 0)
    const endDate = addDays(startDate, 1)

    try {
      await convertTodoToEvent(taskId, startDate, endDate, true)
      cleanupDragArtifacts()
    } catch (error) {
      console.error('Failed to convert todo to event:', error)
    } finally {
      setTimeout(() => {
        pendingTodoConversionRef.current = null
      }, 500)
    }
  }, [currentDate, convertTodoToEvent, getDraggedTodoMeta, hideTodoOverlay])

  const handleHourCellTodoDragOver = useCallback((e, hour) => {
    if (document.body.classList.contains('task-dragging')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      document.body.classList.add('calendar-drag-focus')
      const { start, end } = buildHourlyRange(currentDate, hour)
      setTodoDropPreview(start, end, false)
      hideTodoOverlay()
    }
  }, [currentDate, setTodoDropPreview, hideTodoOverlay])

  const handleAllDayTodoDragOver = useCallback((e) => {
    if (document.body.classList.contains('task-dragging')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      document.body.classList.add('calendar-drag-focus')
      const startDate = new Date(currentDate)
      startDate.setHours(0, 0, 0, 0)
      const endDate = addDays(startDate, 1)
      setTodoDropPreview(startDate, endDate, true)
      hideTodoOverlay()
    }
  }, [currentDate, setTodoDropPreview, hideTodoOverlay])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined
    }

    const handleGlobalTodoDragEnd = async (event) => {
      const meta = getDraggedTodoMeta()
      const isTodoDrag = document.body.classList.contains('task-dragging') || !!meta
      if (!isTodoDrag) return
      if (pendingTodoConversionRef.current) return

      const taskId = meta?.taskId
      if (!taskId) return

      const { clientX, clientY } = event
      if (typeof clientX !== 'number' || typeof clientY !== 'number') return

      const el = document.elementFromPoint(clientX, clientY)
      if (!el) return

      const hourCell = el.closest?.('.day-hour-cell')
      const allDaySection = el.closest?.('.day-all-day-section')
      if (!hourCell && !allDaySection) return

      pendingTodoConversionRef.current = taskId
      pendingTodoPreviewRef.current = taskId

      try {
        if (hourCell) {
          const hourAttr = hourCell.getAttribute('data-hour')
          const hour = hourAttr != null ? parseInt(hourAttr, 10) : NaN
          if (!Number.isFinite(hour)) return
          const { start, end } = buildHourlyRange(currentDate, hour)
          await convertTodoToEvent(taskId, start, end, false)
        } else if (allDaySection) {
          const startDate = new Date(currentDate)
          startDate.setHours(0, 0, 0, 0)
          const endDate = addDays(startDate, 1)
          await convertTodoToEvent(taskId, startDate, endDate, true)
        }
        cleanupDragArtifacts()
      } catch (error) {
        console.error('Failed to convert todo to event from day dragend fallback:', error)
      } finally {
        pendingTodoConversionRef.current = null
      }
    }

    window.addEventListener('dragend', handleGlobalTodoDragEnd, true)
    return () => window.removeEventListener('dragend', handleGlobalTodoDragEnd, true)
  }, [convertTodoToEvent, currentDate, getDraggedTodoMeta])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleTodoConverted = (evt) => {
      const todoId = evt?.detail?.todoId || evt?.detail?.eventData?.todoId || evt?.detail?.eventData?.todo_id
      if (todoId && pendingTodoPreviewRef.current && String(todoId) === String(pendingTodoPreviewRef.current)) {
        pendingTodoPreviewRef.current = null
        clearTodoDragPreview()
        hideTodoOverlay()
      }
    }

    const handleTodoConversionFailed = () => {
      pendingTodoPreviewRef.current = null
      clearTodoDragPreview()
    }

    window.addEventListener('todoConvertedToEvent', handleTodoConverted)
    window.addEventListener('todoConversionFailed', handleTodoConversionFailed)
    return () => {
      window.removeEventListener('todoConvertedToEvent', handleTodoConverted)
      window.removeEventListener('todoConversionFailed', handleTodoConversionFailed)
    }
  }, [clearTodoDragPreview, hideTodoOverlay])

  return {
    todoDragPreview,
    pendingTodoConversionRef,
    pendingTodoPreviewRef,
    getDraggedTodoMeta,
    hideTodoOverlay,
    clearTodoDragPreview,
    setTodoDropPreview,
    handleTodoDropOnHourCell,
    handleTodoDropOnAllDay,
    handleHourCellTodoDragOver,
    handleAllDayTodoDragOver
  }
}
