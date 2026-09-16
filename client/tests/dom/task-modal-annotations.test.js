import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';
import { mountToBody } from './setup.js';

const mocks = vi.hoisted(() => ({
  addTask: vi.fn(),
  updateTask: vi.fn(),
  setTaskBlockedReason: vi.fn(),
  addAnnotation: vi.fn(),
  removeAnnotation: vi.fn(() => true),
  isTaskLocked: vi.fn(() => false),
  promptDialog: vi.fn(async () => null),
  loadTasks: vi.fn(() => []),
  loadColumns: vi.fn(() => [
    { id: 'todo', name: 'To Do' },
    { id: 'inprogress', name: 'In Progress' }
  ]),
  emit: vi.fn()
}));

vi.mock('../../src/modules/tasks.js', () => ({
  addTask: mocks.addTask,
  setTaskBlockedReason: mocks.setTaskBlockedReason,
  addAnnotation: mocks.addAnnotation,
  removeAnnotation: mocks.removeAnnotation,
  isTaskLocked: mocks.isTaskLocked
}));

vi.mock('../../src/modules/task-update.js', () => ({
  updateTask: mocks.updateTask
}));

vi.mock('../../src/modules/storage.js', () => ({
  isDoneColumnId: () => false,
  loadLabels: () => [],
  loadColumns: mocks.loadColumns,
  loadSettings: () => ({}),
  loadTasks: mocks.loadTasks
}));

vi.mock('../../src/modules/icons.js', () => ({ renderIcons: vi.fn() }));

vi.mock('../../src/modules/validation.js', () => ({
  validateAndShowTaskTitleError: () => true,
  clearFieldError: vi.fn()
}));

vi.mock('../../src/modules/events.js', () => ({
  emit: mocks.emit,
  DATA_CHANGED: 'data:changed'
}));

vi.mock('../../src/modules/dialog.js', () => ({
  promptDialog: mocks.promptDialog
}));

vi.mock('../../src/modules/render.js', () => ({
  renderBoard: vi.fn()
}));

vi.mock('sortablejs', () => ({
  default: vi.fn(function Sortable() {
    this.destroy = vi.fn();
  })
}));

import { initializeTaskModalHandlers, showEditModal, showModal } from '../../src/modules/task-modal.js';

const FIXTURE = `
  <div id="task-modal" class="modal hidden">
    <div class="modal-backdrop" data-close-modal></div>
    <article class="modal-content task-modal-content">
      <header class="modal-header-row">
        <div class="task-modal-heading">
          <span id="task-modal-key" class="task-modal-key hidden"></span>
          <h3 id="task-modal-title">Add New Task</h3>
        </div>
        <div class="modal-header-actions">
          <button id="task-fullpage-btn" type="button" class="btn-small hidden"></button>
          <button id="task-close-btn" type="button" class="btn-small"></button>
        </div>
      </header>
      <section id="task-summary" class="task-summary hidden" aria-label="Task summary">
        <div class="task-summary-badges">
          <span id="task-summary-column" class="task-summary-chip hidden"></span>
        </div>
        <div id="task-claim-chip" class="task-claim-chip hidden">
          <span id="task-claim-agent"></span>
          <span id="task-claim-time"></span>
        </div>
      </section>
      <div id="task-lock-notice" class="task-lock-notice hidden" role="status"></div>
      <section id="task-annotations-fieldset" class="task-annotations hidden">
        <h4 id="task-annotations-title" class="task-annotations-title">
          Annotations
          <span id="task-annotations-count" class="annotations-count hidden"></span>
        </h4>
        <ul id="task-annotations-list" class="annotations-list" role="list"></ul>
        <div class="task-annotation-add-row">
          <input type="text" id="task-annotation-input">
          <button type="button" id="task-annotation-add-btn" class="btn-small">Add</button>
        </div>
      </section>
      <form id="task-form" novalidate>
        <div class="task-form-columns">
          <div class="task-form-column-left">
            <div class="form-group"><label for="task-title">Title</label><input id="task-title" type="text"></div>
            <div class="form-group">
              <label for="task-description">Description</label>
              <textarea id="task-description"></textarea>
              <div id="task-description-links" hidden></div>
            </div>
            <div class="task-form-grid">
              <div class="form-group">
                <label for="task-type">Type</label>
                <select id="task-type">
                  <option value="story">Story</option>
                  <option value="bug">Bug</option>
                  <option value="task" selected>Task</option>
                  <option value="spike">Spike</option>
                </select>
              </div>
              <div class="form-group"><label for="task-estimate">Estimate</label><input id="task-estimate" type="number"></div>
            </div>
          </div>
          <div class="task-form-column-right">
            <fieldset class="form-group" id="task-acceptance-fieldset">
              <legend>Acceptance criteria <span id="task-acceptance-progress" hidden></span></legend>
              <ul id="task-acceptance-list"></ul>
              <div class="task-acceptance-add-row">
                <input type="text" id="task-acceptance-input">
                <button type="button" id="task-acceptance-add-btn">Add</button>
              </div>
            </fieldset>
            <fieldset class="form-group" id="task-comments-fieldset">
              <legend>Notes to the agent <span id="task-comments-count" hidden></span></legend>
              <ul id="task-comments-list"></ul>
              <div class="task-comment-add-row">
                <input type="text" id="task-comment-author">
                <input type="text" id="task-comment-input">
                <button type="button" id="task-comment-add-btn">Add</button>
              </div>
            </fieldset>
            <fieldset class="form-group" id="task-relationships-fieldset">
              <legend>Relationships</legend>
              <div id="task-active-relationships"></div>
              <select id="task-relationship-type"><option value="related">Related</option></select>
              <div class="rel-type-tooltip" id="rel-type-tooltip"></div>
              <input type="text" id="task-relationship-search">
              <div id="task-relationship-results" hidden></div>
            </fieldset>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" id="cancel-task-btn" class="btn btn-secondary">Cancel</button>
          <button type="submit" id="task-submit-btn" class="btn btn-primary">Add Task</button>
        </div>
      </form>
    </article>
  </div>
`;

