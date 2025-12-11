import React, { useState, useMemo, useCallback, createContext, useContext, useEffect, useRef } from 'react';
import {
    DndContext,
    DragOverlay,
    closestCenter,
    rectIntersection,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    MeasuringStrategy,
} from '@dnd-kit/core';
import {
    sortableKeyboardCoordinates,
    arrayMove,
} from '@dnd-kit/sortable';
import { addDays } from 'date-fns';
import { getEventColors, normalizeToPaletteColor } from '../lib/eventColors';
import { useTaskContext } from '../context/TaskContext/context';

const LOCK_IN_DELAYS = {
    'day-hour': 120,
    'week-hour': 200,
    'month-cell': 300,
    'all-day': 200,
    default: 200
};

const DndKitContext = createContext({
    activeId: null,
    activeTodo: null,
    isDragging: false,
    isOverCalendar: false,
    lockedCellId: null,
});

export const useDndKit = () => useContext(DndKitContext);

const DRAG_STYLES = `
  body.dnd-kit-dragging * { cursor: none !important; }
  body.dnd-kit-dragging { cursor: none !important; }
`;

// Custom collision detection that prioritizes calendar zones when dragging tasks
const calendarPriorityCollision = (args) => {
    const { active, droppableContainers } = args;

    // If not dragging a task, use default behavior
    if (active?.data?.current?.type !== 'task') {
        return closestCenter(args);
    }

    // Get all intersecting droppables
    const collisions = rectIntersection(args);

    if (!collisions || collisions.length === 0) {
        return closestCenter(args);
    }

    // Separate calendar zones from other droppables
    const calendarCollisions = collisions.filter(collision => {
        // Find the container data - droppableContainers is an array
        const container = droppableContainers.find(c => c.id === collision.id);
        const type = container?.data?.current?.type;
        return type === 'calendar-cell' || type === 'hour-cell' || type === 'all-day-cell';
    });

    // If we're intersecting with ANY calendar zone, prioritize it
    if (calendarCollisions.length > 0) {
        return calendarCollisions;
    }

    // Otherwise return all collisions
    return collisions;
};

