import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { getEventColors, normalizeToPaletteColor } from '../lib/eventColors';

const TodoDragOverlay = () => {
  const [dragState, setDragState] = useState(null);
  const hourHoverRef = useRef(null);
  const suppressOverlayRef = useRef(false);

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

    const forceHideOverlay = () => {
      suppressOverlayRef.current = true;
      setDragState(null);
      setOverlayState(false); // keep global flag in sync
      hourHoverRef.current = null;

      if (typeof document !== 'undefined') {
        const cleanupOnce = () => {
          document.querySelectorAll('.todo-drag-overlay').forEach(el => {
            try {
              // Hide in-place so React can still unmount without errors
              el.style.setProperty('display', 'none', 'important');
              el.style.setProperty('opacity', '0', 'important');
              el.style.setProperty('pointer-events', 'none', 'important');
            } catch (_) {}
          });
        };
        cleanupOnce();
        // In case a portal re-renders briefly after drop, keep
        // removing any stray overlays for a few frames so the pill
        // never lingers visually.
        let frames = 8;
        const loop = () => {
          cleanupOnce();
          frames -= 1;
          if (frames > 0 && typeof window !== 'undefined') {
            window.requestAnimationFrame(loop);
          }
        };
        if (typeof window !== 'undefined') {
          window.requestAnimationFrame(loop);
        }
      }
    };

    const updateFromEvent = (event) => {
      if (suppressOverlayRef.current) {
        return;
      }
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
        isOverCalendar = event.clientX > rect.right + 14;
      }
      const hasCalendarFocus = document.body.classList.contains('calendar-drag-focus');
      if (!isOverCalendar && !hasCalendarFocus) {
        setDragState(null);
        setOverlayState(false);
        return;
      }

      const target = event.target;
      if (target) {
        // If we're hovering a concrete hour cell in day/week view,
        // we want the pill to linger for a short moment so fast moves
        // don't immediately snap to the in-grid marker.
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
      forceHideOverlay();
    };

    const handleHide = () => {
      forceHideOverlay();
    };

    const handleSuppress = () => {
      suppressOverlayRef.current = true;
      forceHideOverlay();
    };

    // On drop, only hide immediately if this wasn't
    // a valid calendar drop; for real calendar drops
    // we rely on the todoConvertedToEvent signal so the
    // pill and the new event swap places seamlessly.
    const handleDrop = () => {
      // Always hide immediately on any drop so the pill never lingers
      forceHideOverlay();
    };

    // Also hide on pointer/mouse/touch release in case drop is swallowed
    const handlePointerUp = () => forceHideOverlay();

    const handleDragStart = (event) => {
      suppressOverlayRef.current = false;
      updateFromEvent(event);
    };

    const handleTodoConverted = () => {
      // As soon as the todo is converted (optimistic
      // or resolved), hide the floating pill so only
      // the real calendar event remains.
      forceHideOverlay();
    };

    window.addEventListener('dragover', updateFromEvent, true);
    window.addEventListener('dragstart', handleDragStart, true);
    window.addEventListener('dragend', clear, true);
    // Use capture phase for drop so we can react globally
    window.addEventListener('drop', handleDrop, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('mouseup', handlePointerUp, true);
    window.addEventListener('touchend', handlePointerUp, true);
    window.addEventListener('touchcancel', handlePointerUp, true);
    window.addEventListener('dragcancel', clear, true);
    // Explicit hide signal so calendar views can
    // dismiss the pill immediately on drop/convert.
    window.addEventListener('chronos-todo-overlay-hide', handleHide, true);
    // Suppress for cases (like month view) where we want to fully hand off to inline preview
    window.addEventListener('chronos-todo-overlay-suppress', handleSuppress, true);
    window.addEventListener('todoConvertedToEvent', handleTodoConverted, true);

    return () => {
      window.removeEventListener('dragover', updateFromEvent, true);
      window.removeEventListener('dragstart', handleDragStart, true);
      window.removeEventListener('dragend', clear, true);
      window.removeEventListener('drop', handleDrop, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('mouseup', handlePointerUp, true);
      window.removeEventListener('touchend', handlePointerUp, true);
      window.removeEventListener('touchcancel', handlePointerUp, true);
      window.removeEventListener('dragcancel', clear, true);
      window.removeEventListener('chronos-todo-overlay-hide', handleHide, true);
      window.removeEventListener('chronos-todo-overlay-suppress', handleSuppress, true);
      window.removeEventListener('todoConvertedToEvent', handleTodoConverted, true);
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
    <div
      className="todo-drag-overlay fixed z-[99999] pointer-events-none opacity-100"
      style={overlayStyle}
    >
      <div
        className="inline-flex items-center gap-1.5 px-3.5 py-[13px] rounded-xl shadow-[0_10px_30px_rgba(15,23,42,0.28)] text-base font-medium max-w-[700px] leading-tight whitespace-nowrap overflow-hidden text-ellipsis"
        style={pillStyle}
      >
        <span
          className="w-1 h-5 rounded-full flex-shrink-0"
          style={lineStyle}
        />
        <span className="max-w-[630px] truncate">
          {dragState.title}
        </span>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};

export default TodoDragOverlay;
