import { test, expect } from 'vitest';
import { claimStartMs, claimTiming, deriveElapsedMs } from '../../src/modules/claim-timer.js';
import { BLOCKED_COLUMN_ID, FIXED_COLUMNS, IN_PROGRESS_COLUMN_ID } from '../../src/modules/constants.js';

const BACKLOG_COLUMN_ID = FIXED_COLUMNS[0].id;
const DONE_FIXED_COLUMN_ID = FIXED_COLUMNS[3].id;
const NOW = new Date('2026-06-01T12:00:00.000Z');
const MINUTE = 60000;

function ago(ms) {
  return new Date(NOW.getTime() - ms).toISOString();
}

test('counts from claimedAt while the task is In Progress', () => {
  const task = { column: IN_PROGRESS_COLUMN_ID, claimedAt: ago(30 * MINUTE) };
  expect(deriveElapsedMs(task, NOW)).toBe(30 * MINUTE);
});

test('freezes at doneDate in the done column', () => {
  const task = { column: DONE_FIXED_COLUMN_ID, claimedAt: ago(60 * MINUTE), doneDate: ago(20 * MINUTE) };
  expect(deriveElapsedMs(task, NOW)).toBe(40 * MINUTE);
});

test('detects the legacy done column id by default', () => {
  const task = { column: 'done', claimedAt: ago(45 * MINUTE), doneDate: ago(15 * MINUTE) };
  expect(deriveElapsedMs(task, NOW)).toBe(30 * MINUTE);
});

test('freezes at blockedAt in the Blocked column', () => {
  const task = { column: BLOCKED_COLUMN_ID, claimedAt: ago(50 * MINUTE), blockedAt: ago(15 * MINUTE) };
  expect(deriveElapsedMs(task, NOW)).toBe(35 * MINUTE);
});

test('returns null outside the timing columns', () => {
  const task = { column: BACKLOG_COLUMN_ID, claimedAt: ago(10 * MINUTE) };
  expect(deriveElapsedMs(task, NOW)).toBeNull();
});

test('falls back to the first In Progress entry in columnHistory when claimedAt is missing', () => {
  const task = {
    column: IN_PROGRESS_COLUMN_ID,
    columnHistory: [
      { column: BACKLOG_COLUMN_ID, at: ago(90 * MINUTE) },
      { column: 'inprogress', at: ago(30 * MINUTE) },
      { column: IN_PROGRESS_COLUMN_ID, at: ago(10 * MINUTE) }
    ]
  };
  expect(claimStartMs(task)).toBe(NOW.getTime() - 30 * MINUTE);
  expect(deriveElapsedMs(task, NOW)).toBe(30 * MINUTE);
});

test('returns null when neither claimedAt nor an In Progress history entry exists', () => {
  const task = { column: IN_PROGRESS_COLUMN_ID, columnHistory: [{ column: BACKLOG_COLUMN_ID, at: ago(30 * MINUTE) }] };
  expect(claimStartMs(task)).toBeNull();
  expect(deriveElapsedMs(task, NOW)).toBeNull();
});

test('returns null when the claim start cannot be derived', () => {
  expect(deriveElapsedMs({ column: DONE_FIXED_COLUMN_ID, doneDate: ago(MINUTE) }, NOW)).toBeNull();
  expect(deriveElapsedMs({}, NOW)).toBeNull();
});

test('returns null for negative durations', () => {
  const active = { column: IN_PROGRESS_COLUMN_ID, claimedAt: ago(-5 * MINUTE) };
  expect(deriveElapsedMs(active, NOW)).toBeNull();

  const done = { column: DONE_FIXED_COLUMN_ID, claimedAt: ago(5 * MINUTE), doneDate: ago(10 * MINUTE) };
  expect(deriveElapsedMs(done, NOW)).toBeNull();
});

test('treats an unparseable claimedAt as missing and falls back to history', () => {
  const task = {
    column: IN_PROGRESS_COLUMN_ID,
    claimedAt: 'not-a-date',
    columnHistory: [{ column: IN_PROGRESS_COLUMN_ID, at: ago(12 * MINUTE) }]
  };
  expect(deriveElapsedMs(task, NOW)).toBe(12 * MINUTE);
});

test('returns null for invalid end timestamps', () => {
  const blocked = { column: BLOCKED_COLUMN_ID, claimedAt: ago(10 * MINUTE), blockedAt: 'bad' };
  expect(deriveElapsedMs(blocked, NOW)).toBeNull();

  const done = { column: DONE_FIXED_COLUMN_ID, claimedAt: ago(10 * MINUTE), doneDate: '' };
  expect(deriveElapsedMs(done, NOW)).toBeNull();

  const badHistory = {
    column: IN_PROGRESS_COLUMN_ID,
    claimedAt: null,
    columnHistory: [{ column: IN_PROGRESS_COLUMN_ID, at: 'also-bad' }]
  };
  expect(deriveElapsedMs(badHistory, NOW)).toBeNull();
});

test('accepts a millisecond timestamp for now', () => {
  const task = { column: IN_PROGRESS_COLUMN_ID, claimedAt: ago(7 * MINUTE) };
  expect(deriveElapsedMs(task, NOW.getTime())).toBe(7 * MINUTE);
});

test('claimTiming reports live windows for In Progress and frozen windows otherwise', () => {
  const active = { column: IN_PROGRESS_COLUMN_ID, claimedAt: ago(5 * MINUTE) };
  expect(claimTiming(active, NOW)).toEqual({ startMs: NOW.getTime() - 5 * MINUTE, endMs: NOW.getTime(), live: true });

  const blocked = { column: BLOCKED_COLUMN_ID, claimedAt: ago(5 * MINUTE), blockedAt: ago(2 * MINUTE) };
  expect(claimTiming(blocked, NOW)).toEqual({ startMs: NOW.getTime() - 5 * MINUTE, endMs: NOW.getTime() - 2 * MINUTE, live: false });
});
