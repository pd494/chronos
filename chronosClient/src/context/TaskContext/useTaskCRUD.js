import { todosApi } from '../../lib/api';
import { arrayMove } from '@dnd-kit/sortable';

export const useTaskCRUD = ({
  tasks, categories, setTasksEnhanced, resolveCategory, loadCategories, clearTaskSnapshots, refs
}) => {
  const { lastMutationTimeRef } = refs;

  const addTask = async ({ content, categoryName }) => {
    const optimisticId = `temp-${Date.now()}`;
    let optimisticAdded = false;
    try {
      let category = resolveCategory(categoryName);
      if (!category) {
        const latestCategories = await loadCategories();
        if (latestCategories) category = resolveCategory(categoryName, latestCategories);
      }
      if (!category) throw new Error(`Category "${categoryName}" not found`);

      const optimisticTask = { id: optimisticId, content, completed: false, category_id: category.id, category_name: category.name };
      setTasksEnhanced(prev => [optimisticTask, ...prev]);
      optimisticAdded = true;
      lastMutationTimeRef.current = Date.now();

      const response = await todosApi.createTodo({ content, completed: false, category_name: category.name, category_id: category.id });
      const created = { ...response.data, category_name: response.data?.category_name || category.name };
      setTasksEnhanced(prev => prev.map(task => (task.id === optimisticId ? created : task)));
      lastMutationTimeRef.current = Date.now();
    } catch (error) {
      if (optimisticAdded) setTasksEnhanced(prev => prev.filter(task => task.id !== optimisticId));
      console.error('Failed to create todo:', error);
    }
  };

  const deleteTask = async (id) => {
    const prevTasks = tasks;
    lastMutationTimeRef.current = Date.now();
    setTasksEnhanced(prev => prev.filter(task => task.id !== id));
    clearTaskSnapshots();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('todoDeleted', { detail: { todoId: id } }));
    }
    try {
      await todosApi.deleteTodo(id);
      lastMutationTimeRef.current = Date.now();
    } catch (error) {
      console.error('Failed to delete todo:', error);
      if (error?.status !== 404) { setTasksEnhanced(prevTasks); clearTaskSnapshots(); }
    }
  };

  const updateTask = async (id, updatedTask) => {
    try {
      await todosApi.updateTodo(id, updatedTask);
      setTasksEnhanced(prev => prev.map(task => (task.id === id ? { ...task, ...updatedTask } : task)));
      lastMutationTimeRef.current = Date.now();
    } catch (error) { console.error('Failed to update todo:', error); }
  };

  const clearTaskSchedule = (todoId) => {
    if (!todoId) return;
    setTasksEnhanced(prev => prev.map(t => t.id === todoId
      ? { ...t, scheduled_date: null, scheduled_at: null, scheduled_end: null, scheduled_is_all_day: false }
      : t
    ));
  };

  const reorderTasks = async (activeId, overId, categoryName = null) => {
    if (activeId === overId) return;

    setTasksEnhanced(prev => {
      const oldIndex = prev.findIndex(t => t.id === activeId);
      const newIndex = prev.findIndex(t => t.id === overId);

      if (oldIndex === -1 || newIndex === -1) return prev;

      return arrayMove(prev, oldIndex, newIndex);
    });

    lastMutationTimeRef.current = Date.now();
  };

  const toggleTaskComplete = async (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const emitCompletionChange = (completed) => {
      if (typeof window === 'undefined') return;
      window.dispatchEvent(new CustomEvent('todoCompletionChanged', { detail: { todoId: id, completed: Boolean(completed) } }));
    };

    if (task.completed && task.category_name === 'Completed') {
      setTasksEnhanced(prev => prev.filter(t => t.id !== id));
      try {
        await todosApi.deleteTodo(id);
        lastMutationTimeRef.current = Date.now();
      } catch (error) {
        console.error('Failed to delete todo:', error);
        setTasksEnhanced(prev => [...prev, task]);
        emitCompletionChange(task.completed);
      }
      return;
    }

    if (!task.completed) {
      const completedCategory = categories.find(cat => cat.name === 'Completed');
      if (completedCategory) {
        const updatedTask = { ...task, completed: true, category_name: 'Completed', category_id: completedCategory.id };
        setTasksEnhanced(prev => prev.map(t => t.id === id ? updatedTask : t));
        emitCompletionChange(true);
        try {
          await todosApi.updateTodo(id, { completed: true, category_name: 'Completed', category_id: completedCategory.id });
          lastMutationTimeRef.current = Date.now();
        } catch (error) {
          console.error('Failed to complete todo:', error);
          setTasksEnhanced(prev => prev.map(t => t.id === id ? task : t));
          emitCompletionChange(task.completed);
        }
      }
    } else {
      const updatedTask = { ...task, completed: false };
      setTasksEnhanced(prev => prev.map(t => t.id === id ? updatedTask : t));
      emitCompletionChange(false);
      try {
        await todosApi.updateTodo(id, { completed: false });
        lastMutationTimeRef.current = Date.now();
      } catch (error) {
        console.error('Failed to uncomplete todo:', error);
        setTasksEnhanced(prev => prev.map(t => t.id === id ? task : t));
        emitCompletionChange(task.completed);
      }
    }
  };

  return { addTask, deleteTask, updateTask, clearTaskSchedule, toggleTaskComplete, reorderTasks };
};
