// Calendar View Types
export const CALENDAR_VIEWS = {
  MONTH: 'month',
  WEEK: 'week',
  DAY: 'day',
  AGENDA: 'agenda'
};

// Event Colors
export const EVENT_COLORS = {
  BLUE: 'blue',
  ORANGE: 'orange',
  VIOLET: 'violet',
  ROSE: 'rose',
  EMERALD: 'emerald'
};

// Event Type Definition
/**
 * @typedef {Object} CalendarEvent
 * @property {string} id - Unique identifier for the event
 * @property {string} title - Event title
 * @property {string} [description] - Optional event description
 * @property {Date} start - Event start date and time
 * @property {Date} end - Event end date and time
 * @property {boolean} [allDay] - Whether the event is an all-day event
 * @property {string} [color] - Event color (one of EVENT_COLORS)
 * @property {string} [label] - Optional event label
 * @property {string} [location] - Optional event location
 */

// Time Constants
export const TIME_CONSTANTS = {
  HOURS_IN_DAY: 24,
  MINUTES_IN_HOUR: 60,
  HOUR_HEIGHT: 60, // pixels
  MIN_EVENT_HEIGHT: 30 // pixels
};

// Grid Constants
export const GRID_CONSTANTS = {
  CELL_HEIGHT: 48, // pixels
  HEADER_HEIGHT: 50, // pixels
  TIME_COLUMN_WIDTH: 60 // pixels
};
