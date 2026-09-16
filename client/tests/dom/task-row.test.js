import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';
import { mountToBody } from './setup.js';

vi.mock('../../src/modules/dialog.js', () => ({ confirmDialog: vi.fn() }));
vi.mock('../../src/modules/tasks.js', () => ({ deleteTask: vi.fn() }));
vi.mock('../../src/modules/events.js', () => ({ DATA_CHANGED: 'data:changed', emit: vi.fn() }));
vi.mock('../../src/modules/modals.js', () => ({ showEditModal: vi.fn() }));
vi.mock('../../src/modules/storage.js', () => ({
  isDoneColumnId: vi.fn(() => false),
  loadLabels: vi.fn(() => [])
}));

const { createTaskElement } = await import('../../src/modules/task-card.js');
const { showEditModal } = await import('../../src/modules/modals.js');

function render(task, settings = {}) {
  const element = createTaskElement(task, settings);
  mountToBody(element);
  return element;
}

const baseTask = {
  id: 'task-1',
  title: 'Ship the release',
  description: '',
  column: 'todo'
};

beforeEach(() => {
  showEditModal.mockClear();
});

test('renders a single compact row without card chrome', () => {
  const element = render(baseTask);

  expect(element.tagName).toBe('LI');
  expect(element.dataset.taskId).toBe('task-1');
  expect(element.querySelector('.task-row')).not.toBeNull();
  expect(element.querySelector('.task-title').textContent).toBe('Ship the release');
  expect(element.querySelector('.task-header')).toBeNull();
  expect(element.querySelector('.task-footer')).toBeNull();
});

test('renders a one-line description preview when a description is present', () => {
  const element = render({ ...baseTask, description: 'Short summary for the human' });
  const preview = element.querySelector('.task-description-preview');

  expect(preview).not.toBeNull();
  expect(preview.textContent).toBe('Short summary for the human');
});

test('omits the description preview when there is no description', () => {
  const element = render(baseTask);
  expect(element.querySelector('.task-description-preview')).toBeNull();
});

test('no longer renders a priority chip, a due date or a label area', () => {
  const element = render({
    ...baseTask,
    priority: 'high',
    dueDate: '2026-05-10',
    labels: ['l1'],
    subTasks: [{ id: 's1', completed: true }]
  });

  const meta = element.querySelector('.task-meta');
  expect(meta.querySelector('.task-priority')).toBeNull();
  expect(meta.querySelector('.task-date')).toBeNull();
  expect(meta.querySelector('.task-labels')).toBeNull();
  expect(meta.querySelector('.task-label')).toBeNull();
  expect(meta.querySelector('.task-subtasks-row')).toBeNull();
  expect(element.querySelector('.task-age')).toBeNull();
});

test('shows acceptance progress as done over total', () => {
  const element = render({
    ...baseTask,
    acceptanceCriteria: [
      { id: 'ac1', text: 'One', done: true },
      { id: 'ac2', text: 'Two', done: false },
      { id: 'ac3', text: 'Three', done: true }
    ]
  });

  const progress = element.querySelector('.task-acceptance-progress');
  expect(progress).not.toBeNull();
  expect(progress.textContent).toContain('2/3');
  expect(progress.getAttribute('aria-label')).toBe('Acceptance criteria: 2/3 done');
});

test('omits acceptance progress when there are no criteria', () => {
  const element = render({ ...baseTask, acceptanceCriteria: [] });
  expect(element.querySelector('.task-acceptance-progress')).toBeNull();
});

test('shows a notes indicator when comments exist', () => {
  const element = render({
    ...baseTask,
    comments: [
      { id: 'c1', author: 'Ada', text: 'Any update?', at: '2026-01-01T10:00:00.000Z' },
      { id: 'c2', author: 'agent-7', text: 'Working on it', at: '2026-01-01T11:00:00.000Z' }
    ]
  });

  const notes = element.querySelector('.task-notes');
  expect(notes).not.toBeNull();
  expect(notes.textContent).toContain('2');
  expect(notes.getAttribute('aria-label')).toBe('Notes: 2 comments');
});

test('omits the notes indicator without comments', () => {
  const element = render({ ...baseTask, comments: [] });
  expect(element.querySelector('.task-notes')).toBeNull();
});

test('clicking the title opens the task editor', () => {
  const element = render(baseTask);
  fireEvent.click(element.querySelector('.task-title'));

  expect(showEditModal).toHaveBeenCalledWith('task-1');
});

test('keeps the delete control inside the row actions', () => {
  const element = render(baseTask);
  expect(element.querySelector('.task-actions .delete-task-btn')).not.toBeNull();
});
