import { isDoneColumnId } from './storage.js';

function isoDateOnly(value) {
  const s = (value || '').toString().trim();
  if (!s) return '';
  if (s.length >= 10) return s.slice(0, 10);
  return '';
}

export function formatIsoDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatMonthKey(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

export function formatMonthLabel(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), 1);
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date);
  } catch {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
}

export function eachDayInclusive(start, end) {
  const days = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (d <= last) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function weekdayIndexMonday0(date) {
  return (date.getDay() + 6) % 7;
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function extractTaskDueDateIso(task) {
  const raw = task?.dueDate ?? task?.['due-date'] ?? '';
  return isoDateOnly(raw);
}

export function extractTaskTitle(task) {
  const title = typeof task?.title === 'string' ? task.title.trim() : '';
  if (title) return title;
  const legacy = typeof task?.text === 'string' ? task.text.trim() : '';
  return legacy || 'Untitled task';
}

function isTaskDone(task) {
  if (!task) return false;
  if (isDoneColumnId(task?.column)) return true;
  const doneDate = (task?.doneDate ?? '').toString().trim();
  return doneDate.length > 0;
}

export function isTaskOverdue(task, todayIso) {
  const due = extractTaskDueDateIso(task);
  if (!due || due.length < 10) return false;
  if (!todayIso || todayIso.length < 10) return false;
  if (isTaskDone(task)) return false;
  return due < todayIso;
}

export function groupTasksByDueDateForMonth(tasks, monthDate, todayIso) {
  const monthKey = formatMonthKey(monthDate);
  const tasksByDate = new Map();
  const overdueCountByDate = new Map();

  for (const task of tasks || []) {
    const due = extractTaskDueDateIso(task);
    if (!due || due.length < 10) continue;
    if (!due.startsWith(monthKey)) continue;
    const list = tasksByDate.get(due) || [];
    list.push(task);

    tasksByDate.set(due, list);

    if (isTaskOverdue(task, todayIso)) {
      overdueCountByDate.set(due, (overdueCountByDate.get(due) || 0) + 1);
    }
  }

  return { tasksByDate, overdueCountByDate };
}
