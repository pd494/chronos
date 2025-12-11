// Drag click suppression - prevents accidental clicks after drag end
export const DRAG_CLICK_SUPPRESSION_MS = 500;

// Global drag state (simplified - mainly for tracking if a drag was recent)
export const globalDragState = { dragging: false, lastEnd: 0 };

// Transparent drag image for native HTML5 fallback scenarios
export const transparentDragImage = new Image();
transparentDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Clean up any leftover drag artifacts from the DOM
 * This handles edge cases where drag elements might remain visible
 */
export const cleanupDragArtifacts = () => {
  try {
    // Remove body classes
    document.body.classList.remove('calendar-drag-focus');
    document.body.classList.remove('task-dragging');
    document.documentElement.classList.remove('dragging');

    // Clean up any remaining ghost elements
    document.querySelectorAll('[data-is-clone="true"]').forEach(el => {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });

    // Remove dragover styling
    document.querySelectorAll('.event-dragover, .sortable-dragover').forEach(el => {
      el.classList.remove('event-dragover', 'sortable-dragover');
    });

    // Clear global drag meta
    if (typeof window !== 'undefined') {
      window.__chronosDraggedTodoMeta = null;
    }
  } catch (_) { }
};
