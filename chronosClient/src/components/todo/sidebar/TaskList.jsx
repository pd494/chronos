import React, { useEffect, useRef, useState } from 'react';
import Sortable from 'sortablejs';
import { useTaskContext } from '../../../context/TaskContext';
import './TaskList.css';

const DRAG_CLICK_SUPPRESSION_MS = 1200;

// Shared drag state across all category groups
const globalDragState = { dragging: false, lastEnd: 0 };

const TaskItem = ({ task, onToggleComplete }) => {
  const checkboxRef = useRef(null);
  const [isChecking, setIsChecking] = useState(false);
  
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
      className={`task-item ${task.completed ? 'completed' : ''}`}
      data-id={task.id}
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
      onStart(evt) {
        globalDragState.dragging = true;
        document.body.classList.add('task-dragging');
        document.documentElement.classList.add('dragging');
        if (evt.item) {
          const taskId = evt.item.getAttribute('data-id');
          evt.item.setAttribute('data-task-id', taskId);
        }
      },
      onClone(evt) {
        // Mark the clone so we know it's safe to remove
        if (evt.clone) {
          evt.clone.setAttribute('data-is-clone', 'true');
        }
      },
      onEnd(evt) {
        document.body.classList.remove('task-dragging');
        document.documentElement.classList.remove('dragging');
        globalDragState.lastEnd = Date.now();
        
        // Delay clearing the dragging flag to prevent race conditions
        setTimeout(() => {
          globalDragState.dragging = false;
        }, 100);
        
        // Clean up only clones and ghost elements
        setTimeout(() => {
          try {
            // Remove clones that were dropped outside
            document.querySelectorAll('[data-is-clone="true"]').forEach(el => {
              if (el && el.parentNode) {
                el.parentNode.removeChild(el);
              }
            });
            // Remove ghost elements
            document.querySelectorAll('.sortable-ghost, .task-ghost').forEach(el => {
              if (el && el.parentNode) {
                el.parentNode.removeChild(el);
              }
            });
          } catch (_) {}
        }, 0);
        
        // Force React re-render as safety net (one frame delay)
        requestAnimationFrame(() => {
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
        {category.name !== 'Completed' && (
          <button 
            className="add-task-to-category-button"
            onClick={(e) => {
              e.stopPropagation();
              setIsEditingNewTask(true);
            }}
          >+
          </button>
        )}
      </div>
      
      {!isCollapsed && (
        <div className="category-tasks" ref={tasksContainerRef} key={renderKey}>
          {tasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
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
  const { addTask } = useTaskContext();
  const [renderKey, setRenderKey] = useState(0);
  const regularTasksContainerRef = useRef(null);
  const regularSortableRef = useRef(null);
  
  const handleAddTaskToCategory = (text, categoryName) => {
    addTask({ content: text, categoryName });
  };
  
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
        onStart: function(evt) {
          globalDragState.dragging = true;
          document.body.classList.add('task-dragging');
          document.documentElement.classList.add('dragging');
          if (evt.item) {
            const taskId = evt.item.getAttribute('data-id');
            evt.item.setAttribute('data-task-id', taskId);
          }
        },
        onClone: function(evt) {
          // Mark the clone so we know it's safe to remove
          if (evt.clone) {
            evt.clone.setAttribute('data-is-clone', 'true');
          }
        },
        onEnd: function(evt) {
          document.body.classList.remove('task-dragging');
          document.documentElement.classList.remove('dragging');
          globalDragState.lastEnd = Date.now();
          
          // Delay clearing the dragging flag to prevent race conditions
          setTimeout(() => {
            globalDragState.dragging = false;
          }, 100);
          
          // Clean up only clones and ghost elements
          setTimeout(() => {
            try {
              // Remove clones that were dropped outside
              document.querySelectorAll('[data-is-clone="true"]').forEach(el => {
                if (el && el.parentNode) {
                  el.parentNode.removeChild(el);
                }
              });
              // Remove ghost elements
              document.querySelectorAll('.sortable-ghost, .task-ghost').forEach(el => {
                if (el && el.parentNode) {
                  el.parentNode.removeChild(el);
                }
              });
            } catch (_) {}
          }, 0);
          
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
  
  if (activeCategory === 'All') {
    const tasksByCategory = {};
    
    categories.forEach(cat => {
      if (cat.id !== 'all' && cat.id !== 'add-category') {
        const orderValue = typeof cat.order === 'number' ? cat.order : categories.findIndex(c => c.id === cat.id);
        tasksByCategory[cat.name] = {
          tasks: [],
          icon: cat.icon,
          order: orderValue
        };
      }
    });
    
    tasks.forEach(task => {
      const category = task.category_name;
      if (!category || category === 'Uncategorized') return;
      
      if (!tasksByCategory[category]) {
        tasksByCategory[category] = {
          tasks: [],
          icon: '⬤',
          order: category === 'Completed' ? Number.MAX_SAFE_INTEGER : Object.keys(tasksByCategory).length
        };
      }
      tasksByCategory[category].tasks.push(task);
    });
    
    categories.forEach(cat => {
      if (cat.id !== 'all' && cat.id !== 'add-category' && !tasksByCategory[cat.name]) {
        const orderValue = typeof cat.order === 'number' ? cat.order : categories.findIndex(c => c.id === cat.id);
        tasksByCategory[cat.name] = {
          tasks: [],
          icon: cat.icon,
          order: orderValue
        };
      }
    });
    
    const sortedCategories = Object.entries(tasksByCategory)
      .sort(([, a], [, b]) => a.order - b.order);
    
    return (
      <div className="task-list" data-view="all">
        {sortedCategories.map(([categoryName, { tasks, icon }], index) => (
          <div key={categoryName} className={`category-group-wrapper ${index > 0 ? 'with-spacing' : ''}`}>
            <CategoryGroup
              category={{ name: categoryName, icon }}
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
