// Task row DOM construction — extracted from render.js

import { isDoneColumnId, loadLabels } from './storage.js';
import { deleteTask } from './tasks.js';
import { showEditModal } from './modals.js';
import { confirmDialog } from './dialog.js';
import { calculateDaysUntilDue, formatCountdown, getCountdownClassName } from './dateutils.js';
import { labelTextColor } from './utils.js';
import { h, cx } from './dom.js';
import { STALE_AFTER_DAYS, TASK_TYPES, isTaskStale, normalizeEstimate, taskAgeDays } from './agile.js';

const TYPE_LABELS = { story: 'Story', bug: 'Bug', task: 'Task', spike: 'Spike' };
const TYPE_ABBREVIATIONS = { story: 'S', bug: 'B', task: 'T', spike: 'SP' };

function assigneeInitials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function formatDisplayDate(value, locale) {
  const raw = (value || '').toString().trim();
  if (!raw) return '';

  const dateForParse = raw.includes('T') ? raw : `${raw}T00:00:00`;
  const parsed = new Date(dateForParse);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString(locale || undefined);
}

export { formatDisplayDate };

// Safely convert URLs in text to <a> elements. Returns a DocumentFragment.
// Only http/https URLs are matched; DOM APIs prevent XSS.
export function linkifyText(text) {
  const URL_RE = /https?:\/\/[^\s<>"']+/g;
  const frag = document.createDocumentFragment();
  let last = 0;
  let match;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > last) {
      frag.appendChild(document.createTextNode(text.slice(last, match.index)));
    }
    const a = document.createElement('a');
    a.href = match[0];
    // Guard: only allow http/https even after DOM parsing
    if (a.protocol !== 'https:' && a.protocol !== 'http:') {
      frag.appendChild(document.createTextNode(match[0]));
    } else {
      a.textContent = match[0];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.addEventListener('click', (e) => e.stopPropagation());
      frag.appendChild(a);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}

function buildSubtaskProgress(task) {
  const completed = task.subTasks.filter((s) => s.completed).length;
  const total = task.subTasks.length;
  const pct = Math.round((completed / total) * 100);
  const isComplete = completed === total;

  const row = h('span', { class: 'task-subtasks-row' });

  const size = 14;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.classList.add('subtasks-donut');
  svg.setAttribute('aria-hidden', 'true');

  const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  bgCircle.setAttribute('cx', size / 2);
  bgCircle.setAttribute('cy', size / 2);
  bgCircle.setAttribute('r', radius);
  bgCircle.classList.add('subtasks-donut-bg');

  const fgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  fgCircle.setAttribute('cx', size / 2);
  fgCircle.setAttribute('cy', size / 2);
  fgCircle.setAttribute('r', radius);
  fgCircle.classList.add('subtasks-donut-fill');
  if (isComplete) fgCircle.classList.add('subtasks-donut-complete');
  fgCircle.style.strokeDasharray = circumference;
  fgCircle.style.strokeDashoffset = offset;

  svg.appendChild(bgCircle);
  svg.appendChild(fgCircle);

  row.appendChild(svg);
  row.appendChild(h('span', {}, `${completed}/${total} Done`));
  return row;
}

export function createTaskElement(task, settings, labelsMap = null, today = null) {
  // Track pointer position to distinguish clicks from drag gestures.
  let pointerDownPos = null;
  const li = h('li', {
    class: 'task',
    draggable: 'true',
    'data-task-id': task.id,
    role: 'listitem',
    'aria-label': `Task: ${task.title || task.text || 'Untitled'}`
  });
  li.addEventListener('pointerdown', (e) => {
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });
  li.addEventListener('click', (e) => {
    if (e.target.closest('.delete-task-btn')) return;
    if (pointerDownPos) {
      const dx = Math.abs(e.clientX - pointerDownPos.x);
      const dy = Math.abs(e.clientY - pointerDownPos.y);
      if (dx > 5 || dy > 5) return;
    }
    showEditModal(task.id);
  });

  const legacyTitle = typeof task.text === 'string' ? task.text : '';
  const titleEl = h('span', { class: 'task-title' },
    (typeof task.title === 'string' && task.title.trim() !== '') ? task.title : legacyTitle
  );

  const meta = h('div', { class: 'task-meta' });

  const taskType = typeof task.type === 'string' ? task.type.trim().toLowerCase() : '';
  if (TASK_TYPES.includes(taskType)) {
    meta.appendChild(h('span', {
      class: cx('task-type', `task-type--${taskType}`),
      title: `Type: ${TYPE_LABELS[taskType]}`,
      'aria-label': `Type: ${TYPE_LABELS[taskType]}`
    }, TYPE_ABBREVIATIONS[taskType]));
  }

  if (settings?.showPriority !== false) {
    const rawPriority = typeof task.priority === 'string' ? task.priority.toLowerCase().trim() : '';
    const priority = (['urgent', 'high', 'medium', 'low', 'none'].includes(rawPriority)) ? rawPriority : 'none';
    meta.appendChild(h('span', {
      class: cx('task-priority', `priority-${priority}`),
      'aria-label': `Priority: ${priority}`
    }, priority));
  }

  if (settings?.showDueDate !== false) {
    const dueDateRaw = typeof task.dueDate === 'string' ? task.dueDate.trim() : '';
    if (dueDateRaw) {
      const formattedDate = formatDisplayDate(dueDateRaw, settings?.locale);
      const daysUntilDue = calculateDaysUntilDue(dueDateRaw, today);
      let dueDateText = `Due ${formattedDate}`;
      let dueDateExtraClass = 'countdown-none';

      if (daysUntilDue !== null && !isDoneColumnId(task.column)) {
        const urgentThreshold = settings?.countdownUrgentThreshold ?? 3;
        const warningThreshold = settings?.countdownWarningThreshold ?? 10;
        dueDateExtraClass = getCountdownClassName(daysUntilDue, urgentThreshold, warningThreshold);
        dueDateText = `Due ${formattedDate} (${formatCountdown(daysUntilDue)})`;
      }

      meta.appendChild(h('span', { class: cx('task-date', dueDateExtraClass) }, dueDateText));
    }
  }

  const estimate = normalizeEstimate(task.estimate);
  if (estimate !== null) {
    meta.appendChild(h('span', {
      class: 'task-estimate',
      title: `Estimate: ${estimate} point${estimate === 1 ? '' : 's'}`,
      'aria-label': `Estimate: ${estimate}`
    }, String(estimate)));
  }

  const assignee = typeof task.assignee === 'string' ? task.assignee.trim() : '';
  if (assignee) {
    meta.appendChild(h('span', {
      class: 'task-assignee',
      title: `Assignee: ${assignee}`,
      'aria-label': `Assignee: ${assignee}`
    }, assigneeInitials(assignee)));
  }

  const labels = labelsMap || new Map(loadLabels().map(l => [l.id, l]));
  const labelIds = Array.isArray(task.labels) ? task.labels : [];
  if (labelIds.length > 0) {
    const labelsContainer = h('div', {
      class: 'task-labels',
      role: 'list',
      'aria-label': 'Task labels'
    });

    labelIds.forEach(labelId => {
      const label = labels instanceof Map ? labels.get(labelId) : labels.find(l => l.id === labelId);
      if (label) {
        labelsContainer.appendChild(h('span', {
          class: 'task-label',
          role: 'listitem',
          style: { backgroundColor: label.color, color: labelTextColor(label.color) }
        }, label.name));
      }
    });

    if (labelsContainer.childElementCount > 0) meta.appendChild(labelsContainer);
  }

  if (task.subTasks && task.subTasks.length > 0) {
    meta.appendChild(buildSubtaskProgress(task));
  }

  if (task.relationships && task.relationships.length > 0) {
    meta.appendChild(h('span', {
      class: 'task-relationships-row',
      title: `${task.relationships.length} relationship${task.relationships.length === 1 ? '' : 's'}`
    },
      h('span', { 'data-lucide': 'git-branch', 'aria-hidden': 'true' }),
      h('span', {}, String(task.relationships.length))
    ));
  }

  const blockedReason = typeof task.blockedReason === 'string' ? task.blockedReason.trim() : '';
  if (blockedReason) {
    meta.appendChild(h('span', {
      class: 'task-blocked',
      title: `Blocked: ${blockedReason}`,
      'aria-label': `Blocked: ${blockedReason}`
    }, h('span', { 'data-lucide': 'ban', 'aria-hidden': 'true' })));
  }

  const now = today || new Date();
  const staleTask = !isDoneColumnId(task.column) && isTaskStale(task, now);
  if (staleTask) li.classList.add('task-stale');

  const ageDays = taskAgeDays(task, now);
  if (settings?.showAge !== false && ageDays !== null) {
    const ageTitle = staleTask
      ? `Age: ${ageDays} day${ageDays === 1 ? '' : 's'} — no updates in over ${STALE_AFTER_DAYS} days`
      : `Age: ${ageDays} day${ageDays === 1 ? '' : 's'}`;
    meta.appendChild(h('span', {
      class: cx('task-age', staleTask && 'task-age--stale'),
      title: ageTitle,
      'aria-label': ageTitle
    }, `${ageDays}d`));
  }

  if (staleTask) {
    meta.appendChild(h('span', {
      class: 'task-stale-dot',
      title: `No updates in over ${STALE_AFTER_DAYS} days`,
      'aria-label': 'Stale task'
    }));
  }

  const actions = h('div', { class: 'task-actions' });

  const deleteBtn = document.createElement('button');
  deleteBtn.classList.add('delete-task-btn');
  deleteBtn.setAttribute('aria-label', 'Delete task');
  deleteBtn.type = 'button';
  const deleteIcon = document.createElement('span');
  deleteIcon.dataset.lucide = 'trash-2';
  deleteIcon.setAttribute('aria-hidden', 'true');
  deleteBtn.appendChild(deleteIcon);
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: 'Delete task?',
      message: 'This will permanently delete the task. There is no undo.',
      confirmText: 'Delete'
    });
    if (!ok) return;
    deleteTask(task.id);
  });

  actions.appendChild(deleteBtn);

  const taskKey = typeof task.key === 'string' ? task.key.trim() : '';

  li.appendChild(h('div', { class: 'task-row' },
    taskKey ? h('span', { class: 'task-key', title: `Key: ${taskKey}` }, taskKey) : null,
    titleEl,
    meta,
    actions
  ));
  return li;
}
