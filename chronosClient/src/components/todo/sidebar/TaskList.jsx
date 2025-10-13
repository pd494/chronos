import React, { useEffect, useRef, useState } from 'react';
import Sortable from 'sortablejs';
import { useTaskContext } from '../../../context/TaskContext';
import './TaskList.css';

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
      }, 150);
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
      <div className="task-text">{task.content}</div>
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
  
  useEffect(() => {
    if (isEditingNewTask && newTaskInputRef.current) {
      newTaskInputRef.current.focus();
    }
  }, [isEditingNewTask]);
  
  useEffect(() => {
    if (tasksContainerRef.current) {
      const sortable = Sortable.create(tasksContainerRef.current, {
        animation: 150,
        handle: '.task-drag-handle',
        group: {
          name: 'tasks',
          pull: 'clone',
          put: false 
        },
        sort: false,
        ghostClass: 'task-ghost',
        chosenClass: 'task-chosen',
        dragClass: 'task-drag',
        onStart: function() {
          document.body.classList.add('task-dragging');
          document.documentElement.classList.add('dragging');
        },
        onEnd: function(evt) {
          document.body.classList.remove('task-dragging');
          document.documentElement.classList.remove('dragging');
          
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
  
  const getCategoryIcon = () => {
    if (!category.icon) return '⬤';
    // If icon is a hex color, render a colored dot
    if (category.icon.startsWith('#')) {
      return <span className="dot" style={{ backgroundColor: category.icon }}></span>;
    }
    return category.icon;
  };

  return (
    <div className="category-group">
      <div className="category-header-container">
        <div 
          className="category-header" 
          onClick={() => setIsCollapsed(!isCollapsed)}
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

const TaskList = ({ tasks, onToggleComplete, activeCategory, categories }) => {
  const { addTask } = useTaskContext();
  
  const handleAddTaskToCategory = (text, categoryName) => {
    addTask({ content: text, categoryName });
  };
  
  // If we're in the 'All' tab, group tasks by category
  if (activeCategory === 'All') {
    // Group tasks by category
    const tasksByCategory = {};
    
    // Initialize with all categories, even empty ones
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
    
    // Add tasks to their categories (skip Uncategorized)
    tasks.forEach(task => {
      const category = task.category_name;
      if (!category || category === 'Uncategorized') return;
      
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
        const orderValue = typeof cat.order === 'number' ? cat.order : categories.findIndex(c => c.id === cat.id);
        tasksByCategory[cat.name] = {
          tasks: [],
          icon: cat.icon,
          order: orderValue
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
    <div className="task-list">
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
