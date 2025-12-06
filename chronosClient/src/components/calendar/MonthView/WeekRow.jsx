import { startOfDay, differenceInCalendarDays } from 'date-fns'
import { computeWeekSpanLayout, MULTI_DAY_TOP_OFFSET, MULTI_DAY_LANE_HEIGHT } from './constants'
import MultiDaySpan from './MultiDaySpan'
import DayCell from './DayCell'

const WeekRow = ({
  weekStart,
  days,
  actualIndex,
  rowHeight,
  currentDate,
  getEventsForDate,
  rangeSelection,
  normalizedSelection,
  todoPreviewDate,
  getDraggedTodoMeta,
  selectDate,
  setView,
  openEventModal,
  handleCombinedDrop,
  handleDragOver,
  handleDragLeave,
  handleRangeMouseDown,
  handleRangeMouseEnter,
  handleRangeMouseMove
}) => {
  const spanLayout = computeWeekSpanLayout(days, getEventsForDate)
  const previewSpan = (rangeSelection.active || rangeSelection.finalized) && normalizedSelection
    ? (() => {
        const weekStartDay = startOfDay(days[0])
        const weekEndDay = startOfDay(days[6])
        if (normalizedSelection.end < weekStartDay || normalizedSelection.start > weekEndDay) return null
        const startIndex = Math.max(0, differenceInCalendarDays(normalizedSelection.start, weekStartDay))
        const endIndex = Math.min(6, differenceInCalendarDays(normalizedSelection.end, weekStartDay))
        if (endIndex < 0 || startIndex > 6) return null
        return { startIndex, endIndex, length: Math.max(1, endIndex - startIndex + 1) }
      })()
    : null
  const totalLanes = spanLayout.laneCount + (previewSpan ? 1 : 0)
  const spanLayerHeight = totalLanes ? MULTI_DAY_TOP_OFFSET + totalLanes * MULTI_DAY_LANE_HEIGHT : 0
  const stackedMultiDayHeight = totalLanes ? totalLanes * MULTI_DAY_LANE_HEIGHT : 0

  return (
    <div
      key={weekStart}
      className="absolute left-0 right-0"
      style={{ height: `${rowHeight}px`, top: `${actualIndex * rowHeight}px` }}
    >
      <div className="absolute left-0 right-0 top-0 z-[4] pointer-events-none [&>*]:pointer-events-auto" style={{ height: `${spanLayerHeight}px` }}>
        {spanLayout.spans.map((span) => (
          <MultiDaySpan key={span.id} span={span} lane={span.lane} weekStart={weekStart} openEventModal={openEventModal} />
        ))}
        {previewSpan && (
          <MultiDaySpan
            span={{ ...previewSpan, id: 'preview', event: {} }}
            lane={spanLayout.laneCount}
            weekStart={weekStart}
            isPreview
            openEventModal={openEventModal}
          />
        )}
      </div>
      <div className="grid grid-cols-7 relative" style={{ height: `${rowHeight}px` }}>
        {days.map((day) => {
          const events = (getEventsForDate(day) || []).filter(event => !spanLayout.multiDayIds.has(event.id))
          return (
            <DayCell
              key={day.toISOString()}
              day={day}
              rowHeight={rowHeight}
              currentDate={currentDate}
              events={events}
              spanLayout={spanLayout}
              previewSpan={previewSpan}
              stackedMultiDayHeight={stackedMultiDayHeight}
              todoPreviewDate={todoPreviewDate}
              getDraggedTodoMeta={getDraggedTodoMeta}
              selectDate={selectDate}
              setView={setView}
              openEventModal={openEventModal}
              handleCombinedDrop={handleCombinedDrop}
              handleDragOver={handleDragOver}
              handleDragLeave={handleDragLeave}
              handleRangeMouseDown={handleRangeMouseDown}
              handleRangeMouseEnter={handleRangeMouseEnter}
              handleRangeMouseMove={handleRangeMouseMove}
              days={days}
            />
          )
        })}
      </div>
    </div>
  )
}

export default WeekRow
