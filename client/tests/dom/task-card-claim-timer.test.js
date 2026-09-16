import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mountToBody } from './setup.js';
import { IN_PROGRESS_COLUMN_ID } from '../../src/modules/constants.js';

vi.mock('../../src/modules/dialog.js', () => ({ confirmDialog: vi.fn() }));
vi.mock('../../src/modules/tasks.js', () => ({ deleteTask: vi.fn() }));
vi.mock('../../src/modules/events.js', () => ({ DATA_CHANGED: 'data:changed', emit: vi.fn() }));
vi.mock('../../src/modules/modals.js', () => ({ showEditModal: vi.fn() }));
vi.mock('../../src/modules/storage.js', () => ({
  isDoneColumnId: vi.fn((columnId) => columnId === 'done-column'),
  loadLabels: vi.fn(() => [])
}));

const { createTaskElement } = await import('../../src/modules/task-card.js');
const { startClaimTicker, stopClaimTicker, refreshClaimTimers } = await import('../../src/modules/claim-timer.js');

const NOW = new Date('2026-06-01T12:00:00.000Z');
const MINUTE = 60000;

const baseTask = {
  id: 'task-1',
  title: 'Ship the release',
  column: IN_PROGRESS_COLUMN_ID
};

function ago(ms) {
  return new Date(NOW.getTime() - ms).toISOString();
}

function render(task) {
  const element = createTaskElement(task, {});
  mountToBody(element);
  return element;
}

function mountChip(startMs, endMs) {
  const chip = document.createElement('span');
  chip.className = 'task-claim-timer';
  chip.dataset.claimStart = String(startMs);
  if (endMs !== undefined) chip.dataset.claimEnd = String(endMs);
  const elapsed = document.createElement('span');
  elapsed.className = 'task-claim-elapsed';
  chip.appendChild(elapsed);
  document.body.appendChild(chip);
  return chip;
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

test('the card renders no claimant or elapsed chip for a claimed in-progress task', () => {
  const element = render({ ...baseTask, claimedBy: 'agent-7', claimedAt: ago(4 * MINUTE) });

  expect(element.querySelector('.task-claim-timer')).toBeNull();
  expect(element.querySelector('.task-assignee')).toBeNull();
  expect(element.querySelector('.task-claim-elapsed')).toBeNull();
});

test('the shared tick refreshes the elapsed text of any claim chip in the DOM', () => {
  const chip = mountChip(NOW.getTime() - (4 * MINUTE + 40_000));

  refreshClaimTimers();
  expect(chip.querySelector('.task-claim-elapsed').textContent).toBe('4m');

  startClaimTicker();
  vi.advanceTimersByTime(30 * 1000);

  expect(chip.querySelector('.task-claim-elapsed').textContent).toBe('5m');
});

test('the tick skips hidden documents and catches up when visible again', () => {
  const chip = mountChip(NOW.getTime() - (4 * MINUTE + 40_000));

  startClaimTicker();
  setHidden(true);
  vi.advanceTimersByTime(60 * 1000);
  expect(chip.querySelector('.task-claim-elapsed').textContent).toBe('');

  setHidden(false);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(chip.querySelector('.task-claim-elapsed').textContent).toBe('5m');
});

test('starting the ticker twice does not leave extra intervals behind', () => {
  const chip = mountChip(NOW.getTime() - (4 * MINUTE + 40_000));

  startClaimTicker();
  startClaimTicker();
  stopClaimTicker();
  vi.advanceTimersByTime(30 * 1000);
  expect(chip.querySelector('.task-claim-elapsed').textContent).toBe('');

  startClaimTicker();
  vi.advanceTimersByTime(30 * 1000);
  expect(chip.querySelector('.task-claim-elapsed').textContent).toBe('5m');
});

test('a frozen end time is left alone by the tick', () => {
  const chip = mountChip(NOW.getTime() - (3 * 60 * MINUTE), NOW.getTime() - 60 * MINUTE);

  refreshClaimTimers();
  expect(chip.querySelector('.task-claim-elapsed').textContent).toBe('2h 00m');

  startClaimTicker();
  vi.advanceTimersByTime(30 * 1000);
  expect(chip.querySelector('.task-claim-elapsed').textContent).toBe('2h 00m');
});
