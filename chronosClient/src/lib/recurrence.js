import {
  format,
  parseISO,
  isValid,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  startOfWeek,
  endOfDay
} from 'date-fns'

export const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

export const WEEKDAY_LABELS = {
  SU: 'Sunday',
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday'
}

export const WEEKDAY_SHORT_LABELS = {
  SU: 'Sun',
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat'
}

export const WEEKDAY_MINI = {
  SU: 'S',
  MO: 'M',
  TU: 'T',
  WE: 'W',
  TH: 'T',
  FR: 'F',
  SA: 'S'
}

export const RECURRENCE_FREQUENCIES = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' }
]

const ORDINAL_WORDS = {
  1: 'first',
  2: 'second',
  3: 'third',
  4: 'fourth',
  '-1': 'last'
}

const toDate = (value) => {
  if (value instanceof Date && isValid(value)) return value
  if (typeof value === 'string') {
    const parsed = parseISO(value)
    if (isValid(parsed)) return parsed
  }
  return new Date()
}

const getMonthlyWeek = (date) => {
  const day = date.getDate()
  const week = Math.ceil(day / 7)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  const isLast = day > lastDay - 7
  return isLast ? -1 : Math.min(week, 4)
}

const clampNumber = (value, min, max, fallback) => {
  const num = Number(value)
  if (Number.isNaN(num)) return fallback
  return Math.min(Math.max(num, min), max)
}

const DAY_MS = 24 * 60 * 60 * 1000

