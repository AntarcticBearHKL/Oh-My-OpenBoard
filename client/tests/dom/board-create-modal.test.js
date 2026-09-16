import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, waitFor } from '@testing-library/dom';
import INDEX_HTML from '../../src/index.html?raw';
import { mountToBody } from './setup.js';
import {
  BACKLOG_COLUMN_ID,
  FIXED_COLUMNS,
  HIL_COLUMN_ID,
  IN_PROGRESS_COLUMN_ID
} from '../../src/modules/constants.js';

const mocks = vi.hoisted(() => ({
  boards: [],
  activeId: null,
  columns: [],
  createBoard: vi.fn(),
  setActiveBoardId: vi.fn(),
  alertDialog: vi.fn(),
  promptDialog: vi.fn(),
  assignBoardToGroup: vi.fn(),
  showModal: vi.fn(),
  addTask: vi.fn(),
  updateTask: vi.fn(),
  setTaskBlockedReason: vi.fn()
}));

vi.mock('../../src/modules/modals.js', () => ({
  showModal: mocks.showModal
}));

vi.mock('../../src/modules/storage.js', () => ({
  ensureBoardsInitialized: vi.fn(),
  listBoards: vi.fn(() => mocks.boards),
  createBoard: mocks.createBoard,
  getActiveBoardId: vi.fn(() => mocks.activeId),
  setActiveBoardId: mocks.setActiveBoardId,
  getActiveBoardName: vi.fn(
    () => mocks.boards.find((board) => board.id === mocks.activeId)?.name || ''
  ),
  loadLabels: vi.fn(() => []),
  loadColumns: vi.fn(() => mocks.columns),
  loadSettings: vi.fn(() => ({})),
  loadTasks: vi.fn(() => []),
  isDoneColumnId: vi.fn(() => false)
}));

vi.mock('../../src/modules/board-groups.js', () => ({
  assignBoardToGroup: mocks.assignBoardToGroup
}));

vi.mock('../../src/modules/dialog.js', () => ({
  alertDialog: mocks.alertDialog,
  promptDialog: mocks.promptDialog
}));

vi.mock('../../src/modules/tasks.js', () => ({
  addTask: mocks.addTask,
  setTaskBlockedReason: mocks.setTaskBlockedReason,
  isTaskLocked: vi.fn(() => false)
}));

vi.mock('../../src/modules/task-update.js', () => ({
  updateTask: mocks.updateTask
}));

vi.mock('../../src/modules/validation.js', () => ({
  validateAndShowTaskTitleError: () => true,
  clearFieldError: vi.fn()
}));

vi.mock('../../src/modules/icons.js', () => ({
  renderIcons: vi.fn()
}));

vi.mock('../../src/modules/render.js', () => ({
  renderBoard: vi.fn()
}));

vi.mock('sortablejs', () => ({
  default: vi.fn(function Sortable() {
    this.destroy = vi.fn();
  })
}));

import { initializeBoardsUI } from '../../src/modules/boards.js';
import { createColumnElement } from '../../src/modules/column-element.js';
import {
  initializeTaskModalHandlers,
  showModal as openTaskModal
} from '../../src/modules/task-modal.js';
import { DATA_CHANGED, off, on } from '../../src/modules/events.js';

const CREATE_MODAL_FIXTURE = `
  <span id="brand-text" class="brand-text"></span>
  <select id="board-select"></select>
  <div id="board-create-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="board-create-modal-title">
    <div class="modal-backdrop" data-close-modal></div>
    <article class="modal-content">
      <header class="modal-header-row">
        <h3 id="board-create-modal-title">Create New Board</h3>
        <button id="board-create-close-btn" type="button" class="icon-btn" aria-label="Close" title="Close">
          <span data-lucide="x" aria-hidden="true"></span>
        </button>
      </header>
      <form id="board-create-form" novalidate>
        <div class="form-group">
          <label for="board-create-name">Board Name <span aria-hidden="true">*</span></label>
          <input type="text" id="board-create-name" required placeholder="Enter board name..." aria-required="true">
        </div>
        <div class="form-actions">
          <button type="button" id="cancel-board-create-btn" class="btn btn-secondary">Cancel</button>
          <button type="submit" id="board-create-submit-btn" class="btn btn-primary">Create Board</button>
        </div>
      </form>
    </article>
  </div>
`;

