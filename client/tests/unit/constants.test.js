import { test, expect } from 'vitest';
import {
  BACKLOG_COLUMN_ID,
  BLOCKED_COLUMN_ID,
  DONE_COLUMN_ID,
  FIXED_COLUMNS,
  IN_PROGRESS_COLUMN_ID,
  DEFAULT_COLUMN_COLOR,
  MAX_LABEL_NAME_LENGTH,
  DEFAULT_APP_KEYBINDINGS,
  matchesKey
} from '../../src/modules/constants.js';

test('the board has four fixed columns in workflow order', () => {
  expect(FIXED_COLUMNS.map((column) => column.name)).toEqual(['Backlog', 'In Progress', 'Blocked', 'Finished']);
  expect(FIXED_COLUMNS[0].id).toBe(BACKLOG_COLUMN_ID);
  expect(FIXED_COLUMNS[1].id).toBe(IN_PROGRESS_COLUMN_ID);
  expect(FIXED_COLUMNS[2].id).toBe(BLOCKED_COLUMN_ID);
  expect(FIXED_COLUMNS[3].role).toBe('done');
});

test('DONE_COLUMN_ID is done', () => {
  expect(DONE_COLUMN_ID).toBe('done');
});

test('DEFAULT_COLUMN_COLOR is a valid hex color', () => {
  expect(DEFAULT_COLUMN_COLOR).toMatch(/^#[0-9a-f]{3}([0-9a-f]{3})?$/i);
});

test('MAX_LABEL_NAME_LENGTH is a positive integer', () => {
  expect(Number.isInteger(MAX_LABEL_NAME_LENGTH)).toBe(true);
  expect(MAX_LABEL_NAME_LENGTH).toBeGreaterThan(0);
});

test('open boards modal shortcut defaults to Ctrl+B', () => {
  const binding = DEFAULT_APP_KEYBINDINGS.openBoardsModal;

  expect(matchesKey({ key: 'B', ctrlKey: true }, binding)).toBe(true);
  expect(matchesKey({ key: 'B', shiftKey: true }, binding)).toBe(false);
});
