import { useState, useRef, useCallback, useEffect } from 'react'
import { startOfDay, addDays } from 'date-fns'
import { formatDateKey } from './constants'
import { cleanupDragArtifacts } from '../WeekView/constants'

export const useMonthDragDrop = ({ updateEvent, convertTodoToEvent }) => {
  const [todoPreviewDate, setTodoPreviewDate] = useState(null)
  const pendingTodoConversionRef = useRef(null)

  const getDraggedTodoMeta = useCallback(() => {
    if (typeof window === 'undefined') return null
    return window.__chronosDraggedTodoMeta || null
  }, [])

  const clearTodoPreview = useCallback(() => setTodoPreviewDate(null), [])

  const hideTodoOverlay = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      window.dispatchEvent(new CustomEvent('chronos-todo-overlay-hide'))
    } catch (_) { }
  }, [])

  const stripDragVisuals = useCallback(() => {
    if (typeof document === 'undefined') return
    try {
      cleanupDragArtifacts()
    } catch (_) { }
    document.querySelectorAll('.event-dragover').forEach(el => el.classList.remove('event-dragover'))
  }, [])

  const obliterateFloatingTodo = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.__chronosTodoOverlayActive = false
      window.__chronosDraggedTodoMeta = null
    }
    if (typeof document !== 'undefined') {
      const nuke = () => {
        document.querySelectorAll('.todo-drag-overlay').forEach(el => {
          try {
            el.style.setProperty('display', 'none', 'important')
            el.style.setProperty('opacity', '0', 'important')
            el.remove()
          } catch (_) { }
        })
      }
      nuke()
      // extra couple of frames in case a portal re-renders
      let frames = 4
      const loop = () => {
        nuke()
        frames -= 1
        if (frames > 0 && typeof window !== 'undefined') window.requestAnimationFrame(loop)
      }
      if (typeof window !== 'undefined') window.requestAnimationFrame(loop)
    }
  }, [])

  const endTodoDragSession = useCallback(() => {
    document.body.classList.remove('task-dragging')
    hideTodoOverlay()
    clearTodoPreview()
    stripDragVisuals()
    obliterateFloatingTodo()
  }, [clearTodoPreview, hideTodoOverlay, stripDragVisuals, obliterateFloatingTodo])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handler = (evt) => { if (evt?.detail?.active) clearTodoPreview() }
    window.addEventListener('chronos-todo-overlay-state', handler)
    return () => window.removeEventListener('chronos-todo-overlay-state', handler)
  }, [clearTodoPreview])

  const handleEventDrop = useCallback(async (e, targetDate) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.classList.remove('event-dragover')
    document.querySelectorAll('.event-dragover').forEach(el => el.classList.remove('event-dragover'))

    const eventData = e.dataTransfer.getData('event')
    if (!eventData) return

    try {
      const draggedEvent = JSON.parse(eventData)
      const oldStart = new Date(draggedEvent.start)
      const oldEnd = new Date(draggedEvent.end)
      const oldStartDay = startOfDay(oldStart)
      const targetDay = startOfDay(targetDate)
      const dayDiff = targetDay.getTime() - oldStartDay.getTime()
      const newStart = new Date(oldStart.getTime() + dayDiff)
      const newEnd = new Date(oldEnd.getTime() + dayDiff)

      await updateEvent(draggedEvent.id, { start: newStart, end: newEnd, isAllDay: draggedEvent.isAllDay })
    } catch (error) {
      console.error('Error dropping event:', error)
    } finally {
      if (typeof window !== 'undefined' && window.__chronosDraggedEventMeta?.id) {
        window.__chronosDraggedEventMeta = null
      }
      document.querySelectorAll('[data-dragging]').forEach(el => el.removeAttribute('data-dragging'))
      document.querySelectorAll('.event-dragover').forEach(el => el.classList.remove('event-dragover'))
    }
  }, [updateEvent])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    if (document.body.classList.contains('task-dragging')) {
      try { window.dispatchEvent(new CustomEvent('chronos-todo-overlay-suppress')) } catch (_) { }
      e.dataTransfer.dropEffect = 'copy'
      const dayCell = e.currentTarget
      const dateStr = dayCell.getAttribute('data-date')
      if (dateStr) {
        const overlayActive = typeof window !== 'undefined' && window.__chronosTodoOverlayActive
        if (overlayActive) clearTodoPreview()
        else setTodoPreviewDate(dateStr)
      }
      dayCell.classList.add('event-dragover')
      document.body.classList.add('calendar-drag-focus')
      return
    }
    e.dataTransfer.dropEffect = 'move'
    e.currentTarget.classList.add('event-dragover')
  }, [clearTodoPreview])

  const handleDragLeave = useCallback((e) => {
    e.currentTarget.classList.remove('event-dragover')
    if (document.body.classList.contains('task-dragging')) {
      const relatedTarget = e.relatedTarget
      if (!relatedTarget || !relatedTarget.closest('.month-day-cell')) clearTodoPreview()
    }
  }, [clearTodoPreview])

  const handleTodoDrop = useCallback(async (e, targetDate) => {
    const meta = getDraggedTodoMeta()
    const isTodoDrag = document.body.classList.contains('task-dragging') || !!meta
    if (!isTodoDrag) return
    e.preventDefault()
    e.stopPropagation()
    if (pendingTodoConversionRef.current) return

    const draggedTodoMeta = meta || getDraggedTodoMeta() || {}
    let taskId = draggedTodoMeta.taskId
    if (!taskId && typeof document !== 'undefined') {
      const draggedElement = document.querySelector('[data-task-id][data-dragging="true"]') ||
        document.querySelector('.task-drag') || document.querySelector('.sortable-drag') ||
        document.querySelector('[data-is-clone="true"]')
      taskId = draggedElement?.getAttribute('data-task-id') || draggedElement?.getAttribute('data-id')
    }
    if (!taskId) return

    endTodoDragSession()

    pendingTodoConversionRef.current = taskId
    const dateStr = formatDateKey(targetDate)
    const [year, month, day] = dateStr.split('-').map(Number)
    const startDate = new Date(year, month - 1, day, 0, 0, 0, 0)
    const endDate = addDays(startDate, 1)

    try {
      await convertTodoToEvent(taskId, startDate, endDate, true)
    } catch (error) {
      console.error('Failed to convert todo to event:', error)
    } finally {
      stripDragVisuals()
      obliterateFloatingTodo()
      document.body.classList.remove('calendar-drag-focus')
      pendingTodoConversionRef.current = null
    }
  }, [convertTodoToEvent, clearTodoPreview, getDraggedTodoMeta, hideTodoOverlay, stripDragVisuals, obliterateFloatingTodo, endTodoDragSession])

  const handleCombinedDrop = useCallback(async (e, targetDate) => {
    const isTodoDrag = document.body.classList.contains('task-dragging') || !!getDraggedTodoMeta()
    if (isTodoDrag) await handleTodoDrop(e, targetDate)
    else await handleEventDrop(e, targetDate)
  }, [handleTodoDrop, handleEventDrop, getDraggedTodoMeta])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined

    const handleGlobalTodoDragEnd = async (event) => {
      const meta = getDraggedTodoMeta()
      const isTodoDrag = document.body.classList.contains('task-dragging') || !!meta
      if (!isTodoDrag) return
      if (pendingTodoConversionRef.current) return
      endTodoDragSession()

      const taskId = meta?.taskId
      if (!taskId) return

      const { clientX, clientY } = event
      if (typeof clientX !== 'number' || typeof clientY !== 'number') return

      const el = document.elementFromPoint(clientX, clientY)
      const dayCell = el?.closest?.('.month-day-cell')
      if (!dayCell) return

      const dateStr = dayCell.getAttribute('data-date')
      if (!dateStr) return

      pendingTodoConversionRef.current = taskId
      const [year, month, day] = dateStr.split('-').map(Number)
      const startDate = new Date(year, month - 1, day, 0, 0, 0, 0)
      const endDate = addDays(startDate, 1)

      try {
        await convertTodoToEvent(taskId, startDate, endDate, true)
      } catch (error) {
        console.error('Failed to convert todo to event from month dragend fallback:', error)
      } finally {
        stripDragVisuals()
        obliterateFloatingTodo()
        document.body.classList.remove('calendar-drag-focus')
        pendingTodoConversionRef.current = null
      }
    }

    window.addEventListener('dragend', handleGlobalTodoDragEnd, true)
    return () => window.removeEventListener('dragend', handleGlobalTodoDragEnd, true)
  }, [convertTodoToEvent, clearTodoPreview, getDraggedTodoMeta, hideTodoOverlay, stripDragVisuals, obliterateFloatingTodo, endTodoDragSession])

  return {
    todoPreviewDate,
    getDraggedTodoMeta,
    clearTodoPreview,
    handleDragOver,
    handleDragLeave,
    handleCombinedDrop
  }
}
