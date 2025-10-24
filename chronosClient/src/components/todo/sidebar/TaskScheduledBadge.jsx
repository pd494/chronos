import { useMemo } from 'react';
import { format } from 'date-fns';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const parseDateValue = (value) => {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (DATE_ONLY_REGEX.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number);
      return new Date(year, month - 1, day, 12, 0, 0, 0);
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
};

const TaskScheduledBadge = ({ task }) => {
  const { label } = useMemo(() => {
    const raw =
      task?.scheduled_date ||
      task?.scheduledDate ||
      task?.scheduled_at ||
      task?.date;

    const date = parseDateValue(raw);
    if (!date) {
      return { label: null };
    }

    const isAllDay =
      task?.scheduled_is_all_day ??
      (typeof raw === 'string' && DATE_ONLY_REGEX.test(raw.trim()));

    const formatted = isAllDay
      ? format(date, 'MMM d')
      : format(date, 'MMM d, h:mm a');

    return { label: formatted };
  }, [
    task?.scheduled_date,
    task?.scheduledDate,
    task?.scheduled_at,
    task?.date,
    task?.scheduled_is_all_day
  ]);

  if (!label) return null;

  return (
    <div className="task-scheduled-tag" aria-label="Scheduled time">
      {label}
    </div>
  );
};

export default TaskScheduledBadge;
