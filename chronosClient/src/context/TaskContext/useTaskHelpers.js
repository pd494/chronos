import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { ALL_CATEGORY } from './constants';
import { enhanceTasks, readTasksSnapshotForUser, toLocalDateOnlyString } from './utils';
import { todosApi } from '../../lib/api';

export const useTaskState = (user) => {
  const initialSnapshot = readTasksSnapshotForUser(user);
  const [tasks, setTasks] = useState(() =>
    Array.isArray(initialSnapshot?.tasks) ? enhanceTasks(initialSnapshot.tasks) : []
  );
  const [categories, setCategories] = useState(() =>
    Array.isArray(initialSnapshot?.categories) && initialSnapshot.categories.length
      ? initialSnapshot.categories : [ALL_CATEGORY]
  );
  const snapshotKey = useMemo(() => null, []);
  const conversionInFlightRef = useRef(new Set());
  const hasHydratedSnapshotRef = useRef(false);
  const bootstrapPromiseRef = useRef(null);
  const lastBootstrapAtRef = useRef(0);
  const hasStartedLoadingRef = useRef(false);
  const lastMutationTimeRef = useRef(0);
  const categoryOverrideRef = useRef(new Map());

  const setTasksEnhanced = useCallback((updater) => {
    setTasks(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (!Array.isArray(next)) return prev;
      return enhanceTasks(next);
    });
  }, []);

  const resetState = useCallback(() => { setTasks([]); setCategories([ALL_CATEGORY]); }, []);

  const clearTaskSnapshots = useCallback(() => {
    if (!snapshotKey || typeof window === 'undefined') return;
    try { window.sessionStorage.removeItem(snapshotKey); } catch (_) {}
    try { window.localStorage.removeItem(snapshotKey); } catch (_) {}
  }, [snapshotKey]);

  const hydrateFromSnapshot = useCallback(() => false, []);

  return {
    tasks, categories, setTasksEnhanced, setCategories, snapshotKey,
    resetState, clearTaskSnapshots, hydrateFromSnapshot,
    refs: {
      conversionInFlightRef, hasHydratedSnapshotRef, bootstrapPromiseRef,
      lastBootstrapAtRef, hasStartedLoadingRef, lastMutationTimeRef, categoryOverrideRef
    }
  };
};

export const useTaskLifecycle = ({ user, hydrateFromSnapshot, loadData, resetState, refs }) => {
  useEffect(() => {
    if (!user) {
      refs.hasHydratedSnapshotRef.current = false;
      refs.bootstrapPromiseRef.current = null;
      refs.lastBootstrapAtRef.current = 0;
      refs.hasStartedLoadingRef.current = false;
      resetState();
      return;
    }
    if (refs.hasStartedLoadingRef.current) return;
    refs.hasStartedLoadingRef.current = true;
    if (!refs.hasHydratedSnapshotRef.current) {
      const hydrated = hydrateFromSnapshot();
      refs.hasHydratedSnapshotRef.current = hydrated;
    }
    loadData(true);
  }, [user, hydrateFromSnapshot, loadData, resetState, refs]);
};

export const useTaskPersistence = ({ snapshotKey, tasks, categories, user }) => {
  useEffect(() => {
    if (!snapshotKey || typeof window === 'undefined' || !user) return;
    try {
      const payload = { tasks, categories, savedAt: Date.now() };
      const serialized = JSON.stringify(payload);
      window.sessionStorage.setItem(snapshotKey, serialized);
      try { window.localStorage.setItem(snapshotKey, serialized); } catch (_) {}
    } catch (error) { console.warn('Failed to persist tasks snapshot:', error); }
  }, [snapshotKey, tasks, categories, user]);
};

export const useTaskScheduleListener = ({ setTasksEnhanced, clearTaskSnapshots }) => {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleScheduleUpdate = (e) => {
      const detail = e.detail || {};
      const todoId = detail.todoId;
      if (!todoId) return;
      const startIso = detail.start;
      const endIso = detail.end;
      const isAllDay = Boolean(detail.isAllDay);
      const isTempId = typeof todoId === 'string' && todoId.startsWith('temp-');

      if (!startIso) {
        setTasksEnhanced(prev => prev.map(t => {
          if (String(t.id) !== String(todoId)) return t;
          return { ...t, scheduled_date: null, scheduled_at: null, scheduled_end: null, scheduled_is_all_day: false, date: null };
        }));
        if (!isTempId) {
          todosApi.updateTodo(todoId, { scheduled_date: null, scheduled_at: null, scheduled_end: null, scheduled_is_all_day: false, date: null }).catch(() => {});
        }
        clearTaskSnapshots();
        return;
      }

      const startDateObj = new Date(startIso);
      const scheduleValue = isAllDay ? toLocalDateOnlyString(startDateObj) : startIso;
      const endValue = endIso || startIso;
      setTasksEnhanced(prev => prev.map(t => {
        const same = String(t.id) === String(todoId);
        if (!same) return t;
        return { ...t, scheduled_date: scheduleValue, scheduled_at: scheduleValue, scheduled_end: endValue, scheduled_is_all_day: isAllDay };
      }));
      clearTaskSnapshots();
    };
    window.addEventListener('todoScheduleUpdated', handleScheduleUpdate);
    return () => window.removeEventListener('todoScheduleUpdated', handleScheduleUpdate);
  }, [setTasksEnhanced, clearTaskSnapshots]);
};
