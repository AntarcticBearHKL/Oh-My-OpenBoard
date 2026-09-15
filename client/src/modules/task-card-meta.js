import { isDoneColumnId, loadLabels } from './storage.js';
import { PRIORITIES } from './constants.js';
import { calculateDaysUntilDue, formatCountdown, getCountdownClassName, formatDisplayDate } from './dateutils.js';
import { labelTextColor } from './utils.js';
import { h, cx } from './dom.js';
import { STALE_AFTER_DAYS, TASK_TYPES, isTaskStale, normalizeEstimate, taskAgeDays, TASK_TYPE_LABELS } from './agile.js';

const TYPE_ABBREVIATIONS = { story: 'S', bug: 'B', task: 'T', spike: 'SP' };

function assigneeInitials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
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

export function buildTaskMeta(task, settings, labelsMap = null, today = null) {
  const meta = h('div', { class: 'task-meta' });

  const taskType = typeof task.type === 'string' ? task.type.trim().toLowerCase() : '';
  if (TASK_TYPES.includes(taskType)) {
    meta.appendChild(h('span', {
      class: cx('task-type', `task-type--${taskType}`),
      title: `Type: ${TASK_TYPE_LABELS[taskType]}`,
      'aria-label': `Type: ${TASK_TYPE_LABELS[taskType]}`
    }, TYPE_ABBREVIATIONS[taskType]));
  }

  if (settings?.showPriority !== false) {
    const rawPriority = typeof task.priority === 'string' ? task.priority.toLowerCase().trim() : '';
    const priority = (PRIORITIES.includes(rawPriority)) ? rawPriority : 'none';
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

  return { meta, staleTask };
}
