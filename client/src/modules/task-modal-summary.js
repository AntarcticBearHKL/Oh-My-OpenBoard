// Read-only claim summary for the task modal.

import { loadColumns } from './storage.js';
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
