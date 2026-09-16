// Wire the task modal key-point and comment inputs.

import { $id } from './dom.js';
import { generateUUID } from './utils.js';
import { state } from './task-modal-state.js';
import { renderKeyPointsList } from './task-modal-status.js';
import { renderCommentsList, saveCommentAuthor } from './task-modal-agile-fields.js';

export function initializeKeyPointHandlers() {
  const keyPointInput = $id('task-key-point-input');

  function appendKeyPoint() {
    const text = (keyPointInput?.value || '').trim();
    if (!text) {
      keyPointInput?.focus();
      return;
    }
    state.selectedTaskKeyPoints.push({ id: generateUUID(), text, at: new Date().toISOString() });
    if (keyPointInput) keyPointInput.value = '';
    renderKeyPointsList();
  }

  keyPointInput?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    appendKeyPoint();
  });

  $id('task-key-point-add-btn')?.addEventListener('click', appendKeyPoint);
}

export function initializeCommentHandlers() {
  function addCommentFromInputs() {
    const authorInput = $id('task-comment-author');
    const textInput = $id('task-comment-input');
    const text = (textInput?.value || '').trim();
    if (!text) return;
    const author = (authorInput?.value || '').trim() || 'You';
    saveCommentAuthor(author);
    if (authorInput) authorInput.value = author;
    state.selectedTaskComments.push({ id: generateUUID(), author, text, at: new Date().toISOString() });
    if (textInput) textInput.value = '';
    renderCommentsList();
  }

  $id('task-comment-add-btn')?.addEventListener('click', addCommentFromInputs);
  $id('task-comment-input')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addCommentFromInputs();
  });
}
