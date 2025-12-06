import { createPortal } from 'react-dom'
import { RECURRENCE_FREQUENCIES, WEEKDAY_CODES, WEEKDAY_MINI, WEEKDAY_LABELS, formatRecurrenceSummary } from '../../../lib/recurrence'
import { FREQUENCY_UNITS, MONTH_LABELS, MONTHLY_DAYS, ORDINAL_SELECT_OPTIONS } from './constants'

const recurrenceShortcutOptions = [
  { id: 'none', label: 'Does not repeat', description: 'One-time event' },
  { id: 'daily', label: 'Daily', description: 'Every day' },
  { id: 'weekly', label: 'Weekly', description: 'Same day each week' },
  { id: 'monthly', label: 'Monthly', description: 'Same date each month' },
  { id: 'yearly', label: 'Yearly', description: 'Same date every year' },
  { id: 'custom', label: 'Custom...', description: 'Advanced repeat options' }
]

const RecurrenceDropdown = ({
  recurrencePickerRef,
  recurrenceViewMode, setRecurrenceViewMode,
  recurrenceDraft, recurrenceSummary,
  recurrenceDropdownPlacement, recurrenceDropdownCoords, recurrenceDropdownMaxHeight,
  recurrenceAnchorDate,
  handleRecurrenceShortcutSelect, handleClearRecurrence, handleApplyRecurrence,
  updateRecurrenceDraft, toggleRecurrenceDay
}) => {
  const handleFrequencySelectChange = (value) => {
    if (value === 'CUSTOM') { setRecurrenceViewMode('custom'); return }
    updateRecurrenceDraft({ frequency: value })
  }

  const handleSelectMonthlyDay = (day) => updateRecurrenceDraft({ monthlyMode: 'day', monthlyDay: day })
  const handleSelectYearlyMonth = (month) => updateRecurrenceDraft({ yearlyMonth: month }, { forceEnable: true })

  return createPortal(
    <div
      className="fixed z-[1000]"
      style={{
        top: recurrenceDropdownCoords.top,
        left: recurrenceDropdownCoords.left,
        transform: recurrenceDropdownPlacement === 'top' ? 'translateY(-100%)' : 'none'
      }}
    >
      <div
        ref={recurrencePickerRef}
        className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 space-y-3 overflow-y-auto modal-fade-in"
        style={{
          width: recurrenceDropdownCoords.width,
          maxHeight: recurrenceDropdownMaxHeight
        }}
      >
        {recurrenceViewMode === 'shortcuts' ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between">
              <p className="text-xs text-gray-500">{recurrenceSummary}</p>
              <button type="button" onClick={handleClearRecurrence} className="text-xs text-blue-600 hover:text-blue-700">Reset</button>
            </div>
            <div className="space-y-1">
              {recurrenceShortcutOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleRecurrenceShortcutSelect(option.id)}
                  className="w-full text-left px-3 py-2 rounded-lg border border-transparent hover:border-blue-200 hover:bg-blue-50 transition-colors"
                >
                  <div className="text-sm font-medium text-gray-900">{option.label}</div>
                  <div className="text-xs text-gray-500">{option.description}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setRecurrenceViewMode('shortcuts')} className="text-xs text-gray-600 hover:text-gray-800">← Back</button>
              <p className="text-sm font-semibold text-gray-900">Custom repeat</p>
              <button type="button" onClick={handleClearRecurrence} className="text-xs text-blue-600 hover:text-blue-700">Clear</button>
            </div>
            <p className="text-xs text-gray-500">{formatRecurrenceSummary(recurrenceDraft, recurrenceAnchorDate())}</p>
            <div>
              <label className="text-xs font-medium text-gray-600">Frequency</label>
              <select
                value={recurrenceDraft.frequency}
                onChange={(e) => handleFrequencySelectChange(e.target.value)}
                className="mt-1 w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {RECURRENCE_FREQUENCIES.map((freq) => (<option key={freq.value} value={freq.value}>{freq.label}</option>))}
                <option value="CUSTOM">Custom…</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600">Every</label>
              <input
                type="number" min="1" value={recurrenceDraft.interval}
                onChange={(e) => updateRecurrenceDraft({ interval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                className="w-16 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-500">{FREQUENCY_UNITS[recurrenceDraft.frequency] || 'occurrence(s)'}</span>
            </div>
            {recurrenceDraft.frequency === 'WEEKLY' && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Week on</label>
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAY_CODES.map((code) => {
                    const active = recurrenceDraft.daysOfWeek.includes(code)
                    return (
                      <button key={code} type="button" onClick={() => toggleRecurrenceDay(code)}
                        className={`h-8 rounded-lg text-xs font-semibold transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {WEEKDAY_MINI[code]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {recurrenceDraft.frequency === 'MONTHLY' && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">Each month</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="radio" name="recurrenceMonthlyMode" checked={recurrenceDraft.monthlyMode === 'day'} onChange={() => updateRecurrenceDraft({ monthlyMode: 'day' })} />
                    <span>Each</span>
                  </label>
                  {recurrenceDraft.monthlyMode === 'day' && (
                    <div className="grid grid-cols-7 gap-1">
                      {MONTHLY_DAYS.map((day) => {
                        const active = recurrenceDraft.monthlyDay === day
                        return (
                          <button key={day} type="button" onClick={() => handleSelectMonthlyDay(day)}
                            className={`h-8 rounded-lg text-xs font-semibold transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {day}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm text-gray-700 pt-1">
                    <input type="radio" name="recurrenceMonthlyMode" checked={recurrenceDraft.monthlyMode === 'weekday'} onChange={() => updateRecurrenceDraft({ monthlyMode: 'weekday' })} />
                    <span>On the</span>
                    <select value={recurrenceDraft.monthlyWeek} onChange={(e) => updateRecurrenceDraft({ monthlyWeek: parseInt(e.target.value, 10) || 1 })}
                      className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {ORDINAL_SELECT_OPTIONS.map(({ value, label }) => (<option key={value} value={value}>{label}</option>))}
                    </select>
                    <select value={recurrenceDraft.monthlyWeekday} onChange={(e) => updateRecurrenceDraft({ monthlyWeekday: e.target.value })}
                      className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1">
                      {WEEKDAY_CODES.map((code) => (<option key={code} value={code}>{WEEKDAY_LABELS[code]}</option>))}
                    </select>
                  </label>
                </div>
              </div>
            )}
            {recurrenceDraft.frequency === 'YEARLY' && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-600">Year in</label>
                <div className="grid grid-cols-3 gap-1">
                  {MONTH_LABELS.map((label, idx) => {
                    const monthNumber = idx + 1
                    const active = recurrenceDraft.yearlyMonth === monthNumber
                    return (
                      <button key={label} type="button" onClick={() => handleSelectYearlyMonth(monthNumber)}
                        className={`h-9 rounded-lg text-xs font-semibold transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                        {label}
                      </button>
                    )
                  })}
                </div>
                <div className="space-y-1">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="radio" name="recurrenceYearlyMode" checked={recurrenceDraft.yearlyMode === 'date'} onChange={() => updateRecurrenceDraft({ yearlyMode: 'date' })} />
                    <span>On day</span>
                    <input type="number" min="1" max="31" value={recurrenceDraft.yearlyDay}
                      onChange={(e) => updateRecurrenceDraft({ yearlyDay: Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
                      className="w-20 px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={recurrenceDraft.yearlyMode !== 'date'} />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="radio" name="recurrenceYearlyMode" checked={recurrenceDraft.yearlyMode === 'weekday'} onChange={() => updateRecurrenceDraft({ yearlyMode: 'weekday' })} />
                    <span>On the</span>
                    <select value={recurrenceDraft.yearlyOrdinal} onChange={(e) => updateRecurrenceDraft({ yearlyOrdinal: parseInt(e.target.value, 10) || 1 })}
                      className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {ORDINAL_SELECT_OPTIONS.map(({ value, label }) => (<option key={value} value={value}>{label}</option>))}
                    </select>
                    <select value={recurrenceDraft.yearlyWeekday} onChange={(e) => updateRecurrenceDraft({ yearlyWeekday: e.target.value })}
                      className="px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {WEEKDAY_CODES.map((code) => (<option key={code} value={code}>{WEEKDAY_LABELS[code]}</option>))}
                    </select>
                  </label>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">{recurrenceSummary}</p>
              <button type="button" onClick={handleApplyRecurrence} className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">Save</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default RecurrenceDropdown
