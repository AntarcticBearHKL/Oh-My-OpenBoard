import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';

const mocks = vi.hoisted(() => ({
  summaries: {},
  saveColumnSummary: vi.fn(() => true),
  loadTasks: vi.fn(() => []),
  showModal: vi.fn()
}));

vi.mock('../../src/modules/storage.js', () => ({
  loadTasks: mocks.loadTasks,
  loadColumnSummaries: () => mocks.summaries,
  saveColumnSummary: mocks.saveColumnSummary
}));

vi.mock('../../src/modules/modals.js', () => ({ showModal: mocks.showModal }));
vi.mock('../../src/modules/icons.js', () => ({ renderIcons: vi.fn() }));

import { createColumnElement } from '../../src/modules/column-element.js';

const COLUMN = { id: 'col-backlog', name: 'Backlog', color: '#3583ff', order: 1, wipLimit: 0 };

function mountColumn() {
  document.body.appendChild(createColumnElement(COLUMN));
  return document.querySelector('.task-column');
}

beforeEach(() => {
  mocks.summaries = {};
  mocks.saveColumnSummary.mockClear();
  mocks.loadTasks.mockClear();
});

test('column header renders the AI summary button next to the task counter', () => {
  const columnEl = mountColumn();
  const header = columnEl.querySelector('.column-header');
  const counter = header.querySelector('.task-counter');
  const button = header.querySelector('.column-summary-btn');

  expect(button).not.toBeNull();
  expect(counter.nextElementSibling).toBe(button);
});

test('summary button opens a popover with the stored summary and metadata', () => {
  mocks.summaries = {
    'col-backlog': {
      text: 'Two tasks left to triage.',
      at: '2026-01-02T10:00:00.000Z',
      by: 'claude-sonnet'
    }
  };
  mountColumn();

  fireEvent.click(document.querySelector('.column-summary-btn'));

  const popover = document.querySelector('.column-summary-popover');
  expect(popover).not.toBeNull();
  expect(popover.querySelector('.column-summary-text').textContent).toBe('Two tasks left to triage.');

  const meta = popover.querySelector('.column-summary-meta').textContent;
  expect(meta).toContain('Updated');
  expect(meta).toContain('claude-sonnet');
});

test('summary popover shows the empty state when the column has no summary', () => {
  mountColumn();

  fireEvent.click(document.querySelector('.column-summary-btn'));

  expect(document.querySelector('.column-summary-empty').textContent).toBe('No summary yet');
  expect(document.querySelector('.column-summary-popover').textContent).toContain('Agents write these over MCP.');
});

test('summary popover closes on Escape', () => {
  mountColumn();
  fireEvent.click(document.querySelector('.column-summary-btn'));
  expect(document.querySelector('.column-summary-popover')).not.toBeNull();

  fireEvent.keyDown(document, { key: 'Escape' });

  expect(document.querySelector('.column-summary-popover')).toBeNull();
  expect(document.querySelector('.column-summary-btn').getAttribute('aria-expanded')).toBe('false');
});

test('summary popover closes on an outside click', () => {
  mountColumn();
  fireEvent.click(document.querySelector('.column-summary-btn'));
  expect(document.querySelector('.column-summary-popover')).not.toBeNull();

  fireEvent.mouseDown(document.body);

  expect(document.querySelector('.column-summary-popover')).toBeNull();
});

test('clicking the summary button again closes the popover', () => {
  mountColumn();
  const button = document.querySelector('.column-summary-btn');

  fireEvent.click(button);
  expect(document.querySelector('.column-summary-popover')).not.toBeNull();

  fireEvent.click(button);
  expect(document.querySelector('.column-summary-popover')).toBeNull();
});

test('the edit affordance saves a human override through saveColumnSummary', () => {
  mountColumn();
  fireEvent.click(document.querySelector('.column-summary-btn'));
  fireEvent.click(document.querySelector('.column-summary-edit'));

  const textarea = document.querySelector('.column-summary-edit-area');
  textarea.value = 'Human override text';
  fireEvent.click(document.querySelector('.column-summary-save'));

  expect(mocks.saveColumnSummary).toHaveBeenCalledWith('col-backlog', 'Human override text');
  expect(document.querySelector('.column-summary-text').textContent).toBe('Human override text');
});

test('the column still renders its add-task row and task list', () => {
  const columnEl = mountColumn();

  expect(columnEl.querySelector('.tasks')).not.toBeNull();
  expect(columnEl.querySelector('.add-task-row-btn')).not.toBeNull();
  expect(columnEl.querySelector('.column-header h2').textContent).toBe('Backlog');
});
