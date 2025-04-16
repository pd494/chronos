import React from 'react';
import { useDrop } from 'react-dnd';
import { useTaskContext } from '../../context/TaskContext';
import './CalendarDay.css';

const CalendarDay = ({ day, monthLabel }) => {
  // Check if this day is today
  const today = new Date();
  const isToday = day.date === today.toISOString().split('T')[0];
  
  const { addTaskToCalendar, canDropTaskOnDate, events } = useTaskContext();
  
  // Set up drop target
  const [{ isOver, canDrop, isDuplicate }, drop] = useDrop(() => ({
    accept: 'TASK',
    canDrop: (item) => canDropTaskOnDate(item.id, day.date),
    drop: (item) => {
      const success = addTaskToCalendar(item.id, day.date);
      return { moved: success };
    },
    collect: (monitor) => ({
      isOver: !!monitor.isOver(),
      canDrop: !!monitor.canDrop(),
      isDuplicate: monitor.getItem() ? !canDropTaskOnDate(monitor.getItem().id, day.date) : false
    }),
  }), [day.date, events]);
  
  return (
    <div 
      ref={drop}
      className={`day ${!day.isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${isOver && canDrop ? 'drag-over' : ''} ${isOver && isDuplicate ? 'duplicate-task' : ''} ${canDrop ? 'can-drop' : ''}`}>
      {/* Month label for the first day of month */}
      {monthLabel && (
        <div className="month-indicator">{monthLabel}</div>
      )}
      
      <div className={`day-number ${isToday ? 'today-circle' : ''}`}>{day.day}</div>
      <div className="events-container">
        {day.events && day.events.slice(0, 4).map(event => (
          <div 
            key={`${event.id}-${day.date}`} 
            className="event" 
            style={{ backgroundColor: event.color }}
          >
            <div className="event-title">{event.title}</div>
          </div>
        ))}
        {day.events && day.events.length > 4 && (
          <div className="more-events">{day.events.length - 4} more</div>
        )}
      </div>
    </div>
  );
};

export default CalendarDay;
