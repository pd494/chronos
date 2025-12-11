import { normalizeToPaletteColor } from '../../lib/eventColors';
import { todosApi } from '../../lib/api';
import { toLocalDateOnlyString } from './utils';

export const useTaskConversion = ({
  tasks,
  categories,
  setTasksEnhanced,
  refs
}) => {
  const { conversionInFlightRef } = refs;

  const convertTodoToEvent = async (todoId, startDate, endDate, isAllDay = false) => {
    const todoKey = String(todoId);
    if (conversionInFlightRef.current.has(todoKey)) {
      return;
    }
    conversionInFlightRef.current.add(todoKey);

    const task = tasks.find((t) => String(t.id) === todoKey);
    if (!task) {
      conversionInFlightRef.current.delete(todoKey);
      throw new Error('Task not found');
    }
    if (task.scheduled_date || task.scheduled_at) {
      conversionInFlightRef.current.delete(todoKey);
      return;
    }

    const taskCategory = categories.find(cat => cat.name === task.category_name);
    const dragMetaColor = typeof window !== 'undefined' ? window.__chronosDraggedTodoMeta?.color : null;
    const rawCategoryColor = taskCategory?.icon || taskCategory?.color || dragMetaColor || 'blue';
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

    if (typeof window !== 'undefined') {
      // Track conversion time to prevent premature day index rebuilds
      window.__chronosLastTodoConversion = Date.now();

      window.dispatchEvent(new CustomEvent('chronos-todo-overlay-hide'));

      window.dispatchEvent(new CustomEvent('todoConvertedToEvent', {
        detail: {
          eventData: optimisticEvent,
          isOptimistic: true,
          todoId: todoKey
        }
      }));
    }

    try {
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
        todoId: todoKey,
        todo_id: todoKey,
        _freshDrop: false
      };

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

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('todoConvertedToEvent', {
          detail: {
            eventData: resolvedEvent,
            isOptimistic: false,
            todoId: todoKey
          }
        }));
      }

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

  return { convertTodoToEvent };
};

