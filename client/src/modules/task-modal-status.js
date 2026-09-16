// Read-only lock state and key-point list for the task modal.

import { $id, h } from './dom.js';
import { state } from './task-modal-state.js';

export function setTaskLocked(locked, task) {
  const form = $id('task-form');
  if (form) {
    form.classList.toggle('task-form--locked', locked);
    form.querySelectorAll('input, select, textarea, button').forEach((control) => {
      if (control.id === 'cancel-task-btn') return;
      control.disabled = locked;
    });
  }

  const notice = $id('task-lock-notice');
  if (notice) {
    const claimedBy = task && typeof task.claimedBy === 'string' ? task.claimedBy.trim() : '';
    notice.textContent = locked
      ? (claimedBy
          ? `Subagent ${claimedBy} is working on this task — everything is read-only.`
          : 'This task is read-only while a subagent works on it.')
      : '';
    notice.classList.toggle('hidden', !locked);
  }
}
export function resetTaskLock() {
  setTaskLocked(false, null);
}
export function renderKeyPointsList() {
  const listEl = $id('task-key-points-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  state.selectedTaskKeyPoints.forEach((point) => {
    const removeBtn = h('button', {
      type: 'button',
      class: 'key-point-remove-btn',
      title: 'Remove note',
      'aria-label': `Remove note "${point.text}"`,
      onClick: () => {
        state.selectedTaskKeyPoints = state.selectedTaskKeyPoints.filter((entry) => entry.id !== point.id);
        renderKeyPointsList();
      }
    }, '×');

    listEl.appendChild(h('li', {
      class: 'key-point-item',
      'data-key-point-id': point.id
    }, h('span', { class: 'key-point-text' }, point.text), removeBtn));
  });
}
