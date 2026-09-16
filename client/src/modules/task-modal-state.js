// Task modal state — shared sink; imports nothing, imported by every task-modal module.

export const COMMENT_AUTHOR_KEY = 'openagile:commentAuthor';

export const RELATIONSHIP_LABELS = { prerequisite: 'Prerequisite', dependent: 'Dependent', related: 'Related' };
export const RELATIONSHIP_DESCRIPTIONS = {
  prerequisite: 'Another task must be completed before this one can begin.',
  dependent: 'This task is needed by another task before that task can start.',
  related: 'A general connection between two tasks without implying order.',
};

export const state = {
  editingTaskId: null,
  selectedTaskRelationships: [], // [{ type, targetTaskId }]
  selectedTaskAcceptanceCriteria: [], // [{ id, text, done }]
  selectedTaskComments: [], // [{ id, author, text, at }]
  selectedTaskAnnotations: [] // [{ id, text, author, at }]
};
