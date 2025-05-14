import React, { useEffect, useRef, useState } from 'react';
import Sortable from 'sortablejs';
import { useTaskContext } from '../../../context/TaskContext';
import './TaskList.css';

// Task Item component
const TaskItem = ({ task, onToggleComplete }) => {
  const checkboxRef = useRef(null);
  
  const handleCheckboxClick = (id) => {
    // Add the animation class
    if (checkboxRef.current) {
      checkboxRef.current.classList.add('checking');
      
      // Remove the class after animation completes
      setTimeout(() => {
        if (checkboxRef.current) {
          checkboxRef.current.classList.remove('checking');
        }
      }, 300);
    }
    
    // Toggle the task complete state
    onToggleComplete(id);
  };
  
  return (
    <div 
      className={`task-item ${task.completed ? 'completed' : ''}`}
      data-id={task.id}
    >
      <div 
        ref={checkboxRef}
        className="task-checkbox"
        onClick={() => handleCheckboxClick(task.id)}
      >
        {task.completed ? <span>✓</span> : <span></span>}
      </div>
      <div className="task-text">{task.text}</div>
      <div className="task-drag-handle">
        <span>⋮⋮</span>
      </div>
    </div>
  );
};

const CategoryGroup = ({ category, tasks, onToggleComplete, onAddTaskToCategory }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isEditingNewTask, setIsEditingNewTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const newTaskInputRef = useRef(null);
  const tasksContainerRef = useRef(null);
  
  // Focus the input when it appears
  useEffect(() => {
    if (isEditingNewTask && newTaskInputRef.current) {
      newTaskInputRef.current.focus();
    }
  }, [isEditingNewTask]);
  
  // Set up sortable for dragging tasks within each category group
  useEffect(() => {
    if (tasksContainerRef.current) {
      const sortable = Sortable.create(tasksContainerRef.current, {
        animation: 150,
        handle: '.task-drag-handle',
        group: {
          name: 'tasks',
          pull: 'clone',
          put: false // Don't allow dropping back into the list
        },
        sort: false,
        ghostClass: 'task-ghost',
        chosenClass: 'task-chosen',
        dragClass: 'task-drag',
        onEnd: function(evt) {
          // This will be handled by the parent TaskList component
        }
      });
      
      return () => {
        sortable.destroy();
      };
    }
  }, [tasks]);
  
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
  
  return (
    <div className="category-group">
      <div className="category-header-container">
        <div 
          className="category-header" 
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <span className="category-icon">{category.icon || '⬤'}</span>
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
          >+</button>
        )}
      </div>
      
      {!isCollapsed && (
        <div className="category-tasks" ref={tasksContainerRef}>
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

const TaskList = ({ tasks, onToggleComplete, activeCategory, categories: propCategories }) => {
  const taskListRef = useRef(null);
  const { addTaskToCalendar, categories: contextCategories, addTask } = useTaskContext();
  
  // Use categories from props if provided, otherwise use from context
  const categories = propCategories || contextCategories;
  
  // Force re-render when categories change
  const [, forceUpdate] = useState({});
  useEffect(() => {
    forceUpdate({});
  }, [categories]);
  
  // Handler for adding a task to a specific category
  const handleAddTaskToCategory = (text, categoryName) => {
    addTask(text, categoryName);
  };
  
  // Only set up Sortable on the taskListRef for NON-All category views
  useEffect(() => {
    if (taskListRef.current && activeCategory !== 'All') {
      // Initialize Sortable for drag-and-drop functionality
      const sortable = Sortable.create(taskListRef.current, {
        animation: 150,
        handle: '.task-drag-handle',
        group: {
          name: 'tasks',
          pull: 'clone',
          put: false // Don't allow dropping back into the list
        },
        sort: false, // Disable sorting within the list
        ghostClass: 'task-ghost',
        chosenClass: 'task-chosen',
        dragClass: 'task-drag',
        onEnd: function(evt) {
          // Handle drop on calendar
          const taskId = evt.item.getAttribute('data-id');
          const targetDate = evt.to.getAttribute('data-date');
          
          if (targetDate && taskId) {
            // Add task to calendar on the target date
            addTaskToCalendar(taskId, targetDate);
            
            // Return the clone to the original list
            if (evt.pullMode === 'clone') {
              evt.item.parentNode.removeChild(evt.item);
            }
          }
        }
      });
      
      return () => {
        // Destroy Sortable instance when component unmounts
        sortable.destroy();
      };
    }
  }, [tasks, addTaskToCalendar, activeCategory]);
  
  // If we're in the 'All' tab, group tasks by category
  if (activeCategory === 'All') {
    // Group tasks by category
    const tasksByCategory = {};
    
    // Initialize with all categories, even empty ones
    categories.forEach(cat => {
      if (cat.id !== 'all' && cat.id !== 'add-category') {
        tasksByCategory[cat.name] = {
          tasks: [],
          icon: cat.icon,
          order: cat.name === 'Completed' ? Number.MAX_SAFE_INTEGER : categories.findIndex(c => c.name === cat.name)
        };
      }
    });
    
    // Add tasks to their categories
    tasks.forEach(task => {
      const category = task.category || 'Uncategorized';
      if (!tasksByCategory[category]) {
        tasksByCategory[category] = {
          tasks: [],
          icon: '⬤', // Default icon
          order: category === 'Completed' ? Number.MAX_SAFE_INTEGER : Object.keys(tasksByCategory).length
        };
      }
      tasksByCategory[category].tasks.push(task);
    });
    
    // Make sure all categories from the context are included, even if they don't have tasks
    categories.forEach(cat => {
      if (cat.id !== 'all' && cat.id !== 'add-category' && !tasksByCategory[cat.name]) {
        tasksByCategory[cat.name] = {
          tasks: [],
          icon: cat.icon,
          order: cat.name === 'Completed' ? Number.MAX_SAFE_INTEGER : categories.findIndex(c => c.name === cat.name)
        };
      }
    });
    
    // Sort categories by order, ensuring Completed is always last
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
  
  // Regular view for specific categories
  return (
    <div className="task-list" ref={taskListRef}>
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
