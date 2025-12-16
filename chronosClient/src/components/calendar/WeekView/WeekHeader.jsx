import { format, isToday, isSameDay, getWeek } from 'date-fns'
import { useSettings } from '../../../context/SettingsContext'

const WeekHeader = ({ days, currentDate, selectDate }) => {
  const { settings } = useSettings()
  const showWeekNumbers = settings?.show_week_numbers === true
  const weekStartsOn = settings?.week_start_day ?? 0

  const weekNumber = showWeekNumbers && days?.length
    ? getWeek(days[0], { weekStartsOn })
    : null

  return (
    <div className="flex w-full border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
      <div className="w-16 text-center py-2 text-gray-500 border-r border-gray-200 dark:border-gray-700">
        {showWeekNumbers ? weekNumber : 'GMT-7'}
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
