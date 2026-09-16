// Comments thread for the task modal — the human's notes to the agent.

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

export function renderAgileFields() {
  renderAcceptanceCriteriaList();
  renderCommentsList();

  const commentAuthor = $id('task-comment-author');
  if (commentAuthor) commentAuthor.value = loadCommentAuthor();
}

export function resetAgileState() {
  state.selectedTaskAcceptanceCriteria = [];
  state.selectedTaskComments = [];
}

export function clearAgileInputs() {
  [
    'task-acceptance-input',
    'task-comment-input',
    'task-annotation-input'
  ].forEach((id) => {
    const el = $id(id);
    if (el) el.value = '';
  });
}
