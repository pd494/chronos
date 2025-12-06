import { startOfWeek, startOfDay, addDays, differenceInCalendarDays } from 'date-fns'

export const BUFFER_WEEKS = 1040
export const WEEKS_PER_VIEW = 6
export const ABOVE = Math.floor(WEEKS_PER_VIEW / 2)
export const BELOW = WEEKS_PER_VIEW - 1 - ABOVE
export const DIRECTIONAL_MONTHS = 24
export const MULTI_DAY_LANE_HEIGHT = 24
export const MULTI_DAY_TOP_OFFSET = 35
export const MULTI_DAY_EVENT_GAP = 2
export const RANGE_DRAG_DELAY = 120
export const RANGE_DRAG_THRESHOLD = 6
export const INITIAL_RANGE_SELECTION = { active: false, committed: false, finalized: false, start: null, end: null }

export const getStartOfWeekLocal = (date, weekStartsOn = 0) =>
  startOfWeek(date, { weekStartsOn })

export const hexToRgba = (hex, alpha) => {
  if (typeof hex !== 'string' || !hex.startsWith('#')) return hex
  const normalized = hex.replace('#', '')
  const r = parseInt(normalized.substring(0, 2), 16)
  const g = parseInt(normalized.substring(2, 4), 16)
  const b = parseInt(normalized.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const formatDateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const cloneDay = (day) => new Date(day.getFullYear(), day.getMonth(), day.getDate())

export const normalizeDay = (value) => {
  if (!value) return null
  if (value instanceof Date) return startOfDay(value)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed)
}

export const computeWeekSpanLayout = (weekDays, getEventsForDate) => {
  const weekStart = startOfDay(weekDays[0])
  const weekEvents = new Map()
  weekDays.forEach((day) => {
    const events = getEventsForDate(day) || []
    events.forEach((event) => {
      if (event?.id && !weekEvents.has(event.id)) {
        weekEvents.set(event.id, event)
      }
    })
  })

  const spans = []
  weekEvents.forEach((event) => {
    const start = normalizeDay(event.start)
    if (!start) return
    const rawEnd = event.end ? new Date(event.end) : null
    if (!rawEnd || Number.isNaN(rawEnd.getTime())) return
    const endBoundary = startOfDay(rawEnd)
    const inclusiveEnd = event.isAllDay
      ? addDays(endBoundary, -1)
      : startOfDay(new Date(rawEnd.getTime() - 1))
    if (inclusiveEnd < start) return
    const totalDays = differenceInCalendarDays(inclusiveEnd, start) + 1
    const isMultiDay = event.isAllDay || totalDays > 1
    if (!isMultiDay || totalDays <= 1) return

    const startIndex = Math.max(0, differenceInCalendarDays(start, weekStart))
    const endIndex = Math.min(6, differenceInCalendarDays(inclusiveEnd, weekStart))
    if (endIndex < 0 || startIndex > 6) return
    const clampedStart = Math.max(0, startIndex)
    const clampedEnd = Math.max(clampedStart, endIndex)
    spans.push({
      id: event.id,
      event: {
        ...event,
        isAllDay: isMultiDay,
        originalIsAllDay: Boolean(event.isAllDay)
      },
      startIndex: clampedStart,
      endIndex: clampedEnd,
      length: clampedEnd - clampedStart + 1
    })
  })

  spans.sort((a, b) => {
    if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex
    if (a.length !== b.length) return b.length - a.length
    return String(a.id).localeCompare(String(b.id))
  })

  const laneEnd = []
  spans.forEach((span) => {
    let lane = 0
    while (laneEnd[lane] !== undefined && laneEnd[lane] >= span.startIndex) {
      lane += 1
    }
    laneEnd[lane] = span.endIndex
    span.lane = lane
  })

  return {
    spans,
    laneCount: laneEnd.length,
    multiDayIds: new Set(spans.map((span) => span.id))
  }
}
