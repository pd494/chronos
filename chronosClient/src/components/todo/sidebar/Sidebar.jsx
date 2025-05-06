import React, { useState, useRef, useEffect } from 'react';
import CategoryTabs from './CategoryTabs';
import TaskInput from './TaskInput';
import TaskList from './TaskList';
import { useTaskContext } from '../../../context/TaskContext';
import './Sidebar.css';

const Sidebar = ({ activeCategory, isSidebarCollapsed, sidebarWidth, sidebarVisible, toggleSidebar }) => {
  const { tasks, addTask, toggleTaskComplete, categories } = useTaskContext();
  const [showNewTaskInput, setShowNewTaskInput] = useState(false);

  // toggleSidebar is now passed from App.jsx as a prop

  // Toggle sidebar collapse state

  const handleAddTask = (text) => {
    addTask(text, activeCategory === 'All' ? 'Inbox' : activeCategory);
    setShowNewTaskInput(false);
  };

  const handleToggleComplete = (id) => {
    toggleTaskComplete(id);
  };

  // Find the icon for the active category
  const getCategoryIcon = () => {
    if (activeCategory === 'All') return '★';
    const category = categories.find(cat => cat.name === activeCategory);
    return category ? category.icon : null;
  };
  
  // Get today's date as a number for the Today icon
  const getTodayDateNumber = () => {
    return new Date().getDate().toString();
  };
  
  // Update the icon for Today category
  useEffect(() => {
    const todayCategory = categories.find(cat => cat.name === 'Today');
    if (todayCategory && todayCategory.icon !== getTodayDateNumber()) {
      // This would update the icon if we had a function to update categories
      // For now, this is just a placeholder
    }
  }, [categories]);

  return (
    <div 
      className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}
    >
      {!isSidebarCollapsed && (
        <>
          {activeCategory !== 'All' ? (
            <TaskInput 
              onAddTask={handleAddTask} 
              activeCategory={activeCategory}
              categoryIcon={activeCategory === 'Today' ? getTodayDateNumber() : getCategoryIcon()}
              categoryCount={tasks.filter(task => task.category === activeCategory).length}
              isEditable={activeCategory !== 'All' && activeCategory !== 'Today' && activeCategory !== 'Inbox' && activeCategory !== 'Completed'}
              showNewTaskInput={true}
              showAddButton={true}
            />
          ) : (
            <div className="all-category-header">
              <div className="category-title-container">
                <span className="category-header-icon">{getCategoryIcon()}</span>
                <span className="category-title-all">All</span>
              </div>
              <div className="category-count-container">
                {/* Removed + button as requested */}
              </div>
            </div>
          )}
          
          {activeCategory === 'All' && (
            <div className="all-tab-task-input">
              <form className="task-input all-tab-form" onSubmit={(e) => {
                e.preventDefault();
                if (e.target.elements.taskText.value.trim()) {
                  handleAddTask(e.target.elements.taskText.value);
                  e.target.elements.taskText.value = '';
                }
              }}>
                <input
                  name="taskText"
                  type="text"
                  placeholder="New todo @list @2pm, or compose email"
                  className="task-input-field"
                  autoFocus={showNewTaskInput}
                />
                <span className="keyboard-shortcut">N</span>
              </form>
            </div>
          )}
          
          <TaskList 
            tasks={tasks.filter(task => activeCategory === 'All' || task.category === activeCategory)} 
            onToggleComplete={handleToggleComplete} 
            activeCategory={activeCategory}
            categories={categories}
          />
        </>
      )}
      <div className="sidebar-toggle" onClick={toggleSidebar}>
        <div className="sidebar-toggle-icon"></div>
      </div>
    </div>
  );
};

export default Sidebar;
