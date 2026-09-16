import { test, expect, beforeEach } from 'vitest';
import { resetLocalStorage } from './setup.js';
import { createBoard, getActiveBoardId, loadDeletedTasksForBoard, loadTasks, saveColumns, saveLabels, saveSettings, saveTasks } from '../../src/modules/storage.js';
import { addTask, deleteTask, moveTaskToTopInColumn, setTaskBlockedReason } from '../../src/modules/tasks.js';
import { updateTask } from '../../src/modules/task-update.js';
import { updateTaskPositionsFromDrop } from '../../src/modules/task-position.js';
import { BACKLOG_COLUMN_ID, DONE_COLUMN_ID } from '../../src/modules/constants.js';

const BLOCKED_COLUMN_ID = '00000000-0000-4000-8000-000000000032';

const REMOVED_FIELDS = ['priority', 'dueDate', 'labels', 'subTasks', 'attachments', 'customFields'];

beforeEach(() => {
  resetLocalStorage();
  createBoard('Test');
  saveTasks([]);
});

// ── addTask ─────────────────────────────────────────────────────────

test('addTask creates task in Backlog with order 1', () => {
  addTask('First', 'desc');
  const tasks = loadTasks();
  expect(tasks.length).toBe(1);
  expect(tasks[0].title).toBe('First');
  expect(tasks[0].description).toBe('desc');
  expect(tasks[0].order).toBe(1);
  expect(tasks[0].column).toBe(BACKLOG_COLUMN_ID);
});

test('addTask with only title, description, type and estimate keeps the slim model', () => {
  addTask('Slim', 'A note', { type: 'bug', estimate: 3 });
  const task = loadTasks()[0];

  expect(task.title).toBe('Slim');
  expect(task.description).toBe('A note');
  expect(task.type).toBe('bug');
  expect(task.estimate).toBe(3);
  expect(task.column).toBe(BACKLOG_COLUMN_ID);
  for (const field of REMOVED_FIELDS) {
    expect(task[field]).toBeUndefined();
  }
});

test('addTask bumps existing task orders in the same column', () => {
  addTask('First', '');
  addTask('Second', '');
  const tasks = loadTasks();
  const second = tasks.find(t => t.title === 'Second');
  const first = tasks.find(t => t.title === 'First');
  expect(second.order).toBe(1);
  expect(first.order > 1).toBe(true);
});

test('addTask does nothing for empty title', () => {
  addTask('', 'desc');
  expect(loadTasks().length).toBe(0);
});

test('addTask sets creationDate, changeDate, and columnHistory', () => {
  addTask('Task', '');
  const task = loadTasks()[0];
  expect(task.creationDate).toBeTruthy();
  expect(task.changeDate).toBeTruthy();
  expect(Array.isArray(task.columnHistory)).toBe(true);
  expect(task.columnHistory.length).toBe(1);
  expect(task.columnHistory[0].column).toBe(BACKLOG_COLUMN_ID);
});

// ── updateTask ──────────────────────────────────────────────────────

test('updateTask updates title and description', () => {
  addTask('Original', 'old desc');
  const task = loadTasks()[0];
  updateTask(task.id, 'Updated', 'new desc');

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.title).toBe('Updated');
  expect(updated.description).toBe('new desc');
});

test('updateTask does nothing for empty title', () => {
  addTask('Original', '');
  const task = loadTasks()[0];
  updateTask(task.id, '', 'desc');
  const after = loadTasks().find(t => t.id === task.id);
  expect(after.title).toBe('Original');
});

test('updateTask appends to columnHistory when a column is passed explicitly', () => {
  addTask('Task', '');
  const task = loadTasks()[0];
  updateTask(task.id, 'Task', '', { column: 'inprogress' });

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.column).toBe('inprogress');
  expect(updated.columnHistory.length).toBe(2);
  expect(updated.columnHistory[1].column).toBe('inprogress');
});

test('updateTask keeps the current column when none is passed', () => {
  addTask('Task', '');
  const task = loadTasks()[0];
  updateTask(task.id, 'Renamed', '');

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.column).toBe(BACKLOG_COLUMN_ID);
  expect(updated.columnHistory.length).toBe(1);
});

test('updateTask sets doneDate when moving to the done column', () => {
  addTask('Task', '');
  const task = loadTasks()[0];
  updateTask(task.id, 'Task', '', { column: DONE_COLUMN_ID });

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.doneDate).toBeTruthy();
});

test('updateTask removes doneDate when moving out of the done column', () => {
  addTask('Task', '');
  const task = loadTasks()[0];
  updateTask(task.id, 'Task', '', { column: DONE_COLUMN_ID });
  expect(loadTasks().find(t => t.id === task.id).doneDate).toBeTruthy();

  updateTask(task.id, 'Task', '', { column: BACKLOG_COLUMN_ID });
  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.doneDate).toBeUndefined();
});

