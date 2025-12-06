import { useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { pickCategoryFromList } from './utils';
import { useTaskState, useTaskLifecycle, useTaskPersistence, useTaskScheduleListener } from './useTaskHelpers';
import { useBootstrap } from './useBootstrap';
import { useCategoryActions } from './useCategoryActions';
import { useTaskCRUD } from './useTaskCRUD';
import { useTaskConversion } from './useTaskConversion';

export const useTaskProvider = () => {
  const { user } = useAuth();
  const {
    tasks, categories, setTasksEnhanced, setCategories, snapshotKey,
    resetState, clearTaskSnapshots, hydrateFromSnapshot, refs
  } = useTaskState(user);

  const { loadBootstrap, refreshBootstrap, loadData } = useBootstrap({
    user, tasks, categories, setTasksEnhanced, setCategories, refs
  });

  const {
    loadCategories, createCategory, updateCategory, deleteCategory, reorderCategories
  } = useCategoryActions({ categories, tasks, setCategories, setTasksEnhanced, refs, refreshBootstrap });

  const resolveCategory = useCallback(
    (categoryName, sourceCategories) => pickCategoryFromList(categoryName, sourceCategories ?? categories),
    [categories]
  );

  const { addTask, toggleTaskComplete, deleteTask, updateTask } = useTaskCRUD({
    tasks, categories, setTasksEnhanced, resolveCategory, loadCategories, clearTaskSnapshots, refs
  });

  const { convertTodoToEvent } = useTaskConversion({ tasks, categories, setTasksEnhanced, refs });

  useTaskPersistence({ snapshotKey, tasks, categories, user });
  useTaskScheduleListener({ setTasksEnhanced, clearTaskSnapshots });
  useTaskLifecycle({ user, hydrateFromSnapshot, loadData, resetState, refs });

  return {
    tasks, categories, addTask, toggleTaskComplete, deleteTask, updateTask,
    createCategory, updateCategory, deleteCategory, loadData, reorderCategories, convertTodoToEvent
  };
};

