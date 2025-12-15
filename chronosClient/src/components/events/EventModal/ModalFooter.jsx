import { FiChevronDown, FiLock, FiUnlock } from 'react-icons/fi'
import { getColorHex, RSVP_OPTIONS } from './constants'

const ModalFooter = ({
  color, setShowColorPicker, showColorPicker,
  colorPickerTriggerRef, notificationTriggerRef,
  notifications, setShowNotificationPicker,
  showAsBusy, setShowAsBusy,
  isPrivateEvent, setIsPrivateEvent,
  selectedEvent, user,
  currentRSVPStatus, showNotifyMembers, setShowNotifyMembers,
  handleInviteResponse,
  handleDelete, deleteButtonRef,
  visibleParticipants,
  isReadOnly = false
}) => {
  return (
    <div className="z-20 bg-white border-t border-gray-100 px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="relative" ref={colorPickerTriggerRef}>
          <button
            type="button"
            onClick={() => !isReadOnly && setShowColorPicker(!showColorPicker)}
            disabled={isReadOnly}
            className={`pl-1 pr-2 py-2 transition-colors ${isReadOnly ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
            title="Change color"
          >
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getColorHex(color) }} />
          </button>
        </div>
        <button type="button" onClick={() => !isReadOnly && setShowNotificationPicker(prev => !prev)} disabled={isReadOnly} className={`px-2 py-2 text-gray-500 transition-colors ${isReadOnly ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`} title="Add notification" ref={notificationTriggerRef}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {notifications.length > 0 && <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">{notifications.length}</div>}
        </button>
        <button type="button" onClick={() => !isReadOnly && setShowAsBusy(prev => !prev)} disabled={isReadOnly} className={`flex items-center gap-1 px-3 py-1 text-sm font-normal text-gray-700 transition-colors ${isReadOnly ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`} title={showAsBusy ? 'Show as busy' : 'Show as free'} style={{ minWidth: 64 }}>
          <span className={`w-2 h-2 rounded-full ${showAsBusy ? 'bg-red-500' : 'bg-green-500'}`} />
          <span>{showAsBusy ? 'Busy' : 'Free'}</span>
        </button>
        <button type="button" onClick={() => !isReadOnly && setIsPrivateEvent(prev => !prev)} disabled={isReadOnly} className={`p-2 transition-colors ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''} ${isPrivateEvent ? 'text-gray-900' : 'text-gray-500 hover:text-gray-600'}`} aria-pressed={isPrivateEvent} title={isPrivateEvent ? 'Private event' : 'Public event'}>
          {isPrivateEvent ? <FiLock size={16} /> : <FiUnlock size={16} />}
        </button>
        <div className="flex-1"></div>
        {selectedEvent?.inviteCanRespond && selectedEvent?.organizerEmail !== user?.email && (
          <div className="relative">
            <button type="button" onClick={() => setShowNotifyMembers(prev => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm shrink-0 transition-colors ${currentRSVPStatus === 'accepted' ? 'text-green-700' : currentRSVPStatus === 'declined' ? 'text-red-600' : 'text-gray-600'
                }`}>
              <div className={`w-2 h-2 rounded-full ${currentRSVPStatus === 'accepted' ? 'bg-green-500' : currentRSVPStatus === 'declined' ? 'bg-red-500' : 'bg-gray-400'}`}></div>
              <span className="whitespace-nowrap">{currentRSVPStatus === 'accepted' ? 'Going' : currentRSVPStatus === 'declined' ? 'Not going' : 'Maybe'}</span>
              <FiChevronDown size={14} />
            </button>
            {showNotifyMembers && (
              <div className="absolute bottom-full right-0 mb-2 z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px]">
                {RSVP_OPTIONS.map((option) => (
                  <button key={option.value} type="button" onClick={() => { handleInviteResponse(option.value); setShowNotifyMembers(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${currentRSVPStatus === option.value ? 'font-semibold' : ''}`}>
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {selectedEvent && (
          <button type="button" onClick={handleDelete} className="px-3 py-1 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors" ref={deleteButtonRef}>
            Delete event
          </button>
        )}
      </div>
      {!isReadOnly && visibleParticipants.length > 0 && !selectedEvent?.inviteCanRespond && (
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={showNotifyMembers} onChange={(e) => setShowNotifyMembers(e.target.checked)} className="h-3 w-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
          <span>Notify members</span>
        </div>
      )}
    </div>
  )
}

export default ModalFooter
