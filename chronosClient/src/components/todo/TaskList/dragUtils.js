export const DRAG_CLICK_SUPPRESSION_MS = 1200;

export const globalDragState = { dragging: false, lastEnd: 0 };

export const transparentDragImage = new Image();
transparentDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

let dragMonitorCleanup = null;
let hideAnimationFrameId = null;
let isOverCalendar = false;

export const hideSortableDragElements = () => {
  document
    .querySelectorAll(
      '.sortable-drag, .sortable-ghost, .sortable-fallback, .task-drag, .task-ghost, [data-is-clone="true"]'
    )
    .forEach(el => {
      const isSidebarTaskItem = el.classList.contains('task-item') && !!el.closest('.sidebar');
      const isClone = el.getAttribute('data-is-clone') === 'true';

      if (isSidebarTaskItem && !isClone) {
        return;
      }

      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('opacity', '0', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      el.style.setProperty('position', 'fixed', 'important');
      el.style.setProperty('left', '-9999px', 'important');
      el.style.setProperty('top', '-9999px', 'important');
    });
};

export const showSortableDragElements = () => {
  document
    .querySelectorAll(
      '.sortable-drag, .sortable-ghost, .sortable-fallback, .task-drag, .task-ghost'
    )
    .forEach(el => {
      if (el.getAttribute('data-is-clone') === 'true') {
        return;
      }
      el.style.removeProperty('display');
      el.style.removeProperty('opacity');
      el.style.removeProperty('visibility');
      el.style.removeProperty('pointer-events');
      el.style.removeProperty('position');
      el.style.removeProperty('left');
      el.style.removeProperty('top');
    });
};

const startHideLoop = () => {
  const loop = () => {
    if (isOverCalendar) {
      hideSortableDragElements();
      hideAnimationFrameId = requestAnimationFrame(loop);
    }
  };
  hideAnimationFrameId = requestAnimationFrame(loop);
};

const stopHideLoop = () => {
  if (hideAnimationFrameId) {
    cancelAnimationFrame(hideAnimationFrameId);
    hideAnimationFrameId = null;
  }
};

export const startCalendarDragMonitor = () => {
  const sidebarEl = document.querySelector('.sidebar');
  if (!sidebarEl) return;
  const rect = sidebarEl.getBoundingClientRect();
  const handler = (evt) => {
    if (!document.body.classList.contains('task-dragging')) return;
    const wasOverCalendar = isOverCalendar;
    isOverCalendar = evt.clientX > rect.right;
    
    if (isOverCalendar) {
      document.body.classList.add('calendar-drag-focus');
      if (!wasOverCalendar) {
        if (evt.dataTransfer) {
          try {
            evt.dataTransfer.setDragImage(transparentDragImage, 0, 0);
          } catch (_) {}
        }
        startHideLoop();
      }
    } else {
      document.body.classList.remove('calendar-drag-focus');
      if (wasOverCalendar) {
        stopHideLoop();
        showSortableDragElements();
      }
    }
  };
  window.addEventListener('dragover', handler, true);
  dragMonitorCleanup = () => {
    window.removeEventListener('dragover', handler, true);
    stopHideLoop();
    isOverCalendar = false;
  };
};

export const stopCalendarDragMonitor = () => {
  if (typeof dragMonitorCleanup === 'function') {
    dragMonitorCleanup();
  }
  dragMonitorCleanup = null;
};

export const cleanupDragArtifacts = () => {
  try {
    stopHideLoop();
    isOverCalendar = false;
    
    document.body.classList.remove('calendar-drag-focus');
    document.body.classList.remove('task-dragging');
    document.documentElement.classList.remove('dragging');
    
    document.querySelectorAll('[data-is-clone="true"]').forEach(el => {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    
    document.querySelectorAll('.task-item').forEach(el => {
      el.classList.remove('sortable-chosen', 'sortable-ghost', 'sortable-drag', 'task-chosen', 'task-ghost', 'task-drag', 'dragging');
      el.removeAttribute('data-dragging');
    });
    
    ['.sortable-ghost', '.task-ghost', '.sortable-drag', '.task-drag'].forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (!el.closest('.task-list')) {
          el.parentNode?.removeChild(el);
        }
      });
    });
    
    showSortableDragElements();
    
    document.querySelectorAll('.event-dragover, .sortable-dragover').forEach(el => {
      el.classList.remove('event-dragover', 'sortable-dragover');
    });
  } catch (_) {}
};

