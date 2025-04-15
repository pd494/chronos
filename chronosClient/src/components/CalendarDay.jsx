import React from 'react';
import './CalendarDay.css';

const CalendarDay = ({ day, monthLabel }) => {
  // Check if this day is today
  const today = new Date();
  const isToday = day.date === today.toISOString().split('T')[0];
  
  return (
    <div className={`day ${!day.isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`}>
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
