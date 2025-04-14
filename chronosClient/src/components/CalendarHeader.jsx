import React from 'react';
import './CalendarHeader.css';

const CalendarHeader = ({ currentMonth, onPrevMonth, onNextMonth, onMonthSelect }) => {
  return (
    <div className="calendar-top-bar">
      <div className="calendar-title">
        <span className="month-name">{currentMonth}</span>
        <button className="month-dropdown-button" onClick={onMonthSelect}>▾</button>
      </div>
      <div className="calendar-controls">
        <button className="nav-button" onClick={onPrevMonth}>‹</button>
        <button className="nav-button" onClick={onNextMonth}>›</button>
      </div>
    </div>
  );
};

export default CalendarHeader;
