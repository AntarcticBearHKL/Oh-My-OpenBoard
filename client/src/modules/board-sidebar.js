import { emit, on, DATA_CHANGED } from './events.js';
import { renderIcons } from './icons.js';
import { DONE_COLUMN_ID, isDoneColumn } from './constants.js';
import {
  deleteBoard as deleteBoardById,
  ensureBoardsInitialized,
  getActiveBoardId,
  listBoards,
  loadColumnsForBoard,
  loadTasksForBoard,
  setActiveBoardId
} from './storage.js';
import { showBoardRenameModal } from './board-rename-modal.js';
import { createArmedDeleteButton } from './armed-delete-button.js';
import {
  createGroup,
  deleteGroup,
  ensureBoardsGrouped,
  initGroupSync,
  listGroups,
  pruneBoardGroups,
  readBoardGroupMap,
  toggleGroupCollapsed,
  toggleGroupPrefixCollapsed
} from './board-groups.js';

function boardName(board) {
  const name = typeof board?.name === 'string' ? board.name.trim() : '';
  return name || 'Untitled board';
}

function isFinishedIteration(boardId) {
  const tasks = loadTasksForBoard(boardId);
  if (tasks.length === 0) return false;
  const doneColumnId = loadColumnsForBoard(boardId).find(isDoneColumn)?.id || DONE_COLUMN_ID;
  return tasks.every((task) => task.column === doneColumnId || task.column === DONE_COLUMN_ID);
}

