import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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
  createBoard: vi.fn((name) => {
    const board = { id: `board-${mocks.boards.length + 1}`, name };
    mocks.boards.push(board);
    return board;
  }),
  getActiveBoardId: vi.fn(() => mocks.activeId),
  setActiveBoardId: vi.fn((id) => { mocks.activeId = id; }),
  renameBoard: vi.fn((id, name) => {
    const board = mocks.boards.find((entry) => entry.id === id);
    if (!board) return false;
    board.name = name;
    return true;
  }),
  deleteBoard: vi.fn((id) => {
    mocks.boards = mocks.boards.filter((board) => board.id !== id);
    return true;
  }),
  loadTasksForBoard: vi.fn((boardId) => mocks.tasksByBoard[boardId] || []),
  loadColumnsForBoard: vi.fn((boardId) => mocks.columnsByBoard[boardId] || [])
}));

vi.mock('../../src/modules/icons.js', () => ({
  renderIcons: vi.fn()
}));

import { initializeBoardSidebar } from '../../src/modules/board-sidebar.js';
import { listGroups, readBoardGroupMap } from '../../src/modules/board-groups.js';

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

let fetchMock;

function postCalls() {
  return fetchMock.mock.calls.filter(([, opts]) => opts?.method === 'POST');
}

function flushTurn() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function adoptFromServer(detail) {
  window.dispatchEvent(new CustomEvent('openagile:groups-changed', { detail }));
}

beforeEach(() => {
  mocks.boards = [
    { id: 'board-1', name: 'Work' },
    { id: 'board-2', name: 'Personal' }
  ];
  mocks.activeId = 'board-1';
  mocks.tasksByBoard = {};
  mocks.columnsByBoard = {};
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ groups: [], boardGroups: {} }) }));
  vi.stubGlobal('fetch', fetchMock);
  mountToBody(FIXTURE);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sidebar group sync', () => {
  test('the first render writes the group state once, not once per write', async () => {
    initializeBoardSidebar();
    await flushTurn();

    const groups = listGroups();
    expect(groups).toHaveLength(1);
    expect(readBoardGroupMap()).toEqual({ 'board-1': groups[0].id, 'board-2': groups[0].id });
    expect(postCalls()).toHaveLength(1);
  });

  test('a group state pushed by another client is adopted without becoming a push of its own', async () => {
    initializeBoardSidebar();
    await flushTurn();
    expect(postCalls()).toHaveLength(1);

    const group = listGroups()[0];
    adoptFromServer({
      groups: [{ ...group }],
      boardGroups: { 'board-1': group.id, 'board-2': group.id, 'board-9': group.id }
    });
    await flushTurn();

    expect(readBoardGroupMap()['board-9']).toBe(group.id);
    expect(postCalls()).toHaveLength(1);
  });

  test('the server echo of the sidebar push does not push again or rebuild the tree', async () => {
    initializeBoardSidebar();
    await flushTurn();
    const pushed = JSON.parse(postCalls()[0][1].body);
    const groupsBefore = document.querySelectorAll('#board-list > .board-group').length;

    adoptFromServer(pushed);
    await flushTurn();

    expect(postCalls()).toHaveLength(1);
    expect(document.querySelectorAll('#board-list > .board-group')).toHaveLength(groupsBefore);
  });

  test('a rename committed in the sidebar reaches the server exactly once', async () => {
    initializeBoardSidebar();
    await flushTurn();
    const groupId = listGroups()[0].id;

    fireEvent.dblClick(document.querySelector('.board-group-name'));
    const input = document.querySelector('.board-group-rename-input');
    input.value = 'Q3 delivery';
    fireEvent.keyDown(input, { key: 'Enter' });
    await flushTurn();

    expect(listGroups()[0].name).toBe('Q3 delivery');
    const posts = postCalls();
    expect(posts).toHaveLength(2);
    expect(JSON.parse(posts[1][1].body).groups[0]).toMatchObject({ id: groupId, name: 'Q3 delivery' });
  });
});
