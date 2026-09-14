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
  updateTask: mocks.updateTask,
  setTaskBlockedReason: mocks.setTaskBlockedReason,
  addAnnotation: mocks.addAnnotation,
  removeAnnotation: mocks.removeAnnotation,
  isTaskLocked: mocks.isTaskLocked
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
          <span id="task-summary-type" class="task-type task-type--task"></span>
          <span id="task-summary-estimate" class="task-summary-chip hidden"></span>
          <span id="task-summary-priority" class="task-priority priority-none"></span>
          <span id="task-summary-due" class="task-summary-chip hidden"></span>
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
            <div class="form-group">
              <label for="task-priority">Priority</label>
              <select id="task-priority">
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="none" selected>None</option>
              </select>
            </div>
            <div class="form-group"><label for="task-due-date">Due Date</label><input id="task-due-date" type="date"></div>
            <div class="form-group">
              <label for="task-column">Column</label>
              <select id="task-column">
                <option value="todo">To Do</option>
                <option value="inprogress">In Progress</option>
              </select>
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
            <div class="form-group"><label for="task-assignee">Assignee</label><input id="task-assignee" type="text"></div>
            <div class="form-group">
              <label for="task-parent">Parent (Epic)</label>
              <select id="task-parent"><option value="">None</option></select>
            </div>
          </div>
          <div class="task-form-column-right">
            <fieldset class="form-group">
              <legend>Labels</legend>
              <div id="task-active-labels"></div>
              <input type="text" id="task-label-search">
              <button id="task-add-label-btn" type="button"></button>
              <div id="task-labels-selection"></div>
            </fieldset>
            <fieldset class="form-group" id="task-relationships-fieldset">
              <legend>Relationships</legend>
              <div id="task-active-relationships"></div>
              <select id="task-relationship-type"><option value="related">Related</option></select>
              <div class="rel-type-tooltip" id="rel-type-tooltip"></div>
              <input type="text" id="task-relationship-search">
              <div id="task-relationship-results" hidden></div>
            </fieldset>
            <fieldset class="form-group" id="task-subtasks-fieldset">
              <legend>Sub-tasks <span id="task-subtasks-progress-legend" hidden></span></legend>
              <ul id="task-subtasks-list"></ul>
              <input type="text" id="task-subtask-input">
            </fieldset>
            <fieldset class="form-group" id="task-acceptance-fieldset">
              <legend>Acceptance criteria <span id="task-acceptance-progress" hidden></span></legend>
              <ul id="task-acceptance-list"></ul>
              <input type="text" id="task-acceptance-input">
            </fieldset>
            <fieldset class="form-group" id="task-comments-fieldset">
              <legend>Comments <span id="task-comments-count" hidden></span></legend>
              <ul id="task-comments-list"></ul>
              <div class="task-comment-add-row">
                <input type="text" id="task-comment-author">
                <input type="text" id="task-comment-input">
                <button type="button" id="task-comment-add-btn">Add</button>
              </div>
            </fieldset>
            <fieldset class="form-group" id="task-attachments-fieldset">
              <legend>Attachments</legend>
              <ul id="task-attachments-list"></ul>
              <div class="task-attachment-add-row">
                <input type="text" id="task-attachment-name">
                <input type="url" id="task-attachment-url">
                <button type="button" id="task-attachment-add-btn">Add</button>
              </div>
            </fieldset>
            <fieldset class="form-group" id="task-custom-fields-fieldset">
              <legend>Custom fields</legend>
              <ul id="task-custom-fields-list"></ul>
              <div class="task-custom-field-add-row">
                <input type="text" id="task-custom-field-key">
                <input type="text" id="task-custom-field-value">
                <button type="button" id="task-custom-field-add-btn">Add</button>
              </div>
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
  priority: 'high',
  dueDate: '2026-02-01',
  type: 'bug',
  estimate: 5,
  assignee: 'agent-7',
  labels: [],
  subTasks: [],
  relationships: [],
  acceptanceCriteria: [],
  comments: [],
  attachments: [],
  customFields: {},
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

test('edit modal leads with key, type, estimate, priority, due date and column', () => {
  mocks.loadTasks.mockReturnValue([TASK]);
  initializeTaskModalHandlers(() => {});
  showEditModal('t1');

  const key = document.getElementById('task-modal-key');
  expect(key.textContent).toBe('OA-7');
  expect(key.classList.contains('hidden')).toBe(false);

  const type = document.getElementById('task-summary-type');
  expect(type.textContent).toBe('Bug');
  expect(type.classList.contains('task-type--bug')).toBe(true);
  expect(document.getElementById('task-summary-estimate').textContent).toBe('5 pts');
  expect(document.getElementById('task-summary-priority').textContent).toBe('high');
  expect(document.getElementById('task-summary-due').textContent).toContain('Due');
  expect(document.getElementById('task-summary-column').textContent).toBe('In To Do');
  expect(document.getElementById('task-summary').classList.contains('hidden')).toBe(false);
});

test('an In Progress task locks AI fields but keeps annotations editable', () => {
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
    'task-assignee',
    'task-priority',
    'task-due-date',
    'task-label-search',
    'task-subtask-input',
    'task-acceptance-input',
    'task-comment-input',
    'task-attachment-url',
    'task-custom-field-key',
    'task-submit-btn'
  ].forEach((id) => {
    expect(document.getElementById(id).disabled, id).toBe(true);
  });

  expect(document.getElementById('task-annotation-input').disabled).toBe(false);
  expect(document.getElementById('task-annotation-add-btn').disabled).toBe(false);

  const notice = document.getElementById('task-lock-notice');
  expect(notice.classList.contains('hidden')).toBe(false);
  expect(notice.textContent).toBe('Subagent agent-7 is working on this task — content is locked.');

  expect(document.getElementById('task-claim-chip').classList.contains('hidden')).toBe(false);
  expect(document.getElementById('task-claim-agent').textContent).toBe('agent-7');

  const input = document.getElementById('task-annotation-input');
  input.value = 'Still here';
  fireEvent.click(document.getElementById('task-annotation-add-btn'));
  expect(mocks.addAnnotation).toHaveBeenCalledWith('t1', 'Still here', 'human');
});

test('add mode hides the summary, claim chip and annotations sections', () => {
  initializeTaskModalHandlers(() => {});
  showModal('todo');

  expect(document.getElementById('task-summary').classList.contains('hidden')).toBe(true);
  expect(document.getElementById('task-annotations-fieldset').classList.contains('hidden')).toBe(true);
  expect(document.getElementById('task-modal-key').classList.contains('hidden')).toBe(true);
  expect(document.getElementById('task-claim-chip').classList.contains('hidden')).toBe(true);
  expect(document.getElementById('task-lock-notice').classList.contains('hidden')).toBe(true);
});
