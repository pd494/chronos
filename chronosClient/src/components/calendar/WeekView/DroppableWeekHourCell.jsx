import { format } from 'date-fns';
import { useDroppable } from '@dnd-kit/core';
import { useDndKit } from '../../DndKitProvider';
import { getEventColors, normalizeToPaletteColor } from '../../../lib/eventColors';

const DroppableWeekHourCell = ({
    day,
    hour,
    hourHeight,
    dayStartHour,
    regularEvents = [],
    handleCellMouseDown,
    handleCellMouseMove,
    handleCellDoubleClick,
    handleCombinedDropOnHourCell,
    handleHourCellDragOver,
    handleHourCellTodoDragOver,
    handleDragLeave,
    clearTodoDragPreview
}) => {
    const { activeTodo, lockedCellId } = useDndKit();
    const dateStr = format(day, 'yyyy-MM-dd');
    const droppableId = `week-hour-${dateStr}-${hour}`;

    const { setNodeRef, isOver, active } = useDroppable({
        id: droppableId,
        data: { type: 'hour-cell', date: day, hour, isAllDay: false },
    });

    const isDndKitHovering = isOver && active?.data?.current?.type === 'task';
    const isLockedOnThisCell = lockedCellId === droppableId;
    const isAnyWeekHourLocked = lockedCellId?.startsWith('week-hour-');

    const showEventPreview = activeTodo && (
        isLockedOnThisCell || (isAnyWeekHourLocked && isDndKitHovering)
    );

    const todoIdBeingDragged = activeTodo?.id;
    const alreadyHasEventForTodo = todoIdBeingDragged && regularEvents.some(ev => {
        const evTodoId = ev.todoId || ev.todo_id;
        return evTodoId && String(evTodoId) === String(todoIdBeingDragged);
    });
    const finalShowEventPreview = showEventPreview && !alreadyHasEventForTodo;

    const renderEventPreview = () => {
        if (!finalShowEventPreview) return null;

        const colorName = normalizeToPaletteColor(activeTodo.color || 'blue');
        const colors = getEventColors(colorName);

        const previewStart = new Date(day);
        previewStart.setHours(hour, 0, 0, 0);
        const previewEnd = new Date(previewStart);
        previewEnd.setHours(hour + 1, 0, 0, 0);

        return (
            <div
                className="absolute rounded-lg p-1 overflow-hidden text-sm pointer-events-none shadow-sm"
                style={{
                    top: 0,
                    left: '2px',
                    right: '2px',
                    minHeight: `${hourHeight}px`,
                    backgroundColor: colors.background,
                    boxShadow: '0 0 0 1px rgba(148, 163, 184, 0.5)',
                    zIndex: 9997,
                }}
            >
                <div
                    className="absolute top-0 bottom-0 w-1 rounded-full"
                    style={{ left: '2px', backgroundColor: colors.border, zIndex: 3 }}
                />
                <div className="ml-3">
                    <div className="font-medium text-xs truncate" style={{ color: colors.text }}>
                        {activeTodo.title}
                    </div>
                    <div className="text-xs" style={{ color: 'rgba(55, 65, 81, 0.75)' }}>
                        {format(previewStart, 'h:mm a')} - {format(previewEnd, 'h:mm a')}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div
            ref={setNodeRef}
            className="hour-cell absolute left-0 right-0 z-[1] cursor-default"
            data-hour={hour}
            data-day={dateStr}
            data-date={dateStr}
            style={{ height: `${hourHeight}px`, top: `${(hour - dayStartHour) * hourHeight}px` }}
            onMouseDown={(e) => handleCellMouseDown(e, day, hour)}
            onMouseMove={(e) => handleCellMouseMove(e, day, hour)}
            onDoubleClick={(e) => handleCellDoubleClick(e, day, hour)}
            onDrop={(e) => handleCombinedDropOnHourCell(e, day, hour, e.currentTarget)}
            onDragOver={(e) => {
                handleHourCellDragOver(e, day, hour);
                handleHourCellTodoDragOver(e, day, hour);
            }}
            onDragLeave={(e) => {
                handleDragLeave(e);
                if (document.body.classList.contains('task-dragging')) {
                    const relatedTarget = e.relatedTarget;
                    if (!relatedTarget || !relatedTarget.closest('.hour-cell')) clearTodoDragPreview();
                }
            }}
        >
            {renderEventPreview()}
        </div>
    );
};

export default DroppableWeekHourCell;
