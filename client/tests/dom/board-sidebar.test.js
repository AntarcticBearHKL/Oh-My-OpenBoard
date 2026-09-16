import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';
import { mountToBody } from './setup.js';

const mocks = vi.hoisted(() => ({
  boards: [],
  activeId: 'board-1',
  tasksByBoard: {},
  columnsByBoard: {}
}));

vi.mock('../../src/modules/storage.js', () => ({
  ensureBoardsInitialized: vi.fn(),
  listBoards: vi.fn(() => mocks.boards),
  getActiveBoardId: vi.fn(() => mocks.activeId),
  setActiveBoardId: vi.fn((id) => { mocks.activeId = id; }),
  deleteBoard: vi.fn((id) => {
    mocks.boards = mocks.boards.filter((board) => board.id !== id);
    return true;
  }),
  loadTasksForBoard: vi.fn((boardId) => mocks.tasksByBoard[boardId] || []),
  loadColumnsForBoard: vi.fn((boardId) => mocks.columnsByBoard[boardId] || [])
}));

vi.mock('../../src/modules/board-rename-modal.js', () => ({
  showBoardRenameModal: vi.fn()
}));

vi.mock('../../src/modules/icons.js', () => ({
  renderIcons: vi.fn()
}));

import { initializeBoardSidebar } from '../../src/modules/board-sidebar.js';
import { on, DATA_CHANGED } from '../../src/modules/events.js';
import {
  assignBoardToGroup,
  createGroup,
  listGroups,
  readBoardGroupMap
} from '../../src/modules/board-groups.js';

const FIXTURE = `
  <aside class="board-sidebar">
    <div class="sidebar-heading">
      <span>Groups</span>
      <button id="add-group-btn" type="button">+</button>
    </div>
    <ul id="board-list" class="board-list"></ul>
  </aside>
  <select id="board-select"></select>
`;

function groupElements() {
  return Array.from(document.querySelectorAll('#board-list > .board-group'));
}

function groupByName(name) {
  return groupElements().find(
    (el) => el.querySelector('.board-group-name')?.textContent === name
  );
}

function rootItems() {
  return Array.from(document.querySelectorAll('#board-list > .board-list-item'));
}

function prefixToggleFor(name) {
  return groupByName(name).querySelector('.board-group-prefix-toggle');
}

beforeEach(() => {
  mocks.boards = [
    { id: 'board-1', name: 'Work' },
    { id: 'board-2', name: 'Personal' }
  ];
  mocks.activeId = 'board-1';
  mocks.tasksByBoard = {};
  mocks.columnsByBoard = {};
  mountToBody(FIXTURE);
});

