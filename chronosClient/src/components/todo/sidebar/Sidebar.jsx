import React, { useState, useRef, useEffect } from 'react';
import CategoryTabs from './CategoryTabs';
import TaskInput from './TaskInput';
import TaskList from './TaskList';
import { useTaskContext } from '../../../context/TaskContext';
import './Sidebar.css';

const Sidebar = () => {
  const [activeCategory, setActiveCategory] = useState('All');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { tasks, addTask, toggleTaskComplete } = useTaskContext();
  
  const [categories, setCategories] = useState([
    { id: 'all', name: 'All', count: 398, icon: '★' },
    { id: 'inbox', name: 'Inbox', count: 5, icon: '📥' },
    { id: 'today', name: 'Today', count: 1, icon: '1' },
    { id: 'completed', name: 'Completed', count: 104, icon: '✓' },
    { id: 'add-category', name: '', icon: '+' }
  ]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
    // Note: Width setting is now handled by Allotment's parent
    // If you need to trigger a collapse/expand visual change,
    // you might need to communicate this state up to App.jsx
    // or handle it purely with CSS class toggles.
  };

  // Toggle sidebar collapse state

  const handleCategoryChange = (category) => {
    setActiveCategory(category);
  };

  const handleAddCategory = (newCategory) => {
    // Add the new category to the categories list
    setCategories([
      ...categories.filter(c => c.id !== 'add-category'), // Remove add button
      newCategory, // Add the new category
      { id: 'add-category', name: '', icon: '+' } // Add back the add button at the end
    ]);
    
    // Optionally switch to the new category
    setActiveCategory(newCategory.name);
  };

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
      <CategoryTabs 
        categories={categories} 
        activeCategory={activeCategory} 
        onCategoryChange={handleCategoryChange}
        onAddCategory={handleAddCategory}
        isCollapsed={isSidebarCollapsed}
      />
      {!isSidebarCollapsed && (
        <>
          <TaskInput 
            onAddTask={handleAddTask} 
            activeCategory={activeCategory} 
            categoryCount={categories.find(cat => cat.name === activeCategory)?.count || 0}
            categoryIcon={categories.find(cat => cat.name === activeCategory)?.icon}
          />
          <TaskList 
            tasks={tasks.filter(task => activeCategory === 'All' || task.category === activeCategory)} 
            onToggleComplete={handleToggleComplete} 
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
