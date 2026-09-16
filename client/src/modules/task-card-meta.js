import { isDoneColumnId } from './storage.js';
import { formatElapsedDuration } from './dateutils.js';
import { h, cx } from './dom.js';
import { TASK_TYPES, normalizeEstimate, TASK_TYPE_LABELS } from './agile.js';
import { claimTiming } from './claim-timer.js';

const TYPE_ABBREVIATIONS = { story: 'S', bug: 'B', task: 'T', spike: 'SP' };

function assigneeInitials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function buildAcceptanceProgress(task) {
  const criteria = Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [];
  const total = criteria.length;
  if (total === 0) return null;
  const done = criteria.filter((entry) => entry?.done === true).length;
  const label = `Acceptance criteria: ${done}/${total} done`;
  return h('span', {
    class: cx('task-acceptance-progress', done === total && 'task-acceptance-progress--complete'),
    title: label,
    'aria-label': label
  },
    h('span', { 'data-lucide': 'check-square', 'aria-hidden': 'true' }),
    h('span', {}, `${done}/${total}`)
  );
}

export function buildTaskMeta(task, settings) {
  const meta = h('div', { class: 'task-meta' });

  const taskType = typeof task.type === 'string' ? task.type.trim().toLowerCase() : '';
  if (TASK_TYPES.includes(taskType)) {
    meta.appendChild(h('span', {
      class: cx('task-type', `task-type--${taskType}`),
      title: `Type: ${TASK_TYPE_LABELS[taskType]}`,
      'aria-label': `Type: ${TASK_TYPE_LABELS[taskType]}`
    }, TYPE_ABBREVIATIONS[taskType]));
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
  const claimedBy = typeof task.claimedBy === 'string' ? task.claimedBy.trim() : '';
  const claimant = claimedBy || assignee;
  const timing = claimTiming(task, new Date(), isDoneColumnId);

  if (timing) {
    const claimAttrs = {
      class: 'task-claim-timer',
      'data-claim-start': String(timing.startMs)
    };
    if (claimant) {
      const claimTitle = claimedBy ? `Claimed by: ${claimedBy}` : `Assignee: ${assignee}`;
      claimAttrs.title = claimTitle;
      claimAttrs['aria-label'] = claimTitle;
    }
    const claimChip = h('span', claimAttrs);
    if (!timing.live) claimChip.setAttribute('data-claim-end', String(timing.endMs));
    if (claimant) {
      claimChip.appendChild(h('span', { class: 'task-assignee' }, assigneeInitials(claimant)));
      claimChip.appendChild(h('span', { class: 'task-claim-name' }, claimant));
    }
    claimChip.appendChild(h('span', { class: 'task-claim-elapsed' }, formatElapsedDuration(timing.endMs - timing.startMs)));
    meta.appendChild(claimChip);
  } else if (assignee) {
    meta.appendChild(h('span', {
      class: 'task-assignee',
      title: `Assignee: ${assignee}`,
      'aria-label': `Assignee: ${assignee}`
    }, assigneeInitials(assignee)));
  }

  const acceptance = buildAcceptanceProgress(task);
  if (acceptance) meta.appendChild(acceptance);

  const comments = Array.isArray(task.comments) ? task.comments : [];
  if (comments.length > 0) {
    const label = `Notes: ${comments.length} comment${comments.length === 1 ? '' : 's'}`;
    meta.appendChild(h('span', {
      class: 'task-notes',
      title: label,
      'aria-label': label
    },
      h('span', { 'data-lucide': 'message-square', 'aria-hidden': 'true' }),
      h('span', {}, String(comments.length))
    ));
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

  return meta;
}
