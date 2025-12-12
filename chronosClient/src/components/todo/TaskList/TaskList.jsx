import React, { useEffect, useMemo, useState } from 'react';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTaskContext } from '../../../context/TaskContext/context';
import TaskItem from './TaskItem';
import CategoryGroup from './CategoryGroup';
import './taskListGlobal.css';

// Sortable category wrapper for the "All" view
const SortableCategoryGroup = ({ category, tasks, onToggleComplete, onAddTaskToCategory, index }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: category.id,
    data: {
      type: 'category',
      id: category.id,
      category,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`category-group-wrapper relative ${index > 0 ? 'mt-[14.4px]' : ''}`}
      data-category-id={category.id}
    >
      <CategoryGroup
        category={category}
        tasks={tasks}
        onToggleComplete={onToggleComplete}
        onAddTaskToCategory={onAddTaskToCategory}
        dragHandleProps={{
          ...attributes,
          ...listeners,
          className: 'cursor-grab active:cursor-grabbing touch-none',
        }}
      />
    </div>
  );
};

const TaskList = ({ tasks, onToggleComplete, activeCategory, categories }) => {
  const { addTask } = useTaskContext();
  const [renderKey, setRenderKey] = useState(0);

  const activeCategoryColor = useMemo(() => {
    const cat = categories?.find((c) => c.name === activeCategory);
    if (!cat) return '';
    if (typeof cat.icon === 'string' && cat.icon.startsWith('#')) return cat.icon;
    if (typeof cat.color === 'string' && cat.color.startsWith('#')) return cat.color;
    return '';
  }, [categories, activeCategory]);

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

  // Must be before any conditional returns (React rules of hooks)
  const taskIds = useMemo(() => tasks.map(task => task.id), [tasks]);

  if (activeCategory === 'All') {
    const tasksByCategory = {};

    categories.forEach(cat => {
      if (cat.id !== 'all' && cat.id !== 'add-category') {
        const orderValue = typeof cat.order === 'number' ? cat.order : categories.findIndex(c => c.id === cat.id);
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

    const categoryIds = sortedCategories.map(([, { id }]) => id);

    return (
      <div className="task-list flex flex-col w-full overflow-y-auto font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif] min-h-[100px]" data-view="all">
        <SortableContext items={categoryIds} strategy={verticalListSortingStrategy}>
          {sortedCategories.map(([categoryName, { tasks, icon, id }], index) => (
            <SortableCategoryGroup
              key={id}
              category={{ name: categoryName, icon, id }}
              tasks={tasks}
              onToggleComplete={onToggleComplete}
              onAddTaskToCategory={handleAddTaskToCategory}
              index={index}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex justify-center items-center py-6 px-4 text-[#8e8e93] text-[15px] italic">
            <p>No tasks</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="task-list flex flex-col w-full overflow-y-auto font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif] min-h-[100px] pl-[4px]" key={renderKey}>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        {tasks.map(task => (
          <TaskItem
            key={task.id}
            task={task}
            onToggleComplete={onToggleComplete}
            categoryColor={activeCategoryColor}
          />
        ))}
      </SortableContext>

      {tasks.length === 0 && (
        <div className="flex justify-center items-center py-6 px-4 text-[#8e8e93] text-[15px] italic">
          <p>No tasks in this category</p>
        </div>
      )}
    </div>
  );
};

export default TaskList;
