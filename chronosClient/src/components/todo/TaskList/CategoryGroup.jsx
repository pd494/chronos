import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import TaskItem from './TaskItem';

const CategoryGroup = ({ category, tasks, onToggleComplete, onAddTaskToCategory, dragHandleProps }) => {
  const [isCollapsed, setIsCollapsed] = useState(category.name === 'Completed');
  const [isEditingNewTask, setIsEditingNewTask] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const newTaskInputRef = useRef(null);
  const { className: dragHandleClassName, ...dragHandleRest } = dragHandleProps || {};

  // Get task IDs for SortableContext
  const taskIds = useMemo(() => tasks.map(task => task.id), [tasks]);

  useEffect(() => {
    if (isEditingNewTask && newTaskInputRef.current) {
      newTaskInputRef.current.focus();
    }
  }, [isEditingNewTask]);

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
      return <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: category.icon }}></span>;
    }
    return category.icon;
  };

  const handleHeaderActivate = (event) => {
    setIsCollapsed(prev => !prev);
  };

  return (
    <div className="category-group mb-3 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between relative">
        <div
          className={`category-header flex items-center py-2.5 px-4 bg-transparent cursor-pointer rounded-2xl transition-colors duration-200 relative flex-grow hover:bg-black/5 ${dragHandleClassName || ''}`}
          role="button"
          tabIndex={0}
          {...dragHandleRest}
          onClick={handleHeaderActivate}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleHeaderActivate(event);
            }
          }}
        >
          <span className="mr-3 text-base w-4 text-center flex items-center justify-center flex-shrink-0">{getCategoryIcon()}</span>
          <span className="flex-grow font-medium text-[15px]">{category.name}</span>
          <span className="bg-black/10 rounded-xl py-0.5 px-2 text-xs min-w-[28px] text-center mr-2">{tasks.length}</span>
          <span className={`text-[10px] transition-transform duration-200 ml-2 w-3 text-center flex-shrink-0 ${isCollapsed ? '-rotate-90' : ''}`}>
            ▼
          </span>
        </div>
        {category.name !== 'Completed' ? (
          <button
            className="w-6 h-6 rounded-full bg-transparent border-none text-[#666] text-base flex items-center justify-center cursor-pointer p-0 mr-4 z-[2] hover:bg-black/5"
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
          <span className="w-6 h-6 mr-4" aria-hidden="true" />
        )}
      </div>

      {!isCollapsed && (
        <div className="pl-2">
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            {tasks.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                categoryColor={typeof category.icon === 'string' && category.icon.startsWith('#') ? category.icon : ''}
                onToggleComplete={onToggleComplete}
              />
            ))}
          </SortableContext>

          {isEditingNewTask && (
            <div className="task-item flex items-center py-2.5 pr-4 mb-1.5 rounded-[20px] relative bg-black/[0.02]">
              <div className="w-[18px] h-[18px] border-2 border-[#8e8e93] rounded-md mr-3 flex justify-center items-center">
                <span></span>
              </div>
              <div className="flex-1 px-3">
                <input
                  ref={newTaskInputRef}
                  type="text"
                  className="w-full border-none bg-transparent outline-none text-inherit font-inherit"
                  placeholder="Type a new task..."
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleAddTask}
                  autoFocus
                />
              </div>
              <div className="task-drag-handle cursor-grab">
                <span>⋮⋮</span>
              </div>
            </div>
          )}

          {tasks.length === 0 && !isEditingNewTask && (
            <div className="flex justify-center items-center py-[15px] px-4 text-[#8e8e93] text-[15px] italic">
              <p>No tasks in this category</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CategoryGroup;