describe('sidebar group tree', () => {
  test('renders group names derived from their order', () => {
    const first = createGroup();
    const second = createGroup();
    assignBoardToGroup('board-1', first.id);
    assignBoardToGroup('board-2', second.id);

    initializeBoardSidebar();

    const names = groupElements().map((el) => el.querySelector('.board-group-name').textContent);
    expect(names).toEqual(['Iterations 1', 'Iterations 2']);
  });

  test('a board without a group is placed in the last group on render', () => {
    const first = createGroup();
    const second = createGroup();
    assignBoardToGroup('board-2', first.id);

    initializeBoardSidebar();

    const work = groupByName('Iterations 1').querySelector('.board-list-item-name');
    const personal = groupByName('Iterations 2').querySelector('.board-list-item-name');
    expect(work.textContent).toBe('Personal');
    expect(personal.textContent).toBe('Work');
    expect(readBoardGroupMap()).toEqual({ 'board-1': second.id, 'board-2': first.id });

    initializeBoardSidebar();

    expect(readBoardGroupMap()).toEqual({ 'board-1': second.id, 'board-2': first.id });
  });

  test('creates a group for existing boards when none exists', () => {
    initializeBoardSidebar();

    const groups = listGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Iterations 1');
    expect(readBoardGroupMap()).toEqual({ 'board-1': groups[0].id, 'board-2': groups[0].id });
    expect(rootItems()).toHaveLength(0);
  });

  test('marks the active iteration', () => {
    initializeBoardSidebar();

    const active = document.querySelector('.board-list-item--active');
    expect(active.dataset.boardId).toBe('board-1');
    expect(active.getAttribute('aria-current')).toBe('true');
  });

  test('clicking an iteration switches the active board and emits DATA_CHANGED', () => {
    initializeBoardSidebar();

    const changed = vi.fn();
    on(DATA_CHANGED, changed);

    const item = document.querySelector('.board-list-item[data-board-id="board-2"]');
    fireEvent.click(item);

    expect(mocks.activeId).toBe('board-2');
    expect(changed).toHaveBeenCalled();
  });

  test('the chevron collapses a group and persists the state', () => {
    const group = createGroup();
    initializeBoardSidebar();

    const toggle = groupByName('Iterations 1').querySelector('.board-group-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);

    expect(groupByName('Iterations 1').classList.contains('is-collapsed')).toBe(true);
    expect(listGroups().find((entry) => entry.id === group.id).collapsed).toBe(true);
  });

  test('clicking a group name toggles collapse and updates both aria-expanded states', () => {
    createGroup();
    initializeBoardSidebar();

    vi.useFakeTimers();
    try {
      const nameEl = groupByName('Iterations 1').querySelector('.board-group-name');
      expect(nameEl.getAttribute('role')).toBe('button');
      expect(nameEl.getAttribute('aria-expanded')).toBe('true');

      fireEvent.click(nameEl);
      expect(groupByName('Iterations 1').classList.contains('is-collapsed')).toBe(false);

      vi.advanceTimersByTime(200);

      const collapsed = groupByName('Iterations 1');
      expect(collapsed.classList.contains('is-collapsed')).toBe(true);
      expect(collapsed.querySelector('.board-group-name').getAttribute('aria-expanded')).toBe('false');
      expect(collapsed.querySelector('.board-group-toggle').getAttribute('aria-expanded')).toBe('false');
    } finally {
      vi.useRealTimers();
    }
  });

  test('Enter and Space on the focused group name toggle collapse immediately', () => {
    createGroup();
    initializeBoardSidebar();

    const nameEl = groupByName('Iterations 1').querySelector('.board-group-name');
    nameEl.focus();
    expect(document.activeElement).toBe(nameEl);
    expect(nameEl.tabIndex).toBe(0);

    fireEvent.keyDown(nameEl, { key: 'Enter' });
    expect(groupByName('Iterations 1').classList.contains('is-collapsed')).toBe(true);

    fireEvent.keyDown(groupByName('Iterations 1').querySelector('.board-group-name'), { key: ' ' });
    expect(groupByName('Iterations 1').classList.contains('is-collapsed')).toBe(false);
  });

  test('#add-group-btn creates a group with a derived name and no rename input', () => {
    initializeBoardSidebar();

    fireEvent.click(document.getElementById('add-group-btn'));

    const groups = listGroups();
    expect(groups).toHaveLength(2);
    expect(groups[1].name).toBe('Iterations 2');
    expect(groupElements()).toHaveLength(2);
    expect(document.querySelector('.board-group-rename-input')).toBeNull();
  });

  test('double-clicking a group name does not open a rename input', () => {
    createGroup();
    initializeBoardSidebar();

    const nameEl = groupByName('Iterations 1').querySelector('.board-group-name');
    fireEvent.dblClick(nameEl);

    expect(document.querySelector('.board-group-rename-input')).toBeNull();
    expect(groupByName('Iterations 1').querySelector('.board-group-name').textContent).toBe('Iterations 1');
  });

  test('deleting a group takes its iterations with it and renames the rest', () => {
    const keep = createGroup();
    const doomed = createGroup();
    assignBoardToGroup('board-1', keep.id);
    assignBoardToGroup('board-2', doomed.id);
    initializeBoardSidebar();

    const deleteBtn = groupByName('Iterations 2').querySelector('.board-group-delete');

    fireEvent.click(deleteBtn);
    expect(deleteBtn.classList.contains('is-armed')).toBe(true);
    expect(listGroups()).toHaveLength(2);

    fireEvent.click(deleteBtn);
    expect(listGroups().map((group) => group.name)).toEqual(['Iterations 1']);
    expect(readBoardGroupMap()).toEqual({ 'board-1': keep.id });
    expect(mocks.boards.map((board) => board.id)).toEqual(['board-1']);
    expect(groupByName('Iterations 1').querySelectorAll('.board-list-item')).toHaveLength(1);
  });

  test('deleting an iteration needs two clicks', () => {
    initializeBoardSidebar();

    const first = document.querySelector('.board-list-item[data-board-id="board-1"] .board-list-delete');
    fireEvent.click(first);
    expect(first.classList.contains('is-armed')).toBe(true);

    fireEvent.click(first);
    expect(document.querySelector('.board-list-item[data-board-id="board-1"]')).toBeNull();
  });

  test('the finished prefix gets one collapse control that hides only the prefix', () => {
    const group = createGroup();
    assignBoardToGroup('board-1', group.id);
    assignBoardToGroup('board-2', group.id);
    mocks.boards.push({ id: 'board-3', name: 'Later' });
    assignBoardToGroup('board-3', group.id);
    mocks.tasksByBoard = {
      'board-1': [{ id: 'task-1', column: 'done' }],
      'board-2': [{ id: 'task-2', column: 'in-progress' }],
      'board-3': [{ id: 'task-3', column: 'done' }]
    };

    initializeBoardSidebar();

    const toggle = prefixToggleFor('Iterations 1');
    expect(toggle).not.toBeNull();
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(groupByName('Iterations 1').classList.contains('is-prefix-collapsed')).toBe(false);

    const first = groupByName('Iterations 1').querySelector('.board-list-item[data-board-id="board-1"]');
    const second = groupByName('Iterations 1').querySelector('.board-list-item[data-board-id="board-2"]');
    const third = groupByName('Iterations 1').querySelector('.board-list-item[data-board-id="board-3"]');
    expect(first.classList.contains('board-list-item--finished-prefix')).toBe(true);
    expect(second.classList.contains('board-list-item--finished-prefix')).toBe(false);
    expect(third.classList.contains('board-list-item--finished-prefix')).toBe(false);

    fireEvent.click(toggle);

    const collapsed = groupByName('Iterations 1');
    expect(collapsed.classList.contains('is-prefix-collapsed')).toBe(true);
    expect(prefixToggleFor('Iterations 1').getAttribute('aria-expanded')).toBe('false');
    expect(listGroups()[0].prefixCollapsed).toBe(true);
    expect(collapsed.querySelector('.board-list-item[data-board-id="board-1"]')).not.toBeNull();
    expect(collapsed.querySelector('.board-list-item[data-board-id="board-2"]')).not.toBeNull();
    expect(collapsed.querySelector('.board-list-item[data-board-id="board-3"]')).not.toBeNull();

    initializeBoardSidebar();
    expect(groupByName('Iterations 1').classList.contains('is-prefix-collapsed')).toBe(true);

    fireEvent.click(prefixToggleFor('Iterations 1'));
    expect(listGroups()[0].prefixCollapsed).toBe(false);
    expect(groupByName('Iterations 1').classList.contains('is-prefix-collapsed')).toBe(false);
  });

  test('a group with an unfinished first iteration shows no prefix control', () => {
    const group = createGroup();
    assignBoardToGroup('board-1', group.id);
    assignBoardToGroup('board-2', group.id);
    mocks.tasksByBoard = {
      'board-2': [{ id: 'task-2', column: 'done' }]
    };

    initializeBoardSidebar();

    expect(prefixToggleFor('Iterations 1')).toBeNull();
  });

  test('a group whose iterations are all finished shows no prefix control', () => {
    const group = createGroup();
    assignBoardToGroup('board-1', group.id);
    assignBoardToGroup('board-2', group.id);
    mocks.tasksByBoard = {
      'board-1': [{ id: 'task-1', column: 'done' }],
      'board-2': [{ id: 'task-2', column: 'done' }]
    };

    initializeBoardSidebar();

    expect(prefixToggleFor('Iterations 1')).toBeNull();
  });
});
