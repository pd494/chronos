// Google Calendar-style overlapping event layout
// Events visually overlap with slight horizontal offset, not side-by-side lanes

const MIN_EVENT_DURATION_MINUTES = 5;

const toMinutes = (date) => date.getHours() * 60 + date.getMinutes();

const eventsOverlap = (a, b) => a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;

export const calculateTimeGridLayout = (events = []) => {
  if (!Array.isArray(events) || events.length === 0) {
    return [];
  }

  const processed = events.map((event, index) => {
    const start = event.start instanceof Date ? event.start : new Date(event.start);
    const end = event.end instanceof Date ? event.end : new Date(event.end);
    const startMinutes = toMinutes(start);
    const rawEndMinutes = toMinutes(end);
    const endMinutes = Math.max(startMinutes + MIN_EVENT_DURATION_MINUTES, rawEndMinutes);
    return {
      event,
      start,
      end,
      startMinutes,
      endMinutes,
      order: index,
      duration: endMinutes - startMinutes,
    };
  });

  // Sort by start time, then by duration (longer first), then by original order
  processed.sort((a, b) => {
    if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes;
    if (a.duration !== b.duration) return b.duration - a.duration;
    return a.order - b.order;
  });

  // For each event, find all events that overlap with it and started before it
  // This determines the horizontal offset (column) for Google Calendar style
  processed.forEach((item, idx) => {
    // Find all earlier events that overlap with this one
    const overlappingPredecessors = [];
    for (let i = 0; i < idx; i++) {
      if (eventsOverlap(processed[i], item)) {
        overlappingPredecessors.push(processed[i]);
      }
    }

    if (overlappingPredecessors.length === 0) {
      item.column = 0;
    } else {
      // Find the first available column slot
      const usedColumns = new Set(overlappingPredecessors.map(p => p.column));
      let col = 0;
      while (usedColumns.has(col)) {
        col++;
      }
      item.column = col;
    }
  });

  // Build overlap groups to determine total columns per group
  const parent = processed.map((_, idx) => idx);
  const find = (i) => {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  };
  const union = (a, b) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pb] = pa;
  };

  for (let i = 0; i < processed.length; i++) {
    for (let j = i + 1; j < processed.length; j++) {
      if (eventsOverlap(processed[i], processed[j])) {
        union(i, j);
      }
    }
  }

  // Calculate max columns per group
  const groupMaxCol = new Map();
  processed.forEach((item, idx) => {
    const gid = find(idx);
    const prev = groupMaxCol.get(gid) || 0;
    groupMaxCol.set(gid, Math.max(prev, item.column + 1));
    item.groupId = gid;
  });

  // Assign columns count to each event
  processed.forEach((item) => {
    item.columns = groupMaxCol.get(item.groupId) || 1;
  });

  // Compute stackIndex for z-index (later start = higher z-index)
  processed.forEach((item, idx) => {
    item.stackIndex = idx;
    item.stackCount = processed.length;
  });

  return processed.map((entry) => ({
    event: entry.event,
    column: entry.column,
    columns: entry.columns || 1,
    stackIndex: entry.stackIndex || 0,
    stackCount: entry.stackCount || 1,
  }));
};
