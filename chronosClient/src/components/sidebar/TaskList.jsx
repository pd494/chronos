import React from 'react';
import './TaskList.css';

const TaskList = ({ tasks, onToggleComplete }) => {
  return (
    <div className="task-list">
      {tasks.map(task => (
        <div key={task.id} className={`task-item ${task.completed ? 'completed' : ''}`}>
          <div 
            className="task-checkbox"
            onClick={() => onToggleComplete(task.id)}
          >
            {task.completed ? <span>✓</span> : <span></span>}
          </div>
          <div className="task-text">{task.text}</div>
        </div>
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
