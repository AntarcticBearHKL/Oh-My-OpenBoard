import { test, expect, beforeEach } from 'vitest';
import { resetLocalStorage } from './setup.js';
import { createBoard, getActiveBoardId, loadDeletedTasksForBoard, loadTasks, saveColumns, saveLabels, saveSettings, saveTasks } from '../../src/modules/storage.js';
import { addTask, updateTask, deleteTask, moveTaskToTopInColumn, setTaskBlockedReason, updateTaskPositionsFromDrop } from '../../src/modules/tasks.js';

const BLOCKED_COLUMN_ID = '00000000-0000-4000-8000-000000000032';

beforeEach(() => {
  resetLocalStorage();
  createBoard('Test');
  saveTasks([]);
});

// ── addTask ─────────────────────────────────────────────────────────

test('addTask creates task with order 1 (top of column)', () => {
  addTask('First', 'desc', 'medium', '', 'todo', []);
  const tasks = loadTasks();
  expect(tasks.length).toBe(1);
  expect(tasks[0].title).toBe('First');
  expect(tasks[0].order).toBe(1);
  expect(tasks[0].column).toBe('todo');
  expect(tasks[0].priority).toBe('medium');
});

test('addTask bumps existing task orders in same column', () => {
  addTask('First', '', 'none', '', 'todo', []);
  addTask('Second', '', 'none', '', 'todo', []);
  const tasks = loadTasks();
  const second = tasks.find(t => t.title === 'Second');
  const first = tasks.find(t => t.title === 'First');
  expect(second.order).toBe(1);
  expect(first.order > 1).toBe(true);
});

test('addTask does nothing for empty title', () => {
  addTask('', 'desc', 'none', '', 'todo', []);
  expect(loadTasks().length).toBe(0);
});

test('addTask sets creationDate, changeDate, and columnHistory', () => {
  addTask('Task', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];
  expect(task.creationDate).toBeTruthy();
  expect(task.changeDate).toBeTruthy();
  expect(Array.isArray(task.columnHistory)).toBe(true);
  expect(task.columnHistory.length).toBe(1);
  expect(task.columnHistory[0].column).toBe('todo');
});

test('addTask sets doneDate when added to Done column', () => {
  addTask('Done Task', '', 'none', '', 'done', []);
  const task = loadTasks()[0];
  expect(task.doneDate).toBeTruthy();
});

test('addTask does not set doneDate for non-Done column', () => {
  addTask('Active Task', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];
  expect(task.doneDate).toBeUndefined();
});

test('addTask preserves labels', () => {
  addTask('Labeled', '', 'none', '', 'todo', ['label-1', 'label-2']);
  const task = loadTasks()[0];
  expect(task.labels).toEqual(['label-1', 'label-2']);
});

// ── updateTask ──────────────────────────────────────────────────────

test('updateTask updates title, description, priority', () => {
  addTask('Original', 'old desc', 'low', '', 'todo', []);
  const task = loadTasks()[0];
  updateTask(task.id, 'Updated', 'new desc', 'high', '2024-12-31', 'todo', ['label-1']);

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.title).toBe('Updated');
  expect(updated.description).toBe('new desc');
  expect(updated.priority).toBe('high');
  expect(updated.dueDate).toBe('2024-12-31');
  expect(updated.labels).toEqual(['label-1']);
});

test('updateTask does nothing for empty title', () => {
  addTask('Original', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];
  updateTask(task.id, '', 'desc', 'high', '', 'todo', []);
  const after = loadTasks().find(t => t.id === task.id);
  expect(after.title).toBe('Original');
});

test('updateTask appends to columnHistory on column change', () => {
  addTask('Task', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];
  updateTask(task.id, 'Task', '', 'none', '', 'inprogress', []);

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.column).toBe('inprogress');
  expect(updated.columnHistory.length).toBe(2);
  expect(updated.columnHistory[1].column).toBe('inprogress');
});

test('updateTask sets doneDate when moving to Done column', () => {
  addTask('Task', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];
  updateTask(task.id, 'Task', '', 'none', '', 'done', []);

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.doneDate).toBeTruthy();
});

test('updateTask removes doneDate when moving from Done column', () => {
  addTask('Task', '', 'none', '', 'done', []);
  const task = loadTasks()[0];
  expect(task.doneDate).toBeTruthy();

  updateTask(task.id, 'Task', '', 'none', '', 'todo', []);
  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.doneDate).toBeUndefined();
});

test('updateTask seeds columnHistory if missing', () => {
  saveTasks([
    { id: 't1', title: 'Legacy', column: 'todo', priority: 'none', creationDate: '2024-01-01T00:00:00Z' }
  ]);
  updateTask('t1', 'Legacy Updated', '', 'none', '', 'todo', []);

  const updated = loadTasks().find(t => t.id === 't1');
  expect(Array.isArray(updated.columnHistory)).toBe(true);
  expect(updated.columnHistory.length >= 1).toBe(true);
});