export const createSortableConfig = (setRenderKey) => ({
  animation: 150,
  handle: '.task-drag-handle',
  filter: '.task-checkbox, .task-text',
  preventOnFilter: false,
  group: {
    name: 'tasks',
    pull: 'clone',
    put: false,
    revertClone: true
  },
  sort: false,
  revertOnSpill: true,
  removeCloneOnHide: false,
  ghostClass: 'task-ghost',
  chosenClass: 'task-chosen',
  dragClass: 'task-drag',
  onMove: (evt) => evt.dragged?.dataset?.scheduled !== 'true',
  onStart(evt) {
    globalDragState.dragging = true;
    document.body.classList.add('task-dragging');
    document.documentElement.classList.add('dragging');
    startCalendarDragMonitor();
    
    if (evt.item) {
      const taskId = evt.item.getAttribute('data-id');
      evt.item.setAttribute('data-task-id', taskId);
      evt.item.setAttribute('data-dragging', 'true');
      const title = evt.item.getAttribute('data-task-title') || 'New task';
      const colorAttr = evt.item.getAttribute('data-task-color') || '';
      const color = colorAttr ? colorAttr.toLowerCase() : 'blue';
      if (typeof window !== 'undefined') {
        window.__chronosDraggedTodoMeta = { title, color, taskId };
      }
    }
  },
  onClone(evt) {
    if (evt.clone) {
      evt.clone.setAttribute('data-is-clone', 'true');
      evt.clone.style.setProperty('display', 'none', 'important');
    }
  },
  onUnchoose() {
    document.querySelectorAll('[data-is-clone="true"]').forEach(el => {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
  },
  onEnd(evt) {
    document.body.classList.remove('task-dragging');
    document.body.classList.remove('calendar-drag-focus');
    document.documentElement.classList.remove('dragging');
    globalDragState.lastEnd = Date.now();
    if (typeof window !== 'undefined') {
      window.__chronosDraggedTodoMeta = null;
    }
    
    document.querySelectorAll('[data-is-clone="true"]').forEach(el => {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    
    cleanupDragArtifacts();
    stopCalendarDragMonitor();
    
    if (evt.item) {
      evt.item.removeAttribute('data-dragging');
      evt.item.classList.remove('sortable-chosen', 'sortable-ghost', 'sortable-drag', 'task-chosen', 'task-ghost', 'task-drag', 'dragging');
    }
    
    document.querySelectorAll('.task-item').forEach(el => {
      el.classList.remove('sortable-chosen', 'sortable-ghost', 'sortable-drag', 'task-chosen', 'task-ghost', 'task-drag', 'dragging');
      el.removeAttribute('data-dragging');
      el.style.opacity = '';
      el.style.cursor = '';
    });
    
    document.querySelectorAll('.event-dragover, .sortable-dragover').forEach(el => {
      el.classList.remove('event-dragover', 'sortable-dragover');
    });
    
    setTimeout(() => {
      globalDragState.dragging = false;
    }, 100);
    
    requestAnimationFrame(() => {
      try {
        document.querySelectorAll('[data-is-clone="true"]').forEach(el => {
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
        ['.sortable-ghost', '.task-ghost', '.sortable-drag', '.task-drag', '.sortable-chosen'].forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            if (!el.closest('.task-list')) {
              el.parentNode?.removeChild(el);
            }
          });
        });
        
        document.querySelectorAll('.task-item').forEach(el => {
          el.classList.remove('sortable-chosen', 'sortable-ghost', 'sortable-drag', 'task-chosen', 'task-ghost', 'task-drag', 'dragging');
        });
      } catch (_) {}
      
      if (setRenderKey) {
        setRenderKey(prev => prev + 1);
      }
    });
  }
});
