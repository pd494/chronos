import { useState, useCallback, useEffect, useRef } from 'react'
import {
  buildRecurrencePayload,
  cloneRecurrenceState,
  createDefaultRecurrenceState,
  describeRecurrence,
  formatRecurrenceSummary,
  WEEKDAY_CODES
} from '../../../lib/recurrence'

export const useRecurrence = ({ selectedEvent, buildDateWithTime, eventDate, timeStart }) => {
  const [showRecurrencePicker, setShowRecurrencePicker] = useState(false)
  const [recurrenceViewMode, setRecurrenceViewMode] = useState('shortcuts')
  const [recurrenceState, setRecurrenceState] = useState(() => createDefaultRecurrenceState(new Date()))
  const [recurrenceDraft, setRecurrenceDraft] = useState(() => createDefaultRecurrenceState(new Date()))
  const [recurrenceSummary, setRecurrenceSummary] = useState('Does not repeat')
  const [recurrenceConfirmationVisible, setRecurrenceConfirmationVisible] = useState(false)
  const [recurrenceDropdownPlacement, setRecurrenceDropdownPlacement] = useState('bottom')
  const [recurrenceDropdownMaxHeight, setRecurrenceDropdownMaxHeight] = useState(360)
  const [recurrenceDropdownCoords, setRecurrenceDropdownCoords] = useState({ top: 0, left: 0, width: 280 })
  const recurrencePickerRef = useRef(null)
  const recurrenceTriggerRef = useRef(null)
  const recurrenceConfirmationTimerRef = useRef(null)

  const recurrenceAnchorDate = useCallback(() => {
    return buildDateWithTime(eventDate, timeStart) || new Date()
  }, [buildDateWithTime, eventDate, timeStart])

  const computeRecurrenceDropdownPlacement = useCallback(() => {
    if (typeof window === 'undefined') return
    const triggerEl = recurrenceTriggerRef.current
    if (!triggerEl) {
      setRecurrenceDropdownPlacement('bottom')
      setRecurrenceDropdownMaxHeight(360)
      return
    }
    const rect = triggerEl.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth
    const margin = 16
    const spaceAbove = rect.top - margin
    const spaceBelow = viewportHeight - rect.bottom - margin
    const preferredHeight = 360
    const maxDropdownWidth = Math.min(300, Math.max(220, viewportWidth - margin * 2))
    const centeredLeft = rect.left + rect.width / 2 - maxDropdownWidth / 2
    const constrainedLeft = Math.min(Math.max(margin, centeredLeft), viewportWidth - margin - maxDropdownWidth)

    if (spaceBelow >= preferredHeight || spaceBelow >= spaceAbove) {
      setRecurrenceDropdownPlacement('bottom')
      setRecurrenceDropdownMaxHeight(Math.min(400, Math.max(240, spaceBelow)))
      setRecurrenceDropdownCoords({ top: rect.bottom + 6, left: constrainedLeft, width: maxDropdownWidth })
    } else {
      setRecurrenceDropdownPlacement('top')
      setRecurrenceDropdownMaxHeight(Math.min(400, Math.max(240, spaceAbove)))
      setRecurrenceDropdownCoords({ top: rect.top - 6, left: constrainedLeft, width: maxDropdownWidth })
    }
  }, [])

  const triggerRecurrenceConfirmation = useCallback(() => {
    if (recurrenceConfirmationTimerRef.current) clearTimeout(recurrenceConfirmationTimerRef.current)
    setRecurrenceConfirmationVisible(true)
    recurrenceConfirmationTimerRef.current = setTimeout(() => {
      setRecurrenceConfirmationVisible(false)
      recurrenceConfirmationTimerRef.current = null
    }, 2000)
  }, [])

  const conciseRecurrenceSummary = useCallback((state) => {
    if (!state?.enabled) return 'Does not repeat'
    switch (state.frequency) {
      case 'DAILY': return 'Daily'
      case 'WEEKLY': return 'Weekly'
      case 'MONTHLY': return 'Monthly'
      case 'YEARLY': return 'Yearly'
      default: return 'Custom'
    }
  }, [])

  const buildPresetRecurrenceState = useCallback((preset) => {
    const anchor = recurrenceAnchorDate()
    const base = createDefaultRecurrenceState(anchor)
    const weekday = WEEKDAY_CODES[anchor.getDay()]
    if (preset === 'none') { base.enabled = false; return base }
    base.enabled = true
    switch (preset) {
      case 'daily': base.frequency = 'DAILY'; base.interval = 1; break
      case 'weekly': base.frequency = 'WEEKLY'; base.interval = 1; base.daysOfWeek = [weekday]; break
      case 'monthly': base.frequency = 'MONTHLY'; base.interval = 1; base.monthlyMode = 'day'; base.monthlyDay = anchor.getDate(); break
      case 'yearly': base.frequency = 'YEARLY'; base.interval = 1; base.yearlyMode = 'date'; base.yearlyMonth = anchor.getMonth() + 1; base.yearlyDay = anchor.getDate(); break
      default: break
    }
    return base
  }, [recurrenceAnchorDate])

  const handleRecurrenceShortcutSelect = useCallback((optionId) => {
    if (optionId === 'custom') {
      setRecurrenceDraft(cloneRecurrenceState(recurrenceState))
      setRecurrenceViewMode('custom')
      return
    }
    const nextState = buildPresetRecurrenceState(optionId)
    setRecurrenceState(cloneRecurrenceState(nextState))
    setRecurrenceDraft(cloneRecurrenceState(nextState))
    setRecurrenceSummary(formatRecurrenceSummary(nextState, recurrenceAnchorDate()))
    setShowRecurrencePicker(false)
    triggerRecurrenceConfirmation()
  }, [buildPresetRecurrenceState, recurrenceAnchorDate, recurrenceState, triggerRecurrenceConfirmation])

  const handleToggleRecurrencePicker = useCallback(() => {
    if (showRecurrencePicker) {
      setRecurrenceDraft(cloneRecurrenceState(recurrenceState))
      setShowRecurrencePicker(false)
      return
    }
    const draft = cloneRecurrenceState(recurrenceState)
    if (!draft.enabled) draft.enabled = true
    setRecurrenceDraft(draft)
    setRecurrenceViewMode('shortcuts')
    computeRecurrenceDropdownPlacement()
    setShowRecurrencePicker(true)
  }, [showRecurrencePicker, recurrenceState, computeRecurrenceDropdownPlacement])

  const handleClearRecurrence = useCallback(() => {
    const cleared = createDefaultRecurrenceState(recurrenceAnchorDate())
    setRecurrenceState(cloneRecurrenceState(cleared))
    setRecurrenceDraft(cloneRecurrenceState(cleared))
    setRecurrenceSummary('Does not repeat')
    setShowRecurrencePicker(false)
    triggerRecurrenceConfirmation()
  }, [recurrenceAnchorDate, triggerRecurrenceConfirmation])

  const updateRecurrenceDraft = useCallback((updates = {}, { forceEnable = true } = {}) => {
    setRecurrenceDraft((prev) => ({ ...prev, ...updates, enabled: forceEnable ? true : prev.enabled }))
  }, [])

  const toggleRecurrenceDay = useCallback((dayCode) => {
    setRecurrenceDraft((prev) => {
      let nextDays = prev.daysOfWeek.includes(dayCode)
        ? prev.daysOfWeek.filter((code) => code !== dayCode)
        : [...prev.daysOfWeek, dayCode]
      if (!nextDays.length) nextDays = [dayCode]
      return { ...prev, daysOfWeek: nextDays, enabled: true }
    })
  }, [])

  const handleApplyRecurrence = useCallback(() => {
    setRecurrenceState(cloneRecurrenceState(recurrenceDraft))
    setRecurrenceSummary(formatRecurrenceSummary(recurrenceDraft, recurrenceAnchorDate()))
    setShowRecurrencePicker(false)
    triggerRecurrenceConfirmation()
  }, [recurrenceDraft, recurrenceAnchorDate, triggerRecurrenceConfirmation])

  const handleCancelRecurrenceEdit = useCallback(() => {
    setRecurrenceDraft(cloneRecurrenceState(recurrenceState))
    setRecurrenceViewMode('shortcuts')
    setShowRecurrencePicker(false)
  }, [recurrenceState])

  useEffect(() => {
    setRecurrenceSummary(conciseRecurrenceSummary(recurrenceState))
  }, [recurrenceState, conciseRecurrenceSummary])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (recurrencePickerRef.current && recurrencePickerRef.current.contains(event.target)) return
      setShowRecurrencePicker(false)
      setRecurrenceViewMode('shortcuts')
    }
    if (showRecurrencePicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showRecurrencePicker])

  useEffect(() => {
    if (!showRecurrencePicker) return
    computeRecurrenceDropdownPlacement()
    const handleResize = () => computeRecurrenceDropdownPlacement()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [showRecurrencePicker, computeRecurrenceDropdownPlacement])

  useEffect(() => {
    if (!showRecurrencePicker) setRecurrenceViewMode('shortcuts')
  }, [showRecurrencePicker])

  useEffect(() => {
    return () => {
      if (recurrenceConfirmationTimerRef.current) {
        clearTimeout(recurrenceConfirmationTimerRef.current)
        recurrenceConfirmationTimerRef.current = null
      }
    }
  }, [])

  return {
    showRecurrencePicker, setShowRecurrencePicker,
    recurrenceViewMode, setRecurrenceViewMode,
    recurrenceState, setRecurrenceState,
    recurrenceDraft, setRecurrenceDraft,
    recurrenceSummary, setRecurrenceSummary,
    recurrenceConfirmationVisible,
    recurrenceDropdownPlacement, recurrenceDropdownMaxHeight, recurrenceDropdownCoords,
    recurrencePickerRef, recurrenceTriggerRef,
    recurrenceAnchorDate,
    handleRecurrenceShortcutSelect, handleToggleRecurrencePicker, handleClearRecurrence,
    updateRecurrenceDraft, toggleRecurrenceDay, handleApplyRecurrence, handleCancelRecurrenceEdit
  }
}
