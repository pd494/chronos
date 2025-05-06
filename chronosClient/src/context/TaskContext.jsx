import React, { createContext, useContext, useState } from 'react';

const TaskContext = createContext();

export const useTaskContext = () => useContext(TaskContext);

export const TaskProvider = ({ children }) => {
  const [tasks, setTasks] = useState([
    { id: 1, text: 'Complete project proposal', completed: false, category: 'Inbox' },
    { id: 2, text: 'Schedule team meeting', completed: true, category: 'Completed' },
    { id: 3, text: 'Review quarterly goals', completed: false, category: 'Today' },
    { id: 4, text: 'Update documentation', completed: false, category: 'Inbox' },
  ]);
  
  // Get today's date as a number for the Today icon
  const getTodayDateNumber = () => {
    return new Date().getDate().toString();
  };
  
  const [categories, setCategories] = useState([
    { id: 'all', name: 'All', count: 4, icon: '★' },
    { id: 'inbox', name: 'Inbox', count: 2, icon: '📥' },
    { id: 'today', name: 'Today', count: 1, icon: getTodayDateNumber() },
    { id: 'completed', name: 'Completed', count: 1, icon: '✓' },
  ]);

  const addTask = (text, category = 'Inbox') => {
    const newTask = {
      id: Date.now(),
      text,
      completed: false,
      category
    };
    setTasks([...tasks, newTask]);
  };

  const addCategory = (newCategory) => {
    setCategories(prevCategories => {
      // Make sure we don't add duplicates
      if (!prevCategories.find(cat => cat.name === newCategory.name)) {
        return [...prevCategories, newCategory];
      }
      return prevCategories;
    });
  };

  const updateCategory = (id, updatedCategory) => {
    setCategories(prevCategories => 
      prevCategories.map(cat => 
        cat.id === id ? { ...cat, ...updatedCategory } : cat
      )
    );
  };

  const toggleTaskComplete = (id) => {
    setTasks(tasks.map(task => {
      if (task.id === id) {
        const updatedTask = {
          ...task,
          completed: !task.completed,
          category: !task.completed ? 'Completed' : task.category === 'Completed' ? 'Inbox' : task.category
        };
        return updatedTask;
      }
      return task;
    }));
  };

  const deleteTask = (id) => {
    setTasks(tasks.filter(task => task.id !== id));
  };

  const updateTask = (id, updatedTask) => {
    setTasks(tasks.map(task => task.id === id ? { ...task, ...updatedTask } : task));
  };

  const addTaskToCalendar = (taskId, date) => {
    // This function will be implemented to add a task to the calendar
    console.log(`Adding task ${taskId} to calendar on ${date}`);
    // For now, just log the action
  };

  return (
    <TaskContext.Provider value={{ 
      tasks, 
      categories, 
      addTask, 
      toggleTaskComplete, 
      deleteTask, 
      updateTask, 
      addTaskToCalendar,
      addCategory,
      updateCategory
    }}>
      {children}
    </TaskContext.Provider>
  );
};
