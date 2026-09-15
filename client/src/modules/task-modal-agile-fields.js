// Comments, attachments, custom fields and parent selection for the task modal.

import { loadTasks } from './storage.js';
import { formatTimestamp } from './dateutils.js';
import { $id, h } from './dom.js';
import { state, COMMENT_AUTHOR_KEY } from './task-modal-state.js';
import { renderAcceptanceCriteriaList } from './task-modal-status.js';

function loadCommentAuthor() {
  try {
    const stored = localStorage.getItem(COMMENT_AUTHOR_KEY);
    return (stored || '').trim() || 'You';
  } catch {
    return 'You';
  }
}
export function saveCommentAuthor(author) {
  try {
    localStorage.setItem(COMMENT_AUTHOR_KEY, author);
  } catch {
    return;
  }
}
export function renderCommentsList() {
  const listEl = $id('task-comments-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  state.selectedTaskComments.forEach((comment) => {
    const removeBtn = h('button', {
      type: 'button',
      class: 'comment-remove-btn',
      title: 'Remove comment',
      'aria-label': `Remove comment by ${comment.author}`,
      onClick: () => {
        state.selectedTaskComments = state.selectedTaskComments.filter((entry) => entry.id !== comment.id);
        renderCommentsList();
      }
    }, '×');

    listEl.appendChild(h('li', { class: 'comment-item' },
      h('div', { class: 'comment-body' },
        h('div', { class: 'comment-meta' },
          h('span', { class: 'comment-author' }, comment.author),
          h('span', { class: 'comment-at' }, formatTimestamp(comment.at, comment.at || ''))
        ),
        h('div', { class: 'comment-text' }, comment.text)
      ),
      removeBtn
    ));
  });

  const countEl = $id('task-comments-count');
  if (countEl) {
    countEl.hidden = state.selectedTaskComments.length === 0;
    countEl.textContent = String(state.selectedTaskComments.length);
  }
}
export function renderAttachmentsList() {
  const listEl = $id('task-attachments-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  state.selectedTaskAttachments.forEach((attachment) => {
    const link = h('a', {
      href: attachment.url,
      target: '_blank',
      rel: 'noopener noreferrer',
      class: 'attachment-link',
      title: attachment.url
    }, attachment.name);
    if (link.protocol !== 'https:' && link.protocol !== 'http:') {
      link.removeAttribute('href');
    }

    const removeBtn = h('button', {
      type: 'button',
      class: 'attachment-remove-btn',
      title: 'Remove attachment',
      'aria-label': `Remove attachment ${attachment.name}`,
      onClick: () => {
        state.selectedTaskAttachments = state.selectedTaskAttachments.filter((entry) => entry.id !== attachment.id);
        renderAttachmentsList();
      }
    }, '×');

    listEl.appendChild(h('li', { class: 'attachment-item' }, link, removeBtn));
  });
}
export function renderCustomFieldsList() {
  const listEl = $id('task-custom-fields-list');
  if (!listEl) return;

  listEl.innerHTML = '';
  Object.entries(state.selectedTaskCustomFields).forEach(([key, value]) => {
    const keyInput = h('input', {
      type: 'text',
      class: 'custom-field-key-input',
      maxlength: '60',
      'aria-label': 'Custom field name'
    });
    keyInput.value = key;

    const valueInput = h('input', {
      type: 'text',
      class: 'custom-field-value-input',
      maxlength: '200',
      'aria-label': `Value for ${key}`
    });
    valueInput.value = value === null || value === undefined ? '' : String(value);

    keyInput.addEventListener('change', () => {
      const nextKey = keyInput.value.trim();
      if (!nextKey || nextKey === key) {
        keyInput.value = key;
        return;
      }
      const next = {};
      for (const [entryKey, entryValue] of Object.entries(state.selectedTaskCustomFields)) {
        next[entryKey === key ? nextKey : entryKey] = entryKey === key ? valueInput.value : entryValue;
      }
      state.selectedTaskCustomFields = next;
      renderCustomFieldsList();
    });
    valueInput.addEventListener('input', () => {
      state.selectedTaskCustomFields[key] = valueInput.value;
    });

    const removeBtn = h('button', {
      type: 'button',
      class: 'custom-field-remove-btn',
      title: 'Remove field',
      'aria-label': `Remove field ${key}`,
      onClick: () => {
        delete state.selectedTaskCustomFields[key];
        renderCustomFieldsList();
      }
    }, '×');

    listEl.appendChild(h('li', { class: 'custom-field-item' }, keyInput, valueInput, removeBtn));
  });
}
function renderParentTaskOptions(preferredId = null) {
  const select = $id('task-parent');
  if (!select) return;

  const previous = typeof preferredId === 'string' ? preferredId : '';
  select.innerHTML = '';
  select.appendChild(h('option', { value: '' }, 'None'));

  loadTasks().forEach((task) => {
    if (task.id === state.editingTaskId) return;
    const title = task.title || '(untitled)';
    const label = task.key ? `${task.key} · ${title}` : title;
    select.appendChild(h('option', { value: task.id }, label));
  });

  select.value = previous;
  if (select.value !== previous) select.value = '';
}
export function renderAgileFields(preferredParentId = null) {
  renderParentTaskOptions(preferredParentId);
  renderAcceptanceCriteriaList();
  renderCommentsList();
  renderAttachmentsList();
  renderCustomFieldsList();

  const commentAuthor = $id('task-comment-author');
  if (commentAuthor) commentAuthor.value = loadCommentAuthor();
}
export function resetAgileState() {
  state.selectedTaskAcceptanceCriteria = [];
  state.selectedTaskComments = [];
  state.selectedTaskAttachments = [];
  state.selectedTaskCustomFields = {};
}
export function clearAgileInputs() {
  [
    'task-acceptance-input',
    'task-comment-input',
    'task-annotation-input',
    'task-attachment-name',
    'task-attachment-url',
    'task-custom-field-key',
    'task-custom-field-value'
  ].forEach((id) => {
    const el = $id(id);
    if (el) el.value = '';
  });
}
