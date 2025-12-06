import { createPortal } from 'react-dom'

const RecurringDeletePrompt = ({
  deletePromptRef,
  deletePromptCoords,
  executeDelete,
  setShowRecurringDeletePrompt
}) => {
  return createPortal(
    <div
      className="fixed z-[1200] bg-white border border-gray-200 rounded-2xl shadow-xl p-3 space-y-3 modal-fade-in"
      style={{ top: deletePromptCoords.top, left: deletePromptCoords.left, width: 280 }}
      ref={deletePromptRef}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div>
        <p className="text-sm font-semibold text-gray-900">Delete recurring event?</p>
        <p className="text-xs text-gray-500 mt-0.5">Remove only this event or the entire series.</p>
      </div>
      <div className="space-y-2 text-sm">
        <button type="button" onClick={() => executeDelete('single')}
          className="w-full px-3 py-2 text-left rounded-lg border border-gray-200 hover:bg-gray-50">
          Delete this event
        </button>
        <button type="button" onClick={() => executeDelete('series')}
          className="w-full px-3 py-2 text-left rounded-lg text-white"
          style={{ backgroundColor: 'rgb(159, 134, 255)' }}>
          Delete entire series
        </button>
        <button type="button" onClick={() => setShowRecurringDeletePrompt(false)}
          className="w-full px-3 py-2 text-left rounded-lg border border-gray-200 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>,
    document.body
  )
}

export default RecurringDeletePrompt
