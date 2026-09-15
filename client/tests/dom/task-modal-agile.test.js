import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/dom';
import { mountToBody } from './setup.js';
import { BLOCKED_COLUMN_ID } from '../../src/modules/constants.js';

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
    { id: '00000000-0000-4000-8000-000000000032', name: 'Blocked' }
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
    <article class="modal-content">
      <header class="modal-header-row">
        <h3 id="task-modal-title">Add New Task</h3>
        <div class="modal-header-actions">
          <button id="task-fullpage-btn" type="button" class="btn-small hidden"></button>
          <button id="task-close-btn" type="button" class="btn-small"></button>
        </div>
      </header>
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
                <option value="${BLOCKED_COLUMN_ID}">Blocked</option>
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

beforeEach(() => {
  mountToBody(FIXTURE);
  mocks.addTask.mockReset();
  mocks.updateTask.mockReset();
  mocks.setTaskBlockedReason.mockReset();
  mocks.promptDialog.mockReset();
  mocks.promptDialog.mockResolvedValue(null);
  mocks.loadTasks.mockReset();
  mocks.loadTasks.mockReturnValue([]);
  mocks.loadColumns.mockClear();
  mocks.emit.mockClear();
  localStorage.clear();
});

test('add form saves agile fields through addTask', () => {
  initializeTaskModalHandlers(() => {});
  showModal('todo');

  document.getElementById('task-title').value = 'New task';
  document.getElementById('task-type').value = 'bug';
  document.getElementById('task-estimate').value = '5';
  document.getElementById('task-assignee').value = 'Ada Lovelace';

  const acceptanceInput = document.getElementById('task-acceptance-input');
  acceptanceInput.value = 'Works offline';
  fireEvent.keyDown(acceptanceInput, { key: 'Enter' });

  document.getElementById('task-comment-author').value = 'Ada';
  document.getElementById('task-comment-input').value = 'First comment';
  fireEvent.click(document.getElementById('task-comment-add-btn'));

  document.getElementById('task-attachment-name').value = 'Spec';
  document.getElementById('task-attachment-url').value = 'https://example.com/spec.pdf';
  fireEvent.click(document.getElementById('task-attachment-add-btn'));

  document.getElementById('task-custom-field-key').value = 'Sprint';
  document.getElementById('task-custom-field-value').value = '12';
  fireEvent.click(document.getElementById('task-custom-field-add-btn'));

  fireEvent.submit(document.getElementById('task-form'));

  expect(mocks.addTask).toHaveBeenCalledTimes(1);
  const call = mocks.addTask.mock.calls[0];
  expect(call[0]).toBe('New task');

  const extra = call[8];
  expect(extra.type).toBe('bug');
  expect(extra.estimate).toBe(5);
  expect(extra.assignee).toBe('Ada Lovelace');
  expect(extra.acceptanceCriteria).toHaveLength(1);
  expect(extra.acceptanceCriteria[0]).toMatchObject({ text: 'Works offline', done: false });
  expect(extra.comments[0]).toMatchObject({ author: 'Ada', text: 'First comment' });
  expect(extra.attachments[0]).toMatchObject({ name: 'Spec', url: 'https://example.com/spec.pdf' });
  expect(extra.customFields).toEqual({ Sprint: '12' });
});

test('acceptance criteria can be toggled and removed before saving', () => {
  initializeTaskModalHandlers(() => {});
  showModal('todo');
  document.getElementById('task-title').value = 'Checklist task';

  const acceptanceInput = document.getElementById('task-acceptance-input');
  acceptanceInput.value = 'First criterion';
  fireEvent.keyDown(acceptanceInput, { key: 'Enter' });
  acceptanceInput.value = 'Second criterion';
  fireEvent.keyDown(acceptanceInput, { key: 'Enter' });

  const items = document.querySelectorAll('#task-acceptance-list .acceptance-item');
  expect(items).toHaveLength(2);

  fireEvent.click(items[0].querySelector('input[type="checkbox"]'));
  fireEvent.click(items[1].querySelector('.acceptance-remove-btn'));

  fireEvent.submit(document.getElementById('task-form'));

  const extra = mocks.addTask.mock.calls[0][8];
  expect(extra.acceptanceCriteria).toHaveLength(1);
  expect(extra.acceptanceCriteria[0]).toMatchObject({ text: 'First criterion', done: true });
});

test('editing a task into Blocked prompts for and stores a reason', async () => {
  mocks.loadTasks.mockReturnValue([
    {
      id: 't1',
      title: 'Blocked soon',
      column: 'todo',
      priority: 'none',
      labels: [],
      subTasks: [],
      relationships: [],
      creationDate: '2026-01-01T00:00:00.000Z',
      changeDate: '2026-01-01T00:00:00.000Z'
    }
  ]);
  mocks.promptDialog.mockResolvedValueOnce('Waiting on design');
  initializeTaskModalHandlers(() => {});
  showEditModal('t1');

  document.getElementById('task-column').value = BLOCKED_COLUMN_ID;
  fireEvent.submit(document.getElementById('task-form'));

  await waitFor(() => expect(mocks.setTaskBlockedReason).toHaveBeenCalledWith('t1', 'Waiting on design'));
  expect(mocks.updateTask).toHaveBeenCalledTimes(1);
  expect(mocks.promptDialog).toHaveBeenCalledTimes(1);
});

test('a normal edit does not prompt for a blocked reason', async () => {
  mocks.loadTasks.mockReturnValue([
    {
      id: 't1',
      title: 'Fine task',
      column: 'todo',
      priority: 'none',
      labels: [],
      subTasks: [],
      relationships: []
    }
  ]);
  initializeTaskModalHandlers(() => {});
  showEditModal('t1');

  fireEvent.submit(document.getElementById('task-form'));

  await waitFor(() => expect(mocks.updateTask).toHaveBeenCalledTimes(1));
  expect(mocks.promptDialog).not.toHaveBeenCalled();
  expect(mocks.setTaskBlockedReason).not.toHaveBeenCalled();
});