const DndKitProvider = ({ children }) => {
    const { convertTodoToEvent, reorderTasks, reorderCategories, tasks, categories } = useTaskContext();
    const [activeId, setActiveId] = useState(null);
    const [activeTodo, setActiveTodo] = useState(null);
    const [isOverCalendar, setIsOverCalendar] = useState(false);
    const [currentOverId, setCurrentOverId] = useState(null);
    const [lockedCellId, setLockedCellId] = useState(null);
    const [currentOverType, setCurrentOverType] = useState(null);
    const pointerXRef = useRef(null);
    const dragStartXRef = useRef(null);

    const lockInTimerRef = useRef(null);
    const lastOverIdRef = useRef(null);

    useEffect(() => {
        const styleEl = document.createElement('style');
        styleEl.textContent = DRAG_STYLES;
        document.head.appendChild(styleEl);
        return () => styleEl.remove();
    }, []);

    useEffect(() => {
        const handlePointerMove = (e) => {
            pointerXRef.current = e.clientX;
        };
        window.addEventListener('pointermove', handlePointerMove, { passive: true });
        return () => window.removeEventListener('pointermove', handlePointerMove);
    }, []);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const measuringConfig = useMemo(() => ({
        droppable: { strategy: MeasuringStrategy.Always },
    }), []);

    const getDelayForCell = (cellId) => {
        if (!cellId) return LOCK_IN_DELAYS.default;
        if (cellId.startsWith('day-hour-')) return LOCK_IN_DELAYS['day-hour'];
        if (cellId.startsWith('week-hour-')) return LOCK_IN_DELAYS['week-hour'];
        if (cellId.startsWith('month-cell-')) return LOCK_IN_DELAYS['month-cell'];
        if (cellId.includes('all-day')) return LOCK_IN_DELAYS['all-day'];
        return LOCK_IN_DELAYS.default;
    };

    const handleDragStart = useCallback((event) => {
        const { active } = event;
        setActiveId(active.id);
        setLockedCellId(null);
        dragStartXRef.current = event?.activatorEvent?.clientX ?? null;

        const todoData = active.data?.current;
        if (todoData?.type === 'task') {
            setActiveTodo({
                id: todoData.id,
                title: todoData.title || 'New task',
                color: todoData.color || 'blue',
                taskId: todoData.id,
            });

            if (typeof window !== 'undefined') {
                window.__chronosDraggedTodoMeta = {
                    title: todoData.title || 'New task',
                    color: todoData.color || 'blue',
                    taskId: todoData.id,
                };
            }
            document.body.classList.add('task-dragging');
            document.body.classList.add('dnd-kit-dragging');
        }
    }, []);

    const handleDragOver = useCallback((event) => {
        const { over, active } = event;

        const isCalendarZone = over?.data?.current?.type === 'calendar-cell' ||
            over?.data?.current?.type === 'hour-cell' ||
            over?.data?.current?.type === 'all-day-cell';

        // Sidebar boundary + buffer to allow vertical reordering without calendar pill
        const sidebar = document.querySelector('.sidebar');
        const sidebarRight = sidebar?.getBoundingClientRect()?.right || 0;
        const CONVERT_BUFFER = 80;
        // Pointer position from pointer tracker, fallback to active rect (center)
        const activeRect = active?.rect?.current?.translated;
        const fallbackX = activeRect ? activeRect.left + (activeRect.width / 2) : 0;
        const pointerX = pointerXRef.current ?? fallbackX;
        const allowCalendar = isCalendarZone && pointerX >= (sidebarRight + CONVERT_BUFFER);

        setIsOverCalendar(allowCalendar);
        setCurrentOverType(over?.data?.current?.type || null);
        setCurrentOverId(allowCalendar ? over?.id : null);

        if (allowCalendar) {
            document.body.classList.add('calendar-drag-focus');

            const currentCell = over?.id;
            // Skip lock-in for wrapper droppables - they're just fallback targets
            const isWrapperDroppable = currentCell?.includes('-wrapper-');

            if (currentCell !== lastOverIdRef.current) {
                lastOverIdRef.current = currentCell;

                if (!isWrapperDroppable) {
                    setLockedCellId(null);
                    if (lockInTimerRef.current) clearTimeout(lockInTimerRef.current);

                    const delay = getDelayForCell(currentCell);
                    lockInTimerRef.current = setTimeout(() => {
                        setLockedCellId(currentCell);
                    }, delay);
                } else {
                    // Over wrapper - clear any existing lock
                    if (lockInTimerRef.current) clearTimeout(lockInTimerRef.current);
                    setLockedCellId(null);
                }
            }
        } else {
            document.body.classList.remove('calendar-drag-focus');
            lastOverIdRef.current = null;
            setLockedCellId(null);
            setCurrentOverType(null);
            if (lockInTimerRef.current) {
                clearTimeout(lockInTimerRef.current);
                lockInTimerRef.current = null;
            }
        }
    }, []);

    const handleDragEnd = useCallback(async (event) => {
        const { active, over } = event;
        const activeType = active?.data?.current?.type;
        const activeId = active?.id;
        const overId = over?.id;
        const overData = over?.data?.current;

        if (lockInTimerRef.current) {
            clearTimeout(lockInTimerRef.current);
            lockInTimerRef.current = null;
        }

        const taskId = active.data?.current?.id;
        const wasOverCalendar = overData?.type === 'calendar-cell' ||
            overData?.type === 'hour-cell' ||
            overData?.type === 'all-day-cell';

        // Check pointer X position relative to sidebar to determine if this was a reorder or calendar drop
        const sidebar = document.querySelector('.sidebar');
        const sidebarRight = sidebar?.getBoundingClientRect()?.right || 0;
        const CONVERT_BUFFER = 80;
        const activeRect = active?.rect?.current?.translated;
        const fallbackX = activeRect ? activeRect.left + (activeRect.width / 2) : 0;
        const pointerX = pointerXRef.current ?? fallbackX;
        const allowCalendarDrop = wasOverCalendar && pointerX >= (sidebarRight + CONVERT_BUFFER);

        setActiveId(null);
        setActiveTodo(null);
        setIsOverCalendar(false);
        setCurrentOverType(null);
        setCurrentOverId(null);
        setLockedCellId(null);
        lastOverIdRef.current = null;
        document.body.classList.remove('task-dragging');
        document.body.classList.remove('calendar-drag-focus');
        document.body.classList.remove('dnd-kit-dragging');

        if (typeof window !== 'undefined') {
            window.__chronosDraggedTodoMeta = null;
            // Clear animation cache so the new event can play the bounce animation
            if (taskId) {
                window.__chronosPlayedDrop?.delete(String(taskId));
            }
        }

        // Task -> calendar conversion (only if not in reorder zone)
        if (over && activeType === 'task' && taskId && allowCalendarDrop) {
            try {
                const targetDate = overData.date;
                const targetHour = overData.hour;
                const isAllDay = overData.isAllDay || overData.type === 'calendar-cell';

                let startDate, endDate;

                if (isAllDay) {
                    startDate = new Date(targetDate);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = addDays(startDate, 1);
                } else if (targetHour !== undefined) {
                    startDate = new Date(targetDate);
                    startDate.setHours(targetHour, 0, 0, 0);
                    endDate = new Date(startDate);
                    endDate.setHours(startDate.getHours() + 1);
                } else {
                    startDate = new Date(targetDate);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = addDays(startDate, 1);
                }

                if (convertTodoToEvent) {
                    await convertTodoToEvent(taskId, startDate, endDate, isAllDay);
                }
            } catch (error) {
                console.error('Failed to convert todo to event:', error);
            }
            return;
        }

        // Task reorder (including scheduled tasks)
        if (activeType === 'task' && overId && activeId !== overId) {
            const isValidTarget = tasks?.some?.(t => String(t.id) === String(overId));
            if (reorderTasks && isValidTarget) {
                await reorderTasks(activeId, overId);
            }
            return;
        }

        // Category reorder (tabs or grouped view)
        if ((activeType === 'category-tab' || activeType === 'category') && overId && activeId !== overId && reorderCategories) {
            const orderedIds = categories
                ?.filter(cat => cat.id && cat.id !== 'add-category')
                ?.map(cat => cat.id) || [];
            const oldIndex = orderedIds.findIndex(id => String(id) === String(activeId));
            const newIndex = orderedIds.findIndex(id => String(id) === String(overId));
            if (oldIndex >= 0 && newIndex >= 0) {
                const nextOrder = arrayMove(orderedIds, oldIndex, newIndex);
                await reorderCategories(nextOrder);
            }
        }
    }, [convertTodoToEvent, reorderCategories, reorderTasks, tasks, categories]);

    const handleDragCancel = useCallback(() => {
        if (lockInTimerRef.current) {
            clearTimeout(lockInTimerRef.current);
            lockInTimerRef.current = null;
        }

        setActiveId(null);
        setActiveTodo(null);
        setIsOverCalendar(false);
        setCurrentOverType(null);
        setCurrentOverId(null);
        setLockedCellId(null);
        lastOverIdRef.current = null;
        document.body.classList.remove('task-dragging');
        document.body.classList.remove('calendar-drag-focus');
        document.body.classList.remove('dnd-kit-dragging');

        if (typeof window !== 'undefined') {
            window.__chronosDraggedTodoMeta = null;
        }
    }, []);

    const contextValue = useMemo(() => ({
        activeId,
        activeTodo,
        isDragging: activeId !== null,
        isOverCalendar,
        currentOverId,
        lockedCellId,
        pointerX: pointerXRef.current,
    }), [activeId, activeTodo, isOverCalendar, currentOverId, lockedCellId]);

    const renderDragOverlay = () => {
        if (!activeTodo) return null;
        if (lockedCellId) return null;
        // Only show the floating pill once we are over the calendar (buffer handled in isOverCalendar)
        if (!isOverCalendar) return null;
        if (currentOverType === 'task') return null;

        const rawColor = typeof activeTodo.color === 'string'
            ? activeTodo.color.toLowerCase()
            : activeTodo.color;
        const colorName = normalizeToPaletteColor(rawColor || 'blue');
        const colors = getEventColors(colorName);

        return (
            <div
                className="pointer-events-none"
                style={{ transform: 'rotate(-2deg)' }}
            >
                <div
                    className="relative inline-flex items-center pl-2.5 pr-3.5 py-[11px] rounded-xl shadow-[0_10px_30px_rgba(15,23,42,0.28)] text-base font-medium max-w-[700px] leading-tight whitespace-nowrap overflow-hidden text-ellipsis"
                    style={{
                        backgroundColor: colors.background,
                        color: colors.text,
                    }}
                >
                    <span
                        className="w-1 h-5 rounded-full flex-shrink-0 mr-2"
                        style={{ backgroundColor: colors.border }}
                    />
                    <span className="max-w-[630px] truncate">
                        {activeTodo.title}
                    </span>
                </div>
            </div>
        );
    };

    const dropAnimation = null;

    return (
        <DndKitContext.Provider value={contextValue}>
            <DndContext
                sensors={sensors}
                collisionDetection={calendarPriorityCollision}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
                measuring={measuringConfig}
            >
                {children}
                <DragOverlay dropAnimation={dropAnimation} style={{ cursor: 'none' }}>
                    {activeId ? renderDragOverlay() : null}
                </DragOverlay>
            </DndContext>
        </DndKitContext.Provider>
    );
};

export default DndKitProvider;
