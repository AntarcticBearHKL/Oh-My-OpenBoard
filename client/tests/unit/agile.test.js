import { test, expect } from 'vitest';
import {
  DEFAULT_TASK_TYPE,
  STALE_AFTER_DAYS,
  boardKeyPrefix,
  isBlockedColumnId,
  isTaskStale,
  nextTaskKey,
  normalizeAcceptanceCriteria,
  normalizeAttachments,
  normalizeComments,
  normalizeCustomFields,
  normalizeEstimate,
  normalizeTaskType,
  taskAgeDays
} from '../../src/modules/agile.js';

// ── normalizeTaskType ───────────────────────────────────────────────

test('normalizeTaskType accepts the four agile types', () => {
  expect(normalizeTaskType('story')).toBe('story');
  expect(normalizeTaskType('bug')).toBe('bug');
  expect(normalizeTaskType('task')).toBe('task');
  expect(normalizeTaskType('spike')).toBe('spike');
});

test('normalizeTaskType is case-insensitive and trims', () => {
  expect(normalizeTaskType(' BUG ')).toBe('bug');
  expect(normalizeTaskType('Spike')).toBe('spike');
});

test('normalizeTaskType falls back to task for invalid values', () => {
  expect(normalizeTaskType('epic')).toBe(DEFAULT_TASK_TYPE);
  expect(normalizeTaskType('')).toBe(DEFAULT_TASK_TYPE);
  expect(normalizeTaskType(null)).toBe(DEFAULT_TASK_TYPE);
  expect(normalizeTaskType(42)).toBe(DEFAULT_TASK_TYPE);
});

// ── normalizeEstimate ───────────────────────────────────────────────

test('normalizeEstimate keeps finite numbers including zero', () => {
  expect(normalizeEstimate(5)).toBe(5);
  expect(normalizeEstimate(0)).toBe(0);
  expect(normalizeEstimate(2.5)).toBe(2.5);
  expect(normalizeEstimate('8')).toBe(8);
});

test('normalizeEstimate returns null for empty or invalid values', () => {
  expect(normalizeEstimate(null)).toBeNull();
  expect(normalizeEstimate(undefined)).toBeNull();
  expect(normalizeEstimate('')).toBeNull();
  expect(normalizeEstimate('abc')).toBeNull();
  expect(normalizeEstimate(Infinity)).toBeNull();
});

// ── normalizeAcceptanceCriteria ─────────────────────────────────────

test('normalizeAcceptanceCriteria keeps entries and coerces done', () => {
  const result = normalizeAcceptanceCriteria([
    { id: 'a1', text: ' Works offline ', done: true },
    { id: 'a2', text: 'Syncs', done: 'yes' }
  ]);

  expect(result).toHaveLength(2);
  expect(result[0]).toEqual({ id: 'a1', text: 'Works offline', done: true });
  expect(result[1]).toEqual({ id: 'a2', text: 'Syncs', done: false });
});

test('normalizeAcceptanceCriteria generates missing ids and drops empty text', () => {
  const result = normalizeAcceptanceCriteria([
    { text: 'No id' },
    { id: 'a2', text: '   ' },
    null
  ]);

  expect(result).toHaveLength(1);
  expect(result[0].text).toBe('No id');
  expect(typeof result[0].id).toBe('string');
  expect(result[0].id.length).toBeGreaterThan(0);
});

test('normalizeAcceptanceCriteria returns [] for non-arrays', () => {
  expect(normalizeAcceptanceCriteria(null)).toEqual([]);
  expect(normalizeAcceptanceCriteria('nope')).toEqual([]);
});

// ── normalizeComments ───────────────────────────────────────────────

test('normalizeComments defaults the author to You and preserves timestamps', () => {
  const result = normalizeComments([
    { id: 'c1', text: 'Hello', at: '2026-01-02T03:04:05.000Z' }
  ]);

  expect(result[0].author).toBe('You');
  expect(result[0].at).toBe('2026-01-02T03:04:05.000Z');
});

test('normalizeComments stamps a missing timestamp and drops empty text', () => {
  const result = normalizeComments([{ text: 'Hi' }, { text: '   ' }]);

  expect(result).toHaveLength(1);
  expect(Number.isNaN(new Date(result[0].at).getTime())).toBe(false);
});

// ── normalizeAttachments ────────────────────────────────────────────

test('normalizeAttachments keeps name, url and optional metadata', () => {
  const result = normalizeAttachments([
    { id: 'at1', name: 'Spec', url: 'https://example.com/spec.pdf', size: 1234, type: 'pdf' }
  ]);

  expect(result[0]).toEqual({
    id: 'at1',
    name: 'Spec',
    url: 'https://example.com/spec.pdf',
    size: 1234,
    type: 'pdf'
  });
});

