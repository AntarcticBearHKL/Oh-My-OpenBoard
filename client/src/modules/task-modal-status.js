// Read-only lock state and acceptance-criteria list for the task modal.

import { $id, h, cx } from './dom.js';
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

  const annotations = $id('task-annotations-fieldset');
  if (annotations) {
    annotations.querySelectorAll('input, button').forEach((control) => {
      control.disabled = locked;
    });
  }

  const notice = $id('task-lock-notice');
  if (notice) {
    const claimedBy = task && typeof task.claimedBy === 'string' ? task.claimedBy.trim() : '';
    notice.textContent = locked
      ? (claimedBy
          ? `Subagent ${claimedBy} is working on this task — everything is read-only, including annotations.`
          : 'This task is read-only while a subagent works on it, including annotations.')
      : '';
    notice.classList.toggle('hidden', !locked);
  }
}
export function resetTaskLock() {
  setTaskLocked(false, null);
}
function updateAcceptanceProgress() {
  const legend = $id('task-acceptance-progress');
  if (!legend) return;
  const total = state.selectedTaskAcceptanceCriteria.length;
  if (total === 0) {
    legend.hidden = true;
    legend.textContent = '';
    return;
  }
  const done = state.selectedTaskAcceptanceCriteria.filter((entry) => entry.done).length;
  legend.textContent = `${done} / ${total}`;
  legend.hidden = false;
}
export function renderAcceptanceCriteriaList() {
  const listEl = $id('task-acceptance-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  state.selectedTaskAcceptanceCriteria.forEach((criterion) => {
    const checkbox = h('input', {
      type: 'checkbox',
      'aria-label': `Mark "${criterion.text}" done`
    });
    checkbox.checked = criterion.done === true;
    checkbox.addEventListener('change', () => {
      criterion.done = checkbox.checked;
      listEl.querySelector(`[data-criterion-id="${criterion.id}"]`)?.classList.toggle('acceptance-item--done', criterion.done);
      updateAcceptanceProgress();
    });

    const textInput = h('input', {
      type: 'text',
      class: 'acceptance-text-input',
      maxlength: '200',
      'aria-label': 'Acceptance criterion'
    });
    textInput.value = criterion.text;
    textInput.addEventListener('input', () => {
      criterion.text = textInput.value;
    });

    const removeBtn = h('button', {
      type: 'button',
      class: 'acceptance-remove-btn',
      title: 'Remove criterion',
      'aria-label': `Remove criterion "${criterion.text}"`,
      onClick: () => {
        state.selectedTaskAcceptanceCriteria = state.selectedTaskAcceptanceCriteria.filter((entry) => entry.id !== criterion.id);
        renderAcceptanceCriteriaList();
      }
    }, '×');

    listEl.appendChild(h('li', {
      class: cx('acceptance-item', criterion.done && 'acceptance-item--done'),
      'data-criterion-id': criterion.id
    }, checkbox, textInput, removeBtn));
  });

  updateAcceptanceProgress();
}
