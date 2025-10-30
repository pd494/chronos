import { useState, useEffect, useCallback, useRef } from 'react'
import { FiChevronsLeft, FiChevronsRight } from 'react-icons/fi'

const SplitView = ({ sidebar, main, onSidebarWidthChange }) => {
  const sidebarRef = useRef(null)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  
  
  // Notify parent component about width changes
  useEffect(() => {
    if (sidebarWidth > 100 && onSidebarWidthChange) {
      onSidebarWidthChange(sidebarWidth, sidebarVisible)
    }
  }, [sidebarWidth, sidebarVisible, onSidebarWidthChange])
  
  // Mouse drag handler for smooth resizing without React renders
  const startDrag = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarRef.current.getBoundingClientRect().width;
    const onMouseMove = (e) => {
      const newW = Math.max(100, startW + (e.clientX - startX));
      sidebarRef.current.style.width = `${newW}px`;
      const hdr = document.getElementById('header-tabs-wrapper');
      if (hdr) hdr.style.width = `${newW}px`;
    };
    const onMouseUp = () => {
      const finalW = sidebarRef.current.getBoundingClientRect().width;
      setSidebarWidth(finalW);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);
  
  return (
    <div className="flex flex-1 overflow-hidden relative border-t border-gray-200 dark:border-gray-700">
      {/* Resizable Sidebar */}
      {sidebarVisible && (
        <div
          ref={sidebarRef}
          className="h-full relative overflow-hidden bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col"
          style={{ width: `${sidebarWidth}px` }}
        >
          {sidebar}
          <div
            onMouseDown={startDrag}
            className="absolute right-0 top-0 h-full w-[1px] bg-gray-200 dark:bg-gray-700 cursor-col-resize hover:bg-blue-300 dark:hover:bg-blue-600 z-10"
          />
        </div>
      )}
      
      {/* Toggle button - commented out */}
      {/* <button
        onClick={() => {
          const newVisibility = !sidebarVisible;
          setSidebarVisible(newVisibility);
          if (onSidebarWidthChange) {
            onSidebarWidthChange(sidebarWidth, newVisibility);
          }
        }}
        className="absolute left-0 bottom-4 z-10 bg-white dark:bg-gray-800 shadow-md p-2 rounded-r-lg transition-all duration-300"
        style={{ transform: sidebarVisible ? `translateX(${sidebarWidth}px)` : 'translateX(0)' }}
        aria-label={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
      >
        {sidebarVisible ? <FiChevronsLeft /> : <FiChevronsRight />}
      </button> */}
      
      {/* Main content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {main}
      </div>
    </div>
  )
}

export default SplitView