const TASK_MODAL_FIXTURE = `
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
            <fieldset class="form-group" id="task-key-points-fieldset">
              <legend>Key points</legend>
              <ul id="task-key-points-list"></ul>
              <input type="text" id="task-key-point-input">
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
  vi.clearAllMocks();
  mocks.boards = [{ id: 'board-1', name: 'Work' }];
  mocks.activeId = 'board-1';
  mocks.columns = FIXED_COLUMNS;
  mocks.createBoard.mockImplementation((name) => {
    const board = { id: `board-${mocks.boards.length + 1}`, name };
    mocks.boards.push(board);
    return board;
  });
  mocks.setActiveBoardId.mockImplementation((id) => {
    mocks.activeId = id;
  });
  mocks.alertDialog.mockResolvedValue(undefined);
  mocks.promptDialog.mockResolvedValue(null);
  mocks.showModal.mockImplementation((columnId) => openTaskModal(columnId));
});

describe('board create modal', () => {
  beforeEach(() => {
    mountToBody(CREATE_MODAL_FIXTURE);
    initializeBoardsUI();
  });

  test("opening from a group's New iteration control shows the iteration wording and an empty name", () => {
    document.dispatchEvent(
      new CustomEvent('kanban:open-board-create', { detail: { groupId: 'group-1' } })
    );

    expect(document.getElementById('board-create-modal').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('board-create-modal-title').textContent).toBe('New Iteration');
    expect(document.getElementById('board-create-submit-btn').textContent).toBe('Create Iteration');
    expect(document.getElementById('board-create-name').value).toBe('');
  });

  test('opening as a plain board shows the Create New Board wording', () => {
    document.dispatchEvent(new CustomEvent('kanban:open-board-create'));

    expect(document.getElementById('board-create-modal').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('board-create-modal-title').textContent).toBe('Create New Board');
    expect(document.getElementById('board-create-submit-btn').textContent).toBe('Create Board');
  });

  test('submitting a whitespace-only name alerts and creates nothing', async () => {
    document.dispatchEvent(new CustomEvent('kanban:open-board-create'));
    document.getElementById('board-create-name').value = '   ';

    fireEvent.submit(document.getElementById('board-create-form'));

    await waitFor(() => expect(mocks.alertDialog).toHaveBeenCalledTimes(1));
    expect(mocks.alertDialog).toHaveBeenCalledWith({
      title: 'Error',
      message: 'Board name cannot be empty.'
    });
    expect(mocks.createBoard).not.toHaveBeenCalled();
    expect(mocks.setActiveBoardId).not.toHaveBeenCalled();
    expect(document.getElementById('board-create-modal').classList.contains('hidden')).toBe(false);
  });

  test('a successful submit creates the board, activates it, hides the modal and dispatches kanban:boards-changed', () => {
    document.dispatchEvent(new CustomEvent('kanban:open-board-create'));
    document.getElementById('board-create-name').value = '  Roadmap  ';

    const dataChanged = vi.fn();
    on(DATA_CHANGED, dataChanged);
    const boardsChanged = vi.fn();
    document.addEventListener('kanban:boards-changed', boardsChanged, { once: true });

    fireEvent.submit(document.getElementById('board-create-form'));

    expect(mocks.createBoard).toHaveBeenCalledWith('Roadmap');
    const created = mocks.boards.at(-1);
    expect(mocks.setActiveBoardId).toHaveBeenCalledWith(created.id);
    expect(document.getElementById('board-create-modal').classList.contains('hidden')).toBe(true);
    expect(dataChanged).toHaveBeenCalledTimes(1);
    expect(boardsChanged).toHaveBeenCalledTimes(1);
    expect(
      [...document.getElementById('board-select').options].map((option) => option.value)
    ).toContain(created.id);

    off(DATA_CHANGED, dataChanged);
  });

  test('a successful submit opened from a group assigns the board to that group', () => {
    document.dispatchEvent(
      new CustomEvent('kanban:open-board-create', { detail: { groupId: 'group-7' } })
    );
    document.getElementById('board-create-name').value = 'Sprint 7';

    fireEvent.submit(document.getElementById('board-create-form'));

    expect(mocks.assignBoardToGroup).toHaveBeenCalledWith(mocks.boards.at(-1).id, 'group-7');
  });

  test('the create dialog markup has no template picker', () => {
    const parsed = new DOMParser().parseFromString(INDEX_HTML, 'text/html');
    const dialog = parsed.getElementById('board-create-modal');

    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('#board-create-template')).toBeNull();
    expect(dialog.querySelector('select')).toBeNull();
    expect(dialog.querySelector('#board-create-name')).not.toBeNull();
  });
});

describe('HIL manual add', () => {
  beforeEach(() => {
    mountToBody(TASK_MODAL_FIXTURE);
    initializeTaskModalHandlers(() => {});
  });

  test('the HIL add-task control opens the full task modal for that column', () => {
    const hil = FIXED_COLUMNS.find((column) => column.id === HIL_COLUMN_ID);
    const columnEl = createColumnElement(hil);
    document.body.appendChild(columnEl);

    const addButton = columnEl.querySelector('.column-header .add-task-btn-icon');
    expect(addButton).not.toBeNull();
    expect(addButton.getAttribute('aria-label')).toBe(`Add task to ${hil.name}`);

    fireEvent.click(addButton);

    expect(mocks.showModal).toHaveBeenCalledWith(HIL_COLUMN_ID);
    expect(document.getElementById('task-modal').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('task-modal-title').textContent).toBe('Add New Task');
    expect(document.getElementById('task-submit-btn').textContent).toBe('Add Task');

    [
      'task-title',
      'task-description',
      'task-type',
      'task-priority',
      'task-estimate',
      'task-assignee',
      'task-due-date',
      'task-parent',
      'task-key-point-input',
      'task-labels-selection',
      'task-relationships-fieldset',
      'task-subtasks-list',
      'task-comments-list',
      'task-attachments-list',
      'task-custom-fields-list'
    ].forEach((id) => {
      const field = document.getElementById(id);
      expect(field).not.toBeNull();
      expect(field.hasAttribute('disabled')).toBe(false);
    });

    expect(
      [...document.getElementById('task-priority').options].map((option) => option.value)
    ).toEqual(['urgent', 'high', 'medium', 'low', 'none']);
  });

  test('columns other than HIL expose no manual add-task control', () => {
    [BACKLOG_COLUMN_ID, IN_PROGRESS_COLUMN_ID].forEach((columnId) => {
      const column = FIXED_COLUMNS.find((entry) => entry.id === columnId);
      const columnEl = createColumnElement(column);
      document.body.appendChild(columnEl);

      expect(columnEl.querySelector('.add-task-btn-icon'), column.name).toBeNull();
    });
  });
});
