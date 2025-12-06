import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, addMonths, subMonths, addDays } from 'date-fns'
import { BUFFER_WEEKS, WEEKS_PER_VIEW, ABOVE, BELOW, DIRECTIONAL_MONTHS, getStartOfWeekLocal, formatDateKey } from './constants'

export const useMonthScroll = ({
  scrollContainerRef,
  rowHeight,
  fetchEventsForRange,
  setHeaderDisplayDate,
  initialLoading
}) => {
  const [referenceDate] = useState(new Date())
  const todayWeekIndex = ABOVE + BUFFER_WEEKS

  const [visibleWeekRange, setVisibleWeekRange] = useState(() => {
    const thisWeek = getStartOfWeekLocal(referenceDate)
    return {
      startDate: addWeeks(thisWeek, -ABOVE - BUFFER_WEEKS),
      endDate: addWeeks(thisWeek, BELOW + BUFFER_WEEKS),
    }
  })

  const [displayMonthDate, setDisplayMonthDate] = useState(referenceDate)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 })

  const requestedRangesRef = useRef(new Set())
  const lastScrollTopRef = useRef(0)
  const lastScrollTsRef = useRef(0)
  const lastHeaderMonthRef = useRef(null)
  const hasUserScrolledRef = useRef(false)

  const weeks = useMemo(() => {
    const all = []
    let cur = visibleWeekRange.startDate
    while (cur <= visibleWeekRange.endDate) {
      const days = Array.from({ length: 7 }, (_, i) => addDays(cur, i))
      all.push({ weekStart: formatDateKey(cur), days })
      cur = addWeeks(cur, 1)
    }
    return all
  }, [visibleWeekRange])

  useEffect(() => {
    if (!scrollContainerRef.current || rowHeight === 0) return
    const top = todayWeekIndex * rowHeight - scrollContainerRef.current.clientHeight / 2 + rowHeight / 2
    scrollContainerRef.current.scrollTop = Math.max(0, top)
  }, [rowHeight, todayWeekIndex, scrollContainerRef])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || rowHeight === 0) return

    let fetchTimeout = null

    const handleScroll = (evt) => {
      const scrollTop = container.scrollTop
      const containerHeight = container.clientHeight
      const startWeek = Math.max(0, Math.floor(scrollTop / rowHeight))
      const endWeek = Math.min(weeks.length, Math.ceil((scrollTop + containerHeight) / rowHeight))
      const bufferSize = 10

      setVisibleRange({
        start: Math.max(0, startWeek - bufferSize),
        end: Math.min(weeks.length, endWeek + bufferSize)
      })

      if (weeks.length) {
        const clampedStart = Math.min(startWeek, weeks.length - 1)
        const clampedEnd = Math.max(clampedStart + 1, endWeek)

        if (clampedStart >= 0 && clampedEnd > clampedStart) {
          const visibleWeeksList = weeks.slice(clampedStart, clampedEnd)
          if (visibleWeeksList.length) {
            const monthTallies = new Map()
            visibleWeeksList.forEach(({ days }) => {
              days.forEach((day) => {
                const key = `${day.getFullYear()}-${day.getMonth()}`
                if (!monthTallies.has(key)) {
                  monthTallies.set(key, { count: 1, representativeDate: new Date(day.getFullYear(), day.getMonth(), 1) })
                } else {
                  monthTallies.get(key).count += 1
                }
              })
            })

            let leadingMonth = null
            monthTallies.forEach((value, key) => {
              if (!leadingMonth || value.count > leadingMonth.count) {
                leadingMonth = { key, ...value }
              }
            })

            let newHeaderDate = null
            const totalDaysVisible = visibleWeeksList.length * 7
            if (leadingMonth && leadingMonth.count >= totalDaysVisible / 2) {
              newHeaderDate = leadingMonth.representativeDate
            } else {
              const allVisibleDays = []
              visibleWeeksList.forEach(({ days }) => allVisibleDays.push(...days))
              if (allVisibleDays.length) {
                newHeaderDate = allVisibleDays[Math.floor(allVisibleDays.length / 2)]
              }
            }

            if (newHeaderDate) {
              const newKey = `${newHeaderDate.getFullYear()}-${newHeaderDate.getMonth()}`
              if (lastHeaderMonthRef.current !== newKey) {
                lastHeaderMonthRef.current = newKey
                setDisplayMonthDate(newHeaderDate)
                setHeaderDisplayDate(newHeaderDate)
              }
            }
          }
        }
      }

      const now = performance.now()
      const prevTop = lastScrollTopRef.current
      const deltaY = scrollTop - prevTop
      lastScrollTopRef.current = scrollTop
      lastScrollTsRef.current = now
      const isUserScroll = Boolean(evt?.isTrusted)
      if (isUserScroll) hasUserScrolledRef.current = true

      if (isUserScroll && !initialLoading && weeks[startWeek] && weeks[endWeek - 1]) {
        const rangeStart = weeks[startWeek].days[0]
        const rangeEnd = weeks[endWeek - 1].days[6]

        const normStart = startOfWeek(startOfMonth(subMonths(rangeStart, 3)))
        const normEnd = endOfWeek(endOfMonth(addMonths(rangeEnd, 3)))
        const normKey = `${normStart.getTime()}_${normEnd.getTime()}`
        if (!requestedRangesRef.current.has(normKey)) {
          requestedRangesRef.current.add(normKey)
          fetchEventsForRange(normStart, normEnd, true).catch(() => {})
        }

        if (deltaY < 0) {
          const upStart = startOfWeek(startOfMonth(subMonths(rangeStart, DIRECTIONAL_MONTHS)))
          const upEnd = endOfWeek(endOfMonth(subMonths(rangeStart, 1)))
          const upKey = `${upStart.getTime()}_${upEnd.getTime()}`
          if (!requestedRangesRef.current.has(upKey)) {
            requestedRangesRef.current.add(upKey)
            fetchEventsForRange(upStart, upEnd, true).catch(() => {})
          }
        }
        if (deltaY > 0) {
          const downStart = startOfWeek(startOfMonth(addMonths(rangeEnd, 1)))
          const downEnd = endOfWeek(endOfMonth(addMonths(rangeEnd, DIRECTIONAL_MONTHS)))
          const downKey = `${downStart.getTime()}_${downEnd.getTime()}`
          if (!requestedRangesRef.current.has(downKey)) {
            requestedRangesRef.current.add(downKey)
            fetchEventsForRange(downStart, downEnd, true).catch(() => {})
          }
        }
      }

      if (fetchTimeout) clearTimeout(fetchTimeout)
      fetchTimeout = setTimeout(() => {}, 500)
    }

    handleScroll()
    container.addEventListener('scroll', handleScroll)
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (fetchTimeout) clearTimeout(fetchTimeout)
    }
  }, [rowHeight, weeks, fetchEventsForRange, setHeaderDisplayDate, initialLoading, scrollContainerRef])

  useEffect(() => {
    if (initialLoading) requestedRangesRef.current.clear()
  }, [initialLoading])

  useEffect(() => {
    if (!displayMonthDate || initialLoading) return
    if (!hasUserScrolledRef.current) return
    const yearPrefetchStart = startOfWeek(startOfMonth(subMonths(displayMonthDate, 12)))
    const yearPrefetchEnd = endOfWeek(endOfMonth(addMonths(displayMonthDate, 12)))
    const key = `year_${yearPrefetchStart.getTime()}_${yearPrefetchEnd.getTime()}`
    if (!requestedRangesRef.current.has(key)) {
      requestedRangesRef.current.add(key)
      fetchEventsForRange(yearPrefetchStart, yearPrefetchEnd, true).catch(() => {})
    }
  }, [displayMonthDate, initialLoading, fetchEventsForRange])

  useEffect(() => () => { requestedRangesRef.current.clear() }, [])

  return { weeks, visibleRange, todayWeekIndex }
}
