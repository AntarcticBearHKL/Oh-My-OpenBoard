import { isDoneColumnId, loadTasks, loadSettings } from './storage.js';
import { calculateDaysUntilDue } from './dateutils.js';

/**
 * Get all tasks that are due within the threshold or overdue.
 * Excludes tasks in the 'done' column.
 * @returns {Array} Array of task objects with additional `daysUntilDue` property
 */
export function getNotificationTasks() {
  const tasks = loadTasks();
  const settings = loadSettings();
  const thresholdDays = Number.isFinite(settings.notificationDays) ? settings.notificationDays : 3;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return tasks
    .filter((task) => {
      // Exclude tasks in the permanent Done column.
      if (isDoneColumnId(task.column)) return false;

      // Must have a due date
      const dueDate = (task.dueDate || '').toString().trim();
      if (!dueDate) return false;

      // Calculate days until due using shared utility
      const daysUntilDue = calculateDaysUntilDue(dueDate, today);
      if (daysUntilDue === null) return false;

      // Include if overdue or within threshold
      return daysUntilDue <= thresholdDays;
    })
    .map((task) => {
      const daysUntilDue = calculateDaysUntilDue(task.dueDate, today);

      return {
        ...task,
        daysUntilDue
      };
    })
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue); // Most urgent first
}

/**
 * Format the due date display text based on days until due.
 * @param {number} daysUntilDue
 * @param {string} dueDate - The original due date string
 * @param {string} locale - Locale for formatting
 * @returns {Object} { text: string, className: string }
 */
export function formatDueStatus(daysUntilDue, dueDate, locale) {
  const dueDateParsed = new Date(dueDate + 'T00:00:00');
  const formattedDate = dueDateParsed.toLocaleDateString(locale || undefined);

  if (daysUntilDue < 0) {
    const overdueDays = Math.abs(daysUntilDue);
    return {
      text: `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'} (${formattedDate})`,
      className: 'overdue'
    };
  } else if (daysUntilDue === 0) {
    return {
      text: `Due today (${formattedDate})`,
      className: 'overdue'
    };
  } else if (daysUntilDue === 1) {
    return {
      text: `Due tomorrow (${formattedDate})`,
      className: 'due-soon'
    };
  } else {
    return {
      text: `Due in ${daysUntilDue} days (${formattedDate})`,
      className: 'due-soon'
    };
  }
}
