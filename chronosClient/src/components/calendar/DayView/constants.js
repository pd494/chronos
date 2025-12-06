export const HOUR_HEIGHT = 55
export const TIME_FOCUS_RATIO = 0.6
export const DAY_START_HOUR = 0
export const DAY_END_HOUR = 23
export const ALL_DAY_SECTION_HEIGHT = 40
export const ALL_DAY_EVENT_HEIGHT = 30
export const ALL_DAY_EVENT_GAP = 4
export const TIMED_EVENT_GAP = 4
export const SNAP_INTERVAL_MINUTES = 15
export const MAX_SNAP_MINUTES = (DAY_END_HOUR * 60) + SNAP_INTERVAL_MINUTES
export const DRAG_DISTANCE_THRESHOLD = 0.08

export const clampSnapMinutes = (minutes) => Math.max(0, Math.min(minutes, MAX_SNAP_MINUTES))

export const snapMinutesToLatestHalfHour = (totalMinutes) => {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return 0
  return clampSnapMinutes(Math.round(totalMinutes / SNAP_INTERVAL_MINUTES) * SNAP_INTERVAL_MINUTES)
}

export const snapHourValue = (hourValue) => {
  if (hourValue == null) return null
  const totalMinutes = Math.max(0, hourValue) * 60
  return snapMinutesToLatestHalfHour(totalMinutes) / 60
}

export const snapHourMinutePair = (hour, minutes = 0) => {
  const snappedMinutes = snapMinutesToLatestHalfHour((hour * 60) + minutes)
  const snappedHour = Math.floor(snappedMinutes / 60)
  const snappedMinute = snappedMinutes % 60
  return { hour: snappedHour, minutes: snappedMinute }
}

export const buildHourlyRange = (day, hour) => {
  const start = new Date(day)
  start.setHours(hour, 0, 0, 0)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return { start, end }
}

export const generateHours = () => {
  const hours = []
  for (let i = DAY_START_HOUR; i <= DAY_END_HOUR; i++) {
    hours.push(i)
  }
  return hours
}

export const isAllDayEvent = (event) => {
  if (event.isAllDay) return true
  if (event.start.getHours() === 0 && event.start.getMinutes() === 0 && 
      event.end.getHours() === 23 && event.end.getMinutes() === 59) {
    return true
  }
  const durationMs = event.end - event.start
  const durationHours = durationMs / (1000 * 60 * 60)
  if (durationHours >= 23) return true
  return false
}

export const cleanupDragArtifacts = () => {
  try {
    document.body.classList.remove('calendar-drag-focus');
    ['.sortable-ghost', '.task-ghost', '.sortable-drag', '.task-drag', '[data-is-clone="true"]'].forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (!el.closest('.task-list')) {
          el.parentNode?.removeChild(el)
        }
      })
    })
  } catch (_) {}
}
