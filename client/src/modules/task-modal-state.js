// Task modal state — shared sink; imports nothing, imported by every task-modal module.

export const CREATE_LABEL_SENTINEL = '__create__';
export const COMMENT_AUTHOR_KEY = 'openagile:commentAuthor';

export const RELATIONSHIP_LABELS = { prerequisite: 'Prerequisite', dependent: 'Dependent', related: 'Related' };
export const RELATIONSHIP_DESCRIPTIONS = {
  prerequisite: 'Another task must be completed before this one can begin.',
  dependent: 'This task is needed by another task before that task can start.',
  related: 'A general connection between two tasks without implying order.',
};

export const state = {
  currentColumn: 'todo',
  editingTaskId: null,
  selectedTaskLabels: [],
  selectedTaskRelationships: [], // [{ type, targetTaskId }]
  selectedTaskSubTasks: [], // [{ id, title, completed, order }]
  selectedTaskAcceptanceCriteria: [], // [{ id, text, done }]
  selectedTaskComments: [], // [{ id, author, text, at }]
  selectedTaskAnnotations: [], // [{ id, text, author, at }]
  selectedTaskAttachments: [], // [{ id, name, url }]
  selectedTaskCustomFields: {}, // { [key]: value }
  subtaskSortable: null,
  returnToTaskModalAfterLabelsManager: false,
  selectCreatedLabelInTaskEditor: false,
  labelSearchHighlightIndex: 0,
  filteredLabelIds: [] // may contain '__create__' sentinel for the create-label button
};

// Expose state getters/setters for coordination with labels-modal
export function getSelectedTaskLabels() { return state.selectedTaskLabels; }
export function setSelectedTaskLabels(labels) { state.selectedTaskLabels = labels; }
export function getReturnToTaskModalFlag() { return state.returnToTaskModalAfterLabelsManager; }
export function setReturnToTaskModalFlag(val) { state.returnToTaskModalAfterLabelsManager = val; }
export function getSelectCreatedLabelFlag() { return state.selectCreatedLabelInTaskEditor; }
export function setSelectCreatedLabelFlag(val) { state.selectCreatedLabelInTaskEditor = val; }
