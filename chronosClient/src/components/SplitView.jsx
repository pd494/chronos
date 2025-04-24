import { useState } from 'react'
import { FiChevronsLeft, FiChevronsRight } from 'react-icons/fi'

const SplitView = ({ sidebar, main }) => {
  const [sidebarVisible, setSidebarVisible] = useState(true)
  
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <div 
        className={`${
          sidebarVisible ? 'w-80' : 'w-0'
        } border-r border-gray-200 dark:border-gray-700 transition-all duration-300 overflow-hidden flex flex-col`}
      >
        {sidebarVisible && sidebar}
      </div>
      
      {/* Toggle button */}
      <button
        onClick={() => setSidebarVisible(!sidebarVisible)}
        className="absolute left-0 bottom-4 z-10 bg-white dark:bg-gray-800 shadow-md p-2 rounded-r-lg transition-all duration-300"
        style={{ transform: sidebarVisible ? 'translateX(320px)' : 'translateX(0)' }}
        aria-label={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
      >
        {sidebarVisible ? <FiChevronsLeft /> : <FiChevronsRight />}
      </button>
      
      {/* Main content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {main}
      </div>
    </div>
  )
}

export default SplitView