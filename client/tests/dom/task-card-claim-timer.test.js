import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mountToBody } from './setup.js';
import { BLOCKED_COLUMN_ID, FIXED_COLUMNS, IN_PROGRESS_COLUMN_ID } from '../../src/modules/constants.js';

vi.mock('../../src/modules/dialog.js', () => ({ confirmDialog: vi.fn() }));
vi.mock('../../src/modules/tasks.js', () => ({ deleteTask: vi.fn() }));
vi.mock('../../src/modules/events.js', () => ({ DATA_CHANGED: 'data:changed', emit: vi.fn() }));
vi.mock('../../src/modules/modals.js', () => ({ showEditModal: vi.fn() }));
vi.mock('../../src/modules/storage.js', () => ({
  isDoneColumnId: vi.fn((columnId) => columnId === 'done-column'),
  loadLabels: vi.fn(() => [])
}));

const { createTaskElement } = await import('../../src/modules/task-card.js');
const { startClaimTicker, stopClaimTicker } = await import('../../src/modules/claim-timer.js');

const NOW = new Date('2026-06-01T12:00:00.000Z');
const MINUTE = 60000;

const baseTask = {
  id: 'task-1',
  title: 'Ship the release',
  priority: 'none',
  dueDate: '',
  column: IN_PROGRESS_COLUMN_ID,
  labels: []
};

function ago(ms) {
  return new Date(NOW.getTime() - ms).toISOString();
}

function render(task) {
  const element = createTaskElement(task, {});
  mountToBody(element);
  return element;
}

function setHidden(value) {
  Object.defineProperty(document, 'hidden', { configurable: true, value });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  stopClaimTicker();
  vi.useRealTimers();
  delete document.hidden;
});

test('renders the claim chip with claimant and elapsed time for a claimed task', () => {
  const element = render({ ...baseTask, claimedBy: 'agent-7', claimedAt: ago(4 * MINUTE) });
  const chip = element.querySelector('.task-claim-timer');

  expect(chip).not.toBeNull();
  expect(chip.textContent).toContain('agent-7');
  expect(chip.textContent).toContain('4m');
  expect(chip.querySelector('.task-assignee').textContent).toBe('AG');
  expect(chip.querySelector('.task-claim-name').textContent).toBe('agent-7');
  expect(chip.querySelector('.task-claim-elapsed').textContent).toBe('4m');
  expect(chip.getAttribute('data-claim-start')).toBe(String(NOW.getTime() - 4 * MINUTE));
  expect(chip.getAttribute('data-claim-end')).toBeNull();
});

test('shows no claim chip for an unclaimed task', () => {
  const element = render(baseTask);
  expect(element.querySelector('.task-claim-timer')).toBeNull();
});

test('shows no claim chip in a column without a timing rule', () => {
  const element = render({
    ...baseTask,
    column: FIXED_COLUMNS[0].id,
    claimedBy: 'agent-7',
    claimedAt: ago(10 * MINUTE)
  });
  expect(element.querySelector('.task-claim-timer')).toBeNull();
});

test('keeps the plain assignee initials chip when there is no claim timing', () => {
  const element = render({ ...baseTask, assignee: 'Ada Lovelace' });
  const assignee = element.querySelector('.task-assignee');

  expect(assignee).not.toBeNull();
  expect(assignee.textContent).toBe('AL');
  expect(assignee.getAttribute('title')).toBe('Assignee: Ada Lovelace');
  expect(element.querySelector('.task-claim-timer')).toBeNull();
});

test('falls back to the assignee as claimant when claimedBy is empty', () => {
  const element = render({
    ...baseTask,
    assignee: 'Ada Lovelace',
    columnHistory: [{ column: IN_PROGRESS_COLUMN_ID, at: ago(10 * MINUTE) }]
  });
  const chip = element.querySelector('.task-claim-timer');

  expect(chip.querySelector('.task-assignee').textContent).toBe('AL');
  expect(chip.querySelector('.task-claim-name').textContent).toBe('Ada Lovelace');
  expect(chip.querySelector('.task-claim-elapsed').textContent).toBe('10m');
  expect(chip.getAttribute('title')).toBe('Assignee: Ada Lovelace');
});

test('the shared tick updates only the elapsed text', () => {
  const element = render({ ...baseTask, claimedBy: 'agent-7', claimedAt: ago(4 * MINUTE + 40_000) });
  const chip = element.querySelector('.task-claim-timer');
  const taskCountBefore = document.querySelectorAll('.task').length;

  expect(chip.querySelector('.task-claim-elapsed').textContent).toBe('4m');

  startClaimTicker();
  vi.advanceTimersByTime(30 * 1000);

  expect(chip.querySelector('.task-claim-elapsed').textContent).toBe('5m');
  expect(chip.querySelector('.task-claim-name').textContent).toBe('agent-7');
  expect(element.querySelector('.task-claim-timer')).toBe(chip);
  expect(document.querySelectorAll('.task').length).toBe(taskCountBefore);
});

test('the tick skips hidden documents and catches up when visible again', () => {
  const element = render({ ...baseTask, claimedBy: 'agent-7', claimedAt: ago(4 * MINUTE + 40_000) });
  const elapsed = element.querySelector('.task-claim-elapsed');

  startClaimTicker();
  setHidden(true);
  vi.advanceTimersByTime(60 * 1000);
  expect(elapsed.textContent).toBe('4m');

  setHidden(false);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(elapsed.textContent).toBe('5m');
});

test('starting the ticker twice does not leave extra intervals behind', () => {
  const element = render({ ...baseTask, claimedBy: 'agent-7', claimedAt: ago(4 * MINUTE + 40_000) });
  const elapsed = element.querySelector('.task-claim-elapsed');

  startClaimTicker();
  startClaimTicker();
  stopClaimTicker();
  vi.advanceTimersByTime(30 * 1000);
  expect(elapsed.textContent).toBe('4m');

  startClaimTicker();
  vi.advanceTimersByTime(30 * 1000);
  expect(elapsed.textContent).toBe('5m');
});

test('freezes the elapsed time for a blocked task', () => {
  const element = render({
    ...baseTask,
    column: BLOCKED_COLUMN_ID,
    claimedBy: 'agent-7',
    claimedAt: ago(2 * 60 * MINUTE),
    blockedAt: ago(60 * MINUTE)
  });
  const chip = element.querySelector('.task-claim-timer');

  expect(chip.querySelector('.task-claim-elapsed').textContent).toBe('1h 00m');
  expect(chip.getAttribute('data-claim-end')).toBe(String(NOW.getTime() - 60 * MINUTE));

  startClaimTicker();
  vi.advanceTimersByTime(30 * 1000);
  expect(chip.querySelector('.task-claim-elapsed').textContent).toBe('1h 00m');
});

test('freezes the elapsed time for a finished task at doneDate', () => {
  const element = render({
    ...baseTask,
    column: 'done-column',
    claimedBy: 'agent-7',
    claimedAt: ago(3 * 60 * MINUTE),
    doneDate: ago(60 * MINUTE)
  });
  const chip = element.querySelector('.task-claim-timer');

  expect(chip.querySelector('.task-claim-elapsed').textContent).toBe('2h 00m');
});
