import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { todosApi } from '../lib/api';
import { normalizeToPaletteColor } from '../lib/eventColors';
import { useAuth } from './AuthContext';

const TaskContext = createContext();

export const useTaskContext = () => useContext(TaskContext);

const ALL_CATEGORY = { id: 'all', name: 'All', icon: '★', order: -1 };
const TASK_SNAPSHOT_PREFIX = 'chronos:tasks:snapshot:';

const SPECIAL_CATEGORY_COLORS = {
  Inbox: '#1761C7',
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

// Disable local/session storage snapshots for tasks
const readTasksSnapshotForUser = () => null;

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
  const snapshotKey = useMemo(() => null, []);
  const conversionInFlightRef = useRef(new Set());
  const hasHydratedSnapshotRef = useRef(false);
  const bootstrapPromiseRef = useRef(null);
  const lastBootstrapAtRef = useRef(0);
  const hasStartedLoadingRef = useRef(false);
  const lastMutationTimeRef = useRef(0); // Track when we last created/updated/deleted a todo
  const categoryOverrideRef = useRef(new Map());

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

  const clearTaskSnapshots = useCallback(() => {
    if (!snapshotKey || typeof window === 'undefined') return;
    try {
      window.sessionStorage.removeItem(snapshotKey);
    } catch (_) {}
    try {
      window.localStorage.removeItem(snapshotKey);
    } catch (_) {}
  }, [snapshotKey]);

  const hydrateFromSnapshot = useCallback(() => false, []);

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
  }, []);

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

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleScheduleUpdate = (e) => {
      const detail = e.detail || {}
      const todoId = detail.todoId
      if (!todoId) return
      const startIso = detail.start
      const endIso = detail.end
      const isAllDay = Boolean(detail.isAllDay)
      const isTempId = typeof todoId === 'string' && todoId.startsWith('temp-')

      if (!startIso) {
        // Clear scheduling locally and remotely, including legacy date field,
        // so the grey chip cannot come back after refresh.
        setTasksEnhanced(prev =>
          prev.map(t => {
            if (String(t.id) !== String(todoId)) return t
            return {
              ...t,
              scheduled_date: null,
              scheduled_at: null,
              scheduled_end: null,
              scheduled_is_all_day: false,
              date: null
            }
          })
        )
        if (!isTempId) {
          todosApi.updateTodo(todoId, {
            scheduled_date: null,
            scheduled_at: null,
            scheduled_end: null,
            scheduled_is_all_day: false,
            date: null
          }).catch(() => {})
        }
        clearTaskSnapshots();
        return
      }

      const startDateObj = new Date(startIso)
      const scheduleValue = isAllDay ? toLocalDateOnlyString(startDateObj) : startIso
      const endValue = endIso || startIso
      setTasksEnhanced(prev =>
        prev.map(t => {
          const same = String(t.id) === String(todoId)
          if (!same) return t
          return {
            ...t,
            scheduled_date: scheduleValue,
            scheduled_at: scheduleValue,
            scheduled_end: endValue,
            scheduled_is_all_day: isAllDay
          }
        })
      )
      clearTaskSnapshots();
    }
    window.addEventListener('todoScheduleUpdated', handleScheduleUpdate)
    return () => window.removeEventListener('todoScheduleUpdated', handleScheduleUpdate)
  }, [setTasksEnhanced])

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
  };

  const updateCategory = async (id, updatedCategory) => {
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

    const emitCompletionChange = (completed) => {
      if (typeof window === 'undefined') return
      window.dispatchEvent(new CustomEvent('todoCompletionChanged', {
        detail: { todoId: id, completed: Boolean(completed) }
      }))
    }

    if (task.completed && task.category_name === 'Completed') {
      setTasksEnhanced(prev => prev.filter(t => t.id !== id));
      
      try {
        await todosApi.deleteTodo(id);
        lastMutationTimeRef.current = Date.now();
      } catch (error) {
        console.error('Failed to delete todo:', error);
        setTasksEnhanced(prev => [...prev, task]);
        emitCompletionChange(task.completed)
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
        emitCompletionChange(true)
        
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
          emitCompletionChange(task.completed)
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
      emitCompletionChange(false)
      
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
        emitCompletionChange(task.completed)
      }
    }
  };

  const deleteTask = async (id) => {
    const prevTasks = tasks;
    // Set mutation time BEFORE the API call to prevent refreshes from overwriting
    lastMutationTimeRef.current = Date.now();
    // Optimistically remove immediately so a single delete action feels responsive
    setTasksEnhanced(prev => prev.filter(task => task.id !== id));
    clearTaskSnapshots();
    // Dispatch event immediately for calendar to react
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('todoDeleted', { detail: { todoId: id } }))
    }
    try {
      await todosApi.deleteTodo(id);
      lastMutationTimeRef.current = Date.now();
    } catch (error) {
      console.error('Failed to delete todo:', error);
      // Only roll back if it's NOT a 404 (already deleted)
      if (error?.status !== 404) {
        setTasksEnhanced(prevTasks);
        clearTaskSnapshots();
      }
    }
  };

  const clearTaskSchedule = useCallback((todoId) => {
    if (!todoId) return
    setTasksEnhanced(prev =>
      prev.map(t =>
        t.id === todoId
          ? {
              ...t,
              scheduled_date: null,
              scheduled_at: null,
              scheduled_end: null,
              scheduled_is_all_day: false
            }
          : t
      )
    )
  }, [setTasksEnhanced])

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
    const todoKey = String(todoId);
    if (conversionInFlightRef.current.has(todoKey)) {
      return;
    }
    conversionInFlightRef.current.add(todoKey);

    const task = tasks.find(t => t.id === todoId);
    if (!task) {
      conversionInFlightRef.current.delete(todoKey);
      throw new Error('Task not found');
    }
    if (task.scheduled_date || task.scheduled_at) {
      conversionInFlightRef.current.delete(todoKey);
      return;
    }

    // Find the category color for this task (fall back to drag meta if available)
    const taskCategory = categories.find(cat => cat.name === task.category_name);
    const dragMetaColor = typeof window !== 'undefined' ? window.__chronosDraggedTodoMeta?.color : null;
    const rawCategoryColor = taskCategory?.icon || taskCategory?.color || dragMetaColor || 'blue'; // Default to palette blue
    const uiCategoryColor = normalizeToPaletteColor(rawCategoryColor);

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

    const optimisticId = `temp-todo-${todoKey}-${Date.now()}`;
    const optimisticEvent = {
      id: optimisticId,
      title: task.content || 'New task',
      start: startDate,
      end: endDate,
      isGoogleEvent: true,
      isAllDay,
      color: uiCategoryColor,
      calendar_id: 'primary',
      todoId: todoKey,
      todo_id: todoKey,
      _freshDrop: true
    };

    // Show the event immediately (optimistic) so the drop feels instant
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('todoConvertedToEvent', {
        detail: { 
          eventData: optimisticEvent,
          isOptimistic: true,
          todoId
        }
      }));
    }

    try {
      // Call the backend API to create the actual event
      const response = await todosApi.convertToEvent(todoId, {
        start_date: payloadStart,
        end_date: payloadEnd,
        is_all_day: isAllDay,
        category_color: rawCategoryColor
      });

      const scheduledDateValue = isAllDay ? startDateOnly : isoStart;

      const resolvedEvent = {
        ...response.data,
        title: response.data?.summary || task.content,
        start: response.data?.start || response.data?.start_date || startDate,
        end: response.data?.end || response.data?.end_date || endDate,
        isGoogleEvent: true,
        isAllDay,
        color: uiCategoryColor,
        todoId,
        todo_id: todoId,
        _freshDrop: false
      };

      // Ensure task schedule stays in sync with server response
      setTasksEnhanced(prev =>
        prev.map(t =>
          t.id === todoId
            ? {
                ...t,
                scheduled_date: scheduledDateValue,
                scheduled_at: scheduledDateValue,
                scheduled_end: isAllDay ? null : payloadEnd,
                scheduled_is_all_day: isAllDay
              }
            : t
        )
      );

      // Notify calendar with the real event data (single deterministic event)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('todoConvertedToEvent', {
          detail: { 
            eventData: resolvedEvent,
            isOptimistic: false,
            todoId
          }
        }));
      }

      // Don't refresh tasks after scheduling - keep UI stable

      return resolvedEvent;
    } catch (error) {
      console.error('Failed to convert todo to event:', error);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('todoConversionFailed', {
          detail: { eventId: optimisticId }
        }));
      }
      throw error;
    } finally {
      conversionInFlightRef.current.delete(todoKey);
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
