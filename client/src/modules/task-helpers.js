import {
  normalizeAcceptanceCriteria,
  normalizeAttachments,
  normalizeComments,
  normalizeCustomFields,
  normalizeEstimate,
  normalizeTaskType
} from './agile.js';

export const RELATIONSHIP_INVERSE = { prerequisite: 'dependent', dependent: 'prerequisite', related: 'related' };

export function normalizeAgileFields(fields = {}) {
  const source = fields && typeof fields === 'object' ? fields : {};
  const parentId = (source.parentId ?? '').toString().trim();
  return {
    type: normalizeTaskType(source.type),
    estimate: normalizeEstimate(source.estimate),
    assignee: (source.assignee ?? '').toString().trim(),
    parentId: parentId || null,
    acceptanceCriteria: normalizeAcceptanceCriteria(source.acceptanceCriteria),
    comments: normalizeComments(source.comments),
    attachments: normalizeAttachments(source.attachments),
    customFields: normalizeCustomFields(source.customFields)
  };
}

export function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function reorderColumnTasks(tasks, columnId, pinnedTaskId = null) {
  const columnTasks = tasks
    .filter((task) => task.column === columnId)
    .slice()
    .sort((a, b) => {
      if (a.id === pinnedTaskId) return -1;
      if (b.id === pinnedTaskId) return 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });

  const orderById = new Map();
  columnTasks.forEach((task, index) => {
    orderById.set(task.id, index + 1);
  });

  return tasks.map((task) => {
    if (task.column !== columnId) return task;
    const nextOrder = orderById.get(task.id);
    return typeof nextOrder === 'number' && nextOrder !== task.order
      ? { ...task, order: nextOrder }
      : task;
  });
}

export function normalizeDueDate(value) {
  const date = (value || '').toString().trim();
  // Expecting YYYY-MM-DD from <input type="date">; keep empty if unset.
  return date;
}

export function relationshipKey(relationship) {
  return `${relationship.targetTaskId}:${relationship.type}`;
}

/**
 * Apply bidirectional relationship sync on a tasks array.
 * Diffs oldRelationships vs newRelationships for a given taskId and mutates
 * the target tasks in-place to keep inverses consistent.
 */
export function syncRelationshipInverses(tasks, taskId, oldRelationships, newRelationships, at) {
  const oldMap = new Map(oldRelationships.map((r) => [r.targetTaskId, r.type]));
  const newMap = new Map(newRelationships.map((r) => [r.targetTaskId, r.type]));

  for (const [targetId, newType] of newMap) {
    const target = tasks.find((t) => t.id === targetId);
    if (!target) continue;
    if (!Array.isArray(target.relationships)) target.relationships = [];
    // Remove any existing entry pointing back at taskId, then add the correct inverse.
    const inverseType = RELATIONSHIP_INVERSE[newType];
    const targetIndex = tasks.findIndex((t) => t.id === targetId);
    let nextTarget = {
      ...target,
      relationships: [
        ...target.relationships.filter((r) => r.targetTaskId !== taskId),
        { type: inverseType, targetTaskId: taskId }
      ]
    };

    tasks[targetIndex] = nextTarget;
  }

  for (const [targetId, oldType] of oldMap) {
    if (newMap.has(targetId)) continue; // handled above
    const target = tasks.find((t) => t.id === targetId);
    if (!target || !Array.isArray(target.relationships)) continue;
    const inverseType = RELATIONSHIP_INVERSE[oldType];
    const targetIndex = tasks.findIndex((t) => t.id === targetId);
    tasks[targetIndex] = {
      ...target,
      relationships: target.relationships.filter((r) => r.targetTaskId !== taskId)
    };
  }
}
