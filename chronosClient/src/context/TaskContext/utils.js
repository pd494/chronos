import { ALL_CATEGORY, SPECIAL_CATEGORY_COLORS, ISO_DATE_ONLY_REGEX } from './constants';

export const pickCategoryFromList = (categoryName, categoriesList = []) => {
  if (!Array.isArray(categoriesList) || !categoriesList.length) {
    return null;
  }

  const usable = categoriesList.filter(cat => cat && cat.id !== ALL_CATEGORY.id);
  const inbox = usable.find(cat => cat.name === 'Inbox');
  const fallback = inbox || usable[0] || categoriesList.find(cat => cat?.id !== ALL_CATEGORY.id) || null;

  if (!categoryName || categoryName === 'All' || categoryName === 'Completed') {
    return fallback;
  }

  return usable.find(cat => cat.name === categoryName) || fallback;
};

export const isDateOnlyString = (value) =>
  typeof value === 'string' && ISO_DATE_ONLY_REGEX.test(value.trim());

export const toLocalDateOnlyString = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const enhanceTaskWithSchedule = (task) => {
  if (!task) return task;
  const rawDate =
    task.scheduled_date ||
    task.scheduledDate ||
    task.scheduled_at ||
    task.date;

  const derivedAllDay = rawDate ? isDateOnlyString(rawDate) : false;

  if (task.scheduled_is_all_day === derivedAllDay) {
    return task;
  }

  return { ...task, scheduled_is_all_day: derivedAllDay };
};

export const enhanceTasks = (tasks = []) => tasks.map(enhanceTaskWithSchedule);

export const getTaskActivityDate = (task) => {
  if (!task) return null;
  const raw =
    task.completed_at ||
    task.completedAt ||
    task.updated_at ||
    task.updatedAt ||
    task.modified_at ||
    task.modifiedAt ||
    task.created_at ||
    task.createdAt ||
    task.date ||
    task.scheduled_at ||
    task.scheduled_date;
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return d;
};

export const isTaskOlderThanDays = (task, days = 7) => {
  const when = getTaskActivityDate(task);
  if (!when) return false;
  const cutoff = Date.now() - (Number(days) || 0) * 24 * 60 * 60 * 1000;
  return when.getTime() < cutoff;
};

export const formatCategory = (category) => {
  if (!category?.name) return null;
  
  if (category.name === 'Uncategorized') return null;
  
  const icon =
    SPECIAL_CATEGORY_COLORS[category.name] ||
    category.color ||
    category.icon ||
    '⬤';

  return {
    id: category.id,
    name: category.name,
    icon,
    order: typeof category.order === 'number' ? category.order : Number.MAX_SAFE_INTEGER
  };
};

export const buildCategories = (rawCategories = []) => {
  const seenNames = new Set();
  const formatted = rawCategories
    .map(formatCategory)
    .filter(Boolean)
    .filter((category) => {
      if (seenNames.has(category.name)) return false;
      seenNames.add(category.name);
      return true;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return [ALL_CATEGORY, ...formatted];
};

// Disable local/session storage snapshots for tasks
export const readTasksSnapshotForUser = () => null;

