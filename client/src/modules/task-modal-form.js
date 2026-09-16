// Open/close the add/edit task modal and populate it from a task.

import { loadTasks } from './storage.js';
import { clearFieldError } from './validation.js';
import { isTaskLocked } from './tasks.js';
import {
  normalizeAcceptanceCriteria,
  normalizeComments,
  normalizeEstimate,
  normalizeTaskType
} from './agile.js';
import { $id } from './dom.js';
import { state } from './task-modal-state.js';
import { setTaskModalFullscreen, updateDescriptionLinks } from './task-modal-chrome.js';
import { renderActiveTaskRelationships } from './task-modal-relationships.js';
import { updateTaskSummary } from './task-modal-summary.js';
import { resetTaskLock, setTaskLocked } from './task-modal-status.js';
import { hideAnnotationsSection, renderAnnotationsList } from './task-modal-annotations.js';
import { clearAgileInputs, renderAgileFields, resetAgileState } from './task-modal-agile-fields.js';

export function showModal() {
  state.editingTaskId = null;
  state.selectedTaskRelationships = [];
  state.selectedTaskAnnotations = [];

  resetTaskLock();
  $id('task-summary')?.classList.add('hidden');
  $id('task-modal-key')?.classList.add('hidden');
  $id('task-claim-chip')?.classList.add('hidden');
  hideAnnotationsSection();

  setTaskModalFullscreen(false);
  $id('task-fullpage-btn')?.classList.add('hidden');

  const modal = $id('task-modal');
  const taskTitle = $id('task-title');
  const taskDescription = $id('task-description');
  const modalTitle = $id('task-modal-title');
  const submitBtn = $id('task-submit-btn');

  clearFieldError(taskTitle);

  modalTitle.textContent = 'Add New Task';
  submitBtn.textContent = 'Add Task';
  taskTitle.value = '';
  taskDescription.value = '';
  updateDescriptionLinks('');

  resetAgileState();
  clearAgileInputs();
  const taskType = $id('task-type');
  if (taskType) taskType.value = 'task';
  const taskEstimate = $id('task-estimate');
  if (taskEstimate) taskEstimate.value = '';

  const relSearch = $id('task-relationship-search');
  if (relSearch) relSearch.value = '';
  const relResults = $id('task-relationship-results');
  if (relResults) { relResults.hidden = true; relResults.innerHTML = ''; }

  renderActiveTaskRelationships(showEditModal);
  renderAgileFields();
  modal.classList.remove('hidden');
  taskTitle.focus();
}

export function showEditModal(taskId) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  state.editingTaskId = taskId;
  state.selectedTaskRelationships = Array.isArray(task.relationships) ? [...task.relationships] : [];
  state.selectedTaskAcceptanceCriteria = normalizeAcceptanceCriteria(task.acceptanceCriteria).map((entry) => ({ ...entry }));
  state.selectedTaskComments = normalizeComments(task.comments).map((entry) => ({ ...entry }));
  state.selectedTaskAnnotations = Array.isArray(task.annotations) ? task.annotations.map((entry) => ({ ...entry })) : [];

  setTaskModalFullscreen(false);
  $id('task-fullpage-btn')?.classList.remove('hidden');

  const modal = $id('task-modal');
  const taskTitle = $id('task-title');
  const taskDescription = $id('task-description');
  const modalTitle = $id('task-modal-title');
  const submitBtn = $id('task-submit-btn');

  clearFieldError(taskTitle);

  modalTitle.textContent = 'Edit Task';
  submitBtn.textContent = 'Save Changes';

  const legacyTitle = typeof task.text === 'string' ? task.text : '';
  taskTitle.value = (typeof task.title === 'string' && task.title.trim() !== '') ? task.title : legacyTitle;
  taskDescription.value = typeof task.description === 'string' ? task.description : '';
  updateDescriptionLinks(taskDescription.value);

  const taskType = $id('task-type');
  if (taskType) taskType.value = normalizeTaskType(task.type);
  const taskEstimate = $id('task-estimate');
  if (taskEstimate) {
    const estimate = normalizeEstimate(task.estimate);
    taskEstimate.value = estimate === null ? '' : String(estimate);
  }

  const relSearch = $id('task-relationship-search');
  if (relSearch) relSearch.value = '';
  const relResults = $id('task-relationship-results');
  if (relResults) { relResults.hidden = true; relResults.innerHTML = ''; }

  renderActiveTaskRelationships(showEditModal);
  clearAgileInputs();
  renderAgileFields();

  updateTaskSummary(task);
  $id('task-annotations-fieldset')?.classList.remove('hidden');
  renderAnnotationsList();
  const locked = isTaskLocked(task);
  setTaskLocked(locked, task);

  modal.classList.remove('hidden');
  if (locked) {
    $id('task-annotation-input')?.focus();
  } else {
    taskTitle.focus();
  }
}

export function hideModal() {
  $id('task-modal').classList.add('hidden');
  state.editingTaskId = null;
  state.selectedTaskRelationships = [];

  resetTaskLock();
  hideAnnotationsSection();

  const relResults = $id('task-relationship-results');
  if (relResults) { relResults.hidden = true; relResults.innerHTML = ''; }

  setTaskModalFullscreen(false);
  $id('task-fullpage-btn')?.classList.add('hidden');
}
