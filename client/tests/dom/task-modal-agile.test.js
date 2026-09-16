import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/dom';
import { mountToBody } from './setup.js';

const mocks = vi.hoisted(() => ({
  addTask: vi.fn(),
  updateTask: vi.fn(),
  setTaskBlockedReason: vi.fn(),
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
  promptDialog: mocks.promptDialog,
  confirmDialog: vi.fn()
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
        <span id="task-modal-key" class="task-modal-key hidden"></span>
        <h3 id="task-modal-title">Add New Task</h3>
        <div class="modal-header-actions">
          <button id="task-fullpage-btn" type="button" class="btn-small hidden"></button>
          <button id="task-close-btn" type="button" class="btn-small"></button>
        </div>
      </header>
      <section id="task-summary" class="task-summary hidden">
        <span id="task-summary-column" class="task-summary-chip hidden"></span>
        <div id="task-claim-chip" class="task-claim-chip hidden">
          <span id="task-claim-agent"></span>
          <span id="task-claim-time"></span>
        </div>
      </section>
      <div id="task-lock-notice" class="task-lock-notice hidden" role="status"></div>
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
            <fieldset class="form-group" id="task-key-points-fieldset">
              <legend>Key points</legend>
              <ul id="task-key-points-list"></ul>
              <div class="task-key-point-add-row">
                <input type="text" id="task-key-point-input">
                <button type="button" id="task-key-point-add-btn">+</button>
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

test('add form saves title, description, type, estimate and relationships through addTask', () => {
  initializeTaskModalHandlers(() => {});
  showModal();

  document.getElementById('task-title').value = 'New task';
  document.getElementById('task-description').value = 'What the agent should do';
  document.getElementById('task-type').value = 'bug';
  document.getElementById('task-estimate').value = '5';

  fireEvent.submit(document.getElementById('task-form'));

  expect(mocks.addTask).toHaveBeenCalledTimes(1);
  const [title, description, fields] = mocks.addTask.mock.calls[0];
  expect(title).toBe('New task');
  expect(description).toBe('What the agent should do');
  expect(fields.type).toBe('bug');
  expect(fields.estimate).toBe(5);
  expect(fields.keyPoints).toEqual([]);
  expect(fields.comments).toEqual([]);
  expect(fields.relationships).toEqual([]);
  expect(Object.keys(fields).sort()).toEqual(['comments', 'estimate', 'keyPoints', 'relationships', 'type']);
});

test('the key points editor appends and removes items', () => {
  initializeTaskModalHandlers(() => {});
  showModal();
  document.getElementById('task-title').value = 'Checklist task';

  const keyPointInput = document.getElementById('task-key-point-input');
  keyPointInput.value = 'First key point';
  fireEvent.keyDown(keyPointInput, { key: 'Enter' });
  keyPointInput.value = 'Second key point';
  fireEvent.click(document.getElementById('task-key-point-add-btn'));

  let items = document.querySelectorAll('#task-key-points-list .key-point-item');
  expect(items).toHaveLength(2);
  expect(items[0].querySelector('.key-point-text').textContent).toBe('First key point');
  expect(items[1].querySelector('.key-point-text').textContent).toBe('Second key point');
  expect(items[0].querySelector('input[type="checkbox"]')).toBeNull();

  fireEvent.click(items[1].querySelector('.key-point-remove-btn'));
  items = document.querySelectorAll('#task-key-points-list .key-point-item');
  expect(items).toHaveLength(1);

  fireEvent.submit(document.getElementById('task-form'));

  const fields = mocks.addTask.mock.calls[0][2];
  expect(fields.keyPoints).toHaveLength(1);
  expect(fields.keyPoints[0]).toMatchObject({ text: 'First key point' });
  expect(fields.keyPoints[0].at).toBeTruthy();
  expect(fields.keyPoints[0].done).toBeUndefined();
});

test('a comment written in the dialog renders in the thread with author and time', () => {
  initializeTaskModalHandlers(() => {});
  showModal();
  document.getElementById('task-title').value = 'Notes task';

  document.getElementById('task-comment-author').value = 'Ada';
  document.getElementById('task-comment-input').value = 'Please answer this';
  fireEvent.click(document.getElementById('task-comment-add-btn'));

  const items = document.querySelectorAll('#task-comments-list .comment-item');
  expect(items).toHaveLength(1);
  expect(items[0].querySelector('.comment-author').textContent).toBe('Ada');
  expect(items[0].querySelector('.comment-text').textContent).toBe('Please answer this');
  expect(items[0].querySelector('.comment-at').textContent).not.toBe('');
  expect(document.getElementById('task-comments-count').textContent).toBe('1');

  fireEvent.submit(document.getElementById('task-form'));
  const fields = mocks.addTask.mock.calls[0][2];
  expect(fields.comments).toHaveLength(1);
  expect(fields.comments[0]).toMatchObject({ author: 'Ada', text: 'Please answer this' });
});

test('the agent reply shows up in the same thread when the dialog reopens', () => {
  mocks.loadTasks.mockReturnValue([
    {
      id: 't1',
      title: 'Answered task',
      column: 'todo',
      comments: [
        { id: 'c1', author: 'Ada', text: 'Any update?', at: '2026-01-01T10:00:00.000Z' },
        { id: 'c2', author: 'agent-7', text: 'Shipped in build 42', at: '2026-01-01T11:00:00.000Z' }
      ]
    }
  ]);
  initializeTaskModalHandlers(() => {});
  showEditModal('t1');

  const items = document.querySelectorAll('#task-comments-list .comment-item');
  expect(items).toHaveLength(2);
  expect(items[0].querySelector('.comment-author').textContent).toBe('Ada');
  expect(items[1].querySelector('.comment-author').textContent).toBe('agent-7');
  expect(items[1].querySelector('.comment-text').textContent).toBe('Shipped in build 42');
});

test('editing a task saves the slim payload through updateTask', async () => {
  mocks.loadTasks.mockReturnValue([
    {
      id: 't1',
      title: 'Fine task',
      description: 'old',
      column: 'todo',
      type: 'task',
      estimate: 2,
      relationships: [],
      keyPoints: [],
      comments: []
    }
  ]);
  initializeTaskModalHandlers(() => {});
  showEditModal('t1');

  document.getElementById('task-title').value = 'Renamed task';
  document.getElementById('task-type').value = 'spike';
  document.getElementById('task-estimate').value = '8';
  fireEvent.submit(document.getElementById('task-form'));

  await waitFor(() => expect(mocks.updateTask).toHaveBeenCalledTimes(1));
  const [taskId, title, , fields] = mocks.updateTask.mock.calls[0];
  expect(taskId).toBe('t1');
  expect(title).toBe('Renamed task');
  expect(fields.type).toBe('spike');
  expect(fields.estimate).toBe(8);
  expect(fields.column).toBeUndefined();
  expect(mocks.promptDialog).not.toHaveBeenCalled();
  expect(mocks.setTaskBlockedReason).not.toHaveBeenCalled();
});
