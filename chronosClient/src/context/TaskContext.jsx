import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { todosApi } from '../lib/api';
import { useAuth } from './AuthContext';

const TaskContext = createContext();

export const useTaskContext = () => useContext(TaskContext);

const ALL_CATEGORY = { id: 'all', name: 'All', icon: '★', order: -1 };

const SPECIAL_CATEGORY_COLORS = {
  Inbox: '#3478F6',
  Today: '#FF9500',
  Completed: '#34C759'
};

const formatCategory = (category) => {
  if (!category?.name) return null;
  
  if (category.name === 'Uncategorized') return null;
  
  const icon =
    SPECIAL_CATEGORY_COLORS[category.name] ||
    category.color ||
    category.icon ||
    '⬤';

  return {
    id: category.id,
    name: category.name,
    icon,
    order: typeof category.order === 'number' ? category.order : Number.MAX_SAFE_INTEGER
  };
};

const buildCategories = (rawCategories = []) => {
  const seenNames = new Set();
  const formatted = rawCategories
    .map(formatCategory)
    .filter(Boolean)
    .filter((category) => {
      if (seenNames.has(category.name)) return false;
      seenNames.add(category.name);
      return true;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return [ALL_CATEGORY, ...formatted];
};

export const TaskProvider = ({ children }) => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [categories, setCategories] = useState([ALL_CATEGORY]);

  const resetState = useCallback(() => {
    setTasks([]);
    setCategories([ALL_CATEGORY]);
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const response = await todosApi.getTodos();
      setTasks(response.data || []);
    } catch (error) {
      console.error('Failed to fetch todos:', error);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const response = await todosApi.getCategories();
      setCategories(buildCategories(response.data || []));
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      await Promise.all([loadTasks(), loadCategories()]);
    } catch (_) {
      // individual helpers already log errors
    }
  }, [loadTasks, loadCategories]);

  // Fetch todos and categories when user is logged in
  useEffect(() => {
    if (user) {
      loadData();
    } else {
      resetState();
    }
  }, [user, loadData, resetState]);

  const resolveCategory = useCallback(
    (categoryName) => {
      if (!categoryName || categoryName === 'All') {
        return categories.find(cat => cat.name === 'Inbox')
          || categories.find(cat => cat.id !== ALL_CATEGORY.id);
      }
      if (categoryName === 'Completed') {
        return categories.find(cat => cat.name === 'Inbox')
          || categories.find(cat => cat.id !== ALL_CATEGORY.id);
      }
      return (
        categories.find(cat => cat.name === categoryName)
        || categories.find(cat => cat.id !== ALL_CATEGORY.id)
      );
    },
    [categories]
  );

  const addTask = async ({ content, categoryName }) => {
    const optimisticId = `temp-${Date.now()}`;
    let optimisticAdded = false;

    try {
      let category = resolveCategory(categoryName);
      if (!category) {
        await loadCategories();
        category = resolveCategory(categoryName);
      }
      if (!category) {
        throw new Error(`Category "${categoryName}" not found`);
      }

      const optimisticTask = {
        id: optimisticId,
        content,
        completed: false,
        category_id: category.id,
        category_name: category.name
      };

      setTasks(prev => [...prev, optimisticTask]);
      optimisticAdded = true;

      const response = await todosApi.createTodo({
        content,
        completed: false,
        category_name: category.name,
        category_id: category.id
      });
      const created = {
        ...response.data,
        category_name: response.data?.category_name || category.name
      };

      setTasks(prev =>
        prev.map(task => (task.id === optimisticId ? created : task))
      );
    } catch (error) {
      if (optimisticAdded) {
        setTasks(prev => prev.filter(task => task.id !== optimisticId));
      }
      console.error('Failed to create todo:', error);
    }
  };

  const createCategory = async (text, color = '#FFFFFF') => {
    try {
      const userCategoryCount = categories.filter(cat => cat.id !== ALL_CATEGORY.id).length;
      const response = await todosApi.createCategory({
        name: text,
        color,
        order: userCategoryCount,
      });

      if (response?.data) {
        await loadCategories();
      }
    } catch (error) {
      console.error('Failed to create category:', error);
    }
  };

  const updateCategory = async (id, updatedCategory) => {
    try {
      await todosApi.updateCategory(id, updatedCategory);
      await loadCategories();
    } catch (error) {
      console.error('Failed to update category:', error);
    }
  };

  const deleteCategory = async (id) => {
    try {
      await todosApi.deleteCategory(id);
      await loadCategories();
    } catch (error) {
      console.error('Failed to delete category:', error);
    }
  };

  const toggleTaskComplete = async (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (task.completed && task.category_name === 'Completed') {
      setTasks(prev => prev.filter(t => t.id !== id));
      
      try {
        await todosApi.deleteTodo(id);
      } catch (error) {
        console.error('Failed to delete todo:', error);
        setTasks(prev => [...prev, task]);
      }
      return;
    }

    if (!task.completed) {
      const completedCategory = categories.find(cat => cat.name === 'Completed');
      if (completedCategory) {
        const updatedTask = {
          ...task,
          completed: true,
          category_name: 'Completed',
          category_id: completedCategory.id
        };
        
        setTasks(prev =>
          prev.map(t =>
            t.id === id ? updatedTask : t
          )
        );
        
        try {
          await todosApi.completeTodo(id, true);
          await todosApi.updateTodo(id, { category_name: 'Completed', category_id: completedCategory.id });
        } catch (error) {
          console.error('Failed to complete todo:', error);
          setTasks(prev =>
            prev.map(t =>
              t.id === id ? task : t
            )
          );
        }
      }
    } else {
      const updatedTask = {
        ...task,
        completed: false
      };
      
      setTasks(prev =>
        prev.map(t =>
          t.id === id ? updatedTask : t
        )
      );
      
      try {
        await todosApi.completeTodo(id, false);
      } catch (error) {
        console.error('Failed to uncomplete todo:', error);
        setTasks(prev =>
          prev.map(t =>
            t.id === id ? task : t
          )
        );
      }
    }
  };

  const deleteTask = async (id) => {
    try {
      await todosApi.deleteTodo(id);
      setTasks(prev => prev.filter(task => task.id !== id));
    } catch (error) {
      console.error('Failed to delete todo:', error);
    }
  };

  const updateTask = async (id, updatedTask) => {
    try {
      await todosApi.updateTodo(id, updatedTask);
      setTasks(prev => prev.map(task => (task.id === id ? { ...task, ...updatedTask } : task)));
    } catch (error) {
      console.error('Failed to update todo:', error);
    }
  };

  const reorderCategories = useCallback(
    async (orderedIds) => {
      const filteredIds = orderedIds.filter(id => id && id !== ALL_CATEGORY.id);

      let batchUpdates = [];

      setCategories(prev => {
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
        for (const update of batchUpdates) {
          await todosApi.updateCategory(update.id, { order: update.order });
        }
      } catch (error) {
        console.error('Failed to reorder categories:', error);
        await loadCategories();
      }
    },
    [loadCategories]
  );

  return (
    <TaskContext.Provider value={{ 
      tasks, 
      categories, 
      addTask, 
      toggleTaskComplete, 
      deleteTask, 
      updateTask,
      createCategory,
      updateCategory,
      deleteCategory,
      loadData,
      reorderCategories
    }}>
      {children}
    </TaskContext.Provider>
  );
};
