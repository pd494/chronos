import React from 'react';
import TaskInput from './TaskInput';
import TaskList from './TaskList';
import { useTaskContext } from '../../../context/TaskContext';
import './Sidebar.css';

const Sidebar = ({ activeCategory, isSidebarCollapsed, sidebarWidth, sidebarVisible, toggleSidebar, onCategoryRenamed }) => {
  const { tasks, addTask, toggleTaskComplete, categories } = useTaskContext();
  
  const handleAddTask = (text) => {
    addTask({ content: text, categoryName: activeCategory });
  };

  const handleToggleComplete = (id) => {
    toggleTaskComplete(id);
  };

  const findActiveCategory = () =>
    categories.find(cat => cat.name === activeCategory);

  const renderCategoryDot = (color, extraClass = '') => (
    <span
      className={`category-header-dot ${extraClass}`.trim()}
      style={{ backgroundColor: color }}
    />
  );

  const renderCategoryIcon = () => {
    if (activeCategory === 'All') return '★';
    const category = findActiveCategory();
    if (!category) return null;
    if (typeof category.icon === 'string' && category.icon.startsWith('#')) {
      return renderCategoryDot(category.icon);
    }
    return category.icon;
  };
  
  const getTodayDateNumber = () => {
    return new Date().getDate().toString();
  };

  const renderTaskInputIcon = () => {
    if (activeCategory === 'Today') {
      const category = findActiveCategory();
      const color =
        (category && typeof category.icon === 'string' && category.icon.startsWith('#'))
          ? category.icon
          : '#FF9500';
      return (
        <>
          {renderCategoryDot(color, 'with-date')}
          <span className="category-today-date">{getTodayDateNumber()}</span>
        </>
      );
    }
    return renderCategoryIcon();
  };
  
  const filteredTasks = tasks
    .filter((task) => {
      if (activeCategory === 'All') return true;
      if (activeCategory === 'Completed') return task.completed;
      return task.category_name === activeCategory;
    })
    .sort((a, b) => {
      // Keep original order, don't separate completed from incomplete
      return 0;
    });

  return (
    <div 
      className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}
      onDragEnter={() => document.body.classList.remove('calendar-drag-focus')}
      onDragOver={() => document.body.classList.remove('calendar-drag-focus')}
    >
      {!isSidebarCollapsed && (
        <>
          {activeCategory !== 'All' ? (
            <TaskInput 
              onAddTask={handleAddTask} 
              activeCategory={activeCategory}
              categoryIcon={renderTaskInputIcon()}
              categoryCount={filteredTasks.length}
              isEditable={activeCategory !== 'All' && activeCategory !== 'Today' && activeCategory !== 'Inbox' && activeCategory !== 'Completed'}
              showNewTaskInput={true}
              showAddButton={true}
              onCategoryRenamed={onCategoryRenamed}
            />
          ) : (
            <div className="all-category-header">
              <div className="category-title-container">
                <span className="category-header-icon">{renderCategoryIcon()}</span>
                <span className="category-title-all">All</span>
              </div>
              <div className="category-count-container">
                {/* Removed + button as requested */}
              </div>
            </div>
          )}
          
          {activeCategory === 'All' && (
            <TaskInput
              onAddTask={handleAddTask}
              activeCategory={activeCategory}
              categoryIcon={renderCategoryIcon()}
              showCategoryHeader={false}
              showAddButton={false}
              placeholder="New Todo "
            />
          )}
          
          <TaskList 
            tasks={filteredTasks} 
            onToggleComplete={handleToggleComplete} 
            activeCategory={activeCategory}
            categories={categories}
          />
        </>
      )}
      {/* Sidebar toggle commented out */}
      {/* <div className="sidebar-toggle" onClick={toggleSidebar}>
        <div className="sidebar-toggle-icon"></div>
      </div> */}
    </div>
  );
};

export default Sidebar;
