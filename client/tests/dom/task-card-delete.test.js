import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';

const confirmDialog = vi.fn();
const deleteTask = vi.fn();
const emit = vi.fn();
const isDoneColumnId = vi.fn(() => false);
const showEditModal = vi.fn();

vi.mock('../../src/modules/dialog.js', () => ({
  confirmDialog
}));

vi.mock('../../src/modules/tasks.js', () => ({
  deleteTask
}));

vi.mock('../../src/modules/events.js', () => ({
  DATA_CHANGED: 'data:changed',
  emit
}));

vi.mock('../../src/modules/modals.js', () => ({
  showEditModal
}));

vi.mock('../../src/modules/storage.js', () => ({
  isDoneColumnId,
  loadLabels: vi.fn(() => [])
}));

const { createTaskElement } = await import('../../src/modules/task-card.js');
const { BACKLOG_COLUMN_ID, FIXED_COLUMNS } = await import('../../src/modules/constants.js');

const FINISHED_COLUMN_ID = FIXED_COLUMNS[4].id;

beforeEach(() => {
  confirmDialog.mockReset();
  deleteTask.mockReset();
  emit.mockReset();
  isDoneColumnId.mockReset();
  isDoneColumnId.mockImplementation(() => false);
});

function renderTask(overrides = {}) {
  const task = {
    id: 'task-1',
    title: 'Delete me',
    description: '',
    priority: 'none',
    dueDate: '',
    column: 'todo',
    labels: [],
    ...overrides
  };
  const element = createTaskElement(task, {});
  document.body.appendChild(element);
  return element;
}

test('delete button shows permanent-delete confirmation message by default', async () => {
  confirmDialog.mockResolvedValue(false);
  const element = renderTask();

  fireEvent.click(element.querySelector('.delete-task-btn'));
  await Promise.resolve();

  expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({
    message: 'This will permanently delete the task. There is no undo.'
  }));
});

test('cancelling delete leaves the task untouched', async () => {
  confirmDialog.mockResolvedValue(false);
  const element = renderTask();

  fireEvent.click(element.querySelector('.delete-task-btn'));
  await Promise.resolve();

  expect(deleteTask).not.toHaveBeenCalled();
  expect(emit).not.toHaveBeenCalled();
});

test('confirming permanent delete calls deleteTask for the task', async () => {
  confirmDialog.mockResolvedValue(true);
  deleteTask.mockReturnValue(true);
  const element = renderTask();

  fireEvent.click(element.querySelector('.delete-task-btn'));
  await Promise.resolve();

  expect(deleteTask).toHaveBeenCalledWith('task-1');
});

test('renders no delete control for a card in the Finished column', () => {
  isDoneColumnId.mockImplementation((columnId) => columnId === FINISHED_COLUMN_ID);
  const element = renderTask({ column: FINISHED_COLUMN_ID });

  expect(element.querySelector('.delete-task-btn')).toBeNull();
});

test('keeps the delete control for a card in another column', () => {
  isDoneColumnId.mockImplementation((columnId) => columnId === FINISHED_COLUMN_ID);
  const element = renderTask({ column: BACKLOG_COLUMN_ID });

  expect(element.querySelector('.task-actions .delete-task-btn')).not.toBeNull();
});

test('keeps the row actions container on both cards so the header does not shift', () => {
  isDoneColumnId.mockImplementation((columnId) => columnId === FINISHED_COLUMN_ID);
  const finished = renderTask({ column: FINISHED_COLUMN_ID });
  const other = renderTask({ id: 'task-2', column: BACKLOG_COLUMN_ID });

  expect(finished.querySelector('.task-row > .task-actions')).not.toBeNull();
  expect(other.querySelector('.task-row > .task-actions')).not.toBeNull();
});

test('a Finished card still opens the task dialog and keeps its notes', () => {
  isDoneColumnId.mockImplementation((columnId) => columnId === FINISHED_COLUMN_ID);
  const element = renderTask({
    column: FINISHED_COLUMN_ID,
    keyPoints: [{ id: 'kp1', text: 'Works offline', at: '2026-01-01T00:00:00.000Z' }]
  });

  expect(element.querySelector('.task-key-points .task-key-point').textContent).toBe('Works offline');
  fireEvent.click(element.querySelector('.task-title'));
  expect(showEditModal).toHaveBeenCalledWith('task-1');
});
