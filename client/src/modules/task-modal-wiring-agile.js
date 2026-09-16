// Wire the task modal acceptance, comment and annotation inputs.

import { $id } from './dom.js';
import { generateUUID } from './utils.js';
import { state } from './task-modal-state.js';
import { renderAcceptanceCriteriaList } from './task-modal-status.js';
import { renderCommentsList, saveCommentAuthor } from './task-modal-agile-fields.js';
import { addAnnotationFromInput } from './task-modal-annotations.js';

export function initializeAcceptanceHandlers() {
  const acceptanceInput = $id('task-acceptance-input');
  acceptanceInput?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const text = acceptanceInput.value.trim();
    if (!text) return;
    state.selectedTaskAcceptanceCriteria.push({ id: generateUUID(), text, done: false });
    acceptanceInput.value = '';
    renderAcceptanceCriteriaList();
  });

  $id('task-acceptance-add-btn')?.addEventListener('click', () => {
    const text = (acceptanceInput?.value || '').trim();
    if (!text) {
      acceptanceInput?.focus();
      return;
    }
    state.selectedTaskAcceptanceCriteria.push({ id: generateUUID(), text, done: false });
    acceptanceInput.value = '';
    renderAcceptanceCriteriaList();
  });
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

export function initializeAnnotationHandlers() {
  $id('task-annotation-add-btn')?.addEventListener('click', addAnnotationFromInput);
  $id('task-annotation-input')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addAnnotationFromInput();
  });
}
