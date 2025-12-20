import { useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { FiX, FiUsers, FiClock, FiCalendar, FiChevronDown, FiCheck, FiRepeat } from 'react-icons/fi'
import { DEFAULT_MODAL_DIMENSIONS, DESCRIPTION_LINE_HEIGHT, MAX_DESCRIPTION_PREVIEW_HEIGHT, getColorHex, getLightColorHex } from './constants'
import { useEventModal } from './useEventModal'
import ParticipantChips from './ParticipantChips'
import LocationSection from './LocationSection'
import RecurrenceDropdown from './RecurrenceDropdown'
import ColorPickerDropdown from './ColorPickerDropdown'
import NotificationDropdown from './NotificationDropdown'
import RecurringEditPrompt from './RecurringEditPrompt'
import RecurringDeletePrompt from './RecurringDeletePrompt'
import ModalFooter from './ModalFooter'

const EventModal = ({ event: propEvent = null, renderInline = false, readOnly: propReadOnly = false }) => {
  const modal = useEventModal(propEvent)
  const {
    selectedEvent, user, internalVisible,
    expandedChips, participantEmail, setParticipantEmail,
    showColorPicker, setShowColorPicker, colorPickerDropdownCoords,
    showNotificationPicker, setShowNotificationPicker, notificationDropdownCoords,
    showRecurringDeletePrompt, setShowRecurringDeletePrompt, deletePromptCoords,
    showRecurringEditPrompt, setShowRecurringEditPrompt, recurringEditScope, setRecurringEditScope,
    pendingEventData, setPendingEventData,
    isDescriptionExpanded, setIsDescriptionExpanded, descriptionOverflowing, setDescriptionOverflowing,
    modalRef, titleInputRef, descriptionInputRef, colorPickerDropdownRef, colorPickerTriggerRef,
    deleteButtonRef, recurringEditPromptRef, notificationPickerRef, notificationTriggerRef, deletePromptRef,
    recurrence, form, modalPosition, updateModalPosition,
    eventIsChecked, visibleParticipants, currentRSVPStatus, enterAnimationKey,
    closeAndAnimateOut, handleInviteResponse, executeDelete, executeRecurringEdit, handleDelete,
    handleAddParticipant, handleRemoveParticipant, toggleChip, handleAddNotification, handleRemoveNotification,
    updateColorPickerDropdownPosition, updateNotificationDropdownPosition, handleSubmit, toggleEventChecked
  } = modal

  useEffect(() => {
    if (!internalVisible || renderInline) return
    const timer = setTimeout(() => {
      if (titleInputRef.current) {
        titleInputRef.current.focus()
        if (!selectedEvent) titleInputRef.current.select()
      }
    }, 50)
    return () => clearTimeout(timer)
  }, [internalVisible, selectedEvent, titleInputRef, renderInline])
  useEffect(() => { setIsDescriptionExpanded(false) }, [selectedEvent?.id, setIsDescriptionExpanded])

  useLayoutEffect(() => {
    const textarea = descriptionInputRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const fullHeight = textarea.scrollHeight
    const canExpand = fullHeight > MAX_DESCRIPTION_PREVIEW_HEIGHT + 4
    setDescriptionOverflowing(canExpand)
    if (isDescriptionExpanded) { textarea.style.overflowY = 'auto'; textarea.style.height = `${fullHeight}px` }
    else { textarea.style.overflowY = 'hidden'; textarea.style.height = `${Math.min(fullHeight, MAX_DESCRIPTION_PREVIEW_HEIGHT)}px` }
    if (!canExpand && isDescriptionExpanded) setIsDescriptionExpanded(false)
  }, [form.eventSubtitle, isDescriptionExpanded, setDescriptionOverflowing, setIsDescriptionExpanded, descriptionInputRef])

  useEffect(() => { if (internalVisible && !renderInline) updateModalPosition() }, [isDescriptionExpanded, internalVisible, updateModalPosition, renderInline])

  useEffect(() => {
    if (renderInline) return
    const handleClickOutside = (event) => {
      if (event.target.closest('[data-event-id]') || event.target.closest('.event-draggable') || event.target.closest('.event-indicator')) return
      if (deletePromptRef.current?.contains(event.target)) return
      if (colorPickerDropdownRef.current?.contains(event.target)) return
      if (colorPickerTriggerRef.current?.contains(event.target)) return
      if (notificationPickerRef.current?.contains(event.target)) return
      if (notificationTriggerRef.current?.contains(event.target)) return
      if (recurrence.recurrencePickerRef.current?.contains(event.target)) return
      if (recurringEditPromptRef.current?.contains(event.target)) return
      if (modalRef.current && !modalRef.current.contains(event.target)) { event.stopPropagation(); event.preventDefault(); closeAndAnimateOut() }
    }
    document.addEventListener('mousedown', handleClickOutside, true)
    return () => document.removeEventListener('mousedown', handleClickOutside, true)
  }, [closeAndAnimateOut, colorPickerDropdownRef, colorPickerTriggerRef, deletePromptRef, modalRef, recurrence.recurrencePickerRef, recurringEditPromptRef, renderInline])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') { closeAndAnimateOut(); return }
      if (!internalVisible) return
      e.stopPropagation()
      const isTyping = ['input', 'textarea'].includes(e.target?.tagName?.toLowerCase()) || e.target?.isContentEditable
      if (selectedEvent && !isTyping && e.key.toLowerCase() === 'd') { toggleEventChecked(selectedEvent.id); return }
      if (selectedEvent && (e.key === 'Backspace' || e.key === 'Delete') && (e.ctrlKey || e.metaKey)) handleDelete()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedEvent, closeAndAnimateOut, handleDelete, internalVisible, toggleEventChecked])

  useEffect(() => {
    if (!showColorPicker) return
    updateColorPickerDropdownPosition()
    const handleClickOutside = (e) => { if (!colorPickerTriggerRef.current?.contains(e.target) && !colorPickerDropdownRef.current?.contains(e.target)) setShowColorPicker(false) }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('resize', updateColorPickerDropdownPosition)
    window.addEventListener('scroll', updateColorPickerDropdownPosition, true)
    return () => { document.removeEventListener('mousedown', handleClickOutside); window.removeEventListener('resize', updateColorPickerDropdownPosition); window.removeEventListener('scroll', updateColorPickerDropdownPosition, true) }
  }, [showColorPicker, updateColorPickerDropdownPosition, colorPickerTriggerRef, colorPickerDropdownRef, setShowColorPicker])

  useEffect(() => {
    if (!showNotificationPicker) return
    updateNotificationDropdownPosition()
    const handleClickOutside = (e) => { requestAnimationFrame(() => { if (!notificationTriggerRef.current?.contains(e.target) && !notificationPickerRef.current?.contains(e.target)) setShowNotificationPicker(false) }) }
    window.addEventListener('resize', updateNotificationDropdownPosition)
    window.addEventListener('scroll', updateNotificationDropdownPosition, true)
    document.addEventListener('click', handleClickOutside, true)
    return () => { window.removeEventListener('resize', updateNotificationDropdownPosition); window.removeEventListener('scroll', updateNotificationDropdownPosition, true); document.removeEventListener('click', handleClickOutside, true) }
  }, [showNotificationPicker, updateNotificationDropdownPosition, notificationTriggerRef, notificationPickerRef, setShowNotificationPicker])

  useEffect(() => {
    if (!showRecurringDeletePrompt) return
    const handleClick = (e) => { if (!deleteButtonRef.current?.contains(e.target) && !deletePromptRef.current?.contains(e.target)) setShowRecurringDeletePrompt(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showRecurringDeletePrompt, deleteButtonRef, deletePromptRef, setShowRecurringDeletePrompt])

  useEffect(() => () => { form.cleanupTemporaryEvent() }, [form])

  const isReadOnly = propReadOnly || selectedEvent?.viewerIsOrganizer === false
  const hasDescription = !!form.eventSubtitle?.trim()
  const shouldShowDescriptionField = !isReadOnly || hasDescription

  const content = (
    <>
      <div key={enterAnimationKey} ref={modalRef}
        className={`${renderInline ? 'relative w-full' : 'fixed shadow-xl'} transition-[opacity,transform] duration-[300ms] ease-[cubic-bezier(.215,.61,.355,1)] ${internalVisible ? 'opacity-100 scale-100 modal-fade-in' : 'opacity-0 scale-95 pointer-events-none'}`}
        style={{
          backgroundColor: 'white',
          top: renderInline ? undefined : (modalPosition.top ?? 0),
          left: renderInline ? undefined : (modalPosition.left ?? 0),
          width: renderInline ? '100%' : (modalPosition.width ?? DEFAULT_MODAL_DIMENSIONS.width),
          border: '1px solid #e5e7eb',
          borderRadius: '22px',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: renderInline ? undefined : 'calc(100vh - 24px)',
          overflowY: 'auto',
          zIndex: renderInline ? 1 : 4000
        }}>
        <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !(e.target instanceof HTMLInputElement && e.target.type === 'email')) { e.preventDefault(); handleSubmit() } }} className="flex flex-col">
          <div className="space-y-0">
            {!renderInline && (
              <button type="button" onClick={closeAndAnimateOut} className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors z-10"><FiX size={20} /></button>
            )}
            <div
              className={`px-4 pt-[14px] ${shouldShowDescriptionField && descriptionOverflowing ? 'pb-2' : 'pb-0'}`}
              style={{ paddingBottom: !shouldShowDescriptionField ? '5px' : undefined }}
            >
              <div className="flex items-start gap-3">
                {selectedEvent?.id && (
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleEventChecked?.(selectedEvent.id) }}
                    className={`w-[20px] h-[20px] flex items-center justify-center border-2 rounded-[6px] transition-colors mt-[8px] ${eventIsChecked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-transparent'}`}>
                    <FiCheck size={14} />
                  </button>
                )}
                <div className="flex-1">
                  <input ref={titleInputRef} type="text" value={form.eventName} onChange={(e) => !isReadOnly && form.setEventName(e.target.value)} placeholder="New event"
                    readOnly={isReadOnly} className={`w-full px-0 py-1 text-xl font-semibold text-gray-900 border-none focus:outline-none focus:ring-0 placeholder-gray-400 bg-transparent ${isReadOnly ? 'cursor-default' : ''}`} />
                  {shouldShowDescriptionField && (
                    <textarea
                      ref={descriptionInputRef}
                      value={form.eventSubtitle}
                      onChange={(e) => !isReadOnly && form.setEventSubtitle(e.target.value)}
                      placeholder={isReadOnly ? '' : 'Add description'}
                      readOnly={isReadOnly}
                      className={`w-full px-0 text-sm text-gray-500 border-none focus:outline-none focus:ring-0 resize-none bg-transparent ${isReadOnly ? 'cursor-default' : ''}`}
                      rows={1}
                      style={{
                        minHeight: descriptionOverflowing ? '32px' : '0px',
                        lineHeight: `${DESCRIPTION_LINE_HEIGHT}px`,
                        pointerEvents: (!isDescriptionExpanded && descriptionOverflowing) ? 'none' : 'auto'
                      }}
                    />
                  )}
                  {shouldShowDescriptionField && descriptionOverflowing && (
                    <div className="pb-2 pt-0" style={{ marginTop: '-15px' }}>
                      <button type="button" onClick={() => setIsDescriptionExpanded(p => !p)} className="text-xs font-medium text-blue-600 hover:text-blue-700">{isDescriptionExpanded ? 'See less' : 'See more'}</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="border-b border-gray-100" />
            <div className="px-4 py-2.5 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <FiUsers className="text-gray-400 mt-1" size={20} />
                  <div className="flex-1 space-y-2.5">
                    {isReadOnly && visibleParticipants.length === 0 ? (
                      <div className="py-1 text-sm text-gray-400 cursor-default">Participants</div>
                    ) : (
                      <input type="email" value={participantEmail} onChange={(e) => !isReadOnly && setParticipantEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !isReadOnly) { e.preventDefault(); handleAddParticipant() } }}
                        placeholder={isReadOnly ? 'Participants' : 'Add guests'} readOnly={isReadOnly} className={`w-full px-0 py-1 text-sm text-gray-900 bg-transparent border-none focus:outline-none focus:ring-0 ${isReadOnly ? 'cursor-default' : ''}`} />
                    )}
                    {visibleParticipants.length > 0 && <ParticipantChips visibleParticipants={visibleParticipants} selectedEvent={selectedEvent} user={user} expandedChips={expandedChips} toggleChip={toggleChip} handleRemoveParticipant={isReadOnly ? () => { } : handleRemoveParticipant} />}
                  </div>
                </div>
                {!isReadOnly && (
                  <button type="submit" disabled={(selectedEvent && !form.hasChanges) || (!!form.timeError && !form.isAllDay)}
                    className={`px-4 py-1.5 text-sm rounded-md font-medium whitespace-nowrap self-start ${(selectedEvent && !form.hasChanges) || (!!form.timeError && !form.isAllDay) ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                    {selectedEvent ? 'Update event' : 'Create event'}
                  </button>
                )}
              </div>
            </div>
            <LocationSection location={form.location} setLocation={form.setLocation} isGeneratingMeeting={form.isGeneratingMeeting} tempEventId={form.tempEventId}
              handleGenerateMeetingLink={form.handleGenerateMeetingLink} cleanupTemporaryEvent={form.cleanupTemporaryEvent} setConferenceRequestId={form.setConferenceRequestId} isReadOnly={isReadOnly} />
            <div className="px-4 py-2.5 border-b border-gray-100">
              <div className="flex items-start gap-[9px]">
                <div className="flex flex-col gap-3 pt-0.5"><FiClock className="text-gray-400" size={20} /><FiCalendar className="text-gray-400" size={20} /></div>
                <div className="flex-1 space-y-0">
                  <div className="space-y-2">
                    {!form.isAllDay ? (
                      <div className="flex items-center gap-2 text-sm text-gray-900">
                        <input type="time" value={form.timeStart} onChange={(e) => !isReadOnly && form.handleTimeStartChange(e.target.value)} readOnly={isReadOnly} className={`px-0 py-0.5 border-none focus:outline-none text-sm font-bold [&::-webkit-calendar-picker-indicator]:hidden bg-transparent ${isReadOnly ? 'cursor-default pointer-events-none' : ''}`} style={{ width: '95px' }} />
                        <span className="flex justify-center w-6 -ml-[10.7px] text-gray-400 font-semibold">→</span>
                        <input type="time" value={form.timeEnd} onChange={(e) => !isReadOnly && form.handleTimeEndChange(e.target.value)} readOnly={isReadOnly} className={`px-0 border-none focus:outline-none text-sm font-bold [&::-webkit-calendar-picker-indicator]:hidden bg-transparent ${isReadOnly ? 'cursor-default pointer-events-none' : ''}`} style={{ width: '95px' }} />
                        <label className={`relative inline-flex items-center ml-auto ${isReadOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                          <input type="checkbox" checked={form.isAllDay} onChange={(e) => !isReadOnly && form.handleAllDayToggle(e.target.checked)} disabled={isReadOnly} className="sr-only peer" />
                          <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                          <span className="ml-2 text-xs text-gray-600">All day</span>
                        </label>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-gray-900">
                        <span className="text-gray-500">All day</span>
                        <label className={`relative inline-flex items-center ml-auto ${isReadOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                          <input type="checkbox" checked={form.isAllDay} onChange={(e) => !isReadOnly && form.handleAllDayToggle(e.target.checked)} disabled={isReadOnly} className="sr-only peer" />
                          <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                          <span className="ml-2 text-xs text-gray-600">All day</span>
                        </label>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-900">
                    <input type="date" value={form.eventDate} onChange={(e) => { if (isReadOnly) return; form.setEventDate(e.target.value); if (form.eventEndDate && new Date(form.eventEndDate) < new Date(e.target.value)) form.setEventEndDate(e.target.value) }}
                      readOnly={isReadOnly} className={`border-none focus:outline-none text-sm [&::-webkit-calendar-picker-indicator]:hidden bg-transparent ${isReadOnly ? 'cursor-default pointer-events-none' : ''}`} style={{ width: '85px', paddingTop: '8px' }} />
                    <span className="flex justify-center w-6 mt-[6px] -ml-[1px] text-gray-400 font-semibold">→</span>
                    <input type="date" value={form.eventEndDate} min={form.eventDate} onChange={(e) => !isReadOnly && form.setEventEndDate(new Date(e.target.value) < new Date(form.eventDate) ? form.eventDate : e.target.value)}
                      readOnly={isReadOnly} className={`border-none focus:outline-none text-sm [&::-webkit-calendar-picker-indicator]:hidden bg-transparent ${isReadOnly ? 'cursor-default pointer-events-none' : ''}`} style={{ width: '85px', paddingTop: '8px' }} />
                    <button type="button" onClick={() => !isReadOnly && recurrence.handleToggleRecurrencePicker()} ref={recurrence.recurrenceTriggerRef} disabled={isReadOnly} className={`flex items-center gap-2 text-xs ml-auto ${isReadOnly ? 'text-gray-400 cursor-not-allowed' : 'text-gray-600 hover:text-gray-800'}`}>
                      <FiRepeat size={14} /><span className={`text-sm ${recurrence.recurrenceState.enabled ? 'text-gray-900' : 'text-gray-500'}`}>{recurrence.recurrenceSummary}</span>{!isReadOnly && <FiChevronDown size={14} />}
                    </button>
                  </div>
                </div>
              </div>
              {recurrence.showRecurrencePicker && <RecurrenceDropdown recurrencePickerRef={recurrence.recurrencePickerRef} recurrenceViewMode={recurrence.recurrenceViewMode} setRecurrenceViewMode={recurrence.setRecurrenceViewMode}
                recurrenceDraft={recurrence.recurrenceDraft} recurrenceSummary={recurrence.recurrenceSummary} recurrenceDropdownPlacement={recurrence.recurrenceDropdownPlacement} recurrenceDropdownCoords={recurrence.recurrenceDropdownCoords}
                recurrenceDropdownMaxHeight={recurrence.recurrenceDropdownMaxHeight} recurrenceAnchorDate={recurrence.recurrenceAnchorDate} handleRecurrenceShortcutSelect={recurrence.handleRecurrenceShortcutSelect}
                handleClearRecurrence={recurrence.handleClearRecurrence} handleApplyRecurrence={recurrence.handleApplyRecurrence} updateRecurrenceDraft={recurrence.updateRecurrenceDraft} toggleRecurrenceDay={recurrence.toggleRecurrenceDay} />}
            </div>
            <ModalFooter color={form.color} setShowColorPicker={setShowColorPicker} showColorPicker={showColorPicker} colorPickerTriggerRef={colorPickerTriggerRef} notificationTriggerRef={notificationTriggerRef}
              notifications={form.notifications} setShowNotificationPicker={setShowNotificationPicker} showAsBusy={form.showAsBusy} setShowAsBusy={form.setShowAsBusy} isPrivateEvent={form.isPrivateEvent} setIsPrivateEvent={form.setIsPrivateEvent}
              selectedEvent={selectedEvent} user={user} currentRSVPStatus={currentRSVPStatus} showNotifyMembers={form.showNotifyMembers} setShowNotifyMembers={form.setShowNotifyMembers}
              handleInviteResponse={handleInviteResponse} handleDelete={handleDelete} deleteButtonRef={deleteButtonRef} visibleParticipants={visibleParticipants} isReadOnly={isReadOnly} renderInline={renderInline} />
          </div>
        </form>
      </div>
      {showColorPicker && <ColorPickerDropdown colorPickerDropdownRef={colorPickerDropdownRef} colorPickerDropdownCoords={colorPickerDropdownCoords} color={form.color} setColor={form.setColor} setShowColorPicker={setShowColorPicker} />}
      {showNotificationPicker && <NotificationDropdown notificationPickerRef={notificationPickerRef} notificationDropdownCoords={notificationDropdownCoords} notifications={form.notifications} handleAddNotification={handleAddNotification} handleRemoveNotification={handleRemoveNotification} />}
      {showRecurringEditPrompt && <RecurringEditPrompt recurringEditPromptRef={recurringEditPromptRef} recurringEditScope={recurringEditScope} setRecurringEditScope={setRecurringEditScope} setShowRecurringEditPrompt={setShowRecurringEditPrompt} setPendingEventData={setPendingEventData} executeRecurringEdit={executeRecurringEdit} />}
      {showRecurringDeletePrompt && <RecurringDeletePrompt deletePromptRef={deletePromptRef} deletePromptCoords={deletePromptCoords} executeDelete={executeDelete} setShowRecurringDeletePrompt={setShowRecurringDeletePrompt} />}
    </>
  )

  if (renderInline) return content
  return createPortal(content, document.body)
}

export default EventModal
