import { useState, useRef, useCallback, useEffect } from 'react'
import { getHours, getMinutes } from 'date-fns'
import { HOUR_HEIGHT, TIME_FOCUS_RATIO, DAY_START_HOUR, DAY_END_HOUR } from './constants'

export const useWeekScroll = ({
  scrollContainerRef,
  timelineRef,
  view,
  currentDate,
  navigateToNext,
  navigateToPrevious
}) => {
  const touchStartX = useRef(null)
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollThreshold = 50

  const scrollToCurrentTime = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const now = new Date()
    const currentHour = getHours(now)
    const currentMinute = getMinutes(now)
    const withinDay = currentHour >= DAY_START_HOUR && currentHour <= DAY_END_HOUR
    const rawPosition = withinDay
      ? ((currentHour - DAY_START_HOUR) * HOUR_HEIGHT) + ((currentMinute / 60) * HOUR_HEIGHT)
      : 60
    const centeredPosition = rawPosition - (container.clientHeight * TIME_FOCUS_RATIO) + (HOUR_HEIGHT / 2)
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight)
    container.scrollTop = Math.max(0, Math.min(centeredPosition, maxScroll))
  }, [scrollContainerRef])

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      scrollToCurrentTime()
      requestAnimationFrame(scrollToCurrentTime)
    })
    return () => cancelAnimationFrame(raf)
  }, [scrollToCurrentTime, view, currentDate])

  useEffect(() => {
    const updateTimeline = () => {
      if (timelineRef.current) {
        const now = new Date()
        const currentHour = getHours(now)
        const currentMinute = getMinutes(now)
        const percentage = (currentHour - DAY_START_HOUR) + (currentMinute / 60)
        timelineRef.current.style.top = `${percentage * HOUR_HEIGHT}px`
      }
    }
    updateTimeline()
    const interval = setInterval(updateTimeline, 60000)
    return () => clearInterval(interval)
  }, [timelineRef])

  const handleWheel = useCallback((e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > scrollThreshold) {
      if (isScrolling) return
      if (e.deltaX > scrollThreshold) {
        setIsScrolling(true)
        navigateToNext()
        setTimeout(() => setIsScrolling(false), 500)
      } else if (e.deltaX < -scrollThreshold) {
        setIsScrolling(true)
        navigateToPrevious()
        setTimeout(() => setIsScrolling(false), 500)
      }
      e.preventDefault()
    }
  }, [isScrolling, navigateToNext, navigateToPrevious])

  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX
  }, [])

  const handleTouchMove = useCallback((e) => {
    if (!touchStartX.current || isScrolling) return
    const touchX = e.touches[0].clientX
    const diff = touchStartX.current - touchX
    if (diff > scrollThreshold) {
      setIsScrolling(true)
      navigateToNext()
      touchStartX.current = null
      setTimeout(() => setIsScrolling(false), 500)
    } else if (diff < -scrollThreshold) {
      setIsScrolling(true)
      navigateToPrevious()
      touchStartX.current = null
      setTimeout(() => setIsScrolling(false), 500)
    }
  }, [isScrolling, navigateToNext, navigateToPrevious])

  const handleTouchEnd = useCallback(() => {
    touchStartX.current = null
  }, [])

  return {
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd
  }
}
