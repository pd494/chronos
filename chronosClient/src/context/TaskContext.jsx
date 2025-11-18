import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { todosApi } from '../lib/api';
import { useAuth } from './AuthContext';

const TaskContext = createContext();

export const useTaskContext = () => useContext(TaskContext);

const ALL_CATEGORY = { id: 'all', name: 'All', icon: '★', order: -1 };
const TASK_SNAPSHOT_PREFIX = 'chronos:tasks:snapshot:';

const SPECIAL_CATEGORY_COLORS = {
  Inbox: '#3478F6',
  Today: '#FF9500',
  Completed: '#34C759'
};

const pickCategoryFromList = (categoryName, categoriesList = []) => {
  if (!Array.isArray(categoriesList) || !categoriesList.length) {
    return null;
  }

  const usable = categoriesList.filter(cat => cat && cat.id !== ALL_CATEGORY.id);
  const inbox = usable.find(cat => cat.name === 'Inbox');
  const fallback = inbox || usable[0] || categoriesList.find(cat => cat?.id !== ALL_CATEGORY.id) || null;

  if (!categoryName || categoryName === 'All' || categoryName === 'Completed') {
    return fallback;
  }

  return usable.find(cat => cat.name === categoryName) || fallback;
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

const readTasksSnapshotForUser = (user) => {
  if (typeof window === 'undefined' || !user) return null;
  const keys = [];
  const emailId = user?.email;
  const rawId = user?.id;
  if (emailId) {
    keys.push(`${TASK_SNAPSHOT_PREFIX}${emailId}`);
  }
  if (rawId) {
    keys.push(`${TASK_SNAPSHOT_PREFIX}${rawId}`);
  }
  if (!keys.length) return null;

  const readForKey = (key) => {
    if (!key) return null;
    const fromSession = window.sessionStorage.getItem(key);
    if (fromSession) return fromSession;
    try {
      return window.localStorage.getItem(key);
    } catch (_) {
      return fromSession;
    }
  };

  for (const key of keys) {
    const raw = readForKey(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') continue;
      return parsed;
    } catch (_) {
      continue;
    }
  }
  return null;
};

export const TaskProvider = ({ children }) => {
  const { user } = useAuth();
  const initialSnapshot = readTasksSnapshotForUser(user);
  const [tasks, setTasks] = useState(() =>
    Array.isArray(initialSnapshot?.tasks) ? enhanceTasks(initialSnapshot.tasks) : []
  );
  const [categories, setCategories] = useState(() =>
    Array.isArray(initialSnapshot?.categories) && initialSnapshot.categories.length
      ? initialSnapshot.categories
      : [ALL_CATEGORY]
  );
  const snapshotKey = useMemo(() => {
    if (!user) return null;
    const stableId = user.email || user.id;
    if (!stableId) return null;
    return `${TASK_SNAPSHOT_PREFIX}${stableId}`;
  }, [user]);
  const hasHydratedSnapshotRef = useRef(false);
  const bootstrapPromiseRef = useRef(null);
  const lastBootstrapAtRef = useRef(0);
  const hasStartedLoadingRef = useRef(false);
  const lastMutationTimeRef = useRef(0); // Track when we last created/updated/deleted a todo

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

  const hydrateFromSnapshot = useCallback(() => {
    if (!user) return false;
    try {
      const parsed = readTasksSnapshotForUser(user);
      if (!parsed) return false;
      if (Array.isArray(parsed.tasks)) {
        setTasksEnhanced(parsed.tasks);
      }
      if (Array.isArray(parsed.categories) && parsed.categories.length) {
        setCategories(parsed.categories);
      }
      return true;
    } catch (error) {
      console.warn('Failed to hydrate tasks snapshot:', error);
      return false;
    }
  }, [user, setTasksEnhanced, setCategories]);

  const loadCategories = useCallback(async () => {
    try {
      const response = await todosApi.getCategories();
      const nextCategories = buildCategories(response.data || []);
      setCategories(nextCategories);
      return nextCategories;
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      return null;
    }
  }, []);

  const loadBootstrap = useCallback(async () => {
    if (!user) return null;
    try {
      const response = await todosApi.getBootstrap();
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
      
      // Only update state if we actually got data (or empty arrays are valid)
      const builtCategories = buildCategories(fetchedCategories);
      
      // Set both atomically to prevent UI flicker
      setTasksEnhanced(fetchedTodos);
      setCategories(builtCategories);
      lastBootstrapAtRef.current = Date.now();
      
      return { todos: fetchedTodos, categories: builtCategories };
    } catch (error) {
      console.error('Failed to bootstrap todos:', error);
      // Don't clear existing data on error - keep what we have
      return null;
    }
  }, [user, setTasksEnhanced]);

  const refreshBootstrap = useCallback(
    async (force = false) => {
      if (!user) return null;
      const now = Date.now();
      const stale = now - lastBootstrapAtRef.current > 60 * 1000;
      const timeSinceMutation = now - lastMutationTimeRef.current;
      
      // Don't refresh if we just made a mutation (within last 2 seconds) unless forced
      // This prevents overwriting optimistic updates
      if (!force && timeSinceMutation < 2000) {
        return null;
      }
      
      // Only skip if we have data, it's not stale, and we're not forcing
      // But always load on first load (when lastBootstrapAtRef is 0)
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
    [user, loadBootstrap, tasks.length, categories.length]
  );

  const loadData = useCallback(async (force = false) => {
    await refreshBootstrap(force);
  }, [refreshBootstrap]);

  // Fetch todos and categories when user is logged in
  useEffect(() => {
    if (!user) {
      hasHydratedSnapshotRef.current = false;
      bootstrapPromiseRef.current = null;
      lastBootstrapAtRef.current = 0;
      hasStartedLoadingRef.current = false;
      resetState();
      return;
    }
    // Only run once per user session to prevent multiple calls
    if (hasStartedLoadingRef.current) {
      return;
    }
    hasStartedLoadingRef.current = true;
    
    if (!hasHydratedSnapshotRef.current) {
      const hydrated = hydrateFromSnapshot();
      hasHydratedSnapshotRef.current = hydrated;
    }
    loadData(true);
  }, [user, hydrateFromSnapshot, loadData, resetState]);

  useEffect(() => {
    if (!snapshotKey || typeof window === 'undefined' || !user) return;
    try {
      const payload = {
        tasks,
        categories,
        savedAt: Date.now()
      };
      const serialized = JSON.stringify(payload);
      window.sessionStorage.setItem(snapshotKey, serialized);
      try {
        window.localStorage.setItem(snapshotKey, serialized);
      } catch (_) {
        // localStorage may be unavailable; ignore
      }
    } catch (error) {
      console.warn('Failed to persist tasks snapshot:', error);
    }
  }, [snapshotKey, tasks, categories, user]);

  // Disabled automatic refresh on focus/visibility/online - only refresh on CRUD operations
  // useEffect(() => {
  //   ... automatic refresh logic disabled ...
  // }, [])

  const resolveCategory = useCallback(
    (categoryName, sourceCategories) => pickCategoryFromList(categoryName, sourceCategories ?? categories),
    [categories]
  );

  const addTask = async ({ content, categoryName }) => {
    const optimisticId = `temp-${Date.now()}`;
    let optimisticAdded = false;

    try {
      let category = resolveCategory(categoryName);
      if (!category) {
        const latestCategories = await loadCategories();
        if (latestCategories) {
          category = resolveCategory(categoryName, latestCategories);
        }
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
      lastMutationTimeRef.current = Date.now(); // Track mutation time

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

      // Update the optimistic task with real data
      setTasksEnhanced(prev =>
        prev.map(task => (task.id === optimisticId ? created : task))
      );
      lastMutationTimeRef.current = Date.now(); // Update mutation time after successful creation
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
        lastMutationTimeRef.current = Date.now();
      }
    } catch (error) {
      console.error('Failed to create category:', error);
    }
  };

  const updateCategory = async (id, updatedCategory) => {
    try {
      await todosApi.updateCategory(id, updatedCategory);
      await loadCategories();
      lastMutationTimeRef.current = Date.now();
    } catch (error) {
      console.error('Failed to update category:', error);
    }
  };

  const deleteCategory = async (id) => {
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
  };

  const toggleTaskComplete = async (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (task.completed && task.category_name === 'Completed') {
      setTasksEnhanced(prev => prev.filter(t => t.id !== id));
      
      try {
        await todosApi.deleteTodo(id);
        lastMutationTimeRef.current = Date.now();
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
          lastMutationTimeRef.current = Date.now();
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
        lastMutationTimeRef.current = Date.now();
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
      lastMutationTimeRef.current = Date.now();
    } catch (error) {
      console.error('Failed to delete todo:', error);
    }
  };

  const updateTask = async (id, updatedTask) => {
    try {
      await todosApi.updateTodo(id, updatedTask);
      setTasksEnhanced(prev => prev.map(task => (task.id === id ? { ...task, ...updatedTask } : task)));
      lastMutationTimeRef.current = Date.now();
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
        await refreshBootstrap(true);
      }
    },
    [refreshBootstrap]
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

    // Create optimistic event immediately with category color
    const optimisticEventId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
      // Don't include todoId - each event is independent
    };

    // Dispatch immediately for instant UI update
    window.dispatchEvent(new CustomEvent('todoConvertedToEvent', {
      detail: { 
        eventData: optimisticEvent,
        isOptimistic: true,
        todoId
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
        // Don't include todoId - each event is independent
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

      // Don't refresh tasks after scheduling - keep UI stable

      return resolvedEvent;
    } catch (error) {
      console.error('Failed to convert todo to event:', error);
      
      // Remove the optimistic event on failure
      window.dispatchEvent(new CustomEvent('todoConversionFailed', {
        detail: { eventId: optimisticEventId }
      }));

      throw error;
    }
  };

  // Removed problematic calendar sync handler that was clearing todo schedule metadata

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