const TASK = {
  id: 't1',
  key: 'OA-7',
  title: 'Wire the annotation channel',
  description: 'Agent-authored description',
  column: 'todo',
  type: 'bug',
  estimate: 5,
  assignee: 'agent-7',
  relationships: [],
  acceptanceCriteria: [],
  comments: [],
  annotations: [
    { id: 'a1', text: 'Check the API contract', author: 'human', at: '2026-01-02T10:00:00.000Z' }
  ],
  claimedBy: 'agent-7',
  claimedAt: '2026-01-02T09:00:00.000Z',
  creationDate: '2026-01-01T00:00:00.000Z',
  changeDate: '2026-01-01T00:00:00.000Z'
};

beforeEach(() => {
  mountToBody(FIXTURE);
  mocks.addAnnotation.mockReset();
  mocks.removeAnnotation.mockReset();
  mocks.removeAnnotation.mockReturnValue(true);
  mocks.isTaskLocked.mockReset();
  mocks.isTaskLocked.mockReturnValue(false);
  mocks.updateTask.mockReset();
  mocks.loadTasks.mockReset();
  mocks.loadTasks.mockReturnValue([]);
  mocks.loadColumns.mockClear();
  localStorage.clear();
});

test('edit modal renders the stored annotations with text, author and time', () => {
  mocks.loadTasks.mockReturnValue([TASK]);
  initializeTaskModalHandlers(() => {});
  showEditModal('t1');

  const items = document.querySelectorAll('#task-annotations-list .annotation-item');
  expect(items).toHaveLength(1);
  expect(items[0].querySelector('.annotation-text').textContent).toBe('Check the API contract');
  expect(items[0].querySelector('.annotation-author').textContent).toBe('human');
  expect(items[0].querySelector('.annotation-at').textContent).not.toBe('');
  expect(document.getElementById('task-annotations-fieldset').classList.contains('hidden')).toBe(false);
});

test('adding an annotation calls addAnnotation and appends it to the list', () => {
  mocks.loadTasks.mockReturnValue([TASK]);
  mocks.addAnnotation.mockReturnValue({
    id: 'a2',
    text: 'Please rebase on main',
    author: 'human',
    at: '2026-01-03T10:00:00.000Z'
  });
  initializeTaskModalHandlers(() => {});
  showEditModal('t1');

  const input = document.getElementById('task-annotation-input');
  input.value = 'Please rebase on main';
  fireEvent.click(document.getElementById('task-annotation-add-btn'));

  expect(mocks.addAnnotation).toHaveBeenCalledWith('t1', 'Please rebase on main', 'human');
  const items = document.querySelectorAll('#task-annotations-list .annotation-item');
  expect(items).toHaveLength(2);
  expect(items[1].querySelector('.annotation-text').textContent).toBe('Please rebase on main');
  expect(input.value).toBe('');
});