test('updateTask seeds columnHistory if missing', () => {
  saveTasks([
    { id: 't1', title: 'Legacy', column: 'todo', creationDate: '2024-01-01T00:00:00Z' }
  ]);
  updateTask('t1', 'Legacy Updated', '');

  const updated = loadTasks().find(t => t.id === 't1');
  expect(Array.isArray(updated.columnHistory)).toBe(true);
  expect(updated.columnHistory.length >= 1).toBe(true);
});

// ── deleteTask ──────────────────────────────────────────────────────

test('deleteTask removes task by ID', () => {
  addTask('Task 1', '');
  addTask('Task 2', '');
  const tasks = loadTasks();
  expect(tasks.length).toBe(2);

  deleteTask(tasks[0].id);
  expect(loadTasks().length).toBe(1);
});

// ── permanent delete ───────────────────────────────────────────────

test('deleteTask permanently removes task from live and deleted task lists by default', () => {
  addTask('Task 1', '');
  const [task] = loadTasks();

  deleteTask(task.id);

  expect(loadTasks().find(t => t.id === task.id)).toBeUndefined();
  expect(loadDeletedTasksForBoard(getActiveBoardId()).find(t => t.id === task.id)).toBeUndefined();
});

test('updateTaskPositionsFromDrop preserves existing task tombstones', () => {
  saveTasks([
    { id: 't1', title: 'Live', column: 'todo', order: 1, columnHistory: [{ column: 'todo', at: '2024-01-01T00:00:00.000Z' }] },
    { id: 't2', title: 'Trash', column: 'todo', order: 2, deleted: true }
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
    { id: 'task-1', title: 'Task 1', column: 'todo', deleted: true }
  ]);

  expect(loadDeletedTasksForBoard(getActiveBoardId())).toHaveLength(1);

  purgeDeleted(getActiveBoardId());

  expect(loadDeletedTasksForBoard(getActiveBoardId())).toHaveLength(0);
});

test('purgeDeleted with { tasks: false } keeps task tombstones', async () => {
  const { purgeDeleted } = await import('../../src/modules/storage.js');
  saveTasks([
    { id: 'task-1', title: 'Task 1', column: 'todo', deleted: true }
  ]);

  purgeDeleted(getActiveBoardId(), { tasks: false });

  expect(loadDeletedTasksForBoard(getActiveBoardId())).toHaveLength(1);
});

// ── moveTaskToTopInColumn ───────────────────────────────────────────

test('moveTaskToTopInColumn moves specified task to order 1', () => {
  addTask('First', '');
  addTask('Second', '');
  addTask('Third', '');

  const tasks = loadTasks();
  const first = tasks.find(t => t.title === 'First');

  moveTaskToTopInColumn(first.id, BACKLOG_COLUMN_ID);

  const after = loadTasks();
  const moved = after.find(t => t.id === first.id);
  expect(moved.order).toBe(1);
});

test('moveTaskToTopInColumn returns null for missing args', () => {
  expect(moveTaskToTopInColumn(null, 'todo')).toBeNull();
  expect(moveTaskToTopInColumn('t1', null)).toBeNull();
});

// ── agile task fields ───────────────────────────────────────────────

test('addTask generates a board-prefixed key', () => {
  addTask('First', '');
  addTask('Second', '');

  const tasks = loadTasks();
  expect(tasks.find(t => t.title === 'First').key).toBe('TES-1');
  expect(tasks.find(t => t.title === 'Second').key).toBe('TES-2');
});

test('addTask defaults the agile fields', () => {
  addTask('Plain', '');
  const task = loadTasks()[0];

  expect(task.type).toBe('task');
  expect(task.estimate).toBeNull();
  expect(task.assignee).toBe('');
  expect(task.parentId).toBeNull();
  expect(task.acceptanceCriteria).toEqual([]);
  expect(task.comments).toEqual([]);
  expect(task.blockedReason).toBe('');
  expect(task.blockedAt).toBeNull();
});

test('addTask persists provided agile fields', () => {
  addTask('Rich', '', {
    type: 'bug',
    estimate: 5,
    assignee: 'Ada',
    parentId: 'epic-1',
    acceptanceCriteria: [{ id: 'ac1', text: 'Works offline', done: true }],
    comments: [{ id: 'c1', author: 'Ada', text: 'First', at: '2026-01-01T00:00:00.000Z' }]
  });

  const task = loadTasks()[0];
  expect(task.type).toBe('bug');
  expect(task.estimate).toBe(5);
  expect(task.assignee).toBe('Ada');
  expect(task.parentId).toBe('epic-1');
  expect(task.acceptanceCriteria).toEqual([{ id: 'ac1', text: 'Works offline', done: true }]);
  expect(task.comments[0]).toMatchObject({ author: 'Ada', text: 'First' });
});

