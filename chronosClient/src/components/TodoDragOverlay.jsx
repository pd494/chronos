import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getEventColors, normalizeToPaletteColor } from '../lib/eventColors';
import './TodoDragOverlay.css';

const TodoDragOverlay = () => {
  const [dragState, setDragState] = useState(null);
  const hourHoverRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    // Helper to keep global overlay state in sync and notify listeners
    const setOverlayState = (active) => {
      if (window.__chronosTodoOverlayActive === active) return;
      window.__chronosTodoOverlayActive = active;
      window.dispatchEvent(
        new CustomEvent('chronos-todo-overlay-state', {
          detail: { active: Boolean(active) }
        })
      );
    };

    setOverlayState(false);

    const updateFromEvent = (event) => {
      // Only show while a todo is being dragged
      if (!document.body.classList.contains('task-dragging')) {
        setDragState(null);
        setOverlayState(false);
        return;
      }

      // Determine if we're over the calendar side (not the sidebar)
      let isOverCalendar = true;
      const sidebarEl = document.querySelector('.sidebar');
      if (sidebarEl && typeof event.clientX === 'number') {
        const rect = sidebarEl.getBoundingClientRect();
        // Add a tiny buffer so the pill appears only after we've
        // meaningfully crossed into the calendar surface.
        isOverCalendar = event.clientX > rect.right + 4;
      }
      const hasCalendarFocus = document.body.classList.contains('calendar-drag-focus');
      if (!isOverCalendar && !hasCalendarFocus) {
        setDragState(null);
        setOverlayState(false);
        return;
      }

      // If we're hovering a concrete hour cell in day/week view,
      // we want the pill to linger for a short moment so fast moves
      // don't immediately snap to the in-grid marker.
      const target = event.target;
      if (target) {
        const overHourCell =
          target.closest('.hour-cell') ||
          target.closest('.day-hour-cell');
        if (overHourCell) {
          const now = Date.now();
          if (!hourHoverRef.current) {
            hourHoverRef.current = now;
          }
          // Only hand off to the hour marker after a short hover
          if (now - hourHoverRef.current > 750) {
            setDragState(null);
            setOverlayState(false);
            return;
          }
        } else {
          // Reset the hover timer when we leave hour cells
          hourHoverRef.current = null;
        }
      }

      const meta = window.__chronosDraggedTodoMeta || null;
      if (!meta) {
        setDragState(null);
        return;
      }

      const rawColor = typeof meta.color === 'string' ? meta.color.toLowerCase() : meta.color;
      const colorName = normalizeToPaletteColor(rawColor || 'blue');

      setDragState({
        title: meta.title || 'New task',
        colorName,
        x: event.clientX ?? 0,
        y: event.clientY ?? 0
      });
      setOverlayState(true);
    };

    const clear = () => {
      setDragState(null);
      setOverlayState(false);
      hourHoverRef.current = null;
    };

    // Track drag position while over the calendar
    window.addEventListener('dragover', updateFromEvent, true);
    window.addEventListener('dragstart', updateFromEvent, true);
    window.addEventListener('dragend', clear, true);
    window.addEventListener('drop', clear, true);
    window.addEventListener('dragcancel', clear, true);

    return () => {
      window.removeEventListener('dragover', updateFromEvent, true);
      window.removeEventListener('dragstart', updateFromEvent, true);
      window.removeEventListener('dragend', clear, true);
      window.removeEventListener('drop', clear, true);
      window.removeEventListener('dragcancel', clear, true);
      setOverlayState(false);
    };
  }, []);

  if (typeof document === 'undefined' || !dragState) {
    return null;
  }

  const colors = getEventColors(dragState.colorName);

  const overlayStyle = {
    left: `${dragState.x + 16}px`,
    top: `${dragState.y - 8}px`,
    transform: 'translate(-50%, -50%) rotate(-6deg)'
  };

  const pillStyle = {
    backgroundColor: colors.background,
    color: colors.text
  };

  const lineStyle = {
    backgroundColor: colors.border
  };

  const content = (
    <div className="todo-drag-overlay" style={overlayStyle}>
      <div className="todo-drag-pill" style={pillStyle}>
        <span className="todo-drag-pill-line" style={lineStyle} />
        <span className="todo-drag-pill-title">
          {dragState.title}
        </span>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default TodoDragOverlay;
