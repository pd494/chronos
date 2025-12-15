import { useState, useEffect, useCallback, useRef } from 'react'

const SplitView = ({ sidebar, main, onSidebarWidthChange, isSidebarCollapsed = false, onToggleSidebar, overlayHeader = null }) => {
  const sidebarRef = useRef(null)
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [lastSidebarWidth, setLastSidebarWidth] = useState(320)
  
  
  // Notify parent component about width changes
  useEffect(() => {
    if (onSidebarWidthChange) {
      onSidebarWidthChange(sidebarWidth, !isSidebarCollapsed)
    }
  }, [sidebarWidth, isSidebarCollapsed, onSidebarWidthChange])
  
  // Mouse drag handler for smooth resizing without React renders
  const startDrag = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = isSidebarCollapsed ? 0 : (sidebarRef.current ? sidebarRef.current.getBoundingClientRect().width : sidebarWidth);
    const onMouseMove = (e) => {
      const newW = Math.max(0, startW + (e.clientX - startX));
      if (sidebarRef.current) sidebarRef.current.style.width = `${newW}px`;
      const hdr = document.getElementById('header-tabs-wrapper');
      if (hdr) hdr.style.width = `${newW}px`;
      if (isSidebarCollapsed && newW >= 24 && onToggleSidebar) {
        setSidebarWidth(newW)
        if (newW >= 120) setLastSidebarWidth(newW)
        onToggleSidebar()
      }
    };
    const onMouseUp = () => {
      const finalW = sidebarRef.current ? sidebarRef.current.getBoundingClientRect().width : sidebarWidth;
      const normalized = Math.max(0, finalW);
      setSidebarWidth(normalized);
      if (normalized >= 120) {
        setLastSidebarWidth(normalized);
      }
      if (!isSidebarCollapsed && normalized < 24 && onToggleSidebar) onToggleSidebar();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [isSidebarCollapsed, onToggleSidebar]);

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
            className="absolute right-0 top-0 h-full w-[6px] cursor-col-resize z-10"
          />
          <div className="absolute right-0 top-0 h-full w-[1px] bg-gray-200 dark:bg-gray-700 z-[11]" />
        </div>
      )}
      
      {/* Peek rail + overlay */}
      {isSidebarCollapsed && (
        <>
          <div
            className="absolute left-0 top-0 bottom-0 w-[6px] z-[60] cursor-col-resize bg-transparent"
            onMouseDown={startDrag}
          />
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
