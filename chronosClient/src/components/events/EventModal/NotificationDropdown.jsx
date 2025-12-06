import { createPortal } from 'react-dom'
import { FiCheck } from 'react-icons/fi'
import { NOTIFICATION_OPTIONS, formatNotificationLabel } from './constants'

const NotificationDropdown = ({
  notificationPickerRef,
  notificationDropdownCoords,
  notifications,
  handleAddNotification,
  handleRemoveNotification
}) => {
  return createPortal(
    <div
      className="fixed z-[1100]"
      style={{
        top: notificationDropdownCoords.top,
        left: notificationDropdownCoords.left,
        transform: notificationDropdownCoords.placement === 'top' ? 'translateY(-100%)' : 'none'
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        ref={notificationPickerRef}
        className="bg-white border border-gray-200 rounded-2xl shadow-xl p-3 space-y-3 modal-fade-in"
        style={{
          width: notificationDropdownCoords.width,
          maxHeight: 360,
          overflowY: 'auto'
        }}
      >
        <div>
          <p className="text-xs font-medium text-gray-500">Reminders</p>
        </div>
        <div className="space-y-1">
          {NOTIFICATION_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={(e) => { e.stopPropagation(); handleAddNotification(option.minutes) }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span>{option.label}</span>
              {(option.minutes === null ? notifications.length === 0 : notifications.some((note) => note.minutes === option.minutes)) && (
                <FiCheck className="text-green-600" />
              )}
            </button>
          ))}
        </div>
        {notifications.length > 0 && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 mb-2">Active</p>
            <div className="space-y-1">
              {notifications.slice().sort((a, b) => a.minutes - b.minutes).map((notification) => (
                <div key={notification.minutes} className="flex items-center justify-between px-3 py-2 text-sm rounded-lg bg-gray-50">
                  <span>{formatNotificationLabel(notification.minutes)}</span>
                  <button type="button" onClick={() => handleRemoveNotification(notification.minutes)} className="text-xs text-gray-500 hover:text-gray-700">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default NotificationDropdown
