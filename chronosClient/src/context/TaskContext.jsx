import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
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

const ISO_DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const isDateOnlyString = (value) =>
  typeof value === 'string' && ISO_DATE_ONLY_REGEX.test(value.trim());

const toLocalDateOnlyString = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const enhanceTaskWithSchedule = (task) => {
  if (!task) return task;
  const rawDate =
    task.scheduled_date ||
    task.scheduledDate ||
    task.scheduled_at ||
    task.date;

  const derivedAllDay = rawDate ? isDateOnlyString(rawDate) : false;

  if (task.scheduled_is_all_day === derivedAllDay) {
    return task;
  }

  return { ...task, scheduled_is_all_day: derivedAllDay };
};

const enhanceTasks = (tasks = []) => tasks.map(enhanceTaskWithSchedule);

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

  const categoryByName = useMemo(() => {
    const lookup = new Map();
    categories.forEach((category) => {
      if (category && category.name) {
        lookup.set(category.name, category);
      }
    });
    return lookup;
  }, [categories]);

  const setTasksEnhanced = useCallback((updater) => {
    setTasks(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (!Array.isArray(next)) {
        return prev;
      }
      return enhanceTasks(next);
    });
  }, []);

  const resetState = useCallback(() => {
    setTasks([]);
    setCategories([ALL_CATEGORY]);
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const response = await todosApi.getTodos();
      setTasksEnhanced(response.data || []);
    } catch (error) {
      console.error('Failed to fetch todos:', error);
    }
  }, [setTasksEnhanced]);

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
        return categoryByName.get('Inbox')
          || categories.find(cat => cat.id !== ALL_CATEGORY.id);
      }
      if (categoryName === 'Completed') {
        return categoryByName.get('Inbox')
          || categories.find(cat => cat.id !== ALL_CATEGORY.id);
      }
      return categoryByName.get(categoryName)
        || categories.find(cat => cat.id !== ALL_CATEGORY.id);
    },
    [categories, categoryByName]
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

      setTasksEnhanced(prev => [...prev, optimisticTask]);
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

      setTasksEnhanced(prev =>
        prev.map(task => (task.id === optimisticId ? created : task))
      );
    } catch (error) {
      if (optimisticAdded) {
        setTasksEnhanced(prev => prev.filter(task => task.id !== optimisticId));
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
      setTasksEnhanced(prev => prev.filter(t => t.id !== id));
      
      try {
        await todosApi.deleteTodo(id);
      } catch (error) {
        console.error('Failed to delete todo:', error);
        setTasksEnhanced(prev => [...prev, task]);
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
        
        setTasksEnhanced(prev =>
          prev.map(t =>
            t.id === id ? updatedTask : t
          )
        );
        
        try {
          await todosApi.updateTodo(id, {
            completed: true,
            category_name: 'Completed',
            category_id: completedCategory.id
          });
        } catch (error) {
          console.error('Failed to complete todo:', error);
          setTasksEnhanced(prev =>
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
      
      setTasksEnhanced(prev =>
        prev.map(t =>
          t.id === id ? updatedTask : t
        )
      );
      
      try {
        await todosApi.updateTodo(id, { completed: false });
      } catch (error) {
        console.error('Failed to uncomplete todo:', error);
        setTasksEnhanced(prev =>
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
      setTasksEnhanced(prev => prev.filter(task => task.id !== id));
    } catch (error) {
      console.error('Failed to delete todo:', error);
    }
  };

  const updateTask = async (id, updatedTask) => {
    try {
      await todosApi.updateTodo(id, updatedTask);
      setTasksEnhanced(prev => prev.map(task => (task.id === id ? { ...task, ...updatedTask } : task)));
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
        await todosApi.batchReorderCategories(batchUpdates);
      } catch (error) {
        console.error('Failed to reorder categories:', error);
        await loadCategories();
      }
    },
    [loadCategories]
  );

  const convertTodoToEvent = async (todoId, startDate, endDate, isAllDay = false) => {
    const task = tasks.find(t => t.id === todoId);
    if (!task) {
      throw new Error('Task not found');
    }

    // Find the category color for this task
    const taskCategory = categories.find(cat => cat.name === task.category_name);
    const categoryColor = taskCategory?.icon || '#3478F6'; // Default to blue if no category found

    const isoStart = startDate.toISOString();
    const isoEnd = endDate.toISOString();
    const startDateOnly = toLocalDateOnlyString(startDate);
    const endDateOnly = toLocalDateOnlyString(endDate);
    const payloadStart = isAllDay ? startDateOnly : isoStart;
    const payloadEnd = isAllDay
      ? (endDateOnly && endDateOnly !== startDateOnly
          ? endDateOnly
          : toLocalDateOnlyString(new Date(startDate.getTime() + 24 * 60 * 60 * 1000)))
      : isoEnd;

    const previousSnapshot = {
      date: task.date,
      scheduled_date: task.scheduled_date,
      scheduled_at: task.scheduled_at,
      scheduled_is_all_day: task.scheduled_is_all_day
    };

    // Immediately reflect scheduled time in the sidebar
    setTasksEnhanced(prev => prev.map(t => (
      t.id === todoId
        ? enhanceTaskWithSchedule({
            ...t,
            date: payloadStart,
            scheduled_date: payloadStart,
            scheduled_at: payloadStart,
            scheduled_is_all_day: isAllDay
          })
        : t
    )));

    // Create optimistic event immediately with category color
    const optimisticEventId = `temp-${Date.now()}`;
    const optimisticEvent = {
      id: optimisticEventId,
      summary: task.content,
      title: task.content,
      start: isAllDay 
        ? { date: startDateOnly }
        : { dateTime: isoStart },
      end: isAllDay
        ? { date: payloadEnd }
        : { dateTime: isoEnd },
      calendar_id: 'primary',
      isAllDay,
      color: categoryColor
    };

    // Dispatch immediately for instant UI update
    window.dispatchEvent(new CustomEvent('todoConvertedToEvent', {
      detail: { 
        eventData: optimisticEvent,
        isOptimistic: true
      }
    }));

    try {
      // Call the backend API to create the actual event
      const response = await todosApi.convertToEvent(todoId, {
        start_date: payloadStart,
        end_date: payloadEnd,
        is_all_day: isAllDay,
        category_color: categoryColor
      });

      const resolvedEvent = {
        ...response.data,
        title: response.data?.summary || task.content,
        isAllDay,
        color: categoryColor
      };

      // Update with real event data
      window.dispatchEvent(new CustomEvent('todoConvertedToEvent', {
        detail: { 
          eventData: resolvedEvent,
          isOptimistic: false,
          replaceId: optimisticEventId, // Replace the optimistic event
          todoId
        }
      }));

      // Background refresh to ensure sidebar state stays in sync
      try { await loadTasks(); } catch (_) {}

      return resolvedEvent;
    } catch (error) {
      console.error('Failed to convert todo to event:', error);
      
      // Remove the optimistic event on failure
      window.dispatchEvent(new CustomEvent('todoConversionFailed', {
        detail: { eventId: optimisticEventId }
      }));

      // revert scheduled tag if backend failed
      setTasksEnhanced(prev => prev.map(t => (
        t.id === todoId
          ? enhanceTaskWithSchedule({
              ...t,
              date: previousSnapshot.date,
              scheduled_date: previousSnapshot.scheduled_date,
              scheduled_at: previousSnapshot.scheduled_at,
              scheduled_is_all_day: previousSnapshot.scheduled_is_all_day
            })
          : t
      )));
      
      throw error;
    }
  };

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
      reorderCategories,
      convertTodoToEvent
    }}>
      {children}
    </TaskContext.Provider>
  );
};
