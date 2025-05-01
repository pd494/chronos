import React, { useEffect, useRef } from 'react';
import Sortable from 'sortablejs';
import { useTaskContext } from '../../../context/TaskContext';
import './TaskList.css';

// Task Item component
const TaskItem = ({ task, onToggleComplete }) => {
  return (
    <div 
      className={`task-item ${task.completed ? 'completed' : ''}`}
      data-id={task.id}
    >
      <div 
        className="task-checkbox"
        onClick={() => onToggleComplete(task.id)}
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

const TaskList = ({ tasks, onToggleComplete }) => {
  const taskListRef = useRef(null);
  const { addTaskToCalendar } = useTaskContext();
  
  useEffect(() => {
    if (taskListRef.current) {
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
  }, [tasks, addTaskToCalendar]);
  
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
