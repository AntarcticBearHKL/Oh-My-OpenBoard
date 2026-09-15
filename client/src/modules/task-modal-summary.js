// Task summary chips (type/estimate/priority/due/column/claim) for the modal.

import { loadColumns } from './storage.js';
import { normalizePriority } from './normalize.js';
import { normalizeTaskType, normalizeEstimate, TASK_TYPE_LABELS } from './agile.js';
import { $id } from './dom.js';

function formatRelativeTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const minutes = Math.floor((Date.now() - parsed.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return parsed.toLocaleDateString();
}
function setSummaryType(value) {
  const el = $id('task-summary-type');
  if (!el) return;
  const type = normalizeTaskType(value);
  el.textContent = TASK_TYPE_LABELS[type];
  el.className = `task-type task-type--${type}`;
}
function setSummaryEstimate(value) {
  const el = $id('task-summary-estimate');
  if (!el) return;
  const estimate = normalizeEstimate(value);
  el.textContent = estimate === null ? '' : `${estimate} pt${estimate === 1 ? '' : 's'}`;
  el.classList.toggle('hidden', estimate === null);
}
function setSummaryPriority(value) {
  const el = $id('task-summary-priority');
  if (!el) return;
  const priority = normalizePriority(value);
  el.textContent = priority === 'none' ? 'No priority' : priority;
  el.className = `task-priority priority-${priority}`;
}
function setSummaryDue(value) {
  const el = $id('task-summary-due');
  if (!el) return;
  const raw = (value || '').toString().trim();
  if (!raw) {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }
  const parsed = new Date(raw.includes('T') ? raw : `${raw}T00:00:00`);
  el.textContent = Number.isNaN(parsed.getTime()) ? raw : `Due ${parsed.toLocaleDateString()}`;
  el.classList.remove('hidden');
}
function setSummaryColumn(columnId) {
  const el = $id('task-summary-column');
  if (!el) return;
  const name = loadColumns().find((column) => column.id === columnId)?.name || '';
  if (!name) {
    el.textContent = '';
    el.classList.add('hidden');
    el.removeAttribute('title');
    el.removeAttribute('aria-label');
    return;
  }
  el.textContent = /^in\s/i.test(name) ? name : `In ${name}`;
  el.title = `Column: ${name}`;
  el.setAttribute('aria-label', `Column: ${name}`);
  el.classList.remove('hidden');
}
export function updateTaskSummary(task) {
  const summary = $id('task-summary');
  if (!summary) return;
  summary.classList.remove('hidden');

  const keyEl = $id('task-modal-key');
  if (keyEl) {
    const key = typeof task.key === 'string' ? task.key.trim() : '';
    keyEl.textContent = key;
    keyEl.classList.toggle('hidden', !key);
  }

  setSummaryType(task.type);
  setSummaryEstimate(task.estimate);
  setSummaryPriority(task.priority);
  setSummaryDue(task.dueDate);
  setSummaryColumn(task.column);

  const claimChip = $id('task-claim-chip');
  const claimAgent = $id('task-claim-agent');
  const claimTime = $id('task-claim-time');
  const claimedBy = typeof task.claimedBy === 'string' ? task.claimedBy.trim() : '';
  if (claimChip && claimAgent && claimTime) {
    claimChip.classList.toggle('hidden', !claimedBy);
    claimAgent.textContent = claimedBy;
    claimTime.textContent = claimedBy ? formatRelativeTime(task.claimedAt) : '';
  }
}
export function syncSummaryFromForm() {
  if ($id('task-summary')?.classList.contains('hidden')) return;
  setSummaryType($id('task-type')?.value);
  setSummaryEstimate($id('task-estimate')?.value);
  setSummaryPriority($id('task-priority')?.value);
  setSummaryDue($id('task-due-date')?.value);
  setSummaryColumn($id('task-column')?.value);
}
