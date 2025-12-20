import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import { format } from 'date-fns'
import { useCalendar } from '../../../context/CalendarContext/CalendarContext'
import { useAuth } from '../../../context/AuthContext'
import { buildRecurrencePayload } from '../../../lib/recurrence'
import { VIEWPORT_MARGIN, clearCalendarSnapshots, deriveVisibleRange } from './constants'
import { useModalPosition } from './useModalPosition'
import { useRecurrence } from './useRecurrence'
import { useEventForm } from './useEventForm'

export const useEventModal = (initialEvent = null) => {
  const [enterAnimationKey, setEnterAnimationKey] = useState(0)
  const calendarProps = useCalendar()
  const {
    closeEventModal: contextCloseEventModal, createEvent, updateEvent,
    respondToInvite, deleteEvent, view, currentDate, fetchEventsForRange, refreshEvents,
    toggleEventChecked, isEventChecked
  } = calendarProps
  const selectedEvent = initialEvent || calendarProps.selectedEvent
  const { user } = useAuth()

  const [internalVisible, setInternalVisible] = useState(false)
  const [expandedChips, setExpandedChips] = useState(new Set())
  const [participantEmail, setParticipantEmail] = useState('')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [colorPickerDropdownCoords, setColorPickerDropdownCoords] = useState({ top: 0, left: 0, placement: 'bottom' })
  const [showNotificationPicker, setShowNotificationPicker] = useState(false)
  const [notificationDropdownCoords, setNotificationDropdownCoords] = useState({ top: 0, left: 0, width: 200, placement: 'bottom' })
  const [showRecurringDeletePrompt, setShowRecurringDeletePrompt] = useState(false)
  const [deletePromptCoords, setDeletePromptCoords] = useState({ top: 0, left: 0 })
  const [showRecurringEditPrompt, setShowRecurringEditPrompt] = useState(false)
  const [recurringEditScope, setRecurringEditScope] = useState('single')
  const [pendingEventData, setPendingEventData] = useState(null)
  const [inviteResponseLoading, setInviteResponseLoading] = useState(false)
  const [optimisticRSVPStatus, setOptimisticRSVPStatus] = useState(null)
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const [descriptionOverflowing, setDescriptionOverflowing] = useState(false)

  const modalRef = useRef(null)
  const titleInputRef = useRef(null)
  const descriptionInputRef = useRef(null)
  const colorPickerDropdownRef = useRef(null)
  const colorPickerTriggerRef = useRef(null)
  const deleteButtonRef = useRef(null)
  const recurringEditPromptRef = useRef(null)
  const participantInputRef = useRef(null)
  const notificationPickerRef = useRef(null)
  const notificationTriggerRef = useRef(null)
  const deletePromptRef = useRef(null)

  const isHolidayEvent = useMemo(() => {
    if (!selectedEvent) return false
    const calendarId = selectedEvent.calendar_id || selectedEvent.calendarId
    const organizer = selectedEvent.organizerEmail || selectedEvent.organizer
    return Boolean(selectedEvent.isHoliday === true ||
      (typeof calendarId === 'string' && calendarId.toLowerCase().includes('holiday@')) ||
      (typeof organizer === 'string' && organizer.toLowerCase().includes('holiday@')))
  }, [selectedEvent])

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

  const recurrence = useRecurrence({ selectedEvent, buildDateWithTime, eventDate: format(new Date(), 'yyyy-MM-dd'), timeStart: '10:30' })

  const form = useEventForm({
    selectedEvent, user, isHolidayEvent,
    setRecurrenceState: recurrence.setRecurrenceState,
    setRecurrenceDraft: recurrence.setRecurrenceDraft,
    setRecurrenceSummary: recurrence.setRecurrenceSummary
  })

  const { modalPosition, updateModalPosition } = useModalPosition({ modalRef, view, selectedEvent, internalVisible })

  useLayoutEffect(() => {
    setEnterAnimationKey((key) => key + 1)
    setInternalVisible(true)
  }, [selectedEvent?.id])

  const eventIsChecked = useMemo(() => {
    if (!selectedEvent?.id || typeof isEventChecked !== 'function') return false
    return isEventChecked(selectedEvent.id)
  }, [selectedEvent?.id, isEventChecked])

  const visibleParticipants = useMemo(() => {
    if (!isHolidayEvent || !selectedEvent?.organizerEmail) return form.participants
    return form.participants.filter(p => p !== selectedEvent.organizerEmail)
  }, [isHolidayEvent, form.participants, selectedEvent?.organizerEmail])

  const normalizeResponseStatus = useCallback((value) => {
    if (!value) return null
    const lower = String(value).toLowerCase()
    if (['accepted', 'declined', 'tentative', 'needsaction'].includes(lower)) return lower === 'needsaction' ? 'needsAction' : lower
    return null
  }, [])

  const rawStatus = selectedEvent ? (optimisticRSVPStatus ?? selectedEvent.viewerResponseStatus) : null
  const currentRSVPStatus = normalizeResponseStatus(rawStatus)

  const isRecurringEvent = useMemo(() => {
    if (!selectedEvent) return false
    if (selectedEvent.recurringEventId || selectedEvent.parentRecurrenceId) return true
    if (selectedEvent.recurrenceMeta?.enabled) return true
    if (Array.isArray(selectedEvent.recurrence) && selectedEvent.recurrence.length > 0) return true
    if (selectedEvent.recurrenceRule && typeof selectedEvent.recurrenceRule === 'string' && selectedEvent.recurrenceRule.trim().length > 0) return true
    return false
  }, [selectedEvent])

  const closeAndAnimateOut = useCallback(() => {
    setInternalVisible(false)
    setTimeout(() => {
      window.prefilledEventDates = null
      window.lastCalendarAnchorRect = null
      window.lastClickedEvent = null
      window.lastClickedCalendarDay = null
      window.lastClickedEventId = null
      setExpandedChips(new Set())
      setParticipantEmail('')
      recurrence.setShowRecurrencePicker(false)
      contextCloseEventModal()
    }, 300)
  }, [contextCloseEventModal, recurrence])

  const handleInviteResponse = useCallback(async (status) => {
    if (!selectedEvent || inviteResponseLoading) return
    const currentStatus = optimisticRSVPStatus ?? selectedEvent.viewerResponseStatus
    if (currentStatus === status) return
    setOptimisticRSVPStatus(status)
    setInviteResponseLoading(true)
    closeAndAnimateOut()
    try { await respondToInvite(selectedEvent.id, status) }
    catch { setOptimisticRSVPStatus(null) }
    finally { setInviteResponseLoading(false) }
  }, [selectedEvent, inviteResponseLoading, respondToInvite, closeAndAnimateOut, optimisticRSVPStatus])

  const executeDelete = useCallback((scope = 'single') => {
    if (!selectedEvent) return
    deleteEvent({ ...selectedEvent, deleteScope: scope })
    setShowRecurringDeletePrompt(false)
    closeAndAnimateOut()
  }, [selectedEvent, deleteEvent, closeAndAnimateOut])

  const executeRecurringEdit = useCallback((scope) => {
    if (!pendingEventData || !selectedEvent) return
    const eventDataWithScope = { ...pendingEventData, recurringEditScope: scope }
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('chronos:month-range-reset'))
    const action = updateEvent(selectedEvent.id, eventDataWithScope)
    setShowRecurringEditPrompt(false)
    setPendingEventData(null)
    setRecurringEditScope('single')
    closeAndAnimateOut()
    action.then(() => {
      if (scope === 'future' || scope === 'all') {
        clearCalendarSnapshots()
        if (typeof refreshEvents === 'function') refreshEvents()
        else if (typeof fetchEventsForRange === 'function') {
          const range = deriveVisibleRange(currentDate, view)
          if (range?.start && range?.end) fetchEventsForRange(range.start, range.end, true, true).catch(() => { })
        }
      }
    }).catch((error) => console.error('Failed to save recurring event:', error))
      .finally(() => form.setConferenceRequestId(null))
  }, [pendingEventData, selectedEvent, updateEvent, closeAndAnimateOut, fetchEventsForRange, currentDate, view, refreshEvents, form])

  const handleDelete = useCallback(() => {
    if (!selectedEvent) return
    if (isRecurringEvent) {
      if (deleteButtonRef.current && modalRef.current) {
        const rect = deleteButtonRef.current.getBoundingClientRect()
        const modalRect = modalRef.current.getBoundingClientRect()
        setDeletePromptCoords({ top: rect.bottom + 8, left: modalRect.left })
      }
      setShowRecurringDeletePrompt(true)
      return
    }
    executeDelete('single')
  }, [selectedEvent, isRecurringEvent, executeDelete])

  const handleAddParticipant = useCallback(() => {
    const email = participantEmail.trim()
    if (email && email.includes('@') && !form.participants.includes(email)) {
      form.setParticipants([...form.participants, email])
      setParticipantEmail('')
      setExpandedChips(new Set())
      form.setShowNotifyMembers(true)
    }
  }, [participantEmail, form])

  const handleRemoveParticipant = useCallback((email) => {
    form.setParticipants(form.participants.filter(p => p !== email))
    setExpandedChips(prev => { const next = new Set(prev); next.delete(email); return next })
  }, [form])

  const toggleChip = useCallback((email) => {
    setExpandedChips(prev => { const next = new Set(prev); if (next.has(email)) next.delete(email); else next.add(email); return next })
  }, [])

  const handleAddNotification = useCallback((minutes) => {
    if (minutes === null) form.setNotifications([])
    else {
      const exists = form.notifications.find(n => n.minutes === minutes)
      if (exists) form.setNotifications(form.notifications.filter(n => n.minutes !== minutes))
      else form.setNotifications([...form.notifications, { method: 'popup', minutes }])
    }
  }, [form])

  const handleRemoveNotification = useCallback((minutes) => {
    form.setNotifications(form.notifications.filter(n => n.minutes !== minutes))
  }, [form])

  const updateColorPickerDropdownPosition = useCallback(() => {
    if (!colorPickerTriggerRef.current) return
    const rect = colorPickerTriggerRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth || 0
    const viewportHeight = window.innerHeight || 0
    const scrollX = window.scrollX || 0
    const scrollY = window.scrollY || 0
    const dropdownWidth = 192
    const dropdownHeight = 176
    const desiredTop = rect.top + scrollY - 8
    const fitsAbove = rect.top - dropdownHeight > VIEWPORT_MARGIN * 2
    const fitsBelow = rect.bottom + dropdownHeight < viewportHeight - VIEWPORT_MARGIN * 2
    const placement = fitsAbove || !fitsBelow ? 'top' : 'bottom'
    const top = placement === 'top'
      ? desiredTop
      : rect.bottom + scrollY + 8

    const anchorCenterX = rect.left + rect.width / 2 + scrollX
    let left = anchorCenterX - dropdownWidth / 2
    const minLeft = VIEWPORT_MARGIN
    const maxLeft = Math.max(minLeft, viewportWidth - dropdownWidth - VIEWPORT_MARGIN)
    left = Math.min(Math.max(left, minLeft), maxLeft)

    setColorPickerDropdownCoords({ top, left, placement })
  }, [])

  const updateNotificationDropdownPosition = useCallback(() => {
    if (!notificationTriggerRef.current) return
    const rect = notificationTriggerRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth || 0
    const viewportHeight = window.innerHeight || 0
    const scrollX = window.scrollX || 0
    const scrollY = window.scrollY || 0
    const width = Math.max(220, rect.width + 40)
    const dropdownHeight = 320
    const desiredTop = rect.top + scrollY - 4
    const fitsAbove = rect.top - dropdownHeight > VIEWPORT_MARGIN * 2
    const fitsBelow = rect.bottom + dropdownHeight < viewportHeight - VIEWPORT_MARGIN * 2
    const placement = fitsAbove || !fitsBelow ? 'top' : 'bottom'
    const top = placement === 'top'
      ? desiredTop
      : rect.bottom + scrollY + 4

    const anchorCenterX = rect.left + rect.width / 2 + scrollX
    let left = anchorCenterX - width / 2
    const minLeft = VIEWPORT_MARGIN
    const maxLeft = Math.max(minLeft, viewportWidth - width - VIEWPORT_MARGIN)
    left = Math.min(Math.max(left, minLeft), maxLeft)

    setNotificationDropdownCoords({ top, left, width, placement })
  }, [])

  const handleSubmit = useCallback((e) => {
    if (e) e.preventDefault()
    if (selectedEvent && isRecurringEvent && !pendingEventData) {
      let finalStartDateTime, finalEndDateTime
      if (form.isAllDay) {
        finalStartDateTime = form.buildDateWithTime(form.eventDate, '00:00') || new Date()
        finalStartDateTime.setHours(0, 0, 0, 0)
        const rawEnd = form.buildDateWithTime(form.eventEndDate || form.eventDate, '00:00') || new Date(finalStartDateTime)
        rawEnd.setHours(0, 0, 0, 0)
        if (rawEnd < finalStartDateTime) { form.setTimeError('End date must be after start date'); return }
        finalEndDateTime = new Date(rawEnd.getTime())
        finalEndDateTime.setDate(finalEndDateTime.getDate() + 1)
      } else {
        finalStartDateTime = form.buildDateWithTime(form.eventDate, form.timeStart) || new Date()
        finalEndDateTime = form.buildDateWithTime(form.eventEndDate || form.eventDate, form.timeEnd)
        if (!finalEndDateTime || finalEndDateTime <= finalStartDateTime) { form.setTimeError('End time must be after start time'); return }
      }
      const eventData = {
        title: form.eventName.trim() === '' ? (selectedEvent ? selectedEvent.title : 'New Event') : form.eventName,
        start: finalStartDateTime, end: finalEndDateTime, color: form.color, isAllDay: form.isAllDay,
        location: form.location, description: form.eventSubtitle.trim(), participants: form.participants,
        sendNotifications: form.showNotifyMembers && form.participants.length > 0,
        reminders: form.notifications.length > 0 ? { useDefault: false, overrides: form.notifications } : { useDefault: false, overrides: [] },
        transparency: form.showAsBusy ? 'opaque' : 'transparent', visibility: form.isPrivateEvent ? 'private' : 'public'
      }
      const recurrencePayload = buildRecurrencePayload(recurrence.recurrenceState, finalStartDateTime)
      if (recurrencePayload) {
        eventData.recurrence = [recurrencePayload.rule]
        eventData.recurrenceRule = recurrencePayload.rule
        eventData.recurrenceSummary = recurrencePayload.summary
        eventData.recurrenceMeta = recurrencePayload.meta
      } else {
        eventData.recurrence = []
        eventData.recurrenceRule = ''
        eventData.recurrenceSummary = 'Does not repeat'
        eventData.recurrenceMeta = { enabled: false }
      }
      setPendingEventData(eventData)
      setShowRecurringEditPrompt(true)
      return
    }
    let finalStartDateTime, finalEndDateTime
    if (form.isAllDay) {
      finalStartDateTime = form.buildDateWithTime(form.eventDate, '00:00') || new Date()
      finalStartDateTime.setHours(0, 0, 0, 0)
      const rawEnd = form.buildDateWithTime(form.eventEndDate || form.eventDate, '00:00') || new Date(finalStartDateTime)
      rawEnd.setHours(0, 0, 0, 0)
      if (rawEnd < finalStartDateTime) { form.setTimeError('End date must be after start date'); return }
      finalEndDateTime = new Date(rawEnd.getTime())
      finalEndDateTime.setDate(finalEndDateTime.getDate() + 1)
    } else {
      finalStartDateTime = form.buildDateWithTime(form.eventDate, form.timeStart) || new Date()
      finalEndDateTime = form.buildDateWithTime(form.eventEndDate || form.eventDate, form.timeEnd)
      if (!finalEndDateTime || finalEndDateTime <= finalStartDateTime) { form.setTimeError('End time must be after start time'); return }
    }
    const eventData = {
      title: form.eventName.trim() === '' ? (selectedEvent ? selectedEvent.title : 'New Event') : form.eventName,
      start: finalStartDateTime, end: finalEndDateTime, color: form.color, isAllDay: form.isAllDay,
      location: form.location, description: form.eventSubtitle.trim(), participants: form.participants,
      sendNotifications: form.showNotifyMembers && form.participants.length > 0,
      reminders: form.notifications.length > 0 ? { useDefault: false, overrides: form.notifications } : { useDefault: false, overrides: [] },
      transparency: form.showAsBusy ? 'opaque' : 'transparent', visibility: form.isPrivateEvent ? 'private' : 'public'
    }
    const isGoogleMeetLink = form.location?.includes('meet.google.com')
    if (form.conferenceRequestId && !isGoogleMeetLink && !form.tempEventId) {
      eventData.conferenceData = { createRequest: { requestId: form.conferenceRequestId } }
    }
    const recurrencePayload = buildRecurrencePayload(recurrence.recurrenceState, finalStartDateTime)
    if (recurrencePayload) {
      eventData.recurrence = [recurrencePayload.rule]
      eventData.recurrenceRule = recurrencePayload.rule
      eventData.recurrenceSummary = recurrencePayload.summary
      eventData.recurrenceMeta = recurrencePayload.meta
    } else {
      eventData.recurrence = []
      eventData.recurrenceRule = ''
      eventData.recurrenceSummary = 'Does not repeat'
      eventData.recurrenceMeta = { enabled: false }
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('chronos:month-range-reset'))
    let action
    if (form.tempEventId && !selectedEvent) {
      action = updateEvent(form.tempEventId, eventData)
      form.setTempEventId(null)
    } else if (selectedEvent) {
      action = updateEvent(selectedEvent.id, eventData)
      if (form.tempEventId) form.cleanupTemporaryEvent()
    } else {
      action = createEvent(eventData)
      if (form.tempEventId) form.cleanupTemporaryEvent()
    }
    closeAndAnimateOut()
    action.catch((error) => console.error('Failed to save event:', error)).finally(() => form.setConferenceRequestId(null))
  }, [selectedEvent, isRecurringEvent, pendingEventData, form, recurrence, updateEvent, createEvent, closeAndAnimateOut])

  useEffect(() => {
    if (typeof window === 'undefined' || !selectedEvent?.id) return undefined
    const eventId = selectedEvent.id
    return () => {
      window.dispatchEvent(new CustomEvent('chronos:event-color-preview-clear', { detail: { eventId } }))
    }
  }, [selectedEvent?.id])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!selectedEvent?.id) return
    const eventId = selectedEvent.id
    const baseColor = selectedEvent.color || 'blue'
    if (!form.color || form.color === baseColor) {
      window.dispatchEvent(new CustomEvent('chronos:event-color-preview-clear', { detail: { eventId } }))
      return
    }
    window.dispatchEvent(new CustomEvent('chronos:event-color-preview', { detail: { eventId, color: form.color } }))
  }, [form.color, selectedEvent?.id, selectedEvent?.color])

  return {
    selectedEvent, user, view, currentDate,
    internalVisible, setInternalVisible,
    expandedChips, setExpandedChips,
    participantEmail, setParticipantEmail,
    showColorPicker, setShowColorPicker, colorPickerDropdownCoords,
    showNotificationPicker, setShowNotificationPicker, notificationDropdownCoords,
    showRecurringDeletePrompt, setShowRecurringDeletePrompt, deletePromptCoords,
    showRecurringEditPrompt, setShowRecurringEditPrompt, recurringEditScope, setRecurringEditScope,
    pendingEventData, setPendingEventData,
    isDescriptionExpanded, setIsDescriptionExpanded, descriptionOverflowing, setDescriptionOverflowing,
    modalRef, titleInputRef, descriptionInputRef, colorPickerDropdownRef, colorPickerTriggerRef,
    deleteButtonRef, recurringEditPromptRef, participantInputRef, notificationPickerRef, notificationTriggerRef, deletePromptRef,
    isHolidayEvent, recurrence, form, modalPosition, updateModalPosition,
    eventIsChecked, visibleParticipants, currentRSVPStatus, isRecurringEvent, enterAnimationKey,
    closeAndAnimateOut, handleInviteResponse, executeDelete, executeRecurringEdit, handleDelete,
    handleAddParticipant, handleRemoveParticipant, toggleChip, handleAddNotification, handleRemoveNotification,
    updateColorPickerDropdownPosition, updateNotificationDropdownPosition, handleSubmit,
    toggleEventChecked
  }
}
