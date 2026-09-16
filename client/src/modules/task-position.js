import { getActiveBoardId, isDoneColumnId, loadColumns, loadLabels, loadSettings, loadTasks } from './storage.js';
import { isBlockedColumnId } from './agile.js';
import { applySwimLaneAssignment } from './swimlanes.js';
import { reorderColumnTasks } from './task-helpers.js';
import { scheduleDomainEvent } from './event-sourcing/emitter.js';

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

  // A swimlane drag reassigns the moved task's lane markers. task.moved only
  // carries column/order, so emit the field changes too — otherwise they would
  // not replay from events (ADR-0005).
  if (isSwimlaneView) {
    const movedFinal = finalTasks.find((task) => task.id === movedTaskId);
    const fields = {};
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
