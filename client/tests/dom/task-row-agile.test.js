import { beforeEach, expect, test, vi } from 'vitest';
import { mountToBody } from './setup.js';

vi.mock('../../src/modules/dialog.js', () => ({ confirmDialog: vi.fn() }));
vi.mock('../../src/modules/tasks.js', () => ({ deleteTask: vi.fn() }));
vi.mock('../../src/modules/events.js', () => ({ DATA_CHANGED: 'data:changed', emit: vi.fn() }));
vi.mock('../../src/modules/modals.js', () => ({ showEditModal: vi.fn() }));
vi.mock('../../src/modules/storage.js', () => ({
  isDoneColumnId: vi.fn((columnId) => columnId === 'archived'),
  loadLabels: vi.fn(() => [])
}));

const { createTaskElement } = await import('../../src/modules/task-card.js');

const baseTask = {
  id: 'task-1',
  title: 'Ship the release',
  column: 'todo'
};

function render(task, settings = {}) {
  const element = createTaskElement(task, settings);
  mountToBody(element);
  return element;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

test('renders the human-readable key when present', () => {
  const element = render({ ...baseTask, key: 'DB-12' });
  expect(element.querySelector('.task-key').textContent).toBe('DB-12');
});

test('omits the key when the task has none', () => {
  const element = render(baseTask);
  expect(element.querySelector('.task-key')).toBeNull();
});

test('renders a colour-coded type marker for known types', () => {
  const element = render({ ...baseTask, type: 'bug' });
  const marker = element.querySelector('.task-type');

  expect(marker).not.toBeNull();
  expect(marker.classList.contains('task-type--bug')).toBe(true);
  expect(marker.textContent).toBe('B');
  expect(marker.getAttribute('aria-label')).toBe('Type: Bug');
});

test('omits the type marker for unknown types', () => {
  const element = render({ ...baseTask, type: 'epic' });
  expect(element.querySelector('.task-type')).toBeNull();
});

test('renders an estimate badge when set', () => {
  const element = render({ ...baseTask, estimate: 5 });
  expect(element.querySelector('.task-estimate').textContent).toBe('5');
});

test('omits the estimate badge when null', () => {
  const element = render({ ...baseTask, estimate: null });
  expect(element.querySelector('.task-estimate')).toBeNull();
});

test('renders assignee initials with the full name as title', () => {
  const element = render({ ...baseTask, assignee: 'Ada Lovelace' });
  const assignee = element.querySelector('.task-assignee');

  expect(assignee.textContent).toBe('AL');
  expect(assignee.getAttribute('title')).toBe('Assignee: Ada Lovelace');
});

test('renders a blocked indicator when blockedReason is set', () => {
  const element = render({ ...baseTask, blockedReason: 'Waiting on API keys' });
  const blocked = element.querySelector('.task-blocked');

  expect(blocked).not.toBeNull();
  expect(blocked.getAttribute('title')).toBe('Blocked: Waiting on API keys');
});

test('omits the blocked indicator without a reason', () => {
  const element = render({ ...baseTask, blockedReason: '' });
  expect(element.querySelector('.task-blocked')).toBeNull();
});

test('never renders a task age badge even when creationDate is set', () => {
  const element = render({ ...baseTask, creationDate: '2026-05-20T00:00:00Z' });
  expect(element.querySelector('.task-age')).toBeNull();
  expect(element.querySelector('.task-stale-dot')).toBeNull();
  expect(element.classList.contains('task-stale')).toBe(false);
});

test('ignores the showAge setting because the age badge is gone', () => {
  const element = render({ ...baseTask, creationDate: '2026-05-20T00:00:00Z' }, { showAge: false });
  expect(element.querySelector('.task-age')).toBeNull();
});
