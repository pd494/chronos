import { createPortal } from 'react-dom'

const RecurringEditPrompt = ({
  recurringEditPromptRef,
  recurringEditScope,
  setRecurringEditScope,
  setShowRecurringEditPrompt,
  setPendingEventData,
  executeRecurringEdit
}) => {
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[1199] bg-black bg-opacity-30"
        onMouseDown={(e) => {
          e.stopPropagation()
          setShowRecurringEditPrompt(false)
          setPendingEventData(null)
          setRecurringEditScope('single')
        }}
      />
      <div
        ref={recurringEditPromptRef}
        className="fixed z-[1200] bg-white rounded-3xl shadow-2xl modal-fade-in"
        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 400, maxWidth: '90vw' }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">Edit recurring event</h2>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="radio" name="recurring-edit-scope" value="single" checked={recurringEditScope === 'single'}
                onChange={(e) => setRecurringEditScope(e.target.value)}
                className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer" />
              <span className="text-base text-gray-700 group-hover:text-gray-900">This event</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="radio" name="recurring-edit-scope" value="future" checked={recurringEditScope === 'future'}
                onChange={(e) => setRecurringEditScope(e.target.value)}
                className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer" />
              <span className="text-base text-gray-700 group-hover:text-gray-900">This and following events</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="radio" name="recurring-edit-scope" value="all" checked={recurringEditScope === 'all'}
                onChange={(e) => setRecurringEditScope(e.target.value)}
                className="w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500 cursor-pointer" />
              <span className="text-base text-gray-700 group-hover:text-gray-900">All events</span>
            </label>
          </div>
          <div className="flex items-center justify-end gap-3 mt-8">
            <button type="button" onClick={() => { setShowRecurringEditPrompt(false); setPendingEventData(null); setRecurringEditScope('single') }}
              className="px-6 py-2 text-base font-medium text-blue-600 hover:bg-blue-50 rounded-full transition-colors">
              Cancel
            </button>
            <button type="button" onClick={() => executeRecurringEdit(recurringEditScope)}
              className="px-8 py-2 text-base font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-full transition-colors">
              OK
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

export default RecurringEditPrompt