test('pressing Enter in the annotation input adds the annotation', () => {
  mocks.loadTasks.mockReturnValue([TASK]);
  mocks.addAnnotation.mockReturnValue({
    id: 'a3',
    text: 'Ship it',
    author: 'human',
    at: '2026-01-03T11:00:00.000Z'
  });
  initializeTaskModalHandlers(() => {});
  showEditModal('t1');

  const input = document.getElementById('task-annotation-input');
  input.value = 'Ship it';
  fireEvent.keyDown(input, { key: 'Enter' });

  expect(mocks.addAnnotation).toHaveBeenCalledWith('t1', 'Ship it', 'human');
  expect(document.querySelectorAll('#task-annotations-list .annotation-item')).toHaveLength(2);
});

test('removing an annotation calls removeAnnotation and drops the entry', () => {
  mocks.loadTasks.mockReturnValue([TASK]);
  initializeTaskModalHandlers(() => {});
  showEditModal('t1');

  fireEvent.click(document.querySelector('#task-annotations-list .annotation-remove-btn'));

  expect(mocks.removeAnnotation).toHaveBeenCalledWith('t1', 'a1');
  expect(document.querySelectorAll('#task-annotations-list .annotation-item')).toHaveLength(0);
  expect(document.querySelector('#task-annotations-list .annotations-empty')).not.toBeNull();
});

test('edit modal leads with the key, the read-only column and the claimant', () => {
  mocks.loadTasks.mockReturnValue([TASK]);
  initializeTaskModalHandlers(() => {});
  showEditModal('t1');

  const key = document.getElementById('task-modal-key');
  expect(key.textContent).toBe('OA-7');
  expect(key.classList.contains('hidden')).toBe(false);

  expect(document.getElementById('task-summary').classList.contains('hidden')).toBe(false);
  expect(document.getElementById('task-summary-column').textContent).toBe('In To Do');
  expect(document.getElementById('task-claim-chip').classList.contains('hidden')).toBe(false);
  expect(document.getElementById('task-claim-agent').textContent).toBe('agent-7');
  expect(document.getElementById('task-claim-time').textContent).not.toBe('');
});

test('edit modal no longer offers priority, due date, labels, sub-tasks, attachments, custom fields or a column selector', () => {
  mocks.loadTasks.mockReturnValue([TASK]);
  initializeTaskModalHandlers(() => {});
  showEditModal('t1');

  [
    'task-priority',
    'task-due-date',
    'task-column',
    'task-label-search',
    'task-subtasks-list',
    'task-attachments-list',
    'task-custom-fields-list',
    'task-parent'
  ].forEach((id) => {
    expect(document.getElementById(id), id).toBeNull();
  });
});

test('an In Progress task is fully read-only, including annotations', () => {
  mocks.loadTasks.mockReturnValue([TASK]);
  mocks.isTaskLocked.mockReturnValue(true);
  mocks.addAnnotation.mockReturnValue({
    id: 'a4',
    text: 'Still here',
    author: 'human',
    at: '2026-01-04T10:00:00.000Z'
  });
  initializeTaskModalHandlers(() => {});
  showEditModal('t1');

  [
    'task-title',
    'task-description',
    'task-type',
    'task-estimate',
    'task-acceptance-input',
    'task-acceptance-add-btn',
    'task-comment-input',
    'task-submit-btn',
    'task-annotation-input',
    'task-annotation-add-btn'
  ].forEach((id) => {
    expect(document.getElementById(id).disabled, id).toBe(true);
  });


  const notice = document.getElementById('task-lock-notice');
  expect(notice.classList.contains('hidden')).toBe(false);
  expect(notice.textContent).toContain('everything is read-only, including annotations.');

  expect(document.getElementById('task-claim-chip').classList.contains('hidden')).toBe(false);
  expect(document.getElementById('task-claim-agent').textContent).toBe('agent-7');

  expect(mocks.addAnnotation).not.toHaveBeenCalled();
});

test('add mode hides the summary, claim chip and annotations sections', () => {
  initializeTaskModalHandlers(() => {});
  showModal();

  expect(document.getElementById('task-summary').classList.contains('hidden')).toBe(true);
  expect(document.getElementById('task-annotations-fieldset').classList.contains('hidden')).toBe(true);
  expect(document.getElementById('task-modal-key').classList.contains('hidden')).toBe(true);
  expect(document.getElementById('task-claim-chip').classList.contains('hidden')).toBe(true);
  expect(document.getElementById('task-lock-notice').classList.contains('hidden')).toBe(true);
});
