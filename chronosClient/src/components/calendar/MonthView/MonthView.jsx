import { useState, useRef, useEffect } from 'react'
import { useCalendar } from '../../../context/CalendarContext/CalendarContext'
import { useTaskContext } from '../../../context/TaskContext/context'
import { WEEKS_PER_VIEW } from './constants'
import { useMonthScroll } from './useMonthScroll'
import { useRangeSelection } from './useRangeSelection'
import { useMonthDragDrop } from './useMonthDragDrop'
import WeekRow from './WeekRow'

const MonthView = () => {
  const {
    currentDate,
    selectDate,
    getEventsForDate,
    setHeaderDisplayDate,
    fetchEventsForRange,
    initialLoading,
    openEventModal,
    showEventModal,
    setView,
    updateEvent,
  } = useCalendar()

  const { convertTodoToEvent } = useTaskContext()

  const scrollContainerRef = useRef(null)
  const [rowHeight, setRowHeight] = useState(0)
  const [cellSize, setCellSize] = useState(0)

  useEffect(() => {
    const update = () => {
      if (!scrollContainerRef.current) return
      const containerHeight = scrollContainerRef.current.clientHeight
      const rowHeightFromContainer = containerHeight / WEEKS_PER_VIEW
      setCellSize(rowHeightFromContainer)
      setRowHeight(rowHeightFromContainer)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const { weeks, visibleRange } = useMonthScroll({
    scrollContainerRef,
    rowHeight,
    fetchEventsForRange,
    setHeaderDisplayDate,
    initialLoading
  })

  const rangeSelection = useRangeSelection({ openEventModal, showEventModal })
  const dragDrop = useMonthDragDrop({ updateEvent, convertTodoToEvent })

  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

  return (
    <div
      className="flex flex-col h-full min-h-0 flex-1 relative overflow-hidden"
      onDragEnter={() => {
        if (document.body.classList.contains('task-dragging')) {
          document.body.classList.add('calendar-drag-focus')
        }
      }}
      onDragOver={() => {
        if (document.body.classList.contains('task-dragging')) {
          document.body.classList.add('calendar-drag-focus')
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          document.body.classList.remove('calendar-drag-focus')
          dragDrop.clearTodoPreview()
        }
      }}
    >
      <div className="p-4 flex flex-col flex-grow overflow-hidden">
        <div className="grid grid-cols-7 mb-2 flex-shrink-0">
          {dayNames.map((d) => (
            <div key={d} className="text-center text-sm text-gray-500 dark:text-gray-400 font-medium py-2">
              {d}
            </div>
          ))}
        </div>

        <div
          ref={scrollContainerRef}
          className="overflow-y-auto flex-grow relative bg-white dark:bg-gray-800 scrollbar-hide"
          style={{ height: 'calc(100% - 60px)' }}
        >
          <div className="relative" style={{ height: `${weeks.length * rowHeight}px` }}>
            {weeks.slice(visibleRange.start, visibleRange.end).map(({ weekStart, days }, index) => {
              const actualIndex = visibleRange.start + index
              return (
                <WeekRow
                  key={weekStart}
                  weekStart={weekStart}
                  days={days}
                  actualIndex={actualIndex}
                  rowHeight={rowHeight}
                  currentDate={currentDate}
                  getEventsForDate={getEventsForDate}
                  rangeSelection={rangeSelection.rangeSelection}
                  normalizedSelection={rangeSelection.normalizedSelection}
                  todoPreviewDate={dragDrop.todoPreviewDate}
                  getDraggedTodoMeta={dragDrop.getDraggedTodoMeta}
                  selectDate={selectDate}
                  setView={setView}
                  openEventModal={openEventModal}
                  handleCombinedDrop={dragDrop.handleCombinedDrop}
                  handleDragOver={dragDrop.handleDragOver}
                  handleDragLeave={dragDrop.handleDragLeave}
                  handleRangeMouseDown={rangeSelection.handleRangeMouseDown}
                  handleRangeMouseEnter={rangeSelection.handleRangeMouseEnter}
                  handleRangeMouseMove={rangeSelection.handleRangeMouseMove}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default MonthView
