import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { useCalendar } from '../context/CalendarContext'

const Header = () => {
  const {
    currentDate,
    view,
    navigateToToday,
    navigateToPrevious,
    navigateToNext,
    changeView,
    formatDateHeader,
    openEventModal
  } = useCalendar()

  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700" style={{ WebkitAppRegion: 'drag' }}>
      <div className="flex items-center mb-4 sm:mb-0">
        <h1 className="text-2xl font-semibold mr-4">{formatDateHeader()}</h1>
        <div className="flex space-x-2">
          <button
            onClick={navigateToPrevious}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="Previous"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <FiChevronLeft className="text-lg" />
          </button>
          <button
            onClick={navigateToNext}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="Next"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <FiChevronRight className="text-lg" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
        <button
          onClick={navigateToToday}
          className="px-4 py-2 bg-gray-900 text-white dark:bg-gray-700 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-600 transition-colors"
        >
          Today
        </button>
        <button
          onClick={() => openEventModal()}
          className="px-4 py-2 bg-white border border-gray-300 dark:bg-gray-800 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          New Event
        </button>
        <div className="flex border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
          <button
            onClick={() => changeView('month')}
            className={`px-4 py-2 ${
              view === 'month'
                ? 'bg-gray-100 dark:bg-gray-700'
                : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
            } transition-colors`}
          >
            Month
          </button>
          <button
            onClick={() => changeView('week')}
            className={`px-4 py-2 ${
              view === 'week'
                ? 'bg-gray-100 dark:bg-gray-700'
                : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
            } transition-colors`}
          >
            Week
          </button>
          <button
            onClick={() => changeView('day')}
            className={`px-4 py-2 ${
              view === 'day'
                ? 'bg-gray-100 dark:bg-gray-700'
                : 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
            } transition-colors`}
          >
            Day
          </button>
        </div>
      </div>
    </header>
  )
}

export default Header