import React, { createContext, useState, useContext, useEffect } from 'react';

// Create the context
const TaskContext = createContext();

// Custom hook to use the task context
export const useTaskContext = () => useContext(TaskContext);

// Provider component
export const TaskProvider = ({ children }) => {
  // Sample initial tasks
  const [tasks, setTasks] = useState([
    { id: 1, text: 'New todo @list @2pm', category: 'All', completed: false },
    { id: 2, text: 'PAY BOFA', category: 'All', completed: false },
    { id: 3, text: 'bofa due date', category: 'All', completed: false },
    { id: 4, text: 'cse 111 section', category: 'All', completed: false },
    { id: 5, text: 'Valentine\'s Day', category: 'All', completed: false },
    { id: 6, text: 'Demo Day', category: 'All', completed: false },
  ]);

  // Sample initial events
  const [events, setEvents] = useState([
    { id: 1, title: 'PAY BOFA', date: '2025-03-09', color: 'blue' },
    { id: 2, title: 'bofa due date', date: '2025-03-10', color: 'teal' },
    { id: 3, title: 'cse 111 section', date: '2025-03-11', color: 'blue' },
    { id: 4, title: 'Valentine\'s Day', date: '2025-03-13', color: 'green' },
    { id: 5, title: 'Demo Day', date: '2025-03-13', color: 'purple' },
    { id: 6, title: 'PAY BILT', date: '2025-03-19', color: 'blue' },
    { id: 7, title: 'bilt due date', date: '2025-03-20', color: 'teal' },
    { id: 8, title: 'career fair', date: '2025-03-20', color: 'orange' },
    { id: 9, title: 'AMEX DUE', date: '2025-03-25', color: 'blue' },
    { id: 10, title: 'enrollment', date: '2025-03-27', color: 'black' },
    { id: 11, title: 'codepath assignment', date: '2025-03-16', color: 'blue' },
    { id: 12, title: 'BILT', date: '2025-03-17', color: 'blue' },
    { id: 13, title: 'Quiz 7', date: '2025-03-24', color: 'purple' },
    { id: 14, title: 'Remote Lecture', date: '2025-03-03', color: 'orange' },
    { id: 15, title: 'Final Quiz', date: '2025-03-13', color: 'red' },
    { id: 16, title: 'hw 7', date: '2025-03-12', color: 'green' },
    { id: 17, title: 'start report', date: '2025-03-14', color: 'purple' },
  ]);

  // Add a new task
  const addTask = (text, category = 'All') => {
    const newTask = {
      id: Date.now(),
      text,
      category,
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

    const newEvent = {
      id: Date.now(),
      title: task.text,
      date: date,
      color: getRandomColor(),
      taskId: task.id // Reference to the original task
    };

    setEvents([...events, newEvent]);
    return true; // Successfully added
  };

  // Helper function to generate a random color
  const getRandomColor = () => {
    const colors = ['blue', 'teal', 'green', 'purple', 'orange', 'red'];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  return (
    <TaskContext.Provider value={{ 
      tasks, 
      events, 
      addTask, 
      toggleTaskComplete, 
      addTaskToCalendar,
      canDropTaskOnDate,
      setTasks,
      setEvents
    }}>
      {children}
    </TaskContext.Provider>
  );
};
