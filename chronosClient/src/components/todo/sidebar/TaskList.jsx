import React, { useEffect, useRef, useState } from 'react';
import Sortable from 'sortablejs';
import { useTaskContext } from '../../../context/TaskContext';
import './TaskList.css';
import TaskScheduledBadge from './TaskScheduledBadge';

const DRAG_CLICK_SUPPRESSION_MS = 1200;

// Shared drag state across all category groups
const globalDragState = { dragging: false, lastEnd: 0 };

// Pre-load a 1x1 transparent image to use as drag image (avoids browser default icon)
const transparentDragImage = new Image();
transparentDragImage.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

let dragMonitorCleanup = null;
let hideAnimationFrameId = null;
let isOverCalendar = false;

const hideSortableDragElements = () => {
  // Hide ALL drag/ghost/clone elements by setting inline styles, but never hide
  // the original sidebar todo items themselves.
  document
    .querySelectorAll(
      '.sortable-drag, .sortable-ghost, .sortable-fallback, .task-drag, .task-ghost, [data-is-clone="true"]'
    )
    .forEach(el => {
      const isSidebarTaskItem = el.classList.contains('task-item') && !!el.closest('.sidebar');
      const isClone = el.getAttribute('data-is-clone') === 'true';

      // If it's the original sidebar item (not a clone), keep it visible.
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

const showSortableDragElements = () => {
  document
    .querySelectorAll(
      '.sortable-drag, .sortable-ghost, .sortable-fallback, .task-drag, .task-ghost'
    )
    .forEach(el => {
      // NEVER show clones - they should always be removed, not shown
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

// Continuously hide elements while over calendar (Sortable.js re-applies styles)
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

const startCalendarDragMonitor = () => {
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
        // Just crossed from sidebar into calendar: hide ghosts and switch
        // the browser drag image to a transparent pixel so the blue pill
        // disappears while over the calendar.
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
const stopCalendarDragMonitor = () => {
  if (typeof dragMonitorCleanup === 'function') {
    dragMonitorCleanup();
  }
  dragMonitorCleanup = null;
};

const cleanupDragArtifacts = () => {
  try {
    // Stop the hide loop
    stopHideLoop();
    isOverCalendar = false;
    
    document.body.classList.remove('calendar-drag-focus');
    document.body.classList.remove('task-dragging');
    document.documentElement.classList.remove('dragging');
    
    // FIRST: Remove ALL clones everywhere (including inside task list)
    // This is critical to prevent duplicate todos
    document.querySelectorAll('[data-is-clone="true"]').forEach(el => {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    
    // Clean up sortable classes from all task items
    document.querySelectorAll('.task-item').forEach(el => {
      el.classList.remove('sortable-chosen', 'sortable-ghost', 'sortable-drag', 'task-chosen', 'task-ghost', 'task-drag', 'dragging');
      el.removeAttribute('data-dragging');
    });
    
    // Remove ghost/drag elements outside of task list
    ['.sortable-ghost', '.task-ghost', '.sortable-drag', '.task-drag'].forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (!el.closest('.task-list')) {
          el.parentNode?.removeChild(el);
        }
      });
    });
    
    // Also remove inline styles from any remaining drag elements
    showSortableDragElements();
    
    // Clear dragover styling
    document.querySelectorAll('.event-dragover, .sortable-dragover').forEach(el => {
      el.classList.remove('event-dragover', 'sortable-dragover');
    });
  } catch (_) {}
};

const TaskItem = ({ task, onToggleComplete, categoryColor }) => {
  const checkboxRef = useRef(null);
  const [isChecking, setIsChecking] = useState(false);
  const isScheduled = Boolean(task.scheduled_date || task.scheduled_at);
  
  const handleCheckboxClick = (id) => {
    if (!task.completed) {
      setIsChecking(true);
      if (checkboxRef.current) {
        checkboxRef.current.classList.add('checking');
      }
      
      setTimeout(() => {
        if (checkboxRef.current) {
          checkboxRef.current.classList.remove('checking');
        }
        setIsChecking(false);
        onToggleComplete(id);
      }, 30);
    } else {
      onToggleComplete(id);
    }
  };
  
  return (
    <div 
      className={`task-item ${task.completed ? 'completed' : ''} ${isScheduled ? 'scheduled' : ''}`}
      data-id={task.id}
      data-task-id={task.id}
      data-task-title={task.content || ''}
      data-task-color={categoryColor || ''}
      data-scheduled={isScheduled ? 'true' : 'false'}
    >
      <div 
        ref={checkboxRef}
        className={`task-checkbox ${task.completed ? 'completed' : ''} ${isChecking ? 'checking' : ''}`}
        onClick={() => handleCheckboxClick(task.id)}
      >
        {(task.completed || isChecking) ? <span>✓</span> : <span></span>}
      </div>
      <div className="task-content">
        <div className="task-text">{task.content}</div>
        <TaskScheduledBadge task={task} />
      </div>
      <div className="task-drag-handle">
        <span>⋮⋮</span>
      </div>
    </div>
  );
};

const CategoryGroup = ({ category, tasks, onToggleComplete, onAddTaskToCategory }) => {
  const [isCollapsed, setIsCollapsed] = useState(category.name === 'Completed');
  const [isEditingNewTask, setIsEditingNewTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [renderKey, setRenderKey] = useState(0);
  const newTaskInputRef = useRef(null);
  const tasksContainerRef = useRef(null);
  const sortableRef = useRef(null);
  
  useEffect(() => {
    if (isEditingNewTask && newTaskInputRef.current) {
      newTaskInputRef.current.focus();
    }
  }, [isEditingNewTask]);

  // Global dragend listener to catch cancelled drags
  useEffect(() => {
    const handleGlobalDragEnd = () => {
      // Clean up if drag ends anywhere (cancelled or otherwise)
      setTimeout(() => {
        if (!globalDragState.dragging) return;
        globalDragState.dragging = false;
        cleanupDragArtifacts();
        stopCalendarDragMonitor();
        if (typeof window !== 'undefined') {
          window.__chronosDraggedTodoMeta = null;
        }
        setRenderKey(prev => prev + 1);
      }, 50);
    };

    document.addEventListener('dragend', handleGlobalDragEnd);
    return () => {
      document.removeEventListener('dragend', handleGlobalDragEnd);
    };
  }, []);
  
  // Set transparent drag image on native dragstart to hide browser ghost
  useEffect(() => {
    const container = tasksContainerRef.current;
    if (!container) return;
    
    const handleDragStart = (e) => {
      if (!e.target.closest('.task-drag-handle')) return;
    };
    
    container.addEventListener('dragstart', handleDragStart, true);
    return () => container.removeEventListener('dragstart', handleDragStart, true);
  }, [isCollapsed]);
  
  useEffect(() => {
    if (!tasksContainerRef.current || isCollapsed) {
      if (sortableRef.current) {
        sortableRef.current.destroy();
        sortableRef.current = null;
      }
      return;
    }

    if (sortableRef.current) {
      return;
    }

    const sortable = Sortable.create(tasksContainerRef.current, {
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
      onMove: (evt) => {
        return evt.dragged?.dataset?.scheduled !== 'true';
      },
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
            window.__chronosDraggedTodoMeta = {
              title,
              color,
              taskId
            };
          }
        }
      },
      onClone(evt) {
        // Mark the clone so we know it's safe to remove
        if (evt.clone) {
          evt.clone.setAttribute('data-is-clone', 'true');
          // Hide the clone immediately - we only want the drag ghost visible
          evt.clone.style.setProperty('display', 'none', 'important');
        }
      },
      onUnchoose(evt) {
        // When drag is cancelled or ends, immediately remove all clones
        document.querySelectorAll('[data-is-clone="true"]').forEach(el => {
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
      },
      onEnd(evt) {
        // Immediate state cleanup
        document.body.classList.remove('task-dragging');
        document.body.classList.remove('calendar-drag-focus');
        document.documentElement.classList.remove('dragging');
        globalDragState.lastEnd = Date.now();
        if (typeof window !== 'undefined') {
          window.__chronosDraggedTodoMeta = null;
        }
        
        // IMMEDIATELY remove all clones - this prevents duplicate todos
        document.querySelectorAll('[data-is-clone="true"]').forEach(el => {
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
        
        // Immediate cleanup
        cleanupDragArtifacts();
        stopCalendarDragMonitor();
        
        // Remove dragging attribute and sortable classes from source item
        if (evt.item) {
          evt.item.removeAttribute('data-dragging');
          evt.item.classList.remove('sortable-chosen', 'sortable-ghost', 'sortable-drag', 'task-chosen', 'task-ghost', 'task-drag', 'dragging');
        }
        
        // Clean up all sortable classes from task items in the sidebar
        document.querySelectorAll('.task-item').forEach(el => {
          el.classList.remove('sortable-chosen', 'sortable-ghost', 'sortable-drag', 'task-chosen', 'task-ghost', 'task-drag', 'dragging');
          el.removeAttribute('data-dragging');
          el.style.opacity = '';
          el.style.cursor = '';
        });
        
        // Clear dragover styling
        document.querySelectorAll('.event-dragover, .sortable-dragover').forEach(el => {
          el.classList.remove('event-dragover', 'sortable-dragover');
        });
        
        // Delay clearing the dragging flag to prevent race conditions
        setTimeout(() => {
          globalDragState.dragging = false;
        }, 100);
        
        // Thorough cleanup of all drag artifacts
        requestAnimationFrame(() => {
          try {
            // Remove any remaining clones
            document.querySelectorAll('[data-is-clone="true"]').forEach(el => {
              if (el && el.parentNode) {
                el.parentNode.removeChild(el);
              }
            });
            // Remove ghost elements that are NOT in the task list
            ['.sortable-ghost', '.task-ghost', '.sortable-drag', '.task-drag', '.sortable-chosen'].forEach(sel => {
              document.querySelectorAll(sel).forEach(el => {
                if (!el.closest('.task-list')) {
                  el.parentNode?.removeChild(el);
                }
              });
            });
            
            // Final cleanup of task items
            document.querySelectorAll('.task-item').forEach(el => {
              el.classList.remove('sortable-chosen', 'sortable-ghost', 'sortable-drag', 'task-chosen', 'task-ghost', 'task-drag', 'dragging');
            });
          } catch (_) {}
          
          setRenderKey(prev => prev + 1);
        });
      }
    });

    sortableRef.current = sortable;

    return () => {
      if (sortableRef.current) {
        sortableRef.current.destroy();
        sortableRef.current = null;
      }
    };
  }, [isCollapsed, category?.name, tasks, renderKey]);
  
  const handleAddTask = () => {
    if (newTaskText.trim()) {
      onAddTaskToCategory(newTaskText, category.name);
      setNewTaskText('');
      setIsEditingNewTask(false);
    }
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleAddTask();
    } else if (e.key === 'Escape') {
      setIsEditingNewTask(false);
      setNewTaskText('');
    }
  };
  
  const getCategoryIcon = () => {
    if (!category.icon) return '⬤';
    if (category.icon.startsWith('#')) {
      return <span className="dot" style={{ backgroundColor: category.icon }}></span>;
    }
    return category.icon;
  };

  const handleHeaderActivate = (event) => {
    const now = Date.now();
    if (globalDragState.dragging || now - globalDragState.lastEnd < DRAG_CLICK_SUPPRESSION_MS) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    setIsCollapsed(prev => !prev);
  };

  return (
    <div className="category-group">
      <div className="category-header-container">
        <div 
          className="category-header" 
          role="button"
          tabIndex={0}
          onClick={handleHeaderActivate}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleHeaderActivate(event);
            }
          }}
        >
          <span className="category-icon">{getCategoryIcon()}</span>
          <span className="category-name">{category.name}</span>
          <span className="category-count">{tasks.length}</span>
          <span className={`collapse-arrow ${isCollapsed ? 'collapsed' : ''}`}>
            ▼
          </span>
        </div>
        {category.name !== 'Completed' ? (
          <button 
            className="add-task-to-category-button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(false);
              setNewTaskText('');
              setIsEditingNewTask(true);
            }}
          >
            +
          </button>
        ) : (
          <span className="add-task-placeholder" aria-hidden="true" />
        )}
      </div>
      
      {!isCollapsed && (
        <div className="category-tasks" ref={tasksContainerRef} key={renderKey}>
          {tasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              categoryColor={typeof category.icon === 'string' && category.icon.startsWith('#') ? category.icon : ''}
              onToggleComplete={onToggleComplete}
            />
          ))}
          
          {isEditingNewTask && (
            <div className="task-item new-task-item">
              <div className="task-checkbox">
                <span></span>
              </div>
              <div className="task-text">
                <input
                  ref={newTaskInputRef}
                  type="text"
                  className="new-task-input"
                  placeholder="Type a new task..."
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleAddTask}
                  autoFocus
                />
              </div>
              <div className="task-drag-handle">
                <span>⋮⋮</span>
              </div>
            </div>
          )}
          
          {tasks.length === 0 && !isEditingNewTask && (
            <div className="empty-category">
              <p>No tasks in this category</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const TaskList = ({ tasks, onToggleComplete, activeCategory, categories }) => {
  const { addTask, reorderCategories } = useTaskContext();
  const [renderKey, setRenderKey] = useState(0);
  const regularTasksContainerRef = useRef(null);
  const regularSortableRef = useRef(null);
  const categoryContainerRef = useRef(null);
  const categorySortableRef = useRef(null);

  // Global dragstart handler: ensure todos always use a transparent drag image
  // so the browser's default blue overlay ghost never appears.
  useEffect(() => {
    const handleGlobalDragStart = (e) => {
      // Only adjust drags that originate from todo items / drag handles
      const isTodoDrag =
        !!e.target.closest('.task-item') ||
        !!e.target.closest('.task-drag-handle');
      if (!isTodoDrag) return;
      if (!e.dataTransfer) return;

      try {
        // Use the pre-loaded transparent image so the OS drag image
        // itself is invisible; the visible blue pill comes from
        // Sortable's DOM ghost, which we can hide when focused on the
        // calendar via calendar-drag-focus.
        e.dataTransfer.setDragImage(transparentDragImage, 0, 0);
      } catch (_) {
        // If setDragImage is not supported, fail silently.
      }
    };

    window.addEventListener('dragstart', handleGlobalDragStart, true);
    return () => {
      window.removeEventListener('dragstart', handleGlobalDragStart, true);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key.toLowerCase() !== 'n') return;
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const mainInput = document.querySelector('.task-input-field');
      if (!mainInput) return;
      event.preventDefault();
      mainInput.focus();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  const handleAddTaskToCategory = (text, categoryName) => {
    addTask({ content: text, categoryName });
  };
  
  useEffect(() => {
    const handleGlobalDragEnd = () => cleanupDragArtifacts();
    document.addEventListener('dragend', handleGlobalDragEnd);
    document.addEventListener('drop', handleGlobalDragEnd);
    return () => {
      document.removeEventListener('dragend', handleGlobalDragEnd);
      document.removeEventListener('drop', handleGlobalDragEnd);
      stopCalendarDragMonitor();
    };
  }, []);

  // Set transparent drag image on native dragstart to hide browser ghost
  useEffect(() => {
    const container = regularTasksContainerRef.current;
    if (!container) return;
    
    const handleDragStart = (e) => {
      if (!e.target.closest('.task-drag-handle')) return;
    };
    
    container.addEventListener('dragstart', handleDragStart, true);
    return () => container.removeEventListener('dragstart', handleDragStart, true);
  }, [activeCategory]);

  useEffect(() => {
    if (regularTasksContainerRef.current && activeCategory !== 'All') {
      if (regularSortableRef.current) {
        return;
      }

      const sortable = Sortable.create(regularTasksContainerRef.current, {
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
        onMove: function(evt) {
          return evt.dragged?.dataset?.scheduled !== 'true';
        },
        onStart: function(evt) {
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
              window.__chronosDraggedTodoMeta = {
                title,
                color,
                taskId
              };
            }
          }
        },
        onClone: function(evt) {
          // Mark the clone so we know it's safe to remove
          if (evt.clone) {
            evt.clone.setAttribute('data-is-clone', 'true');
            // Hide the clone immediately - we only want the drag ghost visible
            evt.clone.style.setProperty('display', 'none', 'important');
          }
        },
        onUnchoose: function(evt) {
          // When drag is cancelled or ends, immediately remove all clones
          document.querySelectorAll('[data-is-clone="true"]').forEach(el => {
            if (el && el.parentNode) {
              el.parentNode.removeChild(el);
            }
          });
        },
        onEnd: function(evt) {
          document.body.classList.remove('task-dragging');
          document.body.classList.remove('calendar-drag-focus');
          document.documentElement.classList.remove('dragging');
          globalDragState.lastEnd = Date.now();
          if (typeof window !== 'undefined') {
            window.__chronosDraggedTodoMeta = null;
          }
          
          // IMMEDIATELY remove all clones - this prevents duplicate todos
          document.querySelectorAll('[data-is-clone="true"]').forEach(el => {
            if (el && el.parentNode) {
              el.parentNode.removeChild(el);
            }
          });
          
          // Immediate cleanup
          cleanupDragArtifacts();
          stopCalendarDragMonitor();
          
          // Delay clearing the dragging flag to prevent race conditions
          setTimeout(() => {
            globalDragState.dragging = false;
          }, 100);
          
          // Force React re-render as safety net (one frame delay)
          requestAnimationFrame(() => {
            setRenderKey(prev => prev + 1);
          });
        }
      });
      
      regularSortableRef.current = sortable;

      return () => {
        if (regularSortableRef.current) {
          regularSortableRef.current.destroy();
          regularSortableRef.current = null;
        }
      };
    } else if (regularSortableRef.current) {
      regularSortableRef.current.destroy();
      regularSortableRef.current = null;
    }
  }, [activeCategory, renderKey]);
  
  // Set up category reordering when viewing All
  useEffect(() => {
    if (activeCategory !== 'All' || !categoryContainerRef.current) {
      if (categorySortableRef.current) {
        categorySortableRef.current.destroy();
        categorySortableRef.current = null;
      }
      return;
    }

    if (categorySortableRef.current) {
      return;
    }

    const sortable = Sortable.create(categoryContainerRef.current, {
      animation: 150,
      handle: '.category-header',
      ghostClass: 'category-ghost',
      chosenClass: 'category-chosen',
      dragClass: 'category-drag',
      onStart() {
        globalDragState.dragging = true;
        document.body.classList.add('category-dragging');
      },
      onEnd(evt) {
        document.body.classList.remove('category-dragging');
        globalDragState.lastEnd = Date.now();
        
        setTimeout(() => {
          globalDragState.dragging = false;
        }, 100);

        // Get new order from DOM
        const container = categoryContainerRef.current;
        if (!container) return;
        
        const orderedIds = Array.from(container.children)
          .map(el => el.getAttribute('data-category-id'))
          .filter(Boolean);
        
        if (orderedIds.length > 0 && reorderCategories) {
          reorderCategories(orderedIds);
        }
      }
    });

    categorySortableRef.current = sortable;

    return () => {
      if (categorySortableRef.current) {
        categorySortableRef.current.destroy();
        categorySortableRef.current = null;
      }
    };
  }, [activeCategory, reorderCategories, categories]);
  
  if (activeCategory === 'All') {
    const tasksByCategory = {};
    
    categories.forEach(cat => {
      if (cat.id !== 'all' && cat.id !== 'add-category') {
        const orderValue = typeof cat.order === 'number' ? cat.order : categories.findIndex(c => c.id === cat.id);
        // Ensure special categories have their proper colors
        const icon = cat.name === 'Completed' ? '#34C759' : cat.name === 'Today' ? '#FF9500' : cat.name === 'Inbox' ? '#1761C7' : cat.icon;
        tasksByCategory[cat.name] = {
          tasks: [],
          icon,
          order: orderValue,
          id: cat.id
        };
      }
    });
    
    tasks.forEach(task => {
      const category = task.category_name;
      if (!category || category === 'Uncategorized') return;
      
      if (!tasksByCategory[category]) {
        const cat = categories.find(c => c.name === category);
        // Ensure special categories have consistent IDs and colors
        const specialId = category === 'Completed' ? 'completed' : category === 'Today' ? 'today' : category === 'Inbox' ? 'inbox' : null;
        tasksByCategory[category] = {
          tasks: [],
          icon: cat?.icon || (category === 'Completed' ? '#34C759' : category === 'Today' ? '#FF9500' : category === 'Inbox' ? '#1761C7' : '⬤'),
          order: cat?.order !== undefined ? cat.order : (category === 'Completed' ? Number.MAX_SAFE_INTEGER : Object.keys(tasksByCategory).length),
          id: cat?.id || specialId || category
        };
      }
      tasksByCategory[category].tasks.push(task);
    });
    
    categories.forEach(cat => {
      if (cat.id !== 'all' && cat.id !== 'add-category' && !tasksByCategory[cat.name]) {
        const orderValue = typeof cat.order === 'number' ? cat.order : categories.findIndex(c => c.id === cat.id);
        // Ensure special categories have their proper colors
        const icon = cat.name === 'Completed' ? '#34C759' : cat.name === 'Today' ? '#FF9500' : cat.name === 'Inbox' ? '#1761C7' : cat.icon;
        tasksByCategory[cat.name] = {
          tasks: [],
          icon,
          order: orderValue,
          id: cat.id
        };
      }
    });
    
    const sortedCategories = Object.entries(tasksByCategory)
      .sort(([, a], [, b]) => a.order - b.order);
    
    return (
      <div className="task-list" data-view="all" ref={categoryContainerRef}>
        {sortedCategories.map(([categoryName, { tasks, icon, id }], index) => (
          <div 
            key={categoryName} 
            className={`category-group-wrapper ${index > 0 ? 'with-spacing' : ''}`}
            data-category-id={id}
          >
            <CategoryGroup
              category={{ name: categoryName, icon, id }}
              tasks={tasks}
              onToggleComplete={onToggleComplete}
              onAddTaskToCategory={handleAddTaskToCategory}
            />
          </div>
        ))}
        
        {tasks.length === 0 && (
          <div className="empty-task-list">
            <p>No tasks</p>
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div className="task-list" ref={regularTasksContainerRef} key={renderKey}>
      {tasks.map(task => (
        <TaskItem
          key={task.id}
          task={task}
          onToggleComplete={onToggleComplete}
        />
      ))}
      
      {tasks.length === 0 && (
        <div className="empty-task-list">
          <p>No tasks in this category</p>
        </div>
      )}
    </div>
  );
};

export default TaskList;
