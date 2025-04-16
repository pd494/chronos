import React from 'react';
import { useDrag } from 'react-dnd';
import { useTaskContext } from '../../context/TaskContext';
import './TaskList.css';

// Draggable Task Item component
const DraggableTaskItem = ({ task, onToggleComplete }) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'TASK',
    item: { id: task.id, text: task.text },
    collect: (monitor) => ({
      isDragging: !!monitor.isDragging(),
    }),
  }));

  return (
    <div 
      ref={drag}
      className={`task-item ${task.completed ? 'completed' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <div 
        className="task-checkbox"
        onClick={() => onToggleComplete(task.id)}
      >
        {task.completed ? <span>✓</span> : <span></span>}
      </div>
      <div className="task-text">{task.text}</div>
    </div>
  );
};

const TaskList = ({ tasks, onToggleComplete }) => {
  return (
    <div className="task-list">
      {tasks.map(task => (
        <DraggableTaskItem 
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