// ── deleteTask ──────────────────────────────────────────────────────

test('deleteTask removes task by ID', () => {
  addTask('Task 1', '', 'none', '', 'todo', []);
  addTask('Task 2', '', 'none', '', 'todo', []);
  const tasks = loadTasks();
  expect(tasks.length).toBe(2);

  deleteTask(tasks[0].id);
  expect(loadTasks().length).toBe(1);
});

// ── permanent delete ───────────────────────────────────────────────

test('deleteTask permanently removes task from live and deleted task lists by default', () => {
  addTask('Task 1', '', 'none', '', 'todo', []);
  const [task] = loadTasks();

  deleteTask(task.id);

  expect(loadTasks().find(t => t.id === task.id)).toBeUndefined();
  expect(loadDeletedTasksForBoard(getActiveBoardId()).find(t => t.id === task.id)).toBeUndefined();
});

test('updateTaskPositionsFromDrop preserves existing task tombstones', () => {
  saveTasks([
    { id: 't1', title: 'Live', column: 'todo', order: 1, priority: 'none', labels: [], columnHistory: [{ column: 'todo', at: '2024-01-01T00:00:00.000Z' }] },
    { id: 't2', title: 'Trash', column: 'todo', order: 2, priority: 'none', labels: [], deleted: true }
  ]);
  const item = { dataset: { taskId: 't1' } };
  const from = { dataset: { column: 'todo' }, closest: () => from };
  const to = { dataset: { column: 'inprogress' }, closest: () => to };
  const fromColumn = { dataset: { column: 'todo' }, querySelectorAll: () => [] };
  const toColumn = { dataset: { column: 'inprogress' }, querySelectorAll: () => [item] };
  const originalDocument = globalThis.document;
  globalThis.document = {
    getElementById: () => null,
    querySelectorAll: () => [fromColumn, toColumn]
  };

  try {
    updateTaskPositionsFromDrop({ from, to, item });
  } finally {
    if (originalDocument) {
      globalThis.document = originalDocument;
    } else {
      delete globalThis.document;
    }
  }

  expect(loadDeletedTasksForBoard(getActiveBoardId())).toHaveLength(1);
});

test('purgeDeleted hard-removes task tombstones from storage', async () => {
  const { purgeDeleted } = await import('../../src/modules/storage.js');
  saveTasks([
    { id: 'task-1', title: 'Task 1', column: 'todo', priority: 'none', deleted: true }
  ]);

  expect(loadDeletedTasksForBoard(getActiveBoardId())).toHaveLength(1);

  purgeDeleted(getActiveBoardId());

  expect(loadDeletedTasksForBoard(getActiveBoardId())).toHaveLength(0);
});

test('purgeDeleted with { tasks: false } keeps task tombstones', async () => {
  const { purgeDeleted } = await import('../../src/modules/storage.js');
  saveTasks([
    { id: 'task-1', title: 'Task 1', column: 'todo', priority: 'none', deleted: true }
  ]);

  purgeDeleted(getActiveBoardId(), { tasks: false });

  expect(loadDeletedTasksForBoard(getActiveBoardId())).toHaveLength(1);
});

// ── updateTaskPositionsFromDrop ─────────────────────────────────────

// ── moveTaskToTopInColumn ───────────────────────────────────────────

test('moveTaskToTopInColumn moves specified task to order 1', () => {
  addTask('First', '', 'none', '', 'todo', []);
  addTask('Second', '', 'none', '', 'todo', []);
  addTask('Third', '', 'none', '', 'todo', []);

  const tasks = loadTasks();
  const first = tasks.find(t => t.title === 'First');

  moveTaskToTopInColumn(first.id, 'todo');

  const after = loadTasks();
  const moved = after.find(t => t.id === first.id);
  expect(moved.order).toBe(1);
});

test('moveTaskToTopInColumn returns null for missing args', () => {
  expect(moveTaskToTopInColumn(null, 'todo')).toBeNull();
  expect(moveTaskToTopInColumn('t1', null)).toBeNull();
});

// ── subTasks ────────────────────────────────────────────────────────

test('addTask stores subTasks when provided', () => {
  const subTasks = [
    { id: 'st1', title: 'Step one', completed: false, order: 1 },
    { id: 'st2', title: 'Step two', completed: true, order: 2 }
  ];
  addTask('Parent', '', 'none', '', 'todo', [], [], subTasks);
  const task = loadTasks()[0];
  expect(Array.isArray(task.subTasks)).toBe(true);
  expect(task.subTasks.length).toBe(2);
  expect(task.subTasks[0].title).toBe('Step one');
  expect(task.subTasks[0].completed).toBe(false);
  expect(task.subTasks[1].title).toBe('Step two');
  expect(task.subTasks[1].completed).toBe(true);
});