const ensureDate = (value) => {
  if (!value) return null
  if (value instanceof Date) {
    return new Date(value.getTime())
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const setTimeFromTemplate = (target, template) => {
  target.setHours(template.getHours(), template.getMinutes(), template.getSeconds(), template.getMilliseconds())
  return target
}

const cloneOccurrence = (startDate, durationMs) => {
  const start = new Date(startDate.getTime())
  const end = new Date(startDate.getTime() + durationMs)
  return { start, end }
}

export const createDefaultRecurrenceState = (baseDateInput) => {
  const baseDate = toDate(baseDateInput)
  const weekday = WEEKDAY_CODES[baseDate.getDay()]
  return {
    enabled: false,
    frequency: 'WEEKLY',
    interval: 1,
    daysOfWeek: [weekday],
    ends: 'never',
    count: 1,
    endDate: '',
    monthlyMode: 'day',
    monthlyDay: baseDate.getDate(),
    monthlyWeekday: weekday,
    monthlyWeek: getMonthlyWeek(baseDate),
    yearlyMode: 'date',
    yearlyMonth: baseDate.getMonth() + 1,
    yearlyDay: baseDate.getDate(),
    yearlyWeek: getMonthlyWeek(baseDate),
    yearlyWeekday: weekday
  }
}

export const cloneRecurrenceState = (state) => JSON.parse(JSON.stringify(state))

const normalizeDays = (days, fallback) => {
  if (!Array.isArray(days) || !days.length) return fallback
  const deduped = Array.from(new Set(days.filter(code => WEEKDAY_CODES.includes(code))))
  return deduped.length ? deduped : fallback
}

const buildUntilValue = (dateStr) => {
  if (!dateStr) return null
  const parsed = parseISO(dateStr)
  if (!isValid(parsed)) return null
  // Google expects UTC format yyyymmddThhmmssZ
  return format(parsed, "yyyyMMdd'T'HHmmss'Z'")
}

const parseUntilValue = (value) => {
  if (!value) return ''
  if (/^\d{8}$/.test(value)) {
    const year = parseInt(value.slice(0, 4), 10)
    const month = parseInt(value.slice(4, 6), 10) - 1
    const day = parseInt(value.slice(6, 8), 10)
    const parsed = new Date(Date.UTC(year, month, day))
    return isValid(parsed) ? format(parsed, 'yyyy-MM-dd') : ''
  }
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const year = parseInt(value.slice(0, 4), 10)
    const month = parseInt(value.slice(4, 6), 10) - 1
    const day = parseInt(value.slice(6, 8), 10)
    const hour = parseInt(value.slice(9, 11), 10)
    const minute = parseInt(value.slice(11, 13), 10)
    const second = parseInt(value.slice(13, 15), 10)
    const parsed = new Date(Date.UTC(year, month, day, hour, minute, second))
    return isValid(parsed) ? format(parsed, 'yyyy-MM-dd') : ''
  }
  return ''
}

const formatWeekdayList = (days) => {
  if (!Array.isArray(days) || !days.length) return ''
  const labels = days.map(code => WEEKDAY_LABELS[code] || code)
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
}

const getOrdinalLabel = (value) => ORDINAL_WORDS[String(value)] || ''

const inferDaysForFrequency = (state, baseDate) => {
  if (state.frequency === 'WEEKLY') {
    return normalizeDays(state.daysOfWeek, [WEEKDAY_CODES[baseDate.getDay()]])
  }
  return normalizeDays(state.daysOfWeek, [WEEKDAY_CODES[baseDate.getDay()]])
}

export const formatRecurrenceSummary = (state, baseDateInput) => {
  if (!state?.enabled) return 'Does not repeat'
  const baseDate = toDate(baseDateInput)
  const interval = Math.max(1, Number(state.interval) || 1)
  const pluralize = (word, count) => (count === 1 ? word : `${word}s`)
  let summary = ''

  switch (state.frequency) {
    case 'DAILY':
      summary = interval === 1 ? 'Daily' : `Every ${interval} ${pluralize('day', interval)}`
      break
    case 'WEEKLY': {
      const days = inferDaysForFrequency(state, baseDate)
      const dayList = formatWeekdayList(days)
      if (interval === 1) {
        summary = dayList ? `Weekly on ${dayList}` : 'Weekly'
      } else {
        summary = `Every ${interval} ${pluralize('week', interval)}${dayList ? ` on ${dayList}` : ''}`
      }
      break
    }
    case 'MONTHLY': {
      if (state.monthlyMode === 'weekday') {
        const ordinal = getOrdinalLabel(state.monthlyWeek)
        const weekday = WEEKDAY_LABELS[state.monthlyWeekday] || WEEKDAY_LABELS[WEEKDAY_CODES[baseDate.getDay()]]
        summary = interval === 1
          ? `Monthly on the ${ordinal} ${weekday}`
          : `Every ${interval} months on the ${ordinal} ${weekday}`
      } else {
        const day = state.monthlyDay || baseDate.getDate()
        summary = interval === 1
          ? `Monthly on day ${day}`
          : `Every ${interval} months on day ${day}`
      }
      break
    }
    case 'YEARLY': {
      const monthIndex = clampNumber(state.yearlyMonth, 1, 12, baseDate.getMonth() + 1) - 1
      const reference = new Date(baseDate.getFullYear(), monthIndex, 1)
      const monthName = format(reference, 'MMMM')
      if (state.yearlyMode === 'weekday') {
        const ordinal = getOrdinalLabel(state.yearlyWeek)
        const weekday = WEEKDAY_LABELS[state.yearlyWeekday] || WEEKDAY_LABELS[WEEKDAY_CODES[baseDate.getDay()]]
        summary = interval === 1
          ? `Annually on the ${ordinal} ${weekday} in ${monthName}`
          : `Every ${interval} years on the ${ordinal} ${weekday} in ${monthName}`
      } else {
        const day = clampNumber(state.yearlyDay, 1, 31, baseDate.getDate())
        summary = interval === 1
          ? `Annually on ${monthName} ${day}`
          : `Every ${interval} years on ${monthName} ${day}`
      }
      break
    }
    default:
      summary = 'Repeats'
  }

  if (state.ends === 'count') {
    const count = Math.max(1, Number(state.count) || 1)
    summary += `, ${count} ${pluralize('time', count)}`
  } else if (state.ends === 'until' && state.endDate) {
    try {
      const untilDate = parseISO(state.endDate)
      if (isValid(untilDate)) {
        summary += `, until ${format(untilDate, 'MMM d, yyyy')}`
      }
    } catch (_) {}
  }

  return summary
}

export const buildRecurrencePayload = (state, baseDateInput) => {
  if (!state?.enabled) return null
  const baseDate = toDate(baseDateInput)
  const ruleParts = []
  const interval = Math.max(1, Number(state.interval) || 1)
  ruleParts.push(`FREQ=${state.frequency}`)
  if (interval > 1) {
    ruleParts.push(`INTERVAL=${interval}`)
  }

  if (state.frequency === 'WEEKLY') {
    const days = inferDaysForFrequency(state, baseDate)
    if (days.length) {
      ruleParts.push(`BYDAY=${days.join(',')}`)
    }
  }

  if (state.frequency === 'MONTHLY') {
    if (state.monthlyMode === 'weekday') {
      const days = normalizeDays([state.monthlyWeekday], [WEEKDAY_CODES[baseDate.getDay()]])
      const pos = typeof state.monthlyWeek === 'number' ? state.monthlyWeek : getMonthlyWeek(baseDate)
      ruleParts.push(`BYDAY=${days[0]}`)
      ruleParts.push(`BYSETPOS=${pos}`)
    } else {
      const day = clampNumber(state.monthlyDay, 1, 31, baseDate.getDate())
      ruleParts.push(`BYMONTHDAY=${day}`)
    }
  }

  if (state.frequency === 'YEARLY') {
    const byMonth = clampNumber(state.yearlyMonth, 1, 12, baseDate.getMonth() + 1)
    ruleParts.push(`BYMONTH=${byMonth}`)
    if (state.yearlyMode === 'weekday') {
      const days = normalizeDays([state.yearlyWeekday], [WEEKDAY_CODES[baseDate.getDay()]])
      const pos = typeof state.yearlyWeek === 'number' ? state.yearlyWeek : getMonthlyWeek(baseDate)
      ruleParts.push(`BYDAY=${days[0]}`)
      ruleParts.push(`BYSETPOS=${pos}`)
    } else {
      const day = clampNumber(state.yearlyDay, 1, 31, baseDate.getDate())
      ruleParts.push(`BYMONTHDAY=${day}`)
    }
  }

  if (state.ends === 'count') {
    const count = Math.max(1, Number(state.count) || 1)
    ruleParts.push(`COUNT=${count}`)
  } else if (state.ends === 'until' && state.endDate) {
    const until = buildUntilValue(state.endDate)
    if (until) {
      ruleParts.push(`UNTIL=${until}`)
    }
  }

  const summary = formatRecurrenceSummary(state, baseDate)
  const meta = {
    enabled: true,
    frequency: state.frequency,
    interval,
    daysOfWeek: inferDaysForFrequency(state, baseDate),
    ends: state.ends,
    count: Math.max(1, Number(state.count) || 1),
    endDate: state.endDate || '',
    monthlyMode: state.monthlyMode,
    monthlyDay: state.monthlyDay,
    monthlyWeek: typeof state.monthlyWeek === 'number' ? state.monthlyWeek : getMonthlyWeek(baseDate),
    monthlyWeekday: state.monthlyWeekday,
    yearlyMode: state.yearlyMode,
    yearlyMonth: clampNumber(state.yearlyMonth, 1, 12, baseDate.getMonth() + 1),
    yearlyDay: clampNumber(state.yearlyDay, 1, 31, baseDate.getDate()),
    yearlyWeek: typeof state.yearlyWeek === 'number' ? state.yearlyWeek : getMonthlyWeek(baseDate),
    yearlyWeekday: state.yearlyWeekday,
    summary
  }

  return {
    rule: `RRULE:${ruleParts.join(';')}`,
    summary,
    meta
  }
}

export const parseRecurrenceRule = (ruleString, baseDateInput) => {
  if (typeof ruleString !== 'string' || !ruleString.trim()) return null
  const cleaned = ruleString.trim().toUpperCase().startsWith('RRULE:')
    ? ruleString.trim().slice(6)
    : ruleString.trim()
  const parts = cleaned.split(';').reduce((acc, part) => {
    const [key, value] = part.split('=')
    if (key && value) {
      acc[key] = value
    }
    return acc
  }, {})

  if (!parts.FREQ) {
    return null
  }

  const baseDate = toDate(baseDateInput)
  const defaults = createDefaultRecurrenceState(baseDate)
  const state = {
    ...defaults,
    enabled: true
  }

  state.frequency = parts.FREQ
  state.interval = Math.max(1, parseInt(parts.INTERVAL || '1', 10) || 1)

  if (parts.BYDAY) {
    state.daysOfWeek = normalizeDays(parts.BYDAY.split(','), defaults.daysOfWeek)
  }

  if (parts.BYMONTHDAY) {
    state.monthlyMode = 'day'
    state.monthlyDay = clampNumber(parts.BYMONTHDAY, 1, 31, defaults.monthlyDay)
  }

  if (parts.BYSETPOS) {
    state.monthlyMode = 'weekday'
    state.monthlyWeek = clampNumber(parts.BYSETPOS, -1, 4, defaults.monthlyWeek)
    if (state.daysOfWeek.length) {
      state.monthlyWeekday = state.daysOfWeek[0]
    }
    if (!state.monthlyWeekday) {
      state.monthlyWeekday = defaults.monthlyWeekday
    }
  }

  if (parts.BYMONTH) {
    state.yearlyMonth = clampNumber(parts.BYMONTH, 1, 12, defaults.yearlyMonth)
  }

  if (parts.FREQ === 'YEARLY' && parts.BYSETPOS) {
    state.yearlyMode = 'weekday'
    state.yearlyWeek = clampNumber(parts.BYSETPOS, -1, 4, defaults.yearlyWeek)
    if (state.daysOfWeek.length) {
      state.yearlyWeekday = state.daysOfWeek[0]
    } else {
      state.yearlyWeekday = defaults.yearlyWeekday
    }
  } else if (parts.FREQ === 'YEARLY' && parts.BYMONTHDAY) {
    state.yearlyMode = 'date'
    state.yearlyDay = clampNumber(parts.BYMONTHDAY, 1, 31, defaults.yearlyDay)
  }

  if (parts.COUNT) {
    state.ends = 'count'
    state.count = Math.max(1, parseInt(parts.COUNT, 10) || 1)
  } else if (parts.UNTIL) {
    state.ends = 'until'
    state.endDate = parseUntilValue(parts.UNTIL)
  } else {
    state.ends = 'never'
  }

  return state
}

export const recurrenceStateFromMeta = (meta, baseDateInput) => {
  const defaults = createDefaultRecurrenceState(baseDateInput)
  if (!meta) return defaults
  return {
    ...defaults,
    ...meta,
    enabled: meta.enabled ?? true,
    daysOfWeek: normalizeDays(meta.daysOfWeek, defaults.daysOfWeek),
    monthlyMode: meta.monthlyMode || defaults.monthlyMode,
    monthlyDay: meta.monthlyDay || defaults.monthlyDay,
    monthlyWeek: meta.monthlyWeek || defaults.monthlyWeek,
    monthlyWeekday: meta.monthlyWeekday || defaults.monthlyWeekday,
    yearlyMode: meta.yearlyMode || defaults.yearlyMode,
    yearlyMonth: meta.yearlyMonth || defaults.yearlyMonth,
    yearlyDay: meta.yearlyDay || defaults.yearlyDay,
    yearlyWeek: meta.yearlyWeek || defaults.yearlyWeek,
    yearlyWeekday: meta.yearlyWeekday || defaults.yearlyWeekday
  }
}

export const describeRecurrence = (ruleString, baseDateInput, meta) => {
  if (!ruleString && (!meta || meta.enabled === false)) {
    const defaults = createDefaultRecurrenceState(baseDateInput)
    return {
      state: defaults,
      summary: 'Does not repeat'
    }
  }

  if (meta) {
    const state = recurrenceStateFromMeta(meta, baseDateInput)
    const summary = meta.summary || formatRecurrenceSummary(state, baseDateInput)
    return { state, summary }
  }

  const state = parseRecurrenceRule(ruleString, baseDateInput)
  if (!state) {
    const defaults = createDefaultRecurrenceState(baseDateInput)
    return { state: defaults, summary: 'Does not repeat' }
  }

  return {
    state,
    summary: formatRecurrenceSummary(state, baseDateInput)
  }
}

const getNthWeekdayOfMonth = (year, monthIndex, weekdayCode, nth) => {
  if (!WEEKDAY_CODES.includes(weekdayCode)) return null
  if (nth === -1) {
    const lastDay = new Date(year, monthIndex + 1, 0)
    const offset = (lastDay.getDay() - WEEKDAY_CODES.indexOf(weekdayCode) + 7) % 7
    return new Date(year, monthIndex, lastDay.getDate() - offset)
  }
  const firstDay = new Date(year, monthIndex, 1)
  const offset = (WEEKDAY_CODES.indexOf(weekdayCode) - firstDay.getDay() + 7) % 7
  const day = 1 + offset + (nth - 1) * 7
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  if (day > lastDay) return null
  return new Date(year, monthIndex, day)
}

const normalizeRangeBoundary = (value, fallback) => {
  const date = ensureDate(value)
  return date || (fallback ? new Date(fallback.getTime()) : null)
}

const addOccurrenceIfValid = (occurrences, candidate, baseStart, rangeStart, hardEnd, durationMs, remainingCountRef, maxInstances) => {
  if (!candidate || Number.isNaN(candidate.getTime())) return false
  if (candidate <= baseStart) return false
  if (candidate < rangeStart || candidate > hardEnd) {
    return candidate > hardEnd
  }
  if (remainingCountRef.value <= 0 || occurrences.length >= maxInstances) {
    return true
  }
  occurrences.push(cloneOccurrence(candidate, durationMs))
  remainingCountRef.value -= 1
  return occurrences.length >= maxInstances
}

export const expandRecurrenceInstances = (event, recurrenceMeta, rangeStartInput, rangeEndInput, maxInstances = 200) => {
  const meta = recurrenceMeta || {}
  if (!meta.enabled) return []
  const baseStart = ensureDate(event?.start)
  const baseEnd = ensureDate(event?.end)
  if (!baseStart || !baseEnd) return []
  const rangeStart = normalizeRangeBoundary(rangeStartInput, baseStart)
  const rangeEnd = normalizeRangeBoundary(rangeEndInput, baseEnd)
  if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) return []
  const untilBoundary = meta.ends === 'until' && meta.endDate ? endOfDay(ensureDate(meta.endDate)) : null
  const hardRangeEnd = untilBoundary && untilBoundary < rangeEnd ? untilBoundary : rangeEnd
  if (hardRangeEnd <= baseStart) return []
  const durationMs = baseEnd.getTime() - baseStart.getTime()
  let remainingCount = meta.ends === 'count' ? Math.max(0, (parseInt(meta.count, 10) || 0) - 1) : Number.POSITIVE_INFINITY
  if (remainingCount <= 0) return []
  const interval = Math.max(1, Number(meta.interval) || 1)
  const occurrences = []
  const remainingRef = { value: remainingCount }

  const shouldStop = (candidate) => addOccurrenceIfValid(occurrences, candidate, baseStart, rangeStart, hardRangeEnd, durationMs, remainingRef, maxInstances)

  const frequency = meta.frequency || 'WEEKLY'

  if (frequency === 'DAILY') {
    let current = new Date(baseStart.getTime())
    while (current <= hardRangeEnd && remainingRef.value > 0 && occurrences.length < maxInstances) {
      current = addDays(current, interval)
      if (current > hardRangeEnd) break
      if (shouldStop(new Date(current.getTime()))) break
    }
    return occurrences
  }

  if (frequency === 'WEEKLY') {
    const days = inferDaysForFrequency(meta, baseStart)
    if (!days.length) return occurrences
    const baseWeekStart = startOfWeek(baseStart, { weekStartsOn: 0 })
    let weekCursor = new Date(baseWeekStart)
    let guard = 0
    while (weekCursor <= hardRangeEnd && remainingRef.value > 0 && occurrences.length < maxInstances && guard < 520) {
      const weeksFromStart = Math.round((weekCursor.getTime() - baseWeekStart.getTime()) / (7 * DAY_MS))
      if (weeksFromStart >= 0 && weeksFromStart % interval === 0) {
        for (const code of days) {
          const dayIndex = WEEKDAY_CODES.indexOf(code)
          if (dayIndex < 0) continue
          const candidate = new Date(weekCursor.getTime())
          candidate.setDate(candidate.getDate() + dayIndex)
          setTimeFromTemplate(candidate, baseStart)
          if (shouldStop(candidate)) break
        }
      }
      weekCursor = addWeeks(weekCursor, 1)
      guard += 1
    }
    return occurrences
  }

  if (frequency === 'MONTHLY') {
    let monthCursor = new Date(baseStart.getFullYear(), baseStart.getMonth(), 1)
    let guard = 0
    while (monthCursor <= hardRangeEnd && remainingRef.value > 0 && occurrences.length < maxInstances && guard < 240) {
      const monthsFromStart = (monthCursor.getFullYear() - baseStart.getFullYear()) * 12 + (monthCursor.getMonth() - baseStart.getMonth())
      if (monthsFromStart >= 0 && monthsFromStart % interval === 0) {
        let candidate = null
        if (meta.monthlyMode === 'weekday') {
          const nth = typeof meta.monthlyWeek === 'number' ? meta.monthlyWeek : getMonthlyWeek(baseStart)
          const weekday = meta.monthlyWeekday || WEEKDAY_CODES[baseStart.getDay()]
          candidate = getNthWeekdayOfMonth(monthCursor.getFullYear(), monthCursor.getMonth(), weekday, nth)
        } else {
          const targetDay = clampNumber(meta.monthlyDay, 1, 31, baseStart.getDate())
          candidate = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1)
          const lastDay = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate()
          candidate.setDate(Math.min(targetDay, lastDay))
        }
        if (candidate) {
          setTimeFromTemplate(candidate, baseStart)
          if (shouldStop(candidate)) break
        }
      }
      monthCursor = addMonths(monthCursor, 1)
      guard += 1
    }
    return occurrences
  }

  if (frequency === 'YEARLY') {
    let yearCursor = baseStart.getFullYear()
    let guard = 0
    while (true) {
      const yearDiff = yearCursor - baseStart.getFullYear()
      if (yearDiff < 0) {
        yearCursor += 1
        continue
      }
      if (yearDiff % interval === 0) {
        let candidate = null
        if (meta.yearlyMode === 'weekday') {
          const nth = typeof meta.yearlyWeek === 'number' ? meta.yearlyWeek : getMonthlyWeek(baseStart)
          const weekday = meta.yearlyWeekday || WEEKDAY_CODES[baseStart.getDay()]
          const monthIndex = clampNumber(meta.yearlyMonth, 1, 12, baseStart.getMonth() + 1) - 1
          candidate = getNthWeekdayOfMonth(yearCursor, monthIndex, weekday, nth)
        } else {
          const monthIndex = clampNumber(meta.yearlyMonth, 1, 12, baseStart.getMonth() + 1) - 1
          const day = clampNumber(meta.yearlyDay, 1, 31, baseStart.getDate())
          candidate = new Date(yearCursor, monthIndex, 1)
          const lastDay = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 0).getDate()
          candidate.setDate(Math.min(day, lastDay))
        }
        if (candidate) {
          setTimeFromTemplate(candidate, baseStart)
          const shouldBreak = shouldStop(candidate)
          if (shouldBreak) break
        }
      }
      yearCursor += 1
      guard += 1
      if (guard > 200 || yearCursor > hardRangeEnd.getFullYear() + 2 || remainingRef.value <= 0 || occurrences.length >= maxInstances) {
        break
      }
    }
    return occurrences
  }

  // Fallback: treat as daily
  let current = new Date(baseStart.getTime())
  while (current <= hardRangeEnd && remainingRef.value > 0 && occurrences.length < maxInstances) {
    current = addDays(current, interval)
    if (current > hardRangeEnd) break
    if (shouldStop(new Date(current.getTime()))) break
  }
  return occurrences
}
