import React from 'react'

const SettingRow = ({ label, description, children }) => {
  return (
    <div
      className="flex items-start justify-between py-3 border-b border-gray-100 last:border-b-0"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}
    >
      <div className="flex-1 pr-4">
        <div className="text-[13px] font-medium text-gray-900 mb-0.5">{label}</div>
        {description && (
          <div className="text-[12px] text-gray-500">{description}</div>
        )}
      </div>
      <div className="flex-shrink-0">
        {children}
      </div>
    </div>
  )
}

export default SettingRow


