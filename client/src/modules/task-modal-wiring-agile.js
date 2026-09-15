// Wire the task modal sub-task, acceptance, comment, attachment, custom-field and annotation inputs.

import { $id } from './dom.js';
import { generateUUID } from './utils.js';
import { state } from './task-modal-state.js';
import { renderSubTaskList } from './task-modal-subtasks.js';
import { renderAcceptanceCriteriaList } from './task-modal-status.js';
import {
  renderAttachmentsList,
  renderCommentsList,
  renderCustomFieldsList,
  saveCommentAuthor
} from './task-modal-agile-fields.js';
import { addAnnotationFromInput } from './task-modal-annotations.js';
import { syncSummaryFromForm } from './task-modal-summary.js';

export function initializeSubtaskHandlers() {
  const subtaskInput = $id('task-subtask-input');
  subtaskInput?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const val = subtaskInput.value.trim();
    if (!val) return;
    const nextOrder = state.selectedTaskSubTasks.length + 1;
    state.selectedTaskSubTasks.push({ id: generateUUID(), title: val, completed: false, order: nextOrder });
    subtaskInput.value = '';
    renderSubTaskList();
  });
}

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

export function initializeAttachmentHandlers() {
  function addAttachmentFromInputs() {
    const nameInput = $id('task-attachment-name');
    const urlInput = $id('task-attachment-url');
    const name = (nameInput?.value || '').trim();
    const url = (urlInput?.value || '').trim();
    if (!name || !url) return;

    let parsed = null;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
      urlInput?.classList.add('invalid');
      return;
    }

    urlInput?.classList.remove('invalid');
    state.selectedTaskAttachments.push({ id: generateUUID(), name, url });
    if (nameInput) nameInput.value = '';
    if (urlInput) urlInput.value = '';
    renderAttachmentsList();
  }

  $id('task-attachment-add-btn')?.addEventListener('click', addAttachmentFromInputs);
  $id('task-attachment-url')?.addEventListener('input', (e) => e.target.classList.remove('invalid'));
  $id('task-attachment-url')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addAttachmentFromInputs();
  });
  $id('task-attachment-name')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addAttachmentFromInputs();
  });
}

export function initializeCustomFieldHandlers() {
  function addCustomFieldFromInputs() {
    const keyInput = $id('task-custom-field-key');
    const valueInput = $id('task-custom-field-value');
    const key = (keyInput?.value || '').trim();
    if (!key) return;
    state.selectedTaskCustomFields[key] = valueInput?.value ?? '';
    if (keyInput) keyInput.value = '';
    if (valueInput) valueInput.value = '';
    renderCustomFieldsList();
  }

  $id('task-custom-field-add-btn')?.addEventListener('click', addCustomFieldFromInputs);
  $id('task-custom-field-value')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addCustomFieldFromInputs();
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

export function initializeSummarySyncHandlers() {
  ['task-type', 'task-estimate', 'task-priority', 'task-due-date', 'task-column'].forEach((id) => {
    const el = $id(id);
    el?.addEventListener('input', syncSummaryFromForm);
    el?.addEventListener('change', syncSummaryFromForm);
  });
}
