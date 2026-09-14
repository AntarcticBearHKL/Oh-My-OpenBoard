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

const TODAY = new Date('2026-05-17T00:00:00Z');

function render(task, settings = {}, labelsMap = new Map()) {
  const element = createTaskElement(task, settings, labelsMap, TODAY);
  mountToBody(element);
  return element;
}

const baseTask = {
  id: 'task-1',
  title: 'Ship the release',
  description: 'Long description that should not render in a row',
  priority: 'high',
  dueDate: '2026-05-10',
  column: 'todo',
  labels: []
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
  expect(element.querySelector('.task-description')).toBeNull();
});

test('orders the meta cluster priority, due date, labels, sub-task progress', () => {
  const element = render({
    ...baseTask,
    labels: ['l1'],
    subTasks: [{ id: 's1', completed: true }, { id: 's2', completed: false }]
  }, {}, new Map([['l1', { id: 'l1', name: 'Backend', color: '#3b82f6' }]]));

  const meta = element.querySelector('.task-meta');
  const order = Array.from(meta.children).map((child) => child.className);

  expect(order[0]).toContain('task-priority');
  expect(order[1]).toContain('task-date');
  expect(order[2]).toContain('task-labels');
  expect(order[3]).toContain('task-subtasks-row');
  expect(meta.querySelector('.task-label').textContent).toBe('Backend');
  expect(meta.querySelector('.task-subtasks-row').textContent).toContain('1/2 Done');
});

test('shows an overdue countdown for a past due date', () => {
  const element = render(baseTask);
  const date = element.querySelector('.task-date');

  expect(date.textContent).toContain('overdue');
  expect(date.classList.contains('countdown-urgent')).toBe(true);
});

test('respects the showPriority and showDueDate settings', () => {
  const element = render(baseTask, { showPriority: false, showDueDate: false });

  expect(element.querySelector('.task-priority')).toBeNull();
  expect(element.querySelector('.task-date')).toBeNull();
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
