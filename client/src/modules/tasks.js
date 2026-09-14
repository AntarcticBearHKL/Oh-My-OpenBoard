import { generateUUID } from './utils.js';
import { getActiveBoardId, getActiveBoardName, isDoneColumnId, loadColumns, loadLabels, loadSettings, loadTasks } from './storage.js';
import { applySwimLaneAssignment } from './swimlanes.js';
import { normalizePriority, normalizeRelationships, normalizeSubTasks } from './normalize.js';
import {
  isBlockedColumnId,
  nextTaskKey,
  normalizeAcceptanceCriteria,
  normalizeAttachments,
  normalizeComments,
  normalizeCustomFields,
  normalizeEstimate,
  normalizeTaskType
} from './agile.js';
import { scheduleDomainEvent } from './event-sourcing/emitter.js';

const RELATIONSHIP_INVERSE = { prerequisite: 'dependent', dependent: 'prerequisite', related: 'related' };

function normalizeAgileFields(fields = {}) {
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

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function reorderColumnTasks(tasks, columnId, pinnedTaskId = null) {
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

function normalizeDueDate(value) {
  const date = (value || '').toString().trim();
  // Expecting YYYY-MM-DD from <input type="date">; keep empty if unset.
  return date;
}

function getColumnName(columnId) {
  return loadColumns().find((column) => column.id === columnId)?.name || '';
}

function getLabelName(labels, labelId) {
  return labels.find((label) => label.id === labelId)?.name || '';
}

function getTaskTitle(tasks, taskId) {
  return tasks.find((task) => task.id === taskId)?.title || '';
}

function relationshipKey(relationship) {
  return `${relationship.targetTaskId}:${relationship.type}`;
}

/**
 * Apply bidirectional relationship sync on a tasks array.
 * Diffs oldRelationships vs newRelationships for a given taskId and mutates
 * the target tasks in-place to keep inverses consistent.
 */
function syncRelationshipInverses(tasks, taskId, oldRelationships, newRelationships, at) {
  const oldMap = new Map(oldRelationships.map((r) => [r.targetTaskId, r.type]));
  const newMap = new Map(newRelationships.map((r) => [r.targetTaskId, r.type]));
  const sourceTask = tasks.find((t) => t.id === taskId);

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

// Add a new task
export function addTask(title, description, priority, dueDate, columnName, labels = [], relationships = [], subTasks = [], extraFields = {}) {
  if (!title || title.trim() === '') return;

  const tasks = loadTasks();
  // Insert new tasks at the top of the column.
  // Normalize the column's existing task orders so they start at 2 (leaving 1 for the new task).
  const columnTasks = tasks
    .filter((t) => t.column === columnName)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const nextOrderById = new Map();
  columnTasks.forEach((task, index) => {
    nextOrderById.set(task.id, index + 2);
  });

  const updatedTasks = tasks.map((task) => {
    if (task.column !== columnName) return task;
    const nextOrder = nextOrderById.get(task.id);
    return typeof nextOrder === 'number' ? { ...task, order: nextOrder } : task;
  });

  const nowIso = new Date().toISOString();
  const normalizedRelationships = normalizeRelationships(relationships);
  const agileFields = normalizeAgileFields(extraFields);
  let newTask = {
    id: generateUUID(),
    key: nextTaskKey(getActiveBoardName(), tasks),
    title: title.trim(),
    description: (description || '').toString().trim(),
    priority: normalizePriority(priority),
    dueDate: normalizeDueDate(dueDate),
    column: columnName,
    order: 1,
    labels: [...labels],
    relationships: normalizedRelationships,
    subTasks: normalizeSubTasks(subTasks),
    type: agileFields.type,
    estimate: agileFields.estimate,
    assignee: agileFields.assignee,
    parentId: agileFields.parentId,
    acceptanceCriteria: agileFields.acceptanceCriteria,
    comments: agileFields.comments,
    attachments: agileFields.attachments,
    customFields: agileFields.customFields,
    blockedReason: '',
    blockedAt: null,
    creationDate: nowIso,
    changeDate: nowIso,
    columnHistory: [{ column: columnName, at: nowIso }],
    ...(isDoneColumnId(columnName) ? { doneDate: nowIso } : {})
  };

  updatedTasks.push(newTask);
  syncRelationshipInverses(updatedTasks, newTask.id, [], normalizedRelationships, nowIso);
  const activeBoardId = getActiveBoardId();
  scheduleDomainEvent({
    type: 'task.created',
    boardId: activeBoardId,
    entityId: newTask.id,
    payload: { task: newTask }
  });
  // Inserting at the top renumbers the column's existing tasks; emit that reorder
  // so the read model replays from events alone (ADR-0005).
  if (columnTasks.length > 0) {
    scheduleDomainEvent({
      type: 'task.moved',
      boardId: activeBoardId,
      entityId: newTask.id,
      payload: {
        from_column: columnName,
        to_column: columnName,
        order: updatedTasks
          .filter((task) => task.column === columnName)
          .map((task) => ({ id: task.id, column: task.column, order: task.order }))
      }
    });
  }
}

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

// Delete a task
export function deleteTask(taskId) {
  const boardId = getActiveBoardId();
  const liveTasks = loadTasks();
  const task = liveTasks.find(t => t.id === taskId);
  if (!task) return false;

  // task.deleted removes the task; the projection is the sole writer (ADR-0005).
  scheduleDomainEvent({
    type: 'task.deleted',
    boardId,
    entityId: task.id,
    payload: { column: task.column }
  });
  return true;
}

function getColumnContainer(node) {
  return node?.closest?.('[data-column]') || null;
}

function getLaneKey(node) {
  const direct = node?.dataset?.laneKey;
  if (typeof direct === 'string') return direct;
  return node?.closest?.('[data-lane-key]')?.dataset?.laneKey || '';
}

function buildOrderByColumnFromDom() {
  const boardContainer = document.getElementById('board-container');
  const isSwimlaneView = boardContainer?.dataset?.viewMode === 'swimlanes';
  const orderByColumn = new Map();

  if (!isSwimlaneView) {
    document.querySelectorAll('.task-column[data-column]').forEach((columnEl) => {
      const columnId = columnEl.dataset.column;
      if (!columnId) return;
      const order = [];
      columnEl.querySelectorAll('.task').forEach((el, idx) => {
        const taskId = el.dataset.taskId;
        if (!taskId) return;
        order.push({ id: taskId, order: idx + 1 });
      });
      orderByColumn.set(columnId, order);
    });
    return orderByColumn;
  }

  const flattenedByColumn = new Map();
  document.querySelectorAll('.swimlane-row').forEach((rowEl) => {
    rowEl.querySelectorAll('.swimlane-cell[data-column]').forEach((cellEl) => {
      const columnId = cellEl.dataset.column;
      if (!columnId) return;
      if (!flattenedByColumn.has(columnId)) {
        flattenedByColumn.set(columnId, []);
      }
      cellEl.querySelectorAll('.task').forEach((taskEl) => {
        const taskId = taskEl.dataset.taskId;
        if (taskId) flattenedByColumn.get(columnId).push(taskId);
      });
    });
  });

  flattenedByColumn.forEach((taskIds, columnId) => {
    orderByColumn.set(columnId, taskIds.map((id, index) => ({ id, order: index + 1 })));
  });

  return orderByColumn;
}

/**
 * Update task positions from a drag-drop event (optimized for performance).
 * Only updates the moved task and reorders tasks in affected columns.
 * @param {object} evt - Sortable event with oldIndex, newIndex, from, to, item
 * @param {object} [options] - { blockedReason } applied when the task enters Blocked
 * @returns {object} - { movedTaskId, fromColumn, toColumn, didChangeColumn, enteredBlocked, leftBlocked }
 */
export function updateTaskPositionsFromDrop(evt, options = {}) {
  const movedTaskId = evt.item?.dataset?.taskId;
  if (!movedTaskId) return null;

  const fromColumnEl = getColumnContainer(evt.from);
  const toColumnEl = getColumnContainer(evt.to);
  if (!fromColumnEl || !toColumnEl) return null;

  const fromColumn = fromColumnEl.dataset.column;
  const toColumn = toColumnEl.dataset.column;
  const didChangeColumn = fromColumn !== toColumn;
  const fromLaneKey = getLaneKey(evt.from);
  const toLaneKey = getLaneKey(evt.to);
  const didChangeLane = fromLaneKey !== toLaneKey;

  const tasks = loadTasks();
  const nowIso = new Date().toISOString();
  const settings = loadSettings();
  const labels = loadLabels();
  const isSwimlaneView = settings.swimLanesEnabled === true;
  const columns = loadColumns();
  const enteredBlocked = didChangeColumn
    && isBlockedColumnId(toColumn, columns)
    && !isBlockedColumnId(fromColumn, columns);
  const leftBlocked = didChangeColumn
    && isBlockedColumnId(fromColumn, columns)
    && !isBlockedColumnId(toColumn, columns);
  const nextBlockedReason = enteredBlocked && typeof options.blockedReason === 'string'
    ? options.blockedReason.trim()
    : '';

  // Find the moved task
  const movedTaskIndex = tasks.findIndex(t => t.id === movedTaskId);
  if (movedTaskIndex === -1) return null;

  const movedTask = tasks[movedTaskIndex];

  const affectedColumns = new Set([fromColumn, toColumn]);
  const orderByColumn = buildOrderByColumnFromDom();

  // Update tasks
  const updatedTasks = tasks.map(task => {
    // Update the moved task
    if (task.id === movedTaskId) {
      let nextTask = {
        ...task,
        column: toColumn
      };

      if (isSwimlaneView) {
        nextTask = applySwimLaneAssignment(nextTask, settings.swimLaneGroupBy, toLaneKey, labels, settings.swimLaneLabelGroup);
      }

      // Update order
      const toOrder = orderByColumn.get(toColumn);
      const orderEntry = toOrder?.find(o => o.id === movedTaskId);
      if (orderEntry) {
        nextTask.order = orderEntry.order;
      }

      // Only update history/dates if column changed
      if (didChangeColumn || (isSwimlaneView && didChangeLane)) {
        nextTask.changeDate = nowIso;

        if (!didChangeColumn) {
          return nextTask;
        }

        const history = Array.isArray(task.columnHistory) && task.columnHistory.length
          ? [...task.columnHistory]
          : [{ column: task.column, at: task.creationDate || task.changeDate || nowIso }];
        history.push({ column: toColumn, at: nowIso });
        nextTask.columnHistory = history;

        if (!isDoneColumnId(task.column) && isDoneColumnId(toColumn)) {
          nextTask.doneDate = nowIso;
        } else if (isDoneColumnId(task.column) && !isDoneColumnId(toColumn)) {
          delete nextTask.doneDate;
        }

        if (enteredBlocked) {
          nextTask.blockedReason = nextBlockedReason;
          nextTask.blockedAt = nextBlockedReason ? nowIso : null;
        } else if (leftBlocked) {
          nextTask.blockedReason = '';
          nextTask.blockedAt = null;
        }
      }

      return nextTask;
    }

    // Update order for other tasks in affected columns
    if (affectedColumns.has(task.column)) {
      const columnOrder = orderByColumn.get(task.column);
      const orderEntry = columnOrder?.find(o => o.id === task.id);
      if (orderEntry && orderEntry.order !== task.order) {
        return { ...task, order: orderEntry.order };
      }
    }

    return task;
  });

  const finalTasks = isDoneColumnId(toColumn)
    ? reorderColumnTasks(updatedTasks, toColumn, movedTaskId)
    : updatedTasks;

  const dropBoardId = getActiveBoardId();
  scheduleDomainEvent({
    type: 'task.moved',
    boardId: dropBoardId,
    entityId: movedTaskId,
    payload: {
      from_column: fromColumn,
      to_column: toColumn,
      order: finalTasks.map((task) => ({ id: task.id, column: task.column, order: task.order }))
    }
  });

  // A swimlane drag reassigns the moved task's lane-defining fields (labels,
  // priority, swimlane markers). task.moved only carries column/order, so emit
  // the field changes too — otherwise they would not replay from events (ADR-0005).
  if (isSwimlaneView) {
    const movedFinal = finalTasks.find((task) => task.id === movedTaskId);
    const fields = {};
    if (JSON.stringify(movedTask.labels || []) !== JSON.stringify(movedFinal.labels || [])) {
      fields.labels = movedFinal.labels;
    }
    if (normalizePriority(movedTask.priority) !== normalizePriority(movedFinal.priority)) {
      fields.priority = movedFinal.priority;
    }
    if ((movedTask.swimlaneLabelId || '') !== (movedFinal.swimlaneLabelId || '')) {
      fields.swimlaneLabelId = movedFinal.swimlaneLabelId || '';
    }
    if ((movedTask.swimlaneLabelGroup || '') !== (movedFinal.swimlaneLabelGroup || '')) {
      fields.swimlaneLabelGroup = movedFinal.swimlaneLabelGroup || '';
    }
    if (Object.keys(fields).length > 0) {
      scheduleDomainEvent({ type: 'task.updated', boardId: dropBoardId, entityId: movedTaskId, payload: { fields } });
    }
  }

  // task.moved only carries column/order, so blocked transitions ride a
  // task.updated event to replay from the log alone (ADR-0005).
  if (enteredBlocked || leftBlocked) {
    scheduleDomainEvent({
      type: 'task.updated',
      boardId: dropBoardId,
      entityId: movedTaskId,
      payload: {
        fields: {
          blockedReason: nextBlockedReason,
          blockedAt: nextBlockedReason ? nowIso : null,
          changeDate: nowIso
        }
      }
    });
  }

  return {
    movedTaskId,
    fromColumn,
    toColumn,
    fromLaneKey,
    toLaneKey,
    didChangeColumn,
    didChangeLane,
    enteredBlocked,
    leftBlocked,
    tasks: finalTasks
  };
}

export function setTaskBlockedReason(taskId, reason) {
  const tasks = loadTasks();
  if (!tasks.some((task) => task.id === taskId)) return false;

  const nowIso = new Date().toISOString();
  const nextReason = typeof reason === 'string' ? reason.trim() : '';
  scheduleDomainEvent({
    type: 'task.updated',
    boardId: getActiveBoardId(),
    entityId: taskId,
    payload: {
      fields: {
        blockedReason: nextReason,
        blockedAt: nextReason ? nowIso : null,
        changeDate: nowIso
      }
    }
  });
  return true;
}

export function moveTaskToTopInColumn(taskId, columnId, tasksCache) {
  if (!taskId || !columnId) return null;

  const tasks = tasksCache || loadTasks();
  const updatedTasks = reorderColumnTasks(tasks, columnId, taskId);
  const didUpdate = updatedTasks.some((task, index) => task !== tasks[index]);

  if (didUpdate) {
    scheduleDomainEvent({
      type: 'task.moved',
      boardId: getActiveBoardId(),
      entityId: taskId,
      payload: {
        from_column: columnId,
        to_column: columnId,
        order: updatedTasks.map((task) => ({ id: task.id, column: task.column, order: task.order }))
      }
    });
    return updatedTasks;
  }
  return tasks;
}

function emitTaskFields(taskId, fields) {
  if (!taskId || !fields) return false;
  const tasks = loadTasks();
  if (!tasks.some((task) => task.id === taskId)) return false;
  scheduleDomainEvent({
    type: 'task.updated',
    boardId: getActiveBoardId(),
    entityId: taskId,
    payload: { fields: { ...fields, changeDate: new Date().toISOString() } }
  });
  return true;
}

export function addAnnotation(taskId, text, author = 'human') {
  const task = loadTasks().find((entry) => entry.id === taskId);
  if (!task) return null;
  const annotation = { id: generateUUID(), text: String(text || ''), author, at: new Date().toISOString() };
  const annotations = [...(Array.isArray(task.annotations) ? task.annotations : []), annotation];
  return emitTaskFields(taskId, { annotations }) ? annotation : null;
}

export function removeAnnotation(taskId, annotationId) {
  const task = loadTasks().find((entry) => entry.id === taskId);
  if (!task) return false;
  const annotations = (Array.isArray(task.annotations) ? task.annotations : [])
    .filter((entry) => entry.id !== annotationId);
  return emitTaskFields(taskId, { annotations });
}

export function isTaskLocked(task) {
  const column = loadColumns().find((entry) => entry.id === task?.column);
  return String(column?.name || '').trim().toLowerCase() === 'in progress';
}
