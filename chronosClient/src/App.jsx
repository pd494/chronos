import { useEffect, useState } from 'react'
import Header from './components/Header'
import SplitView from './components/SplitView'
import MonthlyView from './components/calendar/MonthlyView'
import WeeklyView from './components/calendar/WeeklyView'
import DailyView from './components/calendar/DailyView'
import Sidebar from './components/todo/sidebar/Sidebar'
import CategoryTabs from './components/todo/sidebar/CategoryTabs'

import EventModal from './components/events/EventModal'
import { useCalendar } from './context/CalendarContext'
import { TaskProvider } from './context/TaskContext'
import { FiSun, FiMoon } from 'react-icons/fi'

function App() {
  const { view, showEventModal, changeView } = useCalendar()
  const [isDarkMode, setIsDarkMode] = useState(false)
  
  // Categories for the header tabs - similar to reference screenshot
  const [categories, setCategories] = useState([
    { id: 'all', name: 'All', count: 398, icon: '★' },
    { id: 'inbox', name: 'Inbox', count: 5, icon: '📥' },
    { id: 'today', name: 'Today', count: 1, icon: '1' },
    { id: 'completed', name: 'Completed', count: 0, icon: '✓' },
  ])

  useEffect(() => {
    // Check user's preference from localStorage or system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const savedMode = localStorage.getItem('darkMode')
    
    if (savedMode !== null) {
      setIsDarkMode(savedMode === 'true')
    } else {
      setIsDarkMode(prefersDark)
    }
  }, [])

  useEffect(() => {
    // Apply dark mode class to document
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

  useEffect(() => {
    // Save preference to localStorage
    localStorage.setItem('darkMode', isDarkMode)
  }, [isDarkMode])

  // Add keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip if user is typing in an input or textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      
      switch (e.key.toLowerCase()) {
        case 'm':
          changeView('month');
          break;
        case 'w':
          changeView('week');
          break;
        case 'd':
          changeView('day');
          break;
        case 'n':
          // Focus the task input
          const taskInput = document.querySelector('.task-input-field');
          if (taskInput) {
            taskInput.focus();
          }
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [changeView]);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
  }
  
  const renderCalendarView = () => {
    switch (view) {
      case 'month':
        return <MonthlyView />
      case 'week':
        return <WeeklyView />
      case 'day':
        return <DailyView />
      default:
        return <MonthlyView />
    }
  }

  // State for categories, active category, sidebar collapse and width - moved from Sidebar to App level
  const [activeCategory, setActiveCategory] = useState('All');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  
  // Handler for sidebar updates
  const handleSidebarChange = (width, visible) => {
    setSidebarWidth(width);
    setSidebarVisible(visible);
  };
  
  // Toggle sidebar collapse
  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };
  
  // Handler for category change
  const handleCategoryChange = (category) => {
    setActiveCategory(category);
  };
  
  // Handler for adding new category
  const handleAddCategory = (newCategory) => {
    // Add the new category to the categories list
    setCategories(prev => {
      // Create a new array with the new category
      const updatedCategories = [...prev];
      
      // Add the new category before the last item (if it's 'Completed')
      const completedIndex = updatedCategories.findIndex(c => c.name === 'Completed');
      
      if (completedIndex !== -1) {
        // Insert before 'Completed'
        updatedCategories.splice(completedIndex, 0, newCategory);
      } else {
        // Just append to the end
        updatedCategories.push(newCategory);
      }
      
      return updatedCategories;
    });
    
    // If user is in the All tab, stay there to see the new category
    // Otherwise, switch to the new category
    if (activeCategory !== 'All') {
      setActiveCategory(newCategory.name);
    }
  };

  return (
    <TaskProvider>
      <div className="h-full flex flex-col">
        <div className="header-container flex flex-col relative">
          {/* Position the header tabs area and the header side by side */}
          <div className="flex w-full h-12 border-b border-gray-200 dark:border-gray-700">
            {/* Category tabs section - expands/collapses with sidebar */}
            <div 
              id="header-tabs-wrapper"
              className="h-full flex items-center bg-white dark:bg-gray-800 overflow-hidden border-r border-gray-200 dark:border-gray-700"
              style={{ width: sidebarVisible ? sidebarWidth + 'px' : '0' }}
            >
              <CategoryTabs
                categories={[...categories, { id: 'add-category', name: '', icon: '+' }]}
                activeCategory={activeCategory}
                onCategoryChange={handleCategoryChange}
                onAddCategory={handleAddCategory}
                isCompact={true}
                inHeader={true}
              />
            </div>
            
            {/* Header with controls and navigation */}
            <div className="flex-1">
              <Header
                darkModeButton={
                  <button
                    onClick={toggleDarkMode}
                    className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                  >
                    {isDarkMode ? <FiSun className="text-xl" /> : <FiMoon className="text-xl" />}
                  </button>
                }
              />
            </div>
          </div>
        </div>
        <SplitView
          sidebar={<Sidebar 
            activeCategory={activeCategory}
            isSidebarCollapsed={isSidebarCollapsed}
            sidebarWidth={sidebarWidth}
            sidebarVisible={sidebarVisible}
            toggleSidebar={toggleSidebar}
          />}
          main={renderCalendarView()}
          onSidebarWidthChange={handleSidebarChange}
        />
        {showEventModal && <EventModal />}
      </div>
    </TaskProvider>
  )
}

export default App