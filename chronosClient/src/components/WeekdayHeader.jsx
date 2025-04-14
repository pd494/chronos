import React from 'react';
import './WeekdayHeader.css';

const WeekdayHeader = () => {
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  return (
    <div className="calendar-weekday-header">
      {weekdays.map((day, index) => (
        <div key={index} className="weekday">{day}</div>
      ))}
    </div>
  );
};

export default WeekdayHeader;
