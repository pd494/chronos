import { useCallback } from 'react';
import { todosApi } from '../../lib/api';
import { ALL_CATEGORY } from './constants';
import { buildCategories, formatCategory } from './utils';

export const useCategoryActions = ({
  categories,
  tasks,
  setCategories,
  setTasksEnhanced,
  refs,
  refreshBootstrap
}) => {
  const { categoryOverrideRef, lastMutationTimeRef } = refs;

  const loadCategories = useCallback(async () => {
    try {
      const response = await todosApi.getCategories();
      const fetched = buildCategories(response.data || []);
      const now = Date.now();
      const merged = fetched.map(cat => {
        const override = categoryOverrideRef.current.get(cat.id);
        if (override && now - override.ts < 5000) {
          return { ...cat, icon: override.color, color: override.color };
        }
        return cat;
      });
      setCategories(merged);
      return merged;
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      return null;
    }
  }, [categoryOverrideRef, setCategories]);

  const createCategory = useCallback(async (text, color = '#FFFFFF') => {
    try {
      const userCategoryCount = categories.filter(cat => cat.id !== ALL_CATEGORY.id).length;
      const response = await todosApi.createCategory({
        name: text,
        color,
        order: userCategoryCount,
      });

      if (response?.data) {
        categoryOverrideRef.current.set(response.data.id, { color, ts: Date.now() });
        setCategories(prev => {
          const next = buildCategories([...(prev || []).filter(c => c.id !== response.data.id), formatCategory(response.data)]);
          return next;
        });
        await loadCategories();
        lastMutationTimeRef.current = Date.now();
      }
    } catch (error) {
      console.error('Failed to create category:', error);
    }
  }, [categories, categoryOverrideRef, setCategories, loadCategories, lastMutationTimeRef]);

  const updateCategory = useCallback(async (id, updatedCategory) => {
    try {
      if (updatedCategory?.color) {
        categoryOverrideRef.current.set(id, { color: updatedCategory.color, ts: Date.now() });
      }
      setCategories(prev => prev.map(cat => (cat.id === id
        ? { ...cat, ...updatedCategory, icon: updatedCategory.color || cat.icon, color: updatedCategory.color || cat.color }
        : cat)));
      await todosApi.updateCategory(id, updatedCategory);
      await loadCategories();
      lastMutationTimeRef.current = Date.now();
    } catch (error) {
      console.error('Failed to update category:', error);
    }
  }, [categoryOverrideRef, setCategories, loadCategories, lastMutationTimeRef]);

  const deleteCategory = useCallback(async (id) => {
    if (!id) return;

    const categoryToDelete = categories.find(cat => cat.id === id);
    const previousCategories = categories;
    const previousTasks = tasks;

    setCategories(prev => prev.filter(cat => cat.id !== id));
    setTasksEnhanced(prev =>
      prev.filter(task =>
        task.category_id !== id &&
        task.category_name !== categoryToDelete?.name
      )
    );

    try {
      await todosApi.deleteCategory(id);
      lastMutationTimeRef.current = Date.now();
      refreshBootstrap(true).catch(() => {});
    } catch (error) {
      console.error('Failed to delete category:', error);
      setCategories(previousCategories);
      setTasksEnhanced(previousTasks);
    }
  }, [categories, tasks, setCategories, setTasksEnhanced, lastMutationTimeRef, refreshBootstrap]);

  const reorderCategories = useCallback(
    async (orderedIds) => {
      const filteredIds = orderedIds.filter(id => id && id !== ALL_CATEGORY.id);

      let batchUpdates = [];
      let previousCategories = [];

      setCategories(prev => {
        previousCategories = prev;
        const pinned = prev.filter(cat => cat.id === ALL_CATEGORY.id);
        const reorderable = prev.filter(cat => cat.id !== ALL_CATEGORY.id);
        const map = new Map(reorderable.map(cat => [cat.id, cat]));

        const ordered = filteredIds.map(id => map.get(id)).filter(Boolean);
        const remainder = reorderable.filter(cat => !filteredIds.includes(cat.id));
        const combined = [...ordered, ...remainder];

        batchUpdates = combined.map((cat, index) => ({
          id: cat.id,
          order: index
        }));

        const updated = combined.map((cat, index) => ({
          ...cat,
          order: index
        }));

        return [...pinned, ...updated];
      });

      try {
        await todosApi.batchReorderCategories(batchUpdates);
        lastMutationTimeRef.current = Date.now();
      } catch (error) {
        console.error('Failed to reorder categories:', error);
        setCategories(previousCategories);
        await refreshBootstrap(true);
      }
    },
    [setCategories, refreshBootstrap, lastMutationTimeRef]
  );

  return {
    loadCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories
  };
};

