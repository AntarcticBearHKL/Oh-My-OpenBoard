// Read-only lock state and key-point list for the task modal.

import { $id, h } from './dom.js';
import { state } from './task-modal-state.js';
import { renderIcons } from './icons.js';

const DIGESTED_HINT = 'Digested by the agent — this note is read-only.';

function isDigested(point) {
  return typeof point?.digestedAt === 'string' && point.digestedAt.trim() !== '';
}

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

  const notesEditable = state.dialogAccess?.notes !== false;

  listEl.innerHTML = '';
  state.selectedTaskKeyPoints.forEach((point) => {
    const digested = isDigested(point);
    const editing = notesEditable && !digested && point.id === state.editingKeyPointId;

    if (editing) {
      const originalText = point.text;
      let settled = false;
      const input = h('input', {
        type: 'text',
        class: 'key-point-edit-input',
        value: point.text,
        maxlength: '200',
        'aria-label': `Edit note "${point.text}"`
      });

      const finishEdit = (revert) => {
        if (settled) return;
        settled = true;
        if (revert) {
          point.text = originalText;
        } else {
          const text = point.text.trim();
          if (text) point.text = text;
        }
        state.editingKeyPointId = null;
        renderKeyPointsList();
        listEl.querySelector(`[data-key-point-id="${point.id}"] .key-point-edit-btn`)?.focus();
      };

      input.addEventListener('input', () => {
        const text = input.value.trim();
        if (text) point.text = input.value;
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finishEdit(false);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finishEdit(true);
        }
      });
      input.addEventListener('blur', () => {
        const text = point.text.trim();
        if (text) point.text = text;
      });

      listEl.appendChild(h('li', {
        class: 'key-point-item key-point-item--editing',
        'data-key-point-id': point.id
      }, input));
      renderIcons();
      input.focus();
      input.select();
      return;
    }

    const children = [h('span', { class: 'key-point-text' }, point.text)];

    if (digested) {
      children.push(h('span', {
        class: 'key-point-digested',
        title: DIGESTED_HINT,
        'aria-label': DIGESTED_HINT
      },
        h('span', { 'data-lucide': 'bot', 'aria-hidden': 'true' }),
        'Digested'));
    } else if (notesEditable) {
      children.push(h('button', {
        type: 'button',
        class: 'key-point-edit-btn',
        title: 'Edit note',
        'aria-label': `Edit note "${point.text}"`,
        onClick: () => {
          if (isDigested(point)) return;
          state.editingKeyPointId = point.id;
          renderKeyPointsList();
        }
      }, h('span', { 'data-lucide': 'pencil', 'aria-hidden': 'true' })));

      children.push(h('button', {
        type: 'button',
        class: 'key-point-remove-btn',
        title: 'Remove note',
        'aria-label': `Remove note "${point.text}"`,
        onClick: () => {
          if (isDigested(point)) return;
          state.selectedTaskKeyPoints = state.selectedTaskKeyPoints.filter((entry) => entry.id !== point.id);
          if (state.editingKeyPointId === point.id) state.editingKeyPointId = null;
          renderKeyPointsList();
        }
      }, h('span', { 'data-lucide': 'x', 'aria-hidden': 'true' })));
    }

    listEl.appendChild(h('li', {
      class: point.id === state.lastAddedKeyPointId ? 'key-point-item key-point-item--new' : 'key-point-item',
      'data-key-point-id': point.id
    }, ...children));
  });

  state.lastAddedKeyPointId = null;
  renderIcons();
}
