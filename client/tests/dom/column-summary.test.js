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
import { FIXED_COLUMNS } from '../../src/modules/constants.js';

const COLUMN = { ...FIXED_COLUMNS[0], wipLimit: 0 };

function mountColumn(column = COLUMN) {
  const columnEl = createColumnElement(column);
  document.body.appendChild(columnEl);
  return columnEl;
}

function openSummary() {
  fireEvent.click(document.querySelector('.column-summary-btn'));
  return document.querySelector('.column-summary-overlay');
}

beforeEach(() => {
  mocks.summaries = {};
  mocks.saveColumnSummary.mockClear();
  mocks.loadTasks.mockClear();
  mocks.showModal.mockClear();
});

test('column header renders the summary button next to the task counter', () => {
  const columnEl = mountColumn();
  const header = columnEl.querySelector('.column-header');
  const counter = header.querySelector('.task-counter');
  const button = header.querySelector('.column-summary-btn');

  expect(button).not.toBeNull();
  expect(counter.nextElementSibling).toBe(button);
});

test('summary button opens a full-screen dialog with the stored summary and metadata', () => {
  mocks.summaries = {
    [COLUMN.id]: {
      text: 'Two tasks left to triage.',
      at: '2026-01-02T10:00:00.000Z',
      by: 'claude-sonnet'
    }
  };
  mountColumn();

  const overlay = openSummary();

  expect(overlay).not.toBeNull();
  expect(overlay.getAttribute('role')).toBe('dialog');
  expect(overlay.getAttribute('aria-modal')).toBe('true');
  expect(overlay.querySelector('.column-summary-panel')).not.toBeNull();
  expect(overlay.querySelector('.column-summary-title').textContent).toBe('Backlog');
  expect(overlay.querySelector('.column-summary-text').textContent).toBe('Two tasks left to triage.');

  const meta = overlay.querySelector('.column-summary-meta').textContent;
  expect(meta).toContain('Updated');
  expect(meta).toContain('claude-sonnet');

  expect(document.activeElement).toBe(overlay.querySelector('.column-summary-close'));
  expect(document.body.classList.contains('column-summary-open')).toBe(true);
});

test('summary dialog shows the empty state when the column has no summary', () => {
  mountColumn();

  const overlay = openSummary();

  expect(overlay.querySelector('.column-summary-empty').textContent).toBe('No summary yet');
  expect(overlay.textContent).toContain('Agents write these over MCP.');
});

test('summary dialog closes on Escape and the close control, and restores the trigger state', () => {
  mountColumn();
  openSummary();

  fireEvent.keyDown(document, { key: 'Escape' });

  expect(document.querySelector('.column-summary-overlay')).toBeNull();
  expect(document.body.classList.contains('column-summary-open')).toBe(false);
  expect(document.querySelector('.column-summary-btn').getAttribute('aria-expanded')).toBe('false');

  openSummary();
  fireEvent.click(document.querySelector('.column-summary-close'));
  expect(document.querySelector('.column-summary-overlay')).toBeNull();
});

test('summary dialog closes on a backdrop click but stays open on a panel click', () => {
  mountColumn();
  const overlay = openSummary();

  fireEvent.click(overlay.querySelector('.column-summary-panel'));
  expect(document.querySelector('.column-summary-overlay')).not.toBeNull();

  fireEvent.click(overlay);
  expect(document.querySelector('.column-summary-overlay')).toBeNull();
});

test('clicking the summary button again closes the dialog', () => {
  mountColumn();
  const button = document.querySelector('.column-summary-btn');

  fireEvent.click(button);
  expect(document.querySelector('.column-summary-overlay')).not.toBeNull();

  fireEvent.click(button);
  expect(document.querySelector('.column-summary-overlay')).toBeNull();
});

test('the edit affordance saves a human override through saveColumnSummary', () => {
  mountColumn();
  openSummary();
  fireEvent.click(document.querySelector('.column-summary-edit'));

  const textarea = document.querySelector('.column-summary-edit-area');
  textarea.value = 'Human override text';
  fireEvent.click(document.querySelector('.column-summary-save'));

  expect(mocks.saveColumnSummary).toHaveBeenCalledWith(COLUMN.id, 'Human override text');
  expect(document.querySelector('.column-summary-text').textContent).toBe('Human override text');
});

test('the column renders its add-task control in the header and its task list', () => {
  const columnEl = mountColumn();

  expect(columnEl.querySelector('.tasks')).not.toBeNull();
  expect(columnEl.querySelector('.column-header .add-task-btn-icon')).not.toBeNull();
  expect(columnEl.querySelector('.column-add-row')).toBeNull();
  expect(columnEl.querySelector('.column-header h2').textContent).toBe('Backlog');
});

test('clicking the header add-task control opens the create-task modal for the column', () => {
  const columnEl = mountColumn();

  fireEvent.click(columnEl.querySelector('.add-task-btn-icon'));

  expect(mocks.showModal).toHaveBeenCalledWith(COLUMN.id);
});

test.each([
  FIXED_COLUMNS[1],
  FIXED_COLUMNS[2],
  FIXED_COLUMNS[3]
])('$name renders no add-task affordance', (column) => {
  const columnEl = mountColumn({ ...column, wipLimit: 0 });

  expect(columnEl.querySelector('.column-add-row')).toBeNull();
  expect(columnEl.querySelector('.add-task-btn-icon')).toBeNull();
});
