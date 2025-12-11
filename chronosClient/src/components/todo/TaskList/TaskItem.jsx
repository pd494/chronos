import React, { useRef, useState, forwardRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TaskScheduledBadge from '../TaskScheduledBadge';

// Presentational component for the task item content
const TaskItemContent = forwardRef(({
  task,
  onToggleComplete,
  categoryColor,
  style,
  attributes,
  listeners,
  isDragging
}, ref) => {
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
      ref={ref}
      className={`task-item flex items-center py-2.5 pr-4 mb-1.5 rounded-[20px] relative transition-all duration-200 hover:bg-black/[0.03] ${task.completed ? 'completed' : ''} ${isScheduled ? 'scheduled' : ''} ${isDragging ? 'opacity-50' : ''}`}
      style={style}
      data-id={task.id}
      data-task-id={task.id}
      data-task-title={task.content || ''}
      data-task-color={categoryColor || ''}
      data-scheduled={isScheduled ? 'true' : 'false'}
    >
      <div
        ref={checkboxRef}
        className={`w-[18px] h-[18px] border-2 border-[#8e8e93] rounded-md mr-3 flex justify-center items-center text-white transition-all duration-200 relative overflow-hidden cursor-default
          ${task.completed ? 'bg-[#34c759] border-[#34c759]' : ''}
          ${isChecking ? 'bg-[#34c759] border-[#34c759] checking' : ''}`}
        onClick={() => handleCheckboxClick(task.id)}
      >
        {(task.completed || isChecking) ? <span>✓</span> : <span></span>}
      </div>
      <div className="flex flex-row items-center gap-2 flex-1 px-3 overflow-hidden">
        <div className={`flex-1 p-0 overflow-hidden text-ellipsis whitespace-nowrap ${task.completed ? 'line-through text-[#8e8e93]' : ''}`}>
          {task.content}
        </div>
        <TaskScheduledBadge task={task} />
      </div>
      <div
        className="task-drag-handle cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
      >
        <span>⋮⋮</span>
      </div>
    </div>
  );
});

TaskItemContent.displayName = 'TaskItemContent';

// Sortable wrapper component
const TaskItem = ({ task, onToggleComplete, categoryColor }) => {
  const isScheduled = Boolean(task.scheduled_date || task.scheduled_at);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: 'task',
      id: task.id,
      title: task.content || 'New task',
      color: categoryColor || 'blue',
      task,
    },
    // Disable sorting for scheduled tasks
    disabled: isScheduled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1000 : undefined,
  };

  return (
    <TaskItemContent
      ref={setNodeRef}
      task={task}
      onToggleComplete={onToggleComplete}
      categoryColor={categoryColor}
      style={style}
      attributes={attributes}
      listeners={listeners}
      isDragging={isDragging}
    />
  );
};

export default TaskItem;

// Export presentational component for use in DragOverlay if needed
export { TaskItemContent };
