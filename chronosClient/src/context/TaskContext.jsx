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

  const addTask = (text, category = 'Inbox') => {
    const newTask = {
      id: Date.now(),
      text,
      completed: false,
      category
    };
    setTasks([...tasks, newTask]);
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

  return (
    <TaskContext.Provider value={{ tasks, addTask, toggleTaskComplete, deleteTask, updateTask }}>
      {children}
    </TaskContext.Provider>
  );
};
