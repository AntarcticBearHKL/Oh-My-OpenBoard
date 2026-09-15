import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent } from '@testing-library/dom';
import { mountToBody } from './setup.js';

const mocks = vi.hoisted(() => ({
  boards: [],
  activeId: 'board-1'
}));

vi.mock('../../src/modules/storage.js', () => ({
  ensureBoardsInitialized: vi.fn(),
  listBoards: vi.fn(() => mocks.boards),
  getActiveBoardId: vi.fn(() => mocks.activeId),
  setActiveBoardId: vi.fn((id) => { mocks.activeId = id; }),
  deleteBoard: vi.fn((id) => {
    mocks.boards = mocks.boards.filter((board) => board.id !== id);
    return true;
  })
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

beforeEach(() => {
  mocks.boards = [
    { id: 'board-1', name: 'Work' },
    { id: 'board-2', name: 'Personal' }
  ];
  mocks.activeId = 'board-1';
  mountToBody(FIXTURE);
  initializeBoardSidebar();
});

describe('sidebar group tree', () => {
  test('renders stored groups', () => {
    createGroup('Sprint 1');
    const second = createGroup('Sprint 2');
    assignBoardToGroup('board-2', second.id);

    mountToBody(FIXTURE);
    initializeBoardSidebar();

    const names = groupElements().map((el) => el.querySelector('.board-group-name').textContent);
    expect(names).toEqual(['Sprint 1', 'Sprint 2']);
  });

  test('nests each board under its group and renders unmapped boards at the root', () => {
    const group = createGroup('Sprint 1');
    assignBoardToGroup('board-2', group.id);

    mountToBody(FIXTURE);
    initializeBoardSidebar();

    const sprint = groupByName('Sprint 1');
    expect(sprint.querySelectorAll('.board-list-item')).toHaveLength(1);
    expect(sprint.querySelector('.board-list-item-name').textContent).toBe('Personal');

    const items = rootItems();
    expect(items).toHaveLength(1);
    expect(items[0].querySelector('.board-list-item-name').textContent).toBe('Work');
  });

  test('marks the active iteration', () => {
    mountToBody(FIXTURE);
    initializeBoardSidebar();

    const active = document.querySelector('.board-list-item--active');
    expect(active.dataset.boardId).toBe('board-1');
    expect(active.getAttribute('aria-current')).toBe('true');
  });

  test('clicking an iteration switches the active board and emits DATA_CHANGED', () => {
    const changed = vi.fn();
    on(DATA_CHANGED, changed);

    const item = document.querySelector('.board-list-item[data-board-id="board-2"]');
    fireEvent.click(item);

    expect(mocks.activeId).toBe('board-2');
    expect(changed).toHaveBeenCalled();
  });

  test('the chevron collapses a group and persists the state', () => {
    const group = createGroup('Sprint 1');
    mountToBody(FIXTURE);
    initializeBoardSidebar();

    const groupEl = groupByName('Sprint 1');
    const toggle = groupEl.querySelector('.board-group-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);

    expect(groupByName('Sprint 1').classList.contains('is-collapsed')).toBe(true);
    expect(listGroups().find((entry) => entry.id === group.id).collapsed).toBe(true);
  });

  test('#add-group-btn creates a group and starts inline rename', () => {
    fireEvent.click(document.getElementById('add-group-btn'));

    const input = document.querySelector('.board-group-rename-input');
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);

    input.value = 'Renamed group';
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(listGroups()[0].name).toBe('Renamed group');
    expect(document.querySelector('.board-group-rename-input')).toBeNull();
  });

  test('double-clicking a group name opens inline rename', () => {
    createGroup('Sprint 1');
    mountToBody(FIXTURE);
    initializeBoardSidebar();

    fireEvent.dblClick(groupByName('Sprint 1').querySelector('.board-group-name'));
    expect(document.querySelector('.board-group-rename-input')).not.toBeNull();
  });

  test('deleting a group needs two clicks and leaves its boards at the root', () => {
    const group = createGroup('Sprint 1');
    assignBoardToGroup('board-2', group.id);
    mountToBody(FIXTURE);
    initializeBoardSidebar();

    const deleteBtn = groupByName('Sprint 1').querySelector('.board-group-delete');

    fireEvent.click(deleteBtn);
    expect(deleteBtn.classList.contains('is-armed')).toBe(true);
    expect(listGroups()).toHaveLength(1);

    fireEvent.click(deleteBtn);
    expect(listGroups()).toEqual([]);
    expect(readBoardGroupMap()).toEqual({});
    expect(rootItems()).toHaveLength(2);
  });

  test('deleting an iteration needs two clicks', () => {
    const first = document.querySelector('.board-list-item[data-board-id="board-1"] .board-list-delete');
    fireEvent.click(first);
    expect(first.classList.contains('is-armed')).toBe(true);

    fireEvent.click(first);
    expect(document.querySelector('.board-list-item[data-board-id="board-1"]')).toBeNull();
  });
});
