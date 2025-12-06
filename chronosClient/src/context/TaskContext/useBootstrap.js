import { useCallback } from 'react';
import { todosApi } from '../../lib/api';
import { buildCategories } from './utils';

export const useBootstrap = ({
  user,
  tasks,
  categories,
  setTasksEnhanced,
  setCategories,
  refs
}) => {
  const { lastBootstrapAtRef, lastMutationTimeRef, bootstrapPromiseRef } = refs;

  const loadBootstrap = useCallback(async () => {
    if (!user) return null;
    try {
      const response = await todosApi.getBootstrap(); // aliases to GET /todos/
      const fetchedTodos = Array.isArray(response?.todos)
        ? response.todos
        : Array.isArray(response?.data?.todos)
          ? response.data.todos
          : [];
      const fetchedCategories = Array.isArray(response?.categories)
        ? response.categories
        : Array.isArray(response?.data?.categories)
          ? response.data.categories
          : [];
      
      const builtCategories = buildCategories(fetchedCategories);
      setTasksEnhanced(fetchedTodos);
      setCategories(builtCategories);
      lastBootstrapAtRef.current = Date.now();
      
      return { todos: fetchedTodos, categories: builtCategories };
    } catch (error) {
      console.error('Failed to bootstrap todos:', error);
      return null;
    }
  }, [user, setTasksEnhanced, setCategories, lastBootstrapAtRef]);

  const refreshBootstrap = useCallback(
    async (force = false) => {
      if (!user) return null;
      const now = Date.now();
      const stale = now - lastBootstrapAtRef.current > 60 * 1000;
      const timeSinceMutation = now - lastMutationTimeRef.current;
      
      if (!force && timeSinceMutation < 2000) {
        return null;
      }
      
      if (!force && !stale && lastBootstrapAtRef.current > 0 && tasks.length && categories.length > 1) {
        return null;
      }
      if (bootstrapPromiseRef.current) {
        return bootstrapPromiseRef.current;
      }
      bootstrapPromiseRef.current = (async () => {
        try {
          return await loadBootstrap();
        } finally {
          bootstrapPromiseRef.current = null;
        }
      })();
      return bootstrapPromiseRef.current;
    },
    [user, loadBootstrap, tasks.length, categories.length, lastBootstrapAtRef, lastMutationTimeRef, bootstrapPromiseRef]
  );

  const loadData = useCallback(async (force = false) => {
    await refreshBootstrap(force);
  }, [refreshBootstrap]);

  return {
    loadBootstrap,
    refreshBootstrap,
    loadData
  };
};

