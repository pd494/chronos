import { format, isToday, isSameDay } from 'date-fns'

const WeekHeader = ({ days, currentDate, selectDate }) => {
  return (
    <div className="flex w-full border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
      <div className="w-16 text-center py-2 text-gray-500 border-r border-gray-200 dark:border-gray-700">
        GMT-7
      </div>
      {days.map((day, index) => {
        const dayNumber = format(day, 'd')
        const dayName = format(day, 'EEE')
        const isCurrentDay = isToday(day)
        return (
          <div
            key={index}
            className={`flex-1 p-2 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${isCurrentDay ? 'font-semibold' : ''}`}
            onClick={() => selectDate(day)}
          >
            <div className="text-sm">{dayName} {dayNumber}</div>
          </div>
        )
      })}
    </div>
  )
}

export default WeekHeader