test('addTask stores empty subTasks array when none provided', () => {
  addTask('Plain', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];
  expect(Array.isArray(task.subTasks)).toBe(true);
  expect(task.subTasks.length).toBe(0);
});

test('updateTask persists updated subTasks', () => {
  addTask('Parent', '', 'none', '', 'todo', [], [], [
    { id: 'st1', title: 'Original', completed: false, order: 1 }
  ]);
  const task = loadTasks()[0];

  updateTask(task.id, 'Parent', '', 'none', '', 'todo', [], [], [
    { id: 'st1', title: 'Updated', completed: true, order: 1 },
    { id: 'st2', title: 'New step', completed: false, order: 2 }
  ]);

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.subTasks.length).toBe(2);
  expect(updated.subTasks[0].title).toBe('Updated');
  expect(updated.subTasks[0].completed).toBe(true);
  expect(updated.subTasks[1].title).toBe('New step');
});

test('updateTask clears subTasks when empty array passed', () => {
  addTask('Parent', '', 'none', '', 'todo', [], [], [
    { id: 'st1', title: 'Step', completed: false, order: 1 }
  ]);
  const task = loadTasks()[0];

  updateTask(task.id, 'Parent', '', 'none', '', 'todo', [], [], []);

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.subTasks.length).toBe(0);
});

test('updateTask normalizes invalid subTask entries', () => {
  addTask('Parent', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];

  updateTask(task.id, 'Parent', '', 'none', '', 'todo', [], [], [
    { id: 'st1', title: 'Valid', completed: false, order: 1 },
    { id: '', title: 'No id', completed: false, order: 2 },
    { id: 'st3', title: '', completed: false, order: 3 }
  ]);

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.subTasks.length).toBe(1);
  expect(updated.subTasks[0].id).toBe('st1');
});

test('subTasks persist through storage round-trip', () => {
  const subTasks = [
    { id: 'st1', title: 'Persist me', completed: true, order: 1 }
  ];
  addTask('Parent', '', 'none', '', 'todo', [], [], subTasks);

  // Re-load from storage
  const reloaded = loadTasks();
  const task = reloaded[0];
  expect(task.subTasks[0].title).toBe('Persist me');
  expect(task.subTasks[0].completed).toBe(true);
});

// ── agile task fields ───────────────────────────────────────────────

test('addTask generates a board-prefixed key', () => {
  addTask('First', '', 'none', '', 'todo', []);
  addTask('Second', '', 'none', '', 'todo', []);

  const tasks = loadTasks();
  expect(tasks.find(t => t.title === 'First').key).toBe('TES-1');
  expect(tasks.find(t => t.title === 'Second').key).toBe('TES-2');
});

test('addTask defaults the agile fields', () => {
  addTask('Plain', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];

  expect(task.type).toBe('task');
  expect(task.estimate).toBeNull();
  expect(task.assignee).toBe('');
  expect(task.parentId).toBeNull();
  expect(task.acceptanceCriteria).toEqual([]);
  expect(task.comments).toEqual([]);
  expect(task.attachments).toEqual([]);
  expect(task.customFields).toEqual({});
  expect(task.blockedReason).toBe('');
  expect(task.blockedAt).toBeNull();
});

test('addTask persists provided agile fields', () => {
  addTask('Rich', '', 'none', '', 'todo', [], [], [], {
    type: 'bug',
    estimate: 5,
    assignee: 'Ada',
    parentId: 'epic-1',
    acceptanceCriteria: [{ id: 'ac1', text: 'Works offline', done: true }],
    comments: [{ id: 'c1', author: 'Ada', text: 'First', at: '2026-01-01T00:00:00.000Z' }],
    attachments: [{ id: 'at1', name: 'Spec', url: 'https://example.com/spec.pdf' }],
    customFields: { Sprint: '12' }
  });

  const task = loadTasks()[0];
  expect(task.type).toBe('bug');
  expect(task.estimate).toBe(5);
  expect(task.assignee).toBe('Ada');
  expect(task.parentId).toBe('epic-1');
  expect(task.acceptanceCriteria).toEqual([{ id: 'ac1', text: 'Works offline', done: true }]);
  expect(task.comments[0]).toMatchObject({ author: 'Ada', text: 'First' });
  expect(task.attachments[0]).toMatchObject({ name: 'Spec', url: 'https://example.com/spec.pdf' });
  expect(task.customFields).toEqual({ Sprint: '12' });
});

