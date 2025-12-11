import { useDroppable } from '@dnd-kit/core';
import { useMemo } from 'react';

/**
 * Custom hook for making calendar cells into dnd-kit droppable zones.
 * 
 * @param {Object} options
 * @param {string} options.id - Unique identifier for this droppable zone
 * @param {Date} options.date - The date this cell represents
 * @param {number} [options.hour] - The hour this cell represents (for hour cells)
 * @param {boolean} [options.isAllDay] - Whether this is an all-day cell
 * @param {string} [options.type] - Type of cell: 'calendar-cell', 'hour-cell', 'all-day-cell'
 * @param {boolean} [options.disabled] - Whether this droppable is disabled
 */
export const useCalendarDropZone = ({
    id,
    date,
    hour,
    isAllDay = false,
    type = 'calendar-cell',
    disabled = false,
}) => {
    const data = useMemo(() => ({
        type,
        date,
        hour,
        isAllDay,
    }), [type, date, hour, isAllDay]);

    const { setNodeRef, isOver, active } = useDroppable({
        id,
        data,
        disabled,
    });

    // Check if the active item is a task/todo
    const isTaskDrag = active?.data?.current?.type === 'task';
    const isOverWithTask = isOver && isTaskDrag;

    return {
        setNodeRef,
        isOver,
        isOverWithTask,
        active,
    };
};

export default useCalendarDropZone;
