import { useState, useEffect, useCallback, useRef } from 'react'
import { FiChevronsLeft, FiChevronsRight } from 'react-icons/fi'
import { Resizable } from 'react-resizable'
import 'react-resizable/css/styles.css'

const SplitView = ({ sidebar, main, onSidebarWidthChange }) => {
  const frameIdRef = useRef(null)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  
  // Store sidebar width in localStorage
  useEffect(() => {
    const savedWidth = localStorage.getItem('sidebarWidth')
    if (savedWidth) {
      setSidebarWidth(parseInt(savedWidth))
    }
  }, [])
  
  // Save sidebar width when changed
  useEffect(() => {
    if (sidebarWidth > 100) {
      localStorage.setItem('sidebarWidth', sidebarWidth.toString())
      // Notify parent component about the width change
      if (onSidebarWidthChange) {
        onSidebarWidthChange(sidebarWidth, sidebarVisible)
      }
    }
  }, [sidebarWidth, sidebarVisible, onSidebarWidthChange])
  
  const onResizeStop = useCallback((event, { size }) => {
    setSidebarWidth(size.width)
  }, [])
  
  const onResize = useCallback((event, { size }) => {
    const newWidth = size.width
    if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current)
    frameIdRef.current = requestAnimationFrame(() => {
      setSidebarWidth(newWidth)
      frameIdRef.current = null
    })
  }, [])
  
  return (
    <div className="flex flex-1 overflow-hidden relative">
      {/* Resizable Sidebar */}
      {sidebarVisible && (
        <Resizable
          width={sidebarWidth}
          height={0} // Height will be determined by the parent
          onResize={onResize}
          onResizeStop={onResizeStop}
          minConstraints={[250, 0]}
          maxConstraints={[500, 0]}
          resizeHandles={['e']}
          handle={
            <div className="h-full w-2 bg-gray-200 dark:bg-gray-700 absolute right-0 top-0 cursor-col-resize hover:bg-blue-300 dark:hover:bg-blue-600 z-10" />
          }
        >
          <div
            className="h-full overflow-hidden bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col"
            style={{ width: `${sidebarWidth}px` }}
          >
            {sidebar}
          </div>
        </Resizable>
      )}
      
      {/* Toggle button */}
      <button
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
      </button>
      
      {/* Main content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {main}
      </div>
    </div>
  )
}

export default SplitView