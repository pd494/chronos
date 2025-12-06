import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { isSameDay, startOfDay, addDays } from 'date-fns'
import { INITIAL_RANGE_SELECTION, RANGE_DRAG_DELAY, RANGE_DRAG_THRESHOLD, cloneDay } from './constants'

export const useRangeSelection = ({ openEventModal, showEventModal }) => {
  const [rangeSelection, setRangeSelection] = useState(INITIAL_RANGE_SELECTION)
  const rangeStartClientRef = useRef(null)
  const rangeDelayTimerRef = useRef(null)

  const normalizedSelection = useMemo(() => {
    if (!rangeSelection.committed || !rangeSelection.start || !rangeSelection.end) return null
    const start = rangeSelection.start <= rangeSelection.end
      ? startOfDay(rangeSelection.start)
      : startOfDay(rangeSelection.end)
    const end = rangeSelection.start >= rangeSelection.end
      ? startOfDay(rangeSelection.start)
      : startOfDay(rangeSelection.end)
    return { start, end }
  }, [rangeSelection.committed, rangeSelection.start, rangeSelection.end])

  const cancelRangeSelection = useCallback(() => {
    document.body.classList.remove('month-range-selecting')
    document.body.style.overflow = ''
    document.body.style.userSelect = ''
    setRangeSelection(INITIAL_RANGE_SELECTION)
    rangeStartClientRef.current = null
    if (rangeDelayTimerRef.current) {
      clearTimeout(rangeDelayTimerRef.current)
      rangeDelayTimerRef.current = null
    }
  }, [])

  const finalizeRangeSelection = useCallback(() => {
    if (!rangeSelection.committed || !rangeSelection.start || !rangeSelection.end) {
      cancelRangeSelection()
      return
    }
    const start = rangeSelection.start <= rangeSelection.end ? rangeSelection.start : rangeSelection.end
    const end = rangeSelection.start >= rangeSelection.end ? rangeSelection.start : rangeSelection.end
    const startDate = startOfDay(start)
    const endDate = startOfDay(addDays(end, 1))
    document.body.style.overflow = ''
    document.body.style.userSelect = ''
    document.body.classList.remove('month-range-selecting')
    setRangeSelection(prev => ({ ...prev, active: false, finalized: true }))
    openEventModal({ start: startDate, end: endDate, isAllDay: true, title: 'New Event', color: 'blue' }, true)
  }, [rangeSelection, openEventModal, cancelRangeSelection])

  useEffect(() => {
    if (!rangeSelection.active) return
    const handleMouseUp = () => finalizeRangeSelection()
    const handleKeyDown = (event) => { if (event.key === 'Escape') cancelRangeSelection() }
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [rangeSelection.active, finalizeRangeSelection, cancelRangeSelection])

  useEffect(() => {
    if (!showEventModal && rangeSelection.finalized) cancelRangeSelection()
  }, [showEventModal, rangeSelection.finalized, cancelRangeSelection])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handler = () => cancelRangeSelection()
    window.addEventListener('chronos:month-range-reset', handler)
    return () => window.removeEventListener('chronos:month-range-reset', handler)
  }, [cancelRangeSelection])

  useEffect(() => {
    return () => {
      document.body.classList.remove('month-range-selecting')
      document.body.style.overflow = ''
      document.body.style.userSelect = ''
    }
  }, [])

  const handleRangeMouseDown = useCallback((day, event) => {
    if (event.button !== 0) return
    if (event.target.closest('[data-event-id]') || event.target.closest('.month-multiday-span')) return
    event.preventDefault()
    cancelRangeSelection()
    const cloned = cloneDay(day)
    const startCoords = { x: event.clientX, y: event.clientY }
    rangeStartClientRef.current = startCoords

    let isActive = false

    const handleGlobalMouseMove = (moveEvent) => {
      const dx = Math.abs(moveEvent.clientX - startCoords.x)
      const dy = Math.abs(moveEvent.clientY - startCoords.y)
      if (dx > RANGE_DRAG_THRESHOLD || dy > RANGE_DRAG_THRESHOLD) {
        if (!isActive) {
          isActive = true
          document.body.classList.add('month-range-selecting')
          document.body.style.overflow = 'hidden'
          document.body.style.userSelect = 'none'
          setRangeSelection({ active: true, committed: false, finalized: false, start: cloned, end: cloned })
          if (rangeDelayTimerRef.current) {
            clearTimeout(rangeDelayTimerRef.current)
            rangeDelayTimerRef.current = null
          }
        }
      }
    }

    const handleGlobalMouseUp = () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
      if (rangeDelayTimerRef.current) {
        clearTimeout(rangeDelayTimerRef.current)
        rangeDelayTimerRef.current = null
      }
      if (!isActive) cancelRangeSelection()
    }

    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)

    rangeDelayTimerRef.current = window.setTimeout(() => {
      if (!isActive) {
        window.removeEventListener('mousemove', handleGlobalMouseMove)
        window.removeEventListener('mouseup', handleGlobalMouseUp)
        cancelRangeSelection()
      }
    }, RANGE_DRAG_DELAY)
  }, [cancelRangeSelection])

  const handleRangeMouseEnter = useCallback((day) => {
    setRangeSelection((prev) => {
      if (!prev.active) return prev
      const cloned = cloneDay(day)
      const moved = prev.committed || !isSameDay(cloned, prev.start) ||
        (rangeStartClientRef.current && Math.abs(cloneDay(cloned) - cloneDay(prev.start)) >= RANGE_DRAG_THRESHOLD)
      return { ...prev, end: cloned, committed: prev.committed || moved }
    })
  }, [])

  const handleRangeMouseMove = useCallback((day, event) => {
    setRangeSelection((prev) => {
      if (!prev.active) return prev
      const cloned = cloneDay(day)
      const coords = rangeStartClientRef.current
      const thresholdMet = coords
        ? (Math.abs((event?.clientX ?? coords.x) - coords.x) > RANGE_DRAG_THRESHOLD ||
          Math.abs((event?.clientY ?? coords.y) - coords.y) > RANGE_DRAG_THRESHOLD)
        : false
      const moved = prev.committed || thresholdMet || !isSameDay(cloned, prev.start)
      if (!moved && isSameDay(prev.end, cloned)) return prev
      return { ...prev, end: cloned, committed: prev.committed || thresholdMet || !isSameDay(cloned, prev.start) }
    })
  }, [])

  return {
    rangeSelection,
    normalizedSelection,
    cancelRangeSelection,
    handleRangeMouseDown,
    handleRangeMouseEnter,
    handleRangeMouseMove
  }
}