export function initializeBoardSidebar() {
  initGroupSync();

  const listEl = document.getElementById('board-list');
  if (!listEl) return;

  const syncSelect = (id) => {
    const selectEl = document.getElementById('board-select');
    if (selectEl) selectEl.value = id;
  };

  const selectBoard = (boardId) => {
    setActiveBoardId(boardId);
    syncSelect(boardId);
    emit(DATA_CHANGED);
  };

  const buildBoardItem = (board, activeId) => {
    const isActive = board.id === activeId;
    const label = boardName(board);

    const nameEl = document.createElement('span');
    nameEl.className = 'board-list-item-name';
    nameEl.textContent = label;

    const deleteBtn = createArmedDeleteButton('board-list-delete', `Delete iteration ${label}`, () => {
      if (deleteBoardById(board.id)) {
        emit(DATA_CHANGED);
      } else {
        render();
      }
    });

    const item = document.createElement('li');
    item.className = `board-list-item${isActive ? ' board-list-item--active' : ''}`;
    item.dataset.boardId = board.id;
    item.tabIndex = 0;
    item.title = 'Double-click to rename';
    if (isActive) item.setAttribute('aria-current', 'true');

    item.addEventListener('click', (event) => {
      if (event.target.closest('.board-list-delete')) return;
      selectBoard(board.id);
    });
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectBoard(board.id);
      }
    });
    nameEl.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      showBoardRenameModal(board.id);
    });

    item.append(nameEl, deleteBtn);
    return item;
  };

  const buildGroupElement = (group, boards, activeId) => {
    const isCollapsed = group.collapsed === true;

    const toggle = () => {
      if (toggleGroupCollapsed(group.id)) render();
    };

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'board-group-toggle';
    toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
    toggleBtn.setAttribute('aria-label', `${isCollapsed ? 'Expand' : 'Collapse'} ${group.name}`);
    toggleBtn.title = isCollapsed ? 'Expand' : 'Collapse';
    toggleBtn.innerHTML = `<span data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-down'}" aria-hidden="true"></span>`;
    toggleBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      toggle();
    });

    const nameEl = document.createElement('span');
    nameEl.className = 'board-group-name';
    nameEl.textContent = group.name;
    nameEl.title = isCollapsed ? 'Click to expand' : 'Click to collapse';
    nameEl.setAttribute('role', 'button');
    nameEl.tabIndex = 0;
    nameEl.setAttribute('aria-expanded', String(!isCollapsed));

    let pendingToggle = null;
    nameEl.addEventListener('click', (event) => {
      event.stopPropagation();
      clearTimeout(pendingToggle);
      // Deferred so a double-click collapses once instead of toggling twice.
      pendingToggle = setTimeout(() => {
        pendingToggle = null;
        if (nameEl.isConnected) toggle();
      }, 200);
    });
    nameEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggle();
      }
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'board-group-add';
    addBtn.title = 'New iteration';
    addBtn.setAttribute('aria-label', `New iteration in ${group.name}`);
    addBtn.innerHTML = '<span data-lucide="plus" aria-hidden="true"></span>';
    addBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      document.dispatchEvent(
        new CustomEvent('kanban:open-board-create', { detail: { groupId: group.id } })
      );
    });

    const iterationCount = boards.length;
    const deleteLabel = iterationCount > 0
      ? `Delete group ${group.name} and its ${iterationCount} iteration${iterationCount === 1 ? '' : 's'}`
      : `Delete group ${group.name}`;
    const deleteBtn = createArmedDeleteButton('board-group-delete', deleteLabel, () => {
      // Iterations first: deleteGroup on its own only unassigns them.
      for (const board of boards) deleteBoardById(board.id);
      deleteGroup(group.id);
      render();
    });

    const actions = document.createElement('div');
    actions.className = 'board-group-actions';
    actions.append(addBtn, deleteBtn);

    const header = document.createElement('div');
    header.className = 'board-group-header';
    header.append(toggleBtn, nameEl, actions);

    const items = document.createElement('ul');
    items.className = 'board-group-items';
    items.setAttribute('aria-label', `${group.name} iterations`);

    const finishedPrefix = [];
    let reachedLiveIteration = false;
    for (const board of boards) {
      if (!reachedLiveIteration && isFinishedIteration(board.id)) finishedPrefix.push(board);
      else reachedLiveIteration = true;
    }
    const hasFinishedPrefix = finishedPrefix.length > 0 && finishedPrefix.length < boards.length;
    const isPrefixCollapsed = hasFinishedPrefix && group.prefixCollapsed === true;

    if (hasFinishedPrefix) {
      const prefixToggle = document.createElement('button');
      prefixToggle.type = 'button';
      prefixToggle.className = 'board-group-prefix-toggle';
      prefixToggle.setAttribute('aria-expanded', String(!isPrefixCollapsed));
      prefixToggle.setAttribute(
        'aria-label',
        `${isPrefixCollapsed ? 'Show' : 'Hide'} ${finishedPrefix.length} finished iteration${finishedPrefix.length === 1 ? '' : 's'} in ${group.name}`
      );
      prefixToggle.title = isPrefixCollapsed ? 'Show finished iterations' : 'Hide finished iterations';
      prefixToggle.innerHTML = `<span data-lucide="${isPrefixCollapsed ? 'chevron-down' : 'chevron-up'}" aria-hidden="true"></span><span>${isPrefixCollapsed ? 'Show' : 'Hide'} ${finishedPrefix.length} finished</span>`;
      prefixToggle.addEventListener('click', (event) => {
        event.stopPropagation();
        if (toggleGroupPrefixCollapsed(group.id)) render();
      });

      const prefixItem = document.createElement('li');
      prefixItem.className = 'board-group-prefix';
      prefixItem.appendChild(prefixToggle);
      items.appendChild(prefixItem);
    }

    const finishedPrefixIds = new Set(finishedPrefix.map((board) => board.id));
    boards.forEach((board) => {
      const item = buildBoardItem(board, activeId);
      if (finishedPrefixIds.has(board.id)) item.classList.add('board-list-item--finished-prefix');
      items.appendChild(item);
    });

    const groupEl = document.createElement('li');
    groupEl.className = `board-group${isCollapsed ? ' is-collapsed' : ''}${isPrefixCollapsed ? ' is-prefix-collapsed' : ''}`;
    groupEl.dataset.groupId = group.id;
    groupEl.append(header, items);
    return groupEl;
  };

  const render = () => {
    ensureBoardsInitialized();
    const boards = listBoards();
    const activeId = getActiveBoardId();
    const boardIds = boards.map((board) => board.id);

    pruneBoardGroups(boardIds);
    ensureBoardsGrouped(boardIds);

    const groups = listGroups();
    const boardGroupMap = readBoardGroupMap();
    const knownGroupIds = new Set(groups.map((group) => group.id));
    const buckets = new Map(groups.map((group) => [group.id, []]));

    for (const board of boards) {
      const groupId = boardGroupMap[board.id];
      if (groupId && knownGroupIds.has(groupId)) buckets.get(groupId).push(board);
    }

    listEl.innerHTML = '';
    groups.forEach((group) => {
      listEl.appendChild(buildGroupElement(group, buckets.get(group.id) || [], activeId));
    });

    renderIcons();
  };

  render();
  on(DATA_CHANGED, render);

  document.getElementById('add-group-btn')?.addEventListener('click', () => {
    createGroup();
    render();
  });
}
