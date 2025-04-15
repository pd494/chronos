import React from 'react';
import CalendarDay from '../daily/CalendarDay';
import './CalendarWeek.css';

const CalendarWeek = ({ week, weekIndex, monthLabels }) => {
  return (
    <div className="week">
      {week.map((day, dayIndex) => {
        // Check if this day is the first of a month
        const monthLabel = monthLabels[weekIndex * 7 + dayIndex];
        return (
          <CalendarDay 
            key={`day-${weekIndex}-${dayIndex}`}
            day={day}
            monthLabel={monthLabel ? monthLabel.text : null}
          />
        );
      })}
    </div>
  );
};

export default CalendarWeek;
