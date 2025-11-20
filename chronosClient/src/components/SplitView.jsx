import { useState, useEffect, useCallback, useRef, cloneElement } from 'react'
import { FiChevronsLeft, FiChevronsRight } from 'react-icons/fi'

const SplitView = ({ sidebar, main, onSidebarWidthChange, isSidebarCollapsed = false, onToggleSidebar, overlayHeader = null }) => {
  const sidebarRef = useRef(null)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [lastSidebarWidth, setLastSidebarWidth] = useState(320)
  const [peekOpen, setPeekOpen] = useState(false)
  
  
  // Notify parent component about width changes
  useEffect(() => {
    if (onSidebarWidthChange) {
      onSidebarWidthChange(sidebarWidth, !isSidebarCollapsed)
    }
  }, [sidebarWidth, isSidebarCollapsed, onSidebarWidthChange])
  
  // Mouse drag handler for smooth resizing without React renders
  const startDrag = useCallback((e) => {
    if (!sidebarRef.current) return
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarRef.current.getBoundingClientRect().width;
    const onMouseMove = (e) => {
      const newW = Math.max(0, startW + (e.clientX - startX));
      sidebarRef.current.style.width = `${newW}px`;
      const hdr = document.getElementById('header-tabs-wrapper');
      if (hdr) hdr.style.width = `${newW}px`;
    };
    const onMouseUp = () => {
      const finalW = sidebarRef.current.getBoundingClientRect().width;
      const normalized = Math.max(0, finalW);
      setSidebarWidth(normalized);
      if (normalized >= 120) {
        setLastSidebarWidth(normalized);
      }
      if (!isSidebarCollapsed && normalized < 24 && onToggleSidebar) {
        setPeekOpen(true);
        onToggleSidebar();
      }
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);
  
  const openPeek = useCallback(() => setPeekOpen(true), [])
  const closePeek = useCallback(() => setPeekOpen(false), [])

  const handleExpand = useCallback(() => {
    const targetWidth = Math.max(320, Math.round((window?.innerWidth || 1200) / 3));
    setSidebarWidth(targetWidth);
    if (sidebarRef.current) {
      sidebarRef.current.style.width = `${targetWidth}px`;
    }
    setPeekOpen(false)
    if (onToggleSidebar) onToggleSidebar()
  }, [onToggleSidebar])

  const sidebarNode = sidebar
    ? (peekOpen ? cloneElement(sidebar, { isSidebarCollapsed: false }) : sidebar)
    : null

  const overlayWidth = Math.max(200, Math.round(lastSidebarWidth || sidebarWidth || 260))

  const collapsedRailButton = (
    <button
      onClick={handleExpand}
      className="absolute bg-white dark:bg-gray-800 shadow-md p-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:shadow-lg transition"
      style={{ left: 4, top: 6, zIndex: 90 }}
      aria-label="Show tasks"
    >
      <FiChevronsRight />
    </button>
  )

  return (
    <div className="flex flex-1 overflow-hidden relative border-t border-gray-200 dark:border-gray-700">
      {/* Resizable Sidebar (pinned) */}
      {!isSidebarCollapsed && (
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
      
      {/* Peek rail + overlay */}
      {isSidebarCollapsed && (
        <>
          <div
            className="absolute left-0 top-0 bottom-0 w-8 z-50 cursor-pointer bg-transparent"
            onMouseEnter={(e) => {
              const railWidth = e.currentTarget.clientWidth || 8
              const immuneZone = Math.max(railWidth * 0.25, 8)
              const offset = e.clientX - e.currentTarget.getBoundingClientRect().left
              // Avoid triggering when right over the chevron area; otherwise open peek
              if (offset > immuneZone) {
                openPeek()
              }
            }}
            onClick={() => !peekOpen && setPeekOpen(true)}
          />
          {collapsedRailButton}
          <div
            ref={sidebarRef}
            className="absolute left-0 top-0 bottom-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col z-50"
            style={{
              width: `${overlayWidth}px`,
              opacity: peekOpen ? 1 : 0,
              transform: `translateX(${peekOpen ? 0 : -10}px)`,
              pointerEvents: peekOpen ? 'auto' : 'none',
              transition: 'opacity 115ms ease, transform 115ms ease'
            }}
            onMouseLeave={closePeek}
          >
            <div className="flex flex-col h-full overflow-hidden">
              {overlayHeader && (
                <div className="shrink-0 bg-white dark:bg-gray-800">
                  {overlayHeader}
                </div>
              )}
              <div className="flex-1 overflow-auto">
                {sidebarNode}
              </div>
            </div>
            <div
              onMouseDown={startDrag}
              className="absolute right-0 top-0 h-full w-[1px] bg-gray-200 dark:bg-gray-700 cursor-col-resize hover:bg-blue-300 dark:hover:bg-blue-600 z-10"
            />
          </div>
        </>
      )}
      
      {/* Main content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {main}
      </div>
    </div>
  )
}

export default SplitView
