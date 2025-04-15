import React, { useState, useRef, useEffect } from 'react';
import CategoryTabs from './CategoryTabs';
import TaskInput from './TaskInput';
import TaskList from './TaskList';
import './Sidebar.css';

const Sidebar = () => {
  const [activeCategory, setActiveCategory] = useState('All');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [tasks, setTasks] = useState([
    { id: 1, text: 'New todo @list @2pm', category: 'All', completed: false },
    { id: 2, text: 'PAY BOFA', category: 'All', completed: false },
    { id: 3, text: 'bofa due date', category: 'All', completed: false },
    { id: 4, text: 'cse 111 section', category: 'All', completed: false },
    { id: 5, text: 'Valentine\'s Day', category: 'All', completed: false },
    { id: 6, text: 'Demo Day', category: 'All', completed: false },
  ]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
    // Note: Width setting is now handled by Allotment's parent
    // If you need to trigger a collapse/expand visual change,
    // you might need to communicate this state up to App.jsx
    // or handle it purely with CSS class toggles.
  };

  // Categories with counts
  const categories = [
    { id: 'all', name: 'All', count: 398, icon: '★' },
    { id: 'inbox', name: 'Inbox', count: 5, icon: '📥' },
    { id: 'today', name: 'Today', count: 1, icon: '1' },
    
    { id: 'completed', name: 'Completed', count: 104, icon: '✓' }
  ];

  const handleCategoryChange = (category) => {
    setActiveCategory(category);
  };

  const handleAddTask = (text) => {
    const newTask = {
      id: Date.now(),
      text,
      category: activeCategory,
      completed: false
    };
    setTasks([newTask, ...tasks]);
  };

  const handleToggleComplete = (id) => {
    setTasks(tasks.map(task => 
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  return (
    <div 
      className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}
    >
      <CategoryTabs 
        categories={categories} 
        activeCategory={activeCategory} 
        onCategoryChange={handleCategoryChange}
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
