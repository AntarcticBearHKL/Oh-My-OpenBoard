import { getActiveBoardId, isDoneColumnId, loadColumns, loadLabels, loadTasks } from './storage.js';
import { normalizePriority, normalizeRelationships, normalizeSubTasks } from './normalize.js';
import {
  isBlockedColumnId,
  normalizeAcceptanceCriteria,
  normalizeAttachments,
  normalizeComments,
  normalizeCustomFields,
  normalizeEstimate,
  normalizeTaskType
} from './agile.js';
import { RELATIONSHIP_INVERSE, normalizeAgileFields, normalizeDueDate, relationshipKey, sameJson, syncRelationshipInverses } from './task-helpers.js';
import { scheduleDomainEvent } from './event-sourcing/emitter.js';

// Update an existing task
export function updateTask(taskId, title, description, priority, dueDate, columnName, labels = [], relationships = [], subTasks = [], extraFields = undefined) {
  if (!title || title.trim() === '') return;
  
  const tasks = loadTasks();
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex !== -1) {
    const prevColumn = tasks[taskIndex].column;
    const nextColumn = columnName;
    const nowIso = new Date().toISOString();

    // Ensure we have a baseline history entry before appending transitions.
    if (!Array.isArray(tasks[taskIndex].columnHistory) || tasks[taskIndex].columnHistory.length === 0) {
      const seededAt = tasks[taskIndex].creationDate || tasks[taskIndex].changeDate || nowIso;
      const seededColumn = typeof prevColumn === 'string' ? prevColumn : nextColumn;
      tasks[taskIndex].columnHistory = [{ column: seededColumn, at: seededAt }];
    }

    const oldRelationships = Array.isArray(tasks[taskIndex].relationships) ? tasks[taskIndex].relationships : [];
    const newRelationships = normalizeRelationships(relationships);

    const previousTask = { ...tasks[taskIndex] };
    const nextTitle = title.trim();
    const nextDescription = (description || '').toString().trim();
    const nextPriority = normalizePriority(priority);
    const nextDueDate = normalizeDueDate(dueDate);
    const nextSubTasks = normalizeSubTasks(subTasks);
    const agileFields = extraFields === undefined ? null : normalizeAgileFields(extraFields);
    if (agileFields && agileFields.parentId === taskId) agileFields.parentId = null;
    const changedFields = {};

    tasks[taskIndex].title = nextTitle;
    tasks[taskIndex].description = nextDescription;
    tasks[taskIndex].priority = nextPriority;
    tasks[taskIndex].dueDate = nextDueDate;
    tasks[taskIndex].column = nextColumn;
    tasks[taskIndex].labels = [...labels];
    tasks[taskIndex].relationships = newRelationships;
    tasks[taskIndex].subTasks = nextSubTasks;
    if (agileFields) {
      tasks[taskIndex].type = agileFields.type;
      tasks[taskIndex].estimate = agileFields.estimate;
      tasks[taskIndex].assignee = agileFields.assignee;
      tasks[taskIndex].parentId = agileFields.parentId;
      tasks[taskIndex].acceptanceCriteria = agileFields.acceptanceCriteria;
      tasks[taskIndex].comments = agileFields.comments;
      tasks[taskIndex].attachments = agileFields.attachments;
      tasks[taskIndex].customFields = agileFields.customFields;
    }

    syncRelationshipInverses(tasks, taskId, oldRelationships, newRelationships, nowIso);

    if (prevColumn !== nextColumn) {
      tasks[taskIndex].columnHistory.push({ column: nextColumn, at: nowIso });
    }

    if (previousTask.title !== nextTitle) {
      changedFields.title = nextTitle;
    }
    if ((previousTask.description || '') !== nextDescription) {
      changedFields.description = nextDescription;
    }
    if (normalizePriority(previousTask.priority) !== nextPriority) {
      changedFields.priority = nextPriority;
    }
    if (normalizeDueDate(previousTask.dueDate) !== nextDueDate) {
      changedFields.dueDate = nextDueDate;
    }
    if (agileFields) {
      if (normalizeTaskType(previousTask.type) !== agileFields.type) {
        changedFields.type = agileFields.type;
      }
      if (normalizeEstimate(previousTask.estimate) !== agileFields.estimate) {
        changedFields.estimate = agileFields.estimate;
      }
      if ((previousTask.assignee ?? '').toString().trim() !== agileFields.assignee) {
        changedFields.assignee = agileFields.assignee;
      }
      const previousParentId = (previousTask.parentId ?? '').toString().trim() || null;
      if (previousParentId !== agileFields.parentId) {
        changedFields.parentId = agileFields.parentId;
      }
      if (!sameJson(normalizeAcceptanceCriteria(previousTask.acceptanceCriteria), agileFields.acceptanceCriteria)) {
        changedFields.acceptanceCriteria = agileFields.acceptanceCriteria;
      }
      if (!sameJson(normalizeComments(previousTask.comments), agileFields.comments)) {
        changedFields.comments = agileFields.comments;
      }
      if (!sameJson(normalizeAttachments(previousTask.attachments), agileFields.attachments)) {
        changedFields.attachments = agileFields.attachments;
      }
      if (!sameJson(normalizeCustomFields(previousTask.customFields), agileFields.customFields)) {
        changedFields.customFields = agileFields.customFields;
      }
    }
    const previousLabels = Array.isArray(previousTask.labels) ? previousTask.labels : [];
    const nextLabels = Array.isArray(labels) ? labels : [];
    const labelRecords = loadLabels();
    const previousRelationshipKeys = new Set(oldRelationships.map(relationshipKey));
    const nextRelationshipKeys = new Set(newRelationships.map(relationshipKey));

    if (!isDoneColumnId(prevColumn) && isDoneColumnId(nextColumn)) {
      tasks[taskIndex].doneDate = nowIso;
    } else if (isDoneColumnId(prevColumn) && !isDoneColumnId(nextColumn)) {
      delete tasks[taskIndex].doneDate;
    }

    const columns = loadColumns();
    if (isBlockedColumnId(prevColumn, columns) && !isBlockedColumnId(nextColumn, columns)) {
      tasks[taskIndex].blockedReason = '';
      tasks[taskIndex].blockedAt = null;
      changedFields.blockedReason = '';
      changedFields.blockedAt = null;
    }

    tasks[taskIndex].changeDate = nowIso;
    const boardId = getActiveBoardId();
    if (Object.keys(changedFields).length > 0) {
      scheduleDomainEvent({
        type: 'task.updated',
        boardId,
        entityId: taskId,
        payload: { fields: changedFields }
      });
    }
    if (prevColumn !== nextColumn) {
      scheduleDomainEvent({
        type: 'task.moved',
        boardId,
        entityId: taskId,
        payload: {
          from_column: prevColumn,
          to_column: nextColumn,
          order: tasks.map((task) => ({ id: task.id, column: task.column, order: task.order }))
        }
      });
    }
    nextLabels
      .filter((labelId) => !previousLabels.includes(labelId))
      .forEach((labelId) => {
        scheduleDomainEvent({ type: 'label.added_to_task', boardId, entityId: taskId, payload: { label_id: labelId } });
      });
    previousLabels
      .filter((labelId) => !nextLabels.includes(labelId))
      .forEach((labelId) => {
        scheduleDomainEvent({ type: 'label.removed_from_task', boardId, entityId: taskId, payload: { label_id: labelId } });
      });
    newRelationships
      .filter((relationship) => !previousRelationshipKeys.has(relationshipKey(relationship)))
      .forEach((relationship) => {
        scheduleDomainEvent({ type: 'relationship.added', boardId, entityId: taskId, payload: { relationship } });
        // Emit the inverse on the target task so the bidirectional link replays
        // from events alone (the reducer is the sole read-model writer — ADR-0005).
        const inverseType = RELATIONSHIP_INVERSE[relationship.type];
        if (inverseType) {
          scheduleDomainEvent({
            type: 'relationship.added',
            boardId,
            entityId: relationship.targetTaskId,
            payload: { relationship: { type: inverseType, targetTaskId: taskId } }
          });
        }
      });
    oldRelationships
      .filter((relationship) => !nextRelationshipKeys.has(relationshipKey(relationship)))
      .forEach((relationship) => {
        scheduleDomainEvent({
          type: 'relationship.removed',
          boardId,
          entityId: taskId,
          payload: { targetTaskId: relationship.targetTaskId, relationship_type: relationship.type }
        });
        const inverseType = RELATIONSHIP_INVERSE[relationship.type];
        if (inverseType) {
          scheduleDomainEvent({
            type: 'relationship.removed',
            boardId,
            entityId: relationship.targetTaskId,
            payload: { targetTaskId: taskId, relationship_type: inverseType }
          });
        }
      });
    const previousSubTasks = normalizeSubTasks(previousTask.subTasks);
    const previousSubTasksById = new Map(previousSubTasks.map((subtask) => [subtask.id, subtask]));
    const nextSubTasksById = new Map(nextSubTasks.map((subtask) => [subtask.id, subtask]));
    nextSubTasks.forEach((subtask) => {
      const previous = previousSubTasksById.get(subtask.id);
      if (!previous) {
        scheduleDomainEvent({ type: 'subtask.added', boardId, entityId: taskId, payload: { subtask } });
        return;
      }
      if (previous.completed !== subtask.completed) {
        scheduleDomainEvent({ type: 'subtask.toggled', boardId, entityId: taskId, payload: { subtask_id: subtask.id, completed: subtask.completed === true } });
      }
      if ((previous.title || '') !== (subtask.title || '')) {
        scheduleDomainEvent({ type: 'subtask.text_changed', boardId, entityId: taskId, payload: { subtask_id: subtask.id, title: subtask.title || '' } });
      }
    });
    previousSubTasks
      .filter((subtask) => !nextSubTasksById.has(subtask.id))
      .forEach((subtask) => {
        scheduleDomainEvent({ type: 'subtask.removed', boardId, entityId: taskId, payload: { subtask_id: subtask.id } });
      });
  }
}
