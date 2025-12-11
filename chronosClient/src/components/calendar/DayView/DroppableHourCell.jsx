import { format } from 'date-fns';
import { useDroppable } from '@dnd-kit/core';
import { useDndKit } from '../../DndKitProvider';
import { getEventColors, normalizeToPaletteColor } from '../../../lib/eventColors';

const DroppableHourCell = ({
    hour,
    currentDate,
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
    clearTodoDragPreview,
    pendingTodoPreviewRef
}) => {
    const { activeTodo, lockedCellId, isOverCalendar } = useDndKit();
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    const droppableId = `day-hour-${dateStr}-${hour}`;

    const { setNodeRef, isOver, active } = useDroppable({
        id: droppableId,
        data: { type: 'hour-cell', date: currentDate, hour, isAllDay: false },
    });

    const isDndKitHovering = isOver && active?.data?.current?.type === 'task';
    const isLockedOnThisCell = lockedCellId === droppableId;
    const isAnyDayHourLocked = lockedCellId?.startsWith('day-hour-');

    const showEventPreview = activeTodo && isOverCalendar && (
        isLockedOnThisCell || (isAnyDayHourLocked && isDndKitHovering)
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

        const previewStart = new Date(currentDate);
        previewStart.setHours(hour, 0, 0, 0);
        const previewEnd = new Date(previewStart);
        previewEnd.setHours(hour + 1, 0, 0, 0);

        // Match DayEvent styling exactly
        return (
            <div
                className="absolute rounded-lg p-1 overflow-hidden text-sm pointer-events-none"
                style={{
                    top: 0,
                    left: '120px', // align with visible content area (time gutter is padded)
                    right: '6px',
                    height: `${hourHeight - 4}px`, // Account for gap like real events
                    backgroundColor: colors.background,
                    zIndex: 9997,
                    opacity: 0.92
                }}
            >
                {/* Vertical line - matching DayEvent exactly */}
                <div
                    className="absolute top-0.5 bottom-0.5 w-1 rounded-full pointer-events-none"
                    style={{ left: '2px', backgroundColor: colors.border, zIndex: 3 }}
                />
                <div className="ml-3" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div
                        className="font-medium mb-0.5"
                        style={{ color: colors.text, fontSize: '12px', marginLeft: '2px' }}
                    >
                        <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                            {activeTodo.title}
                        </span>
                    </div>
                    <div
                        className="text-xs leading-tight"
                        style={{ color: 'rgba(55, 65, 81, 0.7)', fontWeight: 500, marginLeft: '2px' }}
                    >
                        {format(previewStart, 'h:mm a')} – {format(previewEnd, 'h:mm a')}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div
            ref={setNodeRef}
            className="day-hour-cell absolute right-0 z-[1] cursor-default"
            data-hour={hour}
            data-date={dateStr}
            style={{
                height: `${hourHeight}px`,
                top: `${(hour - dayStartHour) * hourHeight}px`,
                left: '-120px', // Extend further to catch drags near sidebar
                paddingLeft: '120px' // Visual content stays in original position
            }}
            onMouseDown={(e) => handleCellMouseDown(e, hour)}
            onMouseMove={(e) => handleCellMouseMove(e, hour)}
            onDoubleClick={(e) => handleCellDoubleClick(e, hour)}
            onDrop={(e) => handleCombinedDropOnHourCell(e, hour, e.currentTarget)}
            onDragOver={(e) => {
                handleHourCellDragOver(e, hour);
                handleHourCellTodoDragOver(e, hour);
            }}
            onDragLeave={(e) => {
                handleDragLeave(e);
                if (document.body.classList.contains('task-dragging')) {
                    const relatedTarget = e.relatedTarget;
                    if (!relatedTarget || !relatedTarget.closest('.day-hour-cell')) clearTodoDragPreview();
                }
            }}
        >
            {renderEventPreview()}
        </div>
    );
};

export default DroppableHourCell;