test('normalizeAttachments omits missing size/type and filters incomplete entries', () => {
  const result = normalizeAttachments([
    { name: 'Doc', url: 'https://example.com/doc' },
    { name: 'No URL' },
    { url: 'https://example.com/nameless' }
  ]);

  expect(result).toHaveLength(1);
  expect(result[0].size).toBeUndefined();
  expect(result[0].type).toBeUndefined();
});

// ── normalizeCustomFields ───────────────────────────────────────────

test('normalizeCustomFields trims keys and preserves values', () => {
  const result = normalizeCustomFields({ ' Sprint ': '12', Points: 3, Flag: true });

  expect(result).toEqual({ Sprint: '12', Points: 3, Flag: true });
});

test('normalizeCustomFields drops empty keys and non-objects', () => {
  expect(normalizeCustomFields({ '   ': 'x', Ok: 'y' })).toEqual({ Ok: 'y' });
  expect(normalizeCustomFields(null)).toEqual({});
  expect(normalizeCustomFields(['a'])).toEqual({});
});

// ── boardKeyPrefix / nextTaskKey ────────────────────────────────────

test('boardKeyPrefix uses initials for multi-word names', () => {
  expect(boardKeyPrefix('Default Board')).toBe('DB');
  expect(boardKeyPrefix('My Board')).toBe('MB');
  expect(boardKeyPrefix('Alpha Beta Gamma Delta Epsilon')).toBe('ABGD');
});

test('boardKeyPrefix uses the first three chars for single-word names', () => {
  expect(boardKeyPrefix('Test')).toBe('TES');
  expect(boardKeyPrefix('Work')).toBe('WOR');
  expect(boardKeyPrefix('x')).toBe('X');
});

test('boardKeyPrefix strips non-alphanumerics and falls back to BRD', () => {
  expect(boardKeyPrefix('My-Board')).toBe('MB');
  expect(boardKeyPrefix('Sprint #4!')).toBe('S4');
  expect(boardKeyPrefix('')).toBe('BRD');
  expect(boardKeyPrefix('   ')).toBe('BRD');
  expect(boardKeyPrefix(null)).toBe('BRD');
});

test('nextTaskKey starts at 1 for a fresh board', () => {
  expect(nextTaskKey('Default Board', [])).toBe('DB-1');
});

test('nextTaskKey increments past the highest matching suffix', () => {
  const tasks = [{ key: 'DB-3' }, { key: 'DB-1' }, { key: 'TES-9' }];
  expect(nextTaskKey('Default Board', tasks)).toBe('DB-4');
});

test('nextTaskKey ignores malformed or foreign keys', () => {
  const tasks = [{ key: 'DB-x' }, { key: 'DB-2-extra' }, { key: null }, {}];
  expect(nextTaskKey('Default Board', tasks)).toBe('DB-1');
});

// ── isBlockedColumnId ───────────────────────────────────────────────

test('isBlockedColumnId matches the Blocked column by name', () => {
  const columns = [
    { id: 'todo', name: 'To Do' },
    { id: 'blocked', name: 'Blocked' }
  ];

  expect(isBlockedColumnId('blocked', columns)).toBe(true);
  expect(isBlockedColumnId('todo', columns)).toBe(false);
  expect(isBlockedColumnId('missing', columns)).toBe(false);
  expect(isBlockedColumnId('', columns)).toBe(false);
  expect(isBlockedColumnId('blocked', null)).toBe(false);
});

// ── taskAgeDays / isTaskStale ───────────────────────────────────────

const NOW = new Date('2026-06-15T12:00:00Z');

test('taskAgeDays counts whole days since creationDate', () => {
  expect(taskAgeDays({ creationDate: '2026-06-15T08:00:00Z' }, NOW)).toBe(0);
  expect(taskAgeDays({ creationDate: '2026-06-05T12:00:00Z' }, NOW)).toBe(10);
});

test('taskAgeDays returns null without a valid creationDate', () => {
  expect(taskAgeDays({}, NOW)).toBeNull();
  expect(taskAgeDays({ creationDate: 'not-a-date' }, NOW)).toBeNull();
});

test('isTaskStale flags tasks unchanged for more than 14 days', () => {
  expect(isTaskStale({ changeDate: '2026-05-31T12:00:00Z' }, NOW)).toBe(true);
  expect(isTaskStale({ changeDate: '2026-06-10T12:00:00Z' }, NOW)).toBe(false);
  expect(STALE_AFTER_DAYS).toBe(14);
});

test('isTaskStale falls back to creationDate and ignores missing dates', () => {
  expect(isTaskStale({ creationDate: '2026-01-01T00:00:00Z' }, NOW)).toBe(true);
  expect(isTaskStale({}, NOW)).toBe(false);
});
