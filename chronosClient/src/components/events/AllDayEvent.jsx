import { useState, useEffect } from 'react'
import { getEventColors } from '../../lib/eventColors'

const AllDayEvent = ({ event, onOpen, className = '', style = {} }) => {
  const colors = getEventColors(event.color || 'blue')
  const [isDragging, setIsDragging] = useState(false)
  const [shouldBounce, setShouldBounce] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    let timeoutId = null
    const handleBounce = (evt) => {
      if (evt?.detail?.eventId === event.id) {
        setShouldBounce(true)
        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = setTimeout(() => setShouldBounce(false), 600)
      }
    }
    window.addEventListener('chronos:event-bounce', handleBounce)
    return () => {
      window.removeEventListener('chronos:event-bounce', handleBounce)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [event.id])

  const handleClick = (e) => {
    if (isDragging) return
    e.stopPropagation()
    if (typeof onOpen === 'function') {
      onOpen(event)
    }
  }

  const handleDragStart = (e) => {
    e.stopPropagation()
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('event', JSON.stringify(event))
    e.dataTransfer.setData('eventId', event.id)
    try { e.dataTransfer.setData('text/plain', ' ') } catch (_) {}

    e.currentTarget.setAttribute('data-dragging', 'true')

    const rect = e.currentTarget.getBoundingClientRect()
    const dragPreview = e.currentTarget.cloneNode(true)
    dragPreview.style.opacity = '0.85'
    dragPreview.style.position = 'absolute'
    dragPreview.style.top = '-1000px'
    dragPreview.style.left = '-1000px'
    dragPreview.style.width = `${rect.width}px`
    dragPreview.style.height = `${Math.max(rect.height, 20)}px`
    dragPreview.style.boxSizing = 'border-box'
    dragPreview.style.pointerEvents = 'none'
    document.body.appendChild(dragPreview)
    const rawOffsetX = (e.clientX ?? rect.left) - rect.left
    const rawOffsetY = (e.clientY ?? rect.top) - rect.top
    const offsetX = Math.max(1, Math.min(rect.width - 1, rawOffsetX))
    const offsetY = Math.max(1, Math.min(rect.height - 1, rawOffsetY))
    try { e.dataTransfer.setDragImage(dragPreview, offsetX, offsetY) } catch (_) {}
    setTimeout(() => {
      if (dragPreview.parentNode) {
        dragPreview.parentNode.removeChild(dragPreview)
      }
    }, 0)
  }

  const handleDragEnd = (e) => {
    setIsDragging(false)
    e.currentTarget.removeAttribute('data-dragging')
    document.querySelectorAll('.event-dragover').forEach(el => {
      el.classList.remove('event-dragover')
    })
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      className={`truncate rounded px-2 cursor-pointer text-xs relative flex items-center event-draggable ${shouldBounce ? 'event-bounce' : ''} ${className}`.trim()}
      style={{
        backgroundColor: colors.background,
        color: colors.text,
        opacity: isDragging ? 0.5 : 1,
        ...style
      }}
      data-event-id={event.id}
    >
      <span className="font-medium truncate" style={{ color: colors.text }}>
        {event.title}
      </span>
    </div>
  )
}

export default AllDayEvent