test('updateTask persists agile fields and rejects a self-parent', () => {
  addTask('Original', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];

  updateTask(task.id, 'Original', '', 'none', '', 'todo', [], [], [], {
    type: 'spike',
    estimate: 3,
    assignee: 'Grace',
    parentId: task.id,
    acceptanceCriteria: [{ id: 'ac1', text: 'Investigate', done: false }],
    customFields: { Epic: 'X' }
  });

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.type).toBe('spike');
  expect(updated.estimate).toBe(3);
  expect(updated.assignee).toBe('Grace');
  expect(updated.parentId).toBeNull();
  expect(updated.acceptanceCriteria[0].text).toBe('Investigate');
  expect(updated.customFields).toEqual({ Epic: 'X' });
});

test('updateTask without extraFields leaves agile fields untouched', () => {
  addTask('Keep', '', 'none', '', 'todo', [], [], [], { type: 'bug', estimate: 8, assignee: 'Ada' });
  const task = loadTasks()[0];

  updateTask(task.id, 'Keep renamed', '', 'none', '', 'todo', []);

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.title).toBe('Keep renamed');
  expect(updated.type).toBe('bug');
  expect(updated.estimate).toBe(8);
  expect(updated.assignee).toBe('Ada');
});

// ── blocked reason transitions ──────────────────────────────────────

function withDropDocument(fromColumnId, toColumnId, taskId, callback) {
  const item = { dataset: { taskId } };
  const from = { dataset: { column: fromColumnId }, closest: () => from };
  const to = { dataset: { column: toColumnId }, closest: () => to };
  const fromColumn = { dataset: { column: fromColumnId }, querySelectorAll: () => [] };
  const toColumn = { dataset: { column: toColumnId }, querySelectorAll: () => [item] };
  const originalDocument = globalThis.document;
  globalThis.document = {
    getElementById: () => null,
    querySelectorAll: () => [fromColumn, toColumn]
  };

  try {
    return callback({ from, to, item });
  } finally {
    if (originalDocument) {
      globalThis.document = originalDocument;
    } else {
      delete globalThis.document;
    }
  }
}

test('updateTaskPositionsFromDrop flags and records a move into Blocked', () => {
  addTask('Blocker', '', 'none', '', 'todo', []);
  const [task] = loadTasks();

  const result = withDropDocument('todo', BLOCKED_COLUMN_ID, task.id, (evt) =>
    updateTaskPositionsFromDrop(evt, { blockedReason: 'Waiting on API keys' })
  );

  expect(result.enteredBlocked).toBe(true);
  expect(result.leftBlocked).toBe(false);

  const moved = loadTasks().find(t => t.id === task.id);
  expect(moved.column).toBe(BLOCKED_COLUMN_ID);
  expect(moved.blockedReason).toBe('Waiting on API keys');
  expect(typeof moved.blockedAt).toBe('string');
  expect(Number.isNaN(new Date(moved.blockedAt).getTime())).toBe(false);
});

test('updateTaskPositionsFromDrop leaves the reason empty when none is provided', () => {
  addTask('Blocker', '', 'none', '', 'todo', []);
  const [task] = loadTasks();

  withDropDocument('todo', BLOCKED_COLUMN_ID, task.id, (evt) => updateTaskPositionsFromDrop(evt));

  const moved = loadTasks().find(t => t.id === task.id);
  expect(moved.blockedReason).toBe('');
  expect(moved.blockedAt).toBeNull();
});

test('updateTaskPositionsFromDrop clears blocked fields when leaving Blocked', () => {
  saveTasks([{
    id: 't1',
    title: 'Was blocked',
    column: BLOCKED_COLUMN_ID,
    order: 1,
    priority: 'none',
    labels: [],
    blockedReason: 'Waiting on API keys',
    blockedAt: '2026-01-01T00:00:00.000Z'
  }]);

  const result = withDropDocument(BLOCKED_COLUMN_ID, 'todo', 't1', (evt) =>
    updateTaskPositionsFromDrop(evt)
  );

  expect(result.leftBlocked).toBe(true);
  expect(result.enteredBlocked).toBe(false);

  const moved = loadTasks().find(t => t.id === 't1');
  expect(moved.column).toBe('todo');
  expect(moved.blockedReason).toBe('');
  expect(moved.blockedAt).toBeNull();
});

test('setTaskBlockedReason stores a trimmed reason and clears on empty', () => {
  addTask('Task', '', 'none', '', 'todo', []);
  const task = loadTasks()[0];

  expect(setTaskBlockedReason(task.id, '  Waiting on API  ')).toBe(true);
  const blocked = loadTasks().find(t => t.id === task.id);
  expect(blocked.blockedReason).toBe('Waiting on API');
  expect(blocked.blockedAt).toBeTruthy();

  setTaskBlockedReason(task.id, '');
  const cleared = loadTasks().find(t => t.id === task.id);
  expect(cleared.blockedReason).toBe('');
  expect(cleared.blockedAt).toBeNull();
});

test('setTaskBlockedReason returns false for a missing task', () => {
  expect(setTaskBlockedReason('missing', 'nope')).toBe(false);
});
