import { useCallback, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { useSettings } from '../SettingsContext';
import { pickCategoryFromList } from './utils';
import { useTaskState, useTaskLifecycle, useTaskPersistence, useTaskScheduleListener } from './useTaskHelpers';
import { useBootstrap } from './useBootstrap';
import { useCategoryActions } from './useCategoryActions';
import { useTaskCRUD } from './useTaskCRUD';
import { useTaskConversion } from './useTaskConversion';
import { isTaskOlderThanDays } from './utils';

export const useTaskProvider = () => {
  const { user } = useAuth();
  const { settings } = useSettings();
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

  const { addTask, toggleTaskComplete, deleteTask, updateTask, reorderTasks } = useTaskCRUD({
    tasks, categories, setTasksEnhanced, resolveCategory, loadCategories, clearTaskSnapshots, refs
  });

  const { convertTodoToEvent } = useTaskConversion({ tasks, categories, setTasksEnhanced, refs });

  useTaskPersistence({ snapshotKey, tasks, categories, user });
  useTaskScheduleListener({ setTasksEnhanced, clearTaskSnapshots });
  useTaskLifecycle({ user, hydrateFromSnapshot, loadData, resetState, refs });

  useEffect(() => {
    if (!user || typeof window === 'undefined') return;
    if (settings?.show_completed_tasks === false) return;
    if (!Array.isArray(tasks) || tasks.length === 0) return;

    const storageKey = `chronos:completed-cleanup:lastRun:${user.id}`
    const now = Date.now()
    let lastRun = 0
    try { lastRun = Number(window.localStorage.getItem(storageKey)) || 0 } catch (_) { }
    if (now - lastRun < 24 * 60 * 60 * 1000) return

    const toDelete = tasks
      .filter(t => t?.completed)
      .filter(t => isTaskOlderThanDays(t, 7))
      .map(t => t.id)
      .filter(Boolean)

    if (toDelete.length === 0) {
      try { window.localStorage.setItem(storageKey, String(now)) } catch (_) { }
      return
    }

    let cancelled = false
    const runCleanup = async () => {
      for (const id of toDelete) {
        if (cancelled) return
        try { await deleteTask(id) } catch (_) { }
      }
      if (!cancelled) {
        try { window.localStorage.setItem(storageKey, String(now)) } catch (_) { }
      }
    }
    runCleanup()

    return () => { cancelled = true }
  }, [user, settings?.show_completed_tasks, tasks, deleteTask]);

  return {
    tasks, categories, addTask, toggleTaskComplete, deleteTask, updateTask,
    createCategory, updateCategory, deleteCategory, loadData, reorderCategories, reorderTasks, convertTodoToEvent
  };
};
