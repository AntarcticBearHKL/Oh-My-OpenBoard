import { test, expect, beforeEach } from 'vitest';
import { resetLocalStorage } from './setup.js';
import { createBoard, loadColumns, loadTasks, saveTasks } from '../../src/modules/storage.js';
import { addColumn, toggleColumnCollapsed, updateColumn, deleteColumn } from '../../src/modules/columns.js';

beforeEach(() => {
  resetLocalStorage();
  createBoard('Test');
});

test('columns are locked to the four fixed columns', () => {
  const names = loadColumns().map((c) => c.name);
  expect(names).toEqual(['Backlog', 'In Progress', 'Blocked', 'Archived']);
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

test('updateColumn updates color while the fixed name is preserved', () => {
  const col = loadColumns()[0];
  updateColumn(col.id, 'Updated Name', '#00ff00');
  const updated = loadColumns().find((c) => c.id === col.id);
  expect(updated.name).toBe(col.name);
  expect(updated.color).toBe('#00ff00');
});

test('updateColumn does nothing for empty name', () => {
  const col = loadColumns()[0];
  const originalName = col.name;
  updateColumn(col.id, '', '#00ff00');
  expect(loadColumns().find((c) => c.id === col.id).name).toBe(originalName);
});


test('updateColumn persists a WIP limit change', () => {
  const id = loadColumns()[0].id;
  updateColumn(id, 'Backlog', '#ff0000', 8);
  expect(loadColumns().find((c) => c.id === id).wipLimit).toBe(8);
});

test('updateColumn accepts a limit below the current task count', () => {
  const id = loadColumns()[0].id;
  saveTasks([
    { id: 'a', title: 'a', column: id, order: 1 },
    { id: 'b', title: 'b', column: id, order: 2 },
    { id: 'c', title: 'c', column: id, order: 3 }
  ]);

  updateColumn(id, 'Backlog', '#ff0000', 1);
  expect(loadColumns().find((c) => c.id === id).wipLimit).toBe(1);
  expect(loadTasks().filter((t) => t.column === id)).toHaveLength(3);
});

test('omitting the WIP limit on updateColumn preserves the existing one', () => {
  const id = loadColumns()[0].id;
  updateColumn(id, 'Backlog', '#ff0000', 3);
  updateColumn(id, 'Backlog', '#00ff00');
  const col = loadColumns().find((c) => c.id === id);
  expect(col.wipLimit).toBe(3);
  expect(col.color).toBe('#00ff00');
});
