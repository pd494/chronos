import React, { useEffect, useMemo, useRef, useState } from 'react';
import Sortable from 'sortablejs';
import { useTaskContext } from '../../../context/TaskContext/context';
import TaskItem from './TaskItem';
import CategoryGroup from './CategoryGroup';
import './taskListGlobal.css';
import {
  globalDragState,
  transparentDragImage,
  cleanupDragArtifacts,
  stopCalendarDragMonitor,
  createSortableConfig
} from './dragUtils';

const TaskList = ({ tasks, onToggleComplete, activeCategory, categories }) => {
  const { addTask, reorderCategories } = useTaskContext();
  const [renderKey, setRenderKey] = useState(0);
  const regularTasksContainerRef = useRef(null);
  const regularSortableRef = useRef(null);
  const categoryContainerRef = useRef(null);
  const categorySortableRef = useRef(null);

  const activeCategoryColor = useMemo(() => {
    const cat = categories?.find((c) => c.name === activeCategory)
    if (!cat) return ''
    if (typeof cat.icon === 'string' && cat.icon.startsWith('#')) return cat.icon
    if (typeof cat.color === 'string' && cat.color.startsWith('#')) return cat.color
    return ''
  }, [categories, activeCategory]);

  useEffect(() => {
    const handleGlobalDragStart = (e) => {
      const isTodoDrag =
        !!e.target.closest('.task-item') ||
        !!e.target.closest('.task-drag-handle');
      if (!isTodoDrag) return;
      if (!e.dataTransfer) return;

      try {
        e.dataTransfer.setDragImage(transparentDragImage, 0, 0);
      } catch (_) {}
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

      const sortable = Sortable.create(regularTasksContainerRef.current, createSortableConfig(setRenderKey));
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
    
    return (
      <div className="task-list flex flex-col w-full overflow-y-auto font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif] min-h-[100px]" data-view="all" ref={categoryContainerRef}>
        {sortedCategories.map(([categoryName, { tasks, icon, id }], index) => (
          <div 
            key={categoryName} 
            className={`category-group-wrapper relative ${index > 0 ? 'mt-[14.4px]' : ''}`}
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
          <div className="flex justify-center items-center py-6 px-4 text-[#8e8e93] text-[15px] italic">
            <p>No tasks</p>
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div className="task-list flex flex-col w-full overflow-y-auto font-[-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif] min-h-[100px] pl-[4px]" ref={regularTasksContainerRef} key={renderKey}>
      {tasks.map(task => (
        <TaskItem
          key={task.id}
          task={task}
          onToggleComplete={onToggleComplete}
          categoryColor={activeCategoryColor}
        />
      ))}
      
      {tasks.length === 0 && (
        <div className="flex justify-center items-center py-6 px-4 text-[#8e8e93] text-[15px] italic">
          <p>No tasks in this category</p>
        </div>
      )}
    </div>
  );
};

export default TaskList;
