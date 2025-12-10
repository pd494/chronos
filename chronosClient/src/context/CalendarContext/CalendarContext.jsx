import { createContext, useContext } from 'react'
import { useCalendarController } from './useCalendarController'

const CalendarContext = createContext(null)

export const CalendarProvider = ({ children }) => {
  const value = useCalendarController()
  return (
    <CalendarContext.Provider value={value}>
      {children}
    </CalendarContext.Provider>
  )
}

export const useCalendar = () => {
  const context = useContext(CalendarContext)
  if (context) return context

  const noop = () => {}
  return {
    view: 'month',
    changeView: noop,
    currentDate: new Date(),
    headerDisplayDate: new Date(),
    setHeaderDisplayDate: noop,
    selectDate: noop,
    openEventModal: noop,
    updateEvent: noop,
    toggleEventChecked: noop,
    getEventsForDate: () => [],
    initialLoading: true,
    showEventModal: false,
    selectedEvent: null,
    formatDateHeader: () => '',
    navigateToToday: noop,
    navigateToPrevious: noop,
    navigateToNext: noop,
    refreshEvents: noop,
    setSelectedCalendars: noop,
    selectedCalendars: []
  }
}
