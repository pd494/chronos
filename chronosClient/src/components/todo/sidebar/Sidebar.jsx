import React, { useState, useRef, useEffect } from 'react';
import CategoryTabs from './CategoryTabs';
import TaskInput from './TaskInput';
import TaskList from './TaskList';
import { useTaskContext } from '../../../context/TaskContext';
import './Sidebar.css';

const Sidebar = ({ activeCategory, isSidebarCollapsed, toggleSidebar }) => {
  const { tasks, addTask, toggleTaskComplete } = useTaskContext();

  // toggleSidebar is now passed from App.jsx as a prop

  // Toggle sidebar collapse state

  const handleAddTask = (text) => {
    addTask(text, activeCategory);
  };

  const handleToggleComplete = (id) => {
    toggleTaskComplete(id);
  };

  return (
    <div 
      className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}
    >
      {!isSidebarCollapsed && (
        <>
          <TaskInput 
            onAddTask={handleAddTask} 
            activeCategory={activeCategory}
          />
          <TaskList 
            tasks={tasks.filter(task => activeCategory === 'All' || task.category === activeCategory)} 
            onToggleComplete={handleToggleComplete} 
            activeCategory={activeCategory}
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
