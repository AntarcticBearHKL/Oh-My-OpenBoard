import { test, expect, beforeEach } from 'vitest';
import { resetLocalStorage } from './setup.js';
import { createBoard, loadColumns, loadTasks, saveTasks } from '../../src/modules/storage.js';
import { addColumn, toggleColumnCollapsed, deleteColumn } from '../../src/modules/columns.js';

beforeEach(() => {
  resetLocalStorage();
  createBoard('Test');
});

test('columns are locked to the four fixed columns', () => {
  const names = loadColumns().map((c) => c.name);
  expect(names).toEqual(['Backlog', 'In Progress', 'Blocked', 'Finished']);
});


test('toggleColumnCollapsed toggles from false to true', () => {
  const col = loadColumns()[0];
  expect(col.collapsed).toBe(false);
  expect(toggleColumnCollapsed(col.id)).toBe(true);
  expect(loadColumns().find((c) => c.id === col.id).collapsed).toBe(true);
});

test('toggleColumnCollapsed toggles from true to false', () => {
  const col = loadColumns()[0];
  toggleColumnCollapsed(col.id);
  toggleColumnCollapsed(col.id);
  expect(loadColumns().find((c) => c.id === col.id).collapsed).toBe(false);
});

test('toggleColumnCollapsed returns false for non-existent column', () => {
  expect(toggleColumnCollapsed('non-existent')).toBe(false);
});

test('toggleColumnCollapsed returns false for empty ID', () => {
  expect(toggleColumnCollapsed('')).toBe(false);
});






