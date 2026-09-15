// Open/close the add/edit task modal and populate it from a task.

import { loadLabels, loadColumns, loadSettings, loadTasks } from './storage.js';
import { clearFieldError } from './validation.js';
import { isTaskLocked } from './tasks.js';
import {
  normalizeAcceptanceCriteria,
  normalizeAttachments,
  normalizeComments,
  normalizeCustomFields,
  normalizeEstimate,
  normalizeTaskType
} from './agile.js';
import { $id } from './dom.js';
import { state } from './task-modal-state.js';
import { setTaskModalFullscreen, updateDescriptionLinks } from './task-modal-chrome.js';
import { updateTaskLabelsSelection } from './task-modal-labels.js';
import { renderActiveTaskRelationships } from './task-modal-relationships.js';
import { renderSubTaskList } from './task-modal-subtasks.js';
import { updateTaskSummary } from './task-modal-summary.js';
import { resetTaskLock, setTaskLocked } from './task-modal-status.js';
import { hideAnnotationsSection, renderAnnotationsList } from './task-modal-annotations.js';
import { clearAgileInputs, renderAgileFields, resetAgileState } from './task-modal-agile-fields.js';

export function showModal(columnName, swimlaneContext) {
  state.currentColumn = columnName || loadColumns()[0]?.id || 'todo';
  state.editingTaskId = null;
  state.selectedTaskLabels = [];
  state.selectedTaskRelationships = [];
  state.selectedTaskSubTasks = [];
  state.returnToTaskModalAfterLabelsManager = false;
  state.selectCreatedLabelInTaskEditor = false;

  resetTaskLock();
  $id('task-summary')?.classList.add('hidden');
  $id('task-modal-key')?.classList.add('hidden');
  $id('task-claim-chip')?.classList.add('hidden');
  hideAnnotationsSection();

  setTaskModalFullscreen(false);
  $id('task-fullpage-btn')?.classList.add('hidden');

  const modal = $id('task-modal');
  const columnSelect = $id('task-column');
  const taskTitle = $id('task-title');
  const taskDescription = $id('task-description');
  const taskPriority = $id('task-priority');
  const taskDueDate = $id('task-due-date');
  const modalTitle = $id('task-modal-title');
  const submitBtn = $id('task-submit-btn');

  clearFieldError(taskTitle);

  modalTitle.textContent = 'Add New Task';
  submitBtn.textContent = 'Add Task';
  columnSelect.value = state.currentColumn;
  taskTitle.value = '';
  taskDescription.value = '';
  updateDescriptionLinks('');
  if (taskPriority) {
    const settings = loadSettings();
    taskPriority.value = settings.defaultPriority || 'none';
  }
  if (taskDueDate) taskDueDate.value = '';

  resetAgileState();
  clearAgileInputs();
  const taskType = $id('task-type');
  if (taskType) taskType.value = 'task';
  const taskEstimate = $id('task-estimate');
  if (taskEstimate) taskEstimate.value = '';
  const taskAssignee = $id('task-assignee');
  if (taskAssignee) taskAssignee.value = '';

  if (swimlaneContext) {
    const { groupBy, laneKey } = swimlaneContext;
    if (laneKey && laneKey !== '__no-group__') {
      if (groupBy === 'priority' && taskPriority) {
        taskPriority.value = laneKey;
      } else if (groupBy === 'label' || groupBy === 'label-group') {
        const labels = loadLabels();
        const label = labels.find((l) => l.id === laneKey);
        if (label) {
          state.selectedTaskLabels = [label.id];
        }
      }
    }
  }

  const labelSearch = $id('task-label-search');
  if (labelSearch) labelSearch.value = '';

  const relSearch = $id('task-relationship-search');
  if (relSearch) relSearch.value = '';
  const relResults = $id('task-relationship-results');
  if (relResults) { relResults.hidden = true; relResults.innerHTML = ''; }

  updateTaskLabelsSelection();
  renderActiveTaskRelationships(showEditModal);
  renderSubTaskList();
  renderAgileFields(null);
  modal.classList.remove('hidden');
  taskTitle.focus();
}
export function showEditModal(taskId) {
  const tasks = loadTasks();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  state.editingTaskId = taskId;
  state.selectedTaskLabels = task.labels || [];
  state.selectedTaskRelationships = Array.isArray(task.relationships) ? [...task.relationships] : [];
  state.selectedTaskSubTasks = Array.isArray(task.subTasks) ? task.subTasks.map((s) => ({ ...s })) : [];
  state.selectedTaskAcceptanceCriteria = normalizeAcceptanceCriteria(task.acceptanceCriteria).map((entry) => ({ ...entry }));
  state.selectedTaskComments = normalizeComments(task.comments).map((entry) => ({ ...entry }));
  state.selectedTaskAttachments = normalizeAttachments(task.attachments).map((entry) => ({ ...entry }));
  state.selectedTaskCustomFields = normalizeCustomFields(task.customFields);
  state.selectedTaskAnnotations = Array.isArray(task.annotations) ? task.annotations.map((entry) => ({ ...entry })) : [];
  state.returnToTaskModalAfterLabelsManager = false;
  state.selectCreatedLabelInTaskEditor = false;

  setTaskModalFullscreen(false);
  $id('task-fullpage-btn')?.classList.remove('hidden');

  const modal = $id('task-modal');
  const columnSelect = $id('task-column');
  const taskTitle = $id('task-title');
  const taskDescription = $id('task-description');
  const taskPriority = $id('task-priority');
  const taskDueDate = $id('task-due-date');
  const modalTitle = $id('task-modal-title');
  const submitBtn = $id('task-submit-btn');

  clearFieldError(taskTitle);

  modalTitle.textContent = 'Edit Task';
  submitBtn.textContent = 'Save Changes';
  columnSelect.value = task.column;

  const legacyTitle = typeof task.text === 'string' ? task.text : '';
  taskTitle.value = (typeof task.title === 'string' && task.title.trim() !== '') ? task.title : legacyTitle;
  taskDescription.value = typeof task.description === 'string' ? task.description : '';
  updateDescriptionLinks(taskDescription.value);
  if (taskPriority) taskPriority.value = typeof task.priority === 'string' ? task.priority : 'none';

  const rawDue = typeof task.dueDate === 'string' ? task.dueDate : '';
  const dueForInput = rawDue.includes('T') ? rawDue.slice(0, 10) : rawDue;
  if (taskDueDate) taskDueDate.value = dueForInput;

  const taskType = $id('task-type');
  if (taskType) taskType.value = normalizeTaskType(task.type);
  const taskEstimate = $id('task-estimate');
  if (taskEstimate) {
    const estimate = normalizeEstimate(task.estimate);
    taskEstimate.value = estimate === null ? '' : String(estimate);
  }
  const taskAssignee = $id('task-assignee');
  if (taskAssignee) taskAssignee.value = typeof task.assignee === 'string' ? task.assignee : '';

  const labelSearch = $id('task-label-search');
  if (labelSearch) labelSearch.value = '';

  const relSearch = $id('task-relationship-search');
  if (relSearch) relSearch.value = '';
  const relResults = $id('task-relationship-results');
  if (relResults) { relResults.hidden = true; relResults.innerHTML = ''; }

  updateTaskLabelsSelection();
  renderActiveTaskRelationships(showEditModal);
  renderSubTaskList();
  clearAgileInputs();
  renderAgileFields(typeof task.parentId === 'string' ? task.parentId : null);

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
  state.selectedTaskSubTasks = [];
  if (state.subtaskSortable) { state.subtaskSortable.destroy(); state.subtaskSortable = null; }
  state.returnToTaskModalAfterLabelsManager = false;

  resetTaskLock();
  hideAnnotationsSection();

  const relResults = $id('task-relationship-results');
  if (relResults) { relResults.hidden = true; relResults.innerHTML = ''; }

  setTaskModalFullscreen(false);
  $id('task-fullpage-btn')?.classList.add('hidden');
}
