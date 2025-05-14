import { useState } from 'react';
import { FiClock, FiSend, FiMessageSquare, FiPlus } from 'react-icons/fi';
import { useCalendar } from '../context/CalendarContext';

const FloatingChatBar = () => {
  const [query, setQuery] = useState('');
  const { openEventModal } = useCalendar();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      console.log('Chat query submitted:', query);
      // Process the query here
      setQuery('');
    }
  };

  const handleTimerClick = () => {
    console.log('Timer clicked - open pomodoro timer');
    // Implement pomodoro timer functionality
  };

  const handleNewEvent = () => {
    // Create a new event starting now
    const now = new Date();
    const later = new Date(now);
    later.setHours(now.getHours() + 1);

    const newEvent = {
      id: `temp-${Date.now()}`,
      title: '',
      start: now,
      end: later,
      color: 'blue',
    };

    openEventModal(newEvent, true);
  };

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
      <form 
        onSubmit={handleSubmit}
        className="flex items-center bg-white dark:bg-gray-800 rounded-full shadow-lg p-2 w-96 border-2"
        style={{ borderColor: 'var(--color-lavender)' }}
      >
        <input
          type="text"
          placeholder="Ask Chronos..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 py-2 px-4 bg-transparent outline-none text-gray-700 dark:text-gray-200"
        />
        
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={handleTimerClick}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Pomodoro Timer"
          >
            <FiClock size={18} />
          </button>
          
          <button
            type="button"
            onClick={handleNewEvent}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Create New Event"
          >
            <FiPlus size={18} />
          </button>
          
          <button
            type="submit"
            className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!query.trim()}
          >
            <FiSend size={18} />
          </button>
        </div>
      </form>
    </div>
  );
};

export default FloatingChatBar; 