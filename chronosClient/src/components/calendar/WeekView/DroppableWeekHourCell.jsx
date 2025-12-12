import { format } from 'date-fns';
import { useEffect, useRef } from 'react';
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
    const { activeTodo, lockedCellId, isOverCalendar } = useDndKit();
    const sentOverlayHideRef = useRef(false);
    const dateStr = format(day, 'yyyy-MM-dd');
    const droppableId = `week-hour-${dateStr}-${hour}`;

    const { setNodeRef, isOver, active } = useDroppable({
        id: droppableId,
        data: { type: 'hour-cell', date: day, hour, isAllDay: false },
    });

    const isDndKitHovering = isOver && active?.data?.current?.type === 'task';
    const isLockedOnThisCell = lockedCellId === droppableId;

    // Only show preview once we've "locked" onto this cell (mimics day view handoff)
    const showEventPreview = activeTodo && isOverCalendar && isLockedOnThisCell;

    const todoIdBeingDragged = activeTodo?.id;
    const alreadyHasEventForTodo = todoIdBeingDragged && regularEvents.some(ev => {
        const evTodoId = ev.todoId || ev.todo_id;
        return evTodoId && String(evTodoId) === String(todoIdBeingDragged);
    });
    const finalShowEventPreview = showEventPreview && !alreadyHasEventForTodo;

    useEffect(() => {
        if (showEventPreview && !sentOverlayHideRef.current) {
            sentOverlayHideRef.current = true;
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('chronos-todo-overlay-hide'));
            }
        }
        if (!showEventPreview) {
            sentOverlayHideRef.current = false;
        }
    }, [showEventPreview]);

    const renderEventPreview = () => {
        if (!finalShowEventPreview) return null;

        const colorName = normalizeToPaletteColor(activeTodo.color || 'blue');
        const colors = getEventColors(colorName);

        const previewStart = new Date(day);
        previewStart.setHours(hour, 0, 0, 0);
        const previewEnd = new Date(previewStart);
        previewEnd.setHours(hour + 1, 0, 0, 0);

        // Mirror WeekEvent styling so preview matches the real card
        return (
            <div
                className="absolute rounded-lg p-1 overflow-visible text-sm pointer-events-none"
                style={{
                    top: 0,
                    left: '2px',
                    right: '2px',
                    height: `${Math.max(20, hourHeight - 4)}px`,
                    backgroundColor: colors.background,
                    zIndex: 9997,
                    opacity: 0.9,
                    boxShadow: '0 0 0 1px rgba(148, 163, 184, 0.4)',
                    paddingLeft: '10px',
                    userSelect: 'none',
                }}
            >
                <div
                    className="absolute left-0.5 top-0.5 bottom-0.5 w-1 rounded-full pointer-events-none"
                    style={{ backgroundColor: colors.border, zIndex: 3 }}
                />
                <div className="ml-3.5" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div
                        className="font-medium mb-0.5 flex items-start gap-1.5"
                        style={{ color: colors.text, fontSize: '12px', fontWeight: 600 }}
                    >
                        <span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">
                            {activeTodo.title}
                        </span>
                    </div>
                    <div
                        className="text-xs leading-tight"
                        style={{
                            color: 'rgba(55, 65, 81, 0.7)',
                            fontWeight: 600,
                            fontSize: 'clamp(8px, 0.85vw, 10.5px)',
                            lineHeight: '1.05',
                            whiteSpace: 'normal',
                            wordBreak: 'break-word',
                            maxWidth: '100%',
                        }}
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
