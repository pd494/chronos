import React from 'react';
import TaskContext from './context';
import { useTaskProvider } from './useTaskProvider';

export const TaskProvider = ({ children }) => {
  const value = useTaskProvider();

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
};

