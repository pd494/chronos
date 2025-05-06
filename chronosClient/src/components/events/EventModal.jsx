import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { FiX, FiTrash2 } from 'react-icons/fi'
import { useCalendar } from '../../context/CalendarContext'

const EVENT_COLORS = [
  { name: 'blue', label: 'Blue' },
  { name: 'purple', label: 'Purple' },
  { name: 'green', label: 'Green' },
  { name: 'orange', label: 'Orange' },
  { name: 'red', label: 'Red' }
]

const EventModal = () => {
  const { 
    selectedEvent, 
    closeEventModal: originalCloseEventModal,
    createEvent,
    updateEvent,
    deleteEvent,
    currentDate
  } = useCalendar()
  
  const closeEventModal = useCallback(() => {
    // Clear prefilled dates when closing
    window.prefilledEventDates = null
    originalCloseEventModal()
  }, [originalCloseEventModal])
  
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [color, setColor] = useState('blue')
  
  useEffect(() => {
    try {
      if (selectedEvent) {
        // Editing existing event
        const start = new Date(selectedEvent.start)
        const end = new Date(selectedEvent.end)
        
        setTitle(selectedEvent.title)
        setStartDate(format(start, 'yyyy-MM-dd'))
        setStartTime(format(start, 'HH:mm'))
        setEndDate(format(end, 'yyyy-MM-dd'))
        setEndTime(format(end, 'HH:mm'))
        setColor(selectedEvent.color)
      } else if (window.prefilledEventDates) {
        // Creating new event from drag-to-create with prefilled dates
        const { startDate: dragStartDate, endDate: dragEndDate, title: dragTitle, color: dragColor } = window.prefilledEventDates
        
        // Ensure we have valid Date objects
        const startDate = dragStartDate instanceof Date ? dragStartDate : new Date(dragStartDate)
        const endDate = dragEndDate instanceof Date ? dragEndDate : new Date(dragEndDate)
        
        // Log for debugging
        console.log('Setting up event modal with:', {
          startDate: startDate.toString(),
          endDate: endDate.toString()
        })
        
        // Set form values from drag times
        setTitle(dragTitle || '')
        setStartDate(format(startDate, 'yyyy-MM-dd'))
        setStartTime(format(startDate, 'HH:mm'))
        setEndDate(format(endDate, 'yyyy-MM-dd'))
        setEndTime(format(endDate, 'HH:mm'))
        setColor(dragColor || 'blue')
      
      } else {
        // Creating new event
        const now = new Date(currentDate)
        const later = new Date(now)
        later.setHours(now.getHours() + 1)
        
        setTitle('')
        setStartDate(format(now, 'yyyy-MM-dd'))
        setStartTime(format(now, 'HH:mm'))
        setEndDate(format(now, 'yyyy-MM-dd'))
        setEndTime(format(later, 'HH:mm'))
        setColor('blue')
      }
    } catch (error) {
      console.error('Error setting up event modal:', error)
    }
  }, [selectedEvent, currentDate])
  
  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Log the input values to debug the issue
    console.log('Form submission with values:', {
      startDate, startTime, endDate, endTime
    });
    
    // Construct Date objects to preserve local times and avoid timezone offsets
    const [startHour, startMinute] = startTime.split(':').map(Number)
    const start = new Date(startDate)
    start.setHours(startHour, startMinute, 0, 0)
    
    const [endHour, endMinute] = endTime.split(':').map(Number)
    const end = new Date(endDate)
    end.setHours(endHour, endMinute, 0, 0)
    
    console.log('Created date objects:', {
      start: start.toString(),
      end: end.toString()
    });

    const eventData = {
      title,
      start,
      end,
      color
    }
    
    // Clear prefilled dates
    window.prefilledEventDates = null
    
    if (selectedEvent) {
      // Update the event with the new data
      updateEvent(selectedEvent.id, eventData)
      
      // Log the updated event for debugging
      console.log('Updated event:', {
        id: selectedEvent.id,
        ...eventData
      })
    } else {
      // Create a new event
      const newEvent = createEvent(eventData)
      console.log('Created new event:', newEvent)
    }
    
    // Close modal immediately to avoid flickering
    closeEventModal()
  }
  
  const handleDelete = () => {
    if (selectedEvent) {
      deleteEvent(selectedEvent.id)
      closeEventModal()
    }
  }
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold">
            {selectedEvent ? 'Edit Event' : 'Create Event'}
          </h2>
          <button
            onClick={closeEventModal}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <FiX />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-4">
            <label htmlFor="title" className="block mb-2 text-sm font-medium">
              Title
            </label>
            <input
              type="text"
              id="title"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="startDate" className="block mb-2 text-sm font-medium">
                Start Date
              </label>
              <input
                type="date"
                id="startDate"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="startTime" className="block mb-2 text-sm font-medium">
                Start Time
              </label>
              <input
                type="time"
                id="startTime"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="endDate" className="block mb-2 text-sm font-medium">
                End Date
              </label>
              <input
                type="date"
                id="endDate"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="endTime" className="block mb-2 text-sm font-medium">
                End Time
              </label>
              <input
                type="time"
                id="endTime"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>
          
          <div className="mb-6">
            <label className="block mb-2 text-sm font-medium">
              Color
            </label>
            <div className="flex space-x-2">
              {EVENT_COLORS.map((eventColor) => (
                <button
                  key={eventColor.name}
                  type="button"
                  className={`h-8 w-8 rounded-full event-${eventColor.name} flex items-center justify-center border-2 ${
                    color === eventColor.name ? `border-${eventColor.name}` : 'border-transparent'
                  }`}
                  onClick={() => setColor(eventColor.name)}
                  aria-label={`Select ${eventColor.label}`}
                />
              ))}
            </div>
          </div>
          
          <div className="flex justify-between">
            {selectedEvent && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors flex items-center"
              >
                <FiTrash2 className="mr-1" /> Delete
              </button>
            )}
            
            <div className="flex ml-auto space-x-2">
              <button
                type="button"
                onClick={closeEventModal}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                {selectedEvent ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default EventModal