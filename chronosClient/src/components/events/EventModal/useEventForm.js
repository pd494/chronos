import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { format } from 'date-fns'
import { calendarApi } from '../../../lib/api'
import {
  DEFAULT_TIMED_START, DEFAULT_TIMED_END, timeToMinutes, minutesToTime,
  getEventNotificationOverrides, generateConferenceRequestId
} from './constants'
import {
  cloneRecurrenceState, createDefaultRecurrenceState, describeRecurrence
} from '../../../lib/recurrence'
import { useSettings } from '../../../context/SettingsContext'

export const useEventForm = ({ selectedEvent, user, isHolidayEvent, setRecurrenceState, setRecurrenceDraft, setRecurrenceSummary }) => {
  const { settings } = useSettings()
  const [eventName, setEventName] = useState('')
  const [eventSubtitle, setEventSubtitle] = useState('')
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [eventEndDate, setEventEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [timeStart, setTimeStart] = useState(DEFAULT_TIMED_START)
  const [timeEnd, setTimeEnd] = useState(DEFAULT_TIMED_END)
  const [color, setColor] = useState('blue')
  const [isAllDay, setIsAllDay] = useState(true)
  const [location, setLocation] = useState('')
  const [participants, setParticipants] = useState([])
  const [notifications, setNotifications] = useState([])
  const [showAsBusy, setShowAsBusy] = useState(true)
  const [isPrivateEvent, setIsPrivateEvent] = useState(false)
  const [showNotifyMembers, setShowNotifyMembers] = useState(false)
  const [timeError, setTimeError] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [isFromDayClick, setIsFromDayClick] = useState(false)
  const [conferenceRequestId, setConferenceRequestId] = useState(null)
  const [tempEventId, setTempEventId] = useState(null)
  const [isGeneratingMeeting, setIsGeneratingMeeting] = useState(false)

  const lastTimedRangeRef = useRef({ start: DEFAULT_TIMED_START, end: DEFAULT_TIMED_END })
  const initialValuesRef = useRef({})
  const tempEventIdRef = useRef(null)

  useEffect(() => { tempEventIdRef.current = tempEventId }, [tempEventId])

  const buildDateWithTime = useCallback((dateStr, timeStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null
    const [year, month, day] = dateStr.split('-').map(Number)
    if ([year, month, day].some(num => Number.isNaN(num))) return null
    const base = new Date(year, month - 1, day, 0, 0, 0, 0)
    if (Number.isNaN(base.getTime())) return null
    if (timeStr && typeof timeStr === 'string' && timeStr.includes(':')) {
      const [hour, minute] = timeStr.split(':').map(Number)
      if (!Number.isNaN(hour) && !Number.isNaN(minute)) base.setHours(hour, minute, 0, 0)
    }
    return base
  }, [])

  const cleanupTemporaryEvent = useCallback(async (eventId = tempEventIdRef.current) => {
    if (!eventId) return
    const accountEmail = settings?.default_calendar_account_email || null
    try { await calendarApi.deleteEvent(eventId, 'primary', accountEmail) } catch (err) { console.error('Failed to delete temporary event:', err) }
    finally {
      setTempEventId(current => (current === eventId ? null : current))
      if (tempEventIdRef.current === eventId) tempEventIdRef.current = null
    }
  }, [settings?.default_calendar_account_email])

  const ensureTimedMode = useCallback(() => {
    if (!isAllDay) return
    const fallbackStart = lastTimedRangeRef.current.start || DEFAULT_TIMED_START
    const fallbackEnd = lastTimedRangeRef.current.end || DEFAULT_TIMED_END
    setIsAllDay(false)
    setTimeStart(fallbackStart)
    setTimeEnd(fallbackEnd)
  }, [isAllDay])

  const handleAllDayToggle = useCallback((checked) => {
    if (checked) {
      if (!isAllDay) lastTimedRangeRef.current = { start: timeStart || DEFAULT_TIMED_START, end: timeEnd || DEFAULT_TIMED_END }
      setIsAllDay(true)
      setTimeStart('00:00')
      setTimeEnd('23:59')
      setTimeError('')
    } else {
      ensureTimedMode()
    }
  }, [ensureTimedMode, isAllDay, timeStart, timeEnd])

  const handleTimeStartChange = useCallback((value) => {
    if (isAllDay) ensureTimedMode()
    const nextValue = value || DEFAULT_TIMED_START
    setTimeStart(nextValue)
    const startMinutes = timeToMinutes(nextValue)
    const endMinutes = timeToMinutes(timeEnd)
    if (endMinutes <= startMinutes) {
      const bumped = minutesToTime(startMinutes + 30)
      setTimeEnd(bumped)
      lastTimedRangeRef.current = { start: nextValue, end: bumped }
      return
    }
    lastTimedRangeRef.current = { ...lastTimedRangeRef.current, start: nextValue }
  }, [ensureTimedMode, isAllDay, timeEnd])

  const handleTimeEndChange = useCallback((value) => {
    if (isAllDay) ensureTimedMode()
    const nextValue = value || DEFAULT_TIMED_END
    const startMinutes = timeToMinutes(timeStart)
    let endMinutes = timeToMinutes(nextValue)
    if (endMinutes <= startMinutes) endMinutes = startMinutes + 30
    const safeEnd = minutesToTime(endMinutes)
    setTimeEnd(safeEnd)
    lastTimedRangeRef.current = { ...lastTimedRangeRef.current, end: safeEnd }
  }, [ensureTimedMode, isAllDay, timeStart])

  const handleGenerateMeetingLink = useCallback(async () => {
    setIsGeneratingMeeting(true)
    setLocation('Generating Google Meet link…')
    try {
      if (tempEventId) await cleanupTemporaryEvent()
      let startDate, endDate
      if (isAllDay) {
        startDate = buildDateWithTime(eventDate, '00:00') || new Date()
        endDate = buildDateWithTime(eventEndDate || eventDate, '00:00') || new Date()
        endDate.setDate(endDate.getDate() + 1)
      } else {
        startDate = buildDateWithTime(eventDate, timeStart) || new Date()
        endDate = buildDateWithTime(eventEndDate || eventDate, timeEnd) || new Date(startDate.getTime() + 60 * 60 * 1000)
      }
      const requestId = generateConferenceRequestId()
      const userTimezone = settings?.use_device_timezone !== false && !settings?.timezone
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : (settings?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone)
      const tempEventData = {
        title: eventName?.trim() || selectedEvent?.title || 'New Event',
        start: startDate, end: endDate, isAllDay,
        timezone: userTimezone,
        conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
      }
      const response = await calendarApi.createEvent(tempEventData, 'primary', false)
      const createdEvent = response.event || response
      let meetLink = ''
      if (createdEvent.hangoutLink) meetLink = createdEvent.hangoutLink
      else if (createdEvent.conferenceData?.hangoutLink) meetLink = createdEvent.conferenceData.hangoutLink
      else if (createdEvent.conferenceData?.entryPoints) {
        const videoEntry = createdEvent.conferenceData.entryPoints.find(ep => ep.entryPointType === 'video' && ep.uri)
        if (videoEntry?.uri) meetLink = videoEntry.uri
      }
      if (meetLink) {
        setLocation(meetLink)
        setTempEventId(createdEvent.id)
        setConferenceRequestId(null)
      } else {
        setLocation('Failed to generate meeting link')
      }
    } catch (error) {
      console.error('Error generating meeting link:', error)
      setLocation('Failed to generate meeting link. Please try again.')
    } finally {
      setIsGeneratingMeeting(false)
    }
  }, [tempEventId, cleanupTemporaryEvent, isAllDay, eventDate, eventEndDate, timeStart, timeEnd, eventName, selectedEvent, buildDateWithTime, settings])

  const initializeForm = useCallback(() => {
    let initialEventName = 'New Event'
    let initialEventDate = format(new Date(), 'yyyy-MM-dd')
    let initialEventEndDate = initialEventDate
    let initialTimeStart = '00:00'
    let initialTimeEnd = '23:59'
    let timedFallbackStart = DEFAULT_TIMED_START
    let timedFallbackEnd = DEFAULT_TIMED_END
    let initialColor = 'blue'
    let initialIsAllDay = true
    let initialLocation = ''
    let initialSubtitle = ''

    if (selectedEvent) {
      const start = new Date(selectedEvent.start)
      const end = new Date(selectedEvent.end)
      initialEventName = selectedEvent.title || ''
      initialEventDate = format(start, 'yyyy-MM-dd')
      if (selectedEvent.isAllDay) {
        const inclusiveEnd = new Date(end)
        inclusiveEnd.setDate(inclusiveEnd.getDate() - 1)
        initialEventEndDate = format(inclusiveEnd, 'yyyy-MM-dd')
      } else {
        initialEventEndDate = format(end, 'yyyy-MM-dd')
      }
      initialTimeStart = format(start, 'HH:mm')
      initialTimeEnd = format(end, 'HH:mm')
      timedFallbackStart = initialTimeStart
      timedFallbackEnd = initialTimeEnd
      initialColor = selectedEvent.color || 'blue'
      initialIsAllDay = selectedEvent.isAllDay || false
      initialLocation = selectedEvent.location || ''
      initialSubtitle = selectedEvent.description || ''
    } else if (window.prefilledEventDates) {
      const { startDate: dragStartDate, endDate: dragEndDate, title: dragTitle, color: dragColor, isAllDay: dragIsAllDay, fromDayClick } = window.prefilledEventDates
      const startDateObj = dragStartDate instanceof Date ? dragStartDate : new Date(dragStartDate)
      const endDateObj = dragEndDate instanceof Date ? dragEndDate : new Date(dragEndDate)
      initialEventName = dragTitle || ''
      initialEventDate = format(startDateObj, 'yyyy-MM-dd')
      initialColor = dragColor || 'blue'
      const derivedAllDay = typeof dragIsAllDay === 'boolean' ? dragIsAllDay : true
      initialIsAllDay = derivedAllDay
      if (derivedAllDay) {
        const inclusiveEnd = new Date(endDateObj)
        inclusiveEnd.setDate(inclusiveEnd.getDate() - 1)
        initialEventEndDate = format(inclusiveEnd, 'yyyy-MM-dd')
        initialTimeStart = '00:00'
        initialTimeEnd = '23:59'
      } else {
        initialEventEndDate = format(endDateObj, 'yyyy-MM-dd')
        initialTimeStart = format(startDateObj, 'HH:mm')
        initialTimeEnd = format(endDateObj, 'HH:mm')
        timedFallbackStart = initialTimeStart
        timedFallbackEnd = initialTimeEnd
      }
      setIsFromDayClick(!!fromDayClick)
    } else {
      const wantsAllDay = settings?.default_new_event_is_all_day !== false
      initialIsAllDay = wantsAllDay

      if (settings?.default_event_color) {
        initialColor = settings.default_event_color
      }

      if (!wantsAllDay) {
        const rawStart = String(settings?.default_event_start_time || timedFallbackStart || DEFAULT_TIMED_START)
        const m = rawStart.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
        timedFallbackStart = m ? `${m[1]}:${m[2]}` : (timedFallbackStart || DEFAULT_TIMED_START)
        initialTimeStart = timedFallbackStart

        const defaultMinutesRaw = Number(settings?.default_event_duration) || 60
        const defaultMinutes = Math.max(30, Math.min(360, defaultMinutesRaw))
        const startMinutes = timeToMinutes(timedFallbackStart)
        const endMinutes = startMinutes + defaultMinutes
        timedFallbackEnd = minutesToTime(endMinutes)
        initialTimeEnd = timedFallbackEnd
      }
    }

    const recurrenceAnchor = (() => {
      if (selectedEvent?.start) {
        const existing = new Date(selectedEvent.start)
        if (!Number.isNaN(existing.getTime())) return existing
      }
      return buildDateWithTime(initialEventDate, initialTimeStart) || new Date()
    })()
    const recurrenceDetails = selectedEvent
      ? describeRecurrence(selectedEvent.recurrenceRule, recurrenceAnchor, selectedEvent.recurrenceMeta)
      : { state: createDefaultRecurrenceState(recurrenceAnchor), summary: 'Does not repeat' }

    setEventName(initialEventName)
    setEventSubtitle(initialSubtitle)
    setEventDate(initialEventDate)
    setEventEndDate(initialEventEndDate)
    setColor(initialColor)
    setIsAllDay(initialIsAllDay)
    if (initialIsAllDay) { setTimeStart('00:00'); setTimeEnd('23:59') }
    else { setTimeStart(initialTimeStart); setTimeEnd(initialTimeEnd) }
    lastTimedRangeRef.current = { start: timedFallbackStart, end: timedFallbackEnd }
    setLocation(initialLocation)
    setConferenceRequestId(null)
    cleanupTemporaryEvent()
    setIsGeneratingMeeting(false)
    setEventSubtitle(initialSubtitle)
    if (setRecurrenceState) setRecurrenceState(cloneRecurrenceState(recurrenceDetails.state))
    if (setRecurrenceDraft) setRecurrenceDraft(cloneRecurrenceState(recurrenceDetails.state))
    if (setRecurrenceSummary) setRecurrenceSummary(recurrenceDetails.summary)
    const initialBusyState = selectedEvent ? selectedEvent.transparency !== 'transparent' : true
    const initialPrivacyState = selectedEvent ? selectedEvent.visibility === 'private' : false
    setShowAsBusy(initialBusyState)
    setIsPrivateEvent(initialPrivacyState)

    let initialNotifications = getEventNotificationOverrides(selectedEvent)
    if (!selectedEvent && settings?.default_alert_minutes !== undefined && settings.default_alert_minutes !== null) {
      initialNotifications = [{ method: 'popup', minutes: settings.default_alert_minutes }]
    }
    setNotifications(initialNotifications)

    let initialParticipants = selectedEvent?.participants || []
    if (isHolidayEvent) {
      initialParticipants = initialParticipants.filter(p => p !== selectedEvent?.organizerEmail)
    } else if (selectedEvent?.organizerEmail === user?.email) {
      initialParticipants = initialParticipants.filter(p => p !== user.email)
    } else {
      if (selectedEvent?.organizerEmail && !initialParticipants.includes(selectedEvent.organizerEmail) && selectedEvent.organizerEmail !== user?.email) {
        initialParticipants = [selectedEvent.organizerEmail, ...initialParticipants]
      }
    }

    initialValuesRef.current = {
      eventName: initialEventName, eventDate: initialEventDate, eventEndDate: initialEventEndDate,
      timeStart: initialIsAllDay ? '00:00' : initialTimeStart, timeEnd: initialIsAllDay ? '23:59' : initialTimeEnd,
      color: initialColor, isAllDay: initialIsAllDay, location: initialLocation, eventSubtitle: initialSubtitle,
      participants: initialParticipants, recurrenceRule: selectedEvent?.recurrenceRule || '',
      notifications: initialNotifications, showAsBusy: initialBusyState, isPrivateEvent: initialPrivacyState
    }
    setHasChanges(false)
    setParticipants(initialParticipants)
  }, [selectedEvent, cleanupTemporaryEvent, isHolidayEvent, user?.email, buildDateWithTime, setRecurrenceState, setRecurrenceDraft, setRecurrenceSummary, settings?.default_event_color, settings?.default_event_duration])

  useEffect(() => { initializeForm() }, [initializeForm])

  useEffect(() => {
    if (!eventDate || !eventEndDate) return
    const start = new Date(eventDate)
    const end = new Date(eventEndDate)
    if (end < start) setEventEndDate(eventDate)
  }, [eventDate, eventEndDate])

  useEffect(() => {
    const initial = initialValuesRef.current
    if (!initial) return

    const arraysEqual = (a = [], b = []) => {
      if (!Array.isArray(a) || !Array.isArray(b)) return false
      if (a.length !== b.length) return false
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false
      }
      return true
    }

    const normalizeNotifications = (list = []) => {
      if (!Array.isArray(list)) return []
      return list
        .map((n) => (typeof n === 'object' && n !== null ? n.minutes : null))
        .filter((n) => n !== null && n !== undefined)
        .sort((a, b) => a - b)
    }

    const notificationChanged = (() => {
      const initialMinutes = normalizeNotifications(initial.notifications || [])
      const currentMinutes = normalizeNotifications(notifications || [])
      if (initialMinutes.length !== currentMinutes.length) return true
      return initialMinutes.some((val, idx) => val !== currentMinutes[idx])
    })()

    const hasChanged =
      eventName !== initial.eventName ||
      eventSubtitle !== initial.eventSubtitle ||
      eventDate !== initial.eventDate ||
      eventEndDate !== initial.eventEndDate ||
      timeStart !== initial.timeStart ||
      timeEnd !== initial.timeEnd ||
      color !== initial.color ||
      isAllDay !== initial.isAllDay ||
      location !== initial.location ||
      showAsBusy !== initial.showAsBusy ||
      isPrivateEvent !== initial.isPrivateEvent ||
      notificationChanged ||
      !arraysEqual(participants, initial.participants || [])

    setHasChanges(hasChanged)
  }, [
    eventName,
    eventSubtitle,
    eventDate,
    eventEndDate,
    timeStart,
    timeEnd,
    color,
    isAllDay,
    location,
    participants,
    notifications,
    showAsBusy,
    isPrivateEvent
  ])

  return {
    eventName, setEventName, eventSubtitle, setEventSubtitle,
    eventDate, setEventDate, eventEndDate, setEventEndDate,
    timeStart, setTimeStart, timeEnd, setTimeEnd,
    color, setColor, isAllDay, setIsAllDay,
    location, setLocation, participants, setParticipants,
    notifications, setNotifications, showAsBusy, setShowAsBusy,
    isPrivateEvent, setIsPrivateEvent, showNotifyMembers, setShowNotifyMembers,
    timeError, setTimeError, hasChanges, setHasChanges, isFromDayClick,
    conferenceRequestId, setConferenceRequestId, tempEventId, setTempEventId,
    isGeneratingMeeting, lastTimedRangeRef, initialValuesRef,
    buildDateWithTime, cleanupTemporaryEvent, ensureTimedMode,
    handleAllDayToggle, handleTimeStartChange, handleTimeEndChange, handleGenerateMeetingLink
  }
}
