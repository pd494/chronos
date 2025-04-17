import React, { createContext, useState, useContext, useEffect } from 'react';

// Create the context
const TaskContext = createContext();

// Custom hook to use the task context
export const useTaskContext = () => useContext(TaskContext);

// Provider component
export const TaskProvider = ({ children }) => {
  // Task categories with their colors and emojis
  const [categories, setCategories] = useState([
    { id: 'work', name: 'Work', color: 'blue', emoji: '💼' },
    { id: 'personal', name: 'Personal', color: 'purple', emoji: '🏠' },
    { id: 'finance', name: 'Finance', color: 'green', emoji: '💰' },
    { id: 'school', name: 'School', color: 'orange', emoji: '📚' },
    { id: 'health', name: 'Health', color: 'red', emoji: '❤️' },
    { id: 'all', name: 'All', color: 'black', emoji: '📋' },
  ]);

  // Sample initial tasks
  const [tasks, setTasks] = useState([
    { id: 1, text: 'New todo @list @2pm', category: 'personal', completed: false },
    { id: 2, text: 'PAY BOFA', category: 'finance', completed: false },
    { id: 3, text: 'bofa due date', category: 'finance', completed: false },
    { id: 4, text: 'cse 111 section', category: 'school', completed: false },
    { id: 5, text: 'Valentine\'s Day', category: 'personal', completed: false },
    { id: 6, text: 'Demo Day', category: 'work', completed: false },
  ]);

  // Sample initial events
  const [events, setEvents] = useState([
    { id: 1, title: 'PAY BOFA', date: '2025-03-09', color: 'blue', category: 'finance', emoji: '💰' },
    { id: 2, title: 'bofa due date', date: '2025-03-10', color: 'teal', category: 'finance', emoji: '💰' },
    { id: 3, title: 'cse 111 section', date: '2025-03-11', color: 'blue', category: 'school', emoji: '📚' },
    { id: 4, title: 'Valentine\'s Day', date: '2025-03-13', color: 'green', category: 'personal', emoji: '🏠' },
    { id: 5, title: 'Demo Day', date: '2025-03-13', color: 'purple', category: 'work', emoji: '💼' },
    { id: 6, title: 'PAY BILT', date: '2025-03-19', color: 'blue', category: 'finance', emoji: '💰' },
    { id: 7, title: 'bilt due date', date: '2025-03-20', color: 'teal', category: 'finance', emoji: '💰' },
    { id: 8, title: 'career fair', date: '2025-03-20', color: 'orange', category: 'school', emoji: '🏢' },
    { id: 9, title: 'AMEX DUE', date: '2025-03-25', color: 'blue', category: 'finance', emoji: '💰' },
    { id: 10, title: 'enrollment', date: '2025-03-27', color: 'black', category: 'school', emoji: '📚' },
    { id: 11, title: 'codepath assignment', date: '2025-03-16', color: 'blue', category: 'school', emoji: '📝' },
    { id: 12, title: 'BILT', date: '2025-03-17', color: 'blue', category: 'finance', emoji: '💰' },
    { id: 13, title: 'Quiz 7', date: '2025-03-24', color: 'purple', category: 'school', emoji: '✏️' },
    { id: 14, title: 'Remote Lecture', date: '2025-03-03', color: 'orange', category: 'school', emoji: '🖥️' },
    { id: 15, title: 'Final Quiz', date: '2025-03-13', color: 'red', category: 'school', emoji: '📝' },
    { id: 16, title: 'hw 7', date: '2025-03-12', color: 'green', category: 'school', emoji: '📚' },
    { id: 17, title: 'start report', date: '2025-03-14', color: 'purple', category: 'work', emoji: '📊' },
  ]);

  // Add a new task
  const addTask = (text, category = 'all') => {
    const categoryObj = categories.find(cat => cat.id === category) || categories.find(cat => cat.id === 'all');
    const newTask = {
      id: Date.now(),
      text,
      category: categoryObj.id,
      completed: false
    };
    setTasks([newTask, ...tasks]);
  };

  // Toggle task completion
  const toggleTaskComplete = (id) => {
    setTasks(tasks.map(task => 
      task.id === id ? { ...task, completed: !task.completed } : task
    ));
  };

  // Check if a task can be dropped on a specific date
  const canDropTaskOnDate = (taskId, date) => {
    // Check if this exact task is already on this date
    return !events.some(e => e.taskId === taskId && e.date === date);
  };

  // Add a task to calendar (convert task to event)
  const addTaskToCalendar = (taskId, date) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return false;
    
    // Check if this exact task is already on this date
    if (!canDropTaskOnDate(taskId, date)) {
      return false; // Task already exists on this date
    }
    
    // Get category color and emoji
    const categoryObj = categories.find(cat => cat.id === task.category) || categories.find(cat => cat.id === 'all');

    const newEvent = {
      id: Date.now(),
      title: task.text,
      date: date,
      color: categoryObj.color,
      category: task.category,
      emoji: categoryObj.emoji,
      taskId: task.id // Reference to the original task
    };

    setEvents([...events, newEvent]);
    return true; // Successfully added
  };

  // Update category color and emoji
  const updateCategory = (categoryId, updates) => {
    setCategories(prevCategories => {
      return prevCategories.map(cat => {
        if (cat.id === categoryId) {
          return { ...cat, ...updates };
        }
        return cat;
      });
    });
    
    // Update all events with this category to reflect the new color/emoji
    if (updates.color || updates.emoji) {
      setEvents(prevEvents => {
        return prevEvents.map(event => {
          if (event.category === categoryId) {
            return { 
              ...event, 
              color: updates.color || event.color,
              emoji: updates.emoji || event.emoji 
            };
          }
          return event;
        });
      });
    }
  };

  return (
    <TaskContext.Provider value={{ 
      tasks, 
      events, 
      categories,
      addTask, 
      toggleTaskComplete, 
      addTaskToCalendar,
      canDropTaskOnDate,
      updateCategory,
      setTasks,
      setEvents,
      setCategories
    }}>
      {children}
    </TaskContext.Provider>
  );
};
