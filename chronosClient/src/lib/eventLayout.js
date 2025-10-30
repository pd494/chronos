// Utility to calculate column layout for time-based calendar events
// Ensures overlapping events share horizontal space without covering each other.

const MIN_EVENT_DURATION_MINUTES = 5;

const toMinutes = (date) => date.getHours() * 60 + date.getMinutes();

export const calculateTimeGridLayout = (events = []) => {
  if (!Array.isArray(events) || events.length === 0) {
    return [];
  }

  const processed = events.map((event, index) => {
    const start = event.start instanceof Date ? event.start : new Date(event.start);
    const end = event.end instanceof Date ? event.end : new Date(event.end);
    return {
      event,
      start,
      end,
      order: index,
    };
  }).sort((a, b) => {
    const diff = a.start.getTime() - b.start.getTime();
    if (diff !== 0) return diff;
    const endDiff = a.end.getTime() - b.end.getTime();
    if (endDiff !== 0) return endDiff;
    return (a.order || 0) - (b.order || 0);
  });

  const active = [];
  const columnAvailability = [];
  const layouts = [];

  processed.forEach((item) => {
    const startMinutes = toMinutes(item.start);
    const rawEndMinutes = toMinutes(item.end);
    const endMinutes = Math.max(startMinutes + MIN_EVENT_DURATION_MINUTES, rawEndMinutes);

    for (let i = active.length - 1; i >= 0; i -= 1) {
      if (active[i].endMinutes <= startMinutes) {
        columnAvailability[active[i].column] = true;
        active.splice(i, 1);
      }
    }

    let columnIndex = columnAvailability.findIndex(Boolean);
    if (columnIndex === -1) {
      columnIndex = columnAvailability.length;
      columnAvailability.push(false);
    } else {
      columnAvailability[columnIndex] = false;
    }

    const overlapCount = active.length + 1;
    active.forEach((activeItem) => {
      activeItem.maxOverlap = Math.max(activeItem.maxOverlap || 1, overlapCount);
    });

    const layoutEntry = {
      event: item.event,
      column: columnIndex,
      startMinutes,
      endMinutes,
      maxOverlap: Math.max(overlapCount, 1),
    };

    active.push(layoutEntry);
    layouts.push(layoutEntry);
  });

  return layouts.map((entry) => ({
    event: entry.event,
    column: entry.column,
    columns: entry.maxOverlap || 1,
  }));
};