test('addTask persists acceptance criteria as { id, text, done }', () => {
  addTask('Checked', '', {
    acceptanceCriteria: [
      { id: 'ac1', text: 'First', done: false },
      { id: 'ac2', text: 'Second', done: true }
    ]
  });

  const task = loadTasks()[0];
  expect(task.acceptanceCriteria).toHaveLength(2);
  expect(task.acceptanceCriteria[0]).toMatchObject({ id: 'ac1', text: 'First', done: false });
  expect(task.acceptanceCriteria[1]).toMatchObject({ id: 'ac2', text: 'Second', done: true });
});

test('updateTask persists agile fields and rejects a self-parent', () => {
  addTask('Original', '');
  const task = loadTasks()[0];

  updateTask(task.id, 'Original', '', {
    type: 'spike',
    estimate: 3,
    assignee: 'Grace',
    parentId: task.id,
    acceptanceCriteria: [{ id: 'ac1', text: 'Investigate', done: false }]
  });

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.type).toBe('spike');
  expect(updated.estimate).toBe(3);
  expect(updated.assignee).toBe('Grace');
  expect(updated.parentId).toBeNull();
  expect(updated.acceptanceCriteria[0].text).toBe('Investigate');
});

test('updateTask without extraFields leaves agile fields untouched', () => {
  addTask('Keep', '', { type: 'bug', estimate: 8, assignee: 'Ada' });
  const task = loadTasks()[0];

  updateTask(task.id, 'Keep renamed', '');

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.title).toBe('Keep renamed');
  expect(updated.type).toBe('bug');
  expect(updated.estimate).toBe(8);
  expect(updated.assignee).toBe('Ada');
});

test('updateTask leaves assignee and parentId untouched when the payload omits them', () => {
  addTask('Keep', '', { assignee: 'Ada', parentId: 'epic-1', type: 'bug', estimate: 2 });
  const task = loadTasks()[0];

  updateTask(task.id, 'Keep renamed', '', { type: 'task', estimate: 3, acceptanceCriteria: [], comments: [] });

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.assignee).toBe('Ada');
  expect(updated.parentId).toBe('epic-1');
  expect(updated.type).toBe('task');
  expect(updated.estimate).toBe(3);
});

test('updateTask replaces acceptance criteria and comments wholesale', () => {
  addTask('Notes', '', {
    acceptanceCriteria: [{ id: 'ac1', text: 'Old', done: false }],
    comments: [{ id: 'c1', author: 'Ada', text: 'Old note', at: '2026-01-01T00:00:00.000Z' }]
  });
  const task = loadTasks()[0];

  updateTask(task.id, 'Notes', '', {
    acceptanceCriteria: [{ id: 'ac2', text: 'New', done: true }],
    comments: [{ id: 'c2', author: 'Agent', text: 'Answer', at: '2026-01-02T00:00:00.000Z' }]
  });

  const updated = loadTasks().find(t => t.id === task.id);
  expect(updated.acceptanceCriteria).toEqual([{ id: 'ac2', text: 'New', done: true }]);
  expect(updated.comments).toHaveLength(1);
  expect(updated.comments[0]).toMatchObject({ author: 'Agent', text: 'Answer' });
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
  addTask('Blocker', '');
  const [task] = loadTasks();

  const result = withDropDocument(BACKLOG_COLUMN_ID, BLOCKED_COLUMN_ID, task.id, (evt) =>
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
  addTask('Blocker', '');
  const [task] = loadTasks();

  withDropDocument(BACKLOG_COLUMN_ID, BLOCKED_COLUMN_ID, task.id, (evt) => updateTaskPositionsFromDrop(evt));

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
    blockedReason: 'Waiting on API keys',
    blockedAt: '2026-01-01T00:00:00.000Z'
  }]);

  const result = withDropDocument(BLOCKED_COLUMN_ID, BACKLOG_COLUMN_ID, 't1', (evt) =>
    updateTaskPositionsFromDrop(evt)
  );

  expect(result.leftBlocked).toBe(true);
  expect(result.enteredBlocked).toBe(false);

  const moved = loadTasks().find(t => t.id === 't1');
  expect(moved.column).toBe(BACKLOG_COLUMN_ID);
  expect(moved.blockedReason).toBe('');
  expect(moved.blockedAt).toBeNull();
});

test('setTaskBlockedReason stores a trimmed reason and clears on empty', () => {
  addTask('Task', '');
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
