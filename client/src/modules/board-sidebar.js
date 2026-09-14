import { alertDialog, confirmDialog } from './dialog.js';
import { emit, on, DATA_CHANGED } from './events.js';
import { renderIcons } from './icons.js';
import {
  deleteBoard as deleteBoardById,
  ensureBoardsInitialized,
  getActiveBoardId,
  listBoards,
  setActiveBoardId
} from './storage.js';
import { showBoardRenameModal } from './boards-modal.js';
import {
  UNGROUPED_GROUP_ID,
  assignBoardToGroup,
  createGroup,
  deleteGroup,
  initGroupSync,
  listGroups,
  pruneBoardGroups,
  readBoardGroupMap,
  renameGroup,
  toggleGroupCollapsed
} from './board-groups.js';

function boardName(board) {
  const name = typeof board?.name === 'string' ? board.name.trim() : '';
  return name || 'Untitled board';
}

function findGroupElement(listEl, groupId) {
  for (const el of listEl.querySelectorAll('.board-group')) {
    if (el.dataset.groupId === groupId) return el;
  }
  return null;
}

export function initializeBoardSidebar() {
  initGroupSync();

  const listEl = document.getElementById('board-list');
  if (!listEl) return;

  // Ungrouped is synthetic, so its collapse state is session-only.
  let ungroupedCollapsed = false;

  const syncSelect = (id) => {
    const selectEl = document.getElementById('board-select');
    if (selectEl) selectEl.value = id;
  };

  const selectBoard = (boardId) => {
    setActiveBoardId(boardId);
    syncSelect(boardId);
    emit(DATA_CHANGED);
  };

  const startGroupRename = (groupId) => {
    const groupEl = findGroupElement(listEl, groupId);
    const nameEl = groupEl?.querySelector('.board-group-name');
    if (!nameEl) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'board-group-rename-input';
    input.value = nameEl.textContent;
    input.maxLength = 60;
    input.setAttribute('aria-label', 'Group name');

    let settled = false;
    const finish = (commit) => {
      if (settled) return;
      settled = true;
      if (commit) renameGroup(groupId, input.value);
      render();
    };

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));

    nameEl.replaceWith(input);
    input.focus();
    input.select();
  };

  const buildBoardItem = (board, activeId) => {
    const isActive = board.id === activeId;
    const label = boardName(board);

    const nameEl = document.createElement('span');
    nameEl.className = 'board-list-item-name';
    nameEl.textContent = label;

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'board-list-delete';
    deleteBtn.title = 'Delete iteration';
    deleteBtn.setAttribute('aria-label', `Delete iteration ${label}`);
    deleteBtn.innerHTML = '<span data-lucide="x" aria-hidden="true"></span>';

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

    deleteBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      const ok = await confirmDialog({
        title: 'Delete iteration',
        message: `Delete the iteration "${label}"? Its columns and tasks will be removed.`,
        confirmText: 'Delete'
      });
      if (!ok) return;
      if (!deleteBoardById(board.id)) {
        await alertDialog({ title: 'Unable to delete', message: 'This iteration could not be deleted.' });
        return;
      }
      assignBoardToGroup(board.id, null);
      emit(DATA_CHANGED);
    });

    item.append(nameEl, deleteBtn);
    return item;
  };

  const buildGroupElement = (group, boards, activeId, { synthetic = false } = {}) => {
    const isCollapsed = synthetic ? ungroupedCollapsed : group.collapsed === true;

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'board-group-toggle';
    toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
    toggleBtn.setAttribute('aria-label', `${isCollapsed ? 'Expand' : 'Collapse'} ${group.name}`);
    toggleBtn.title = isCollapsed ? 'Expand' : 'Collapse';
    toggleBtn.innerHTML = `<span data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-down'}" aria-hidden="true"></span>`;
    toggleBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      if (synthetic) {
        ungroupedCollapsed = !ungroupedCollapsed;
        render();
      } else if (toggleGroupCollapsed(group.id)) {
        render();
      }
    });

    const nameEl = document.createElement('span');
    nameEl.className = 'board-group-name';
    nameEl.textContent = group.name;
    if (!synthetic) {
      nameEl.title = 'Double-click to rename';
      nameEl.addEventListener('dblclick', (event) => {
        event.stopPropagation();
        startGroupRename(group.id);
      });
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'board-group-add';
    addBtn.title = 'New iteration';
    addBtn.setAttribute('aria-label', `New iteration in ${group.name}`);
    addBtn.innerHTML = '<span data-lucide="plus" aria-hidden="true"></span>';
    addBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      document.dispatchEvent(
        new CustomEvent('kanban:open-board-create', {
          detail: { groupId: synthetic ? null : group.id }
        })
      );
    });

    const actions = document.createElement('div');
    actions.className = 'board-group-actions';
    actions.appendChild(addBtn);

    if (!synthetic) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'board-group-delete';
      deleteBtn.title = 'Delete group';
      deleteBtn.setAttribute('aria-label', `Delete group ${group.name}`);
      deleteBtn.innerHTML = '<span data-lucide="x" aria-hidden="true"></span>';
      deleteBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        const ok = await confirmDialog({
          title: 'Delete group',
          message: `Delete the group "${group.name}"? Its iterations are not deleted — they move to Ungrouped.`,
          confirmText: 'Delete'
        });
        if (!ok) return;
        deleteGroup(group.id);
        render();
      });
      actions.appendChild(deleteBtn);
    }

    const header = document.createElement('div');
    header.className = 'board-group-header';
    header.append(toggleBtn, nameEl, actions);

    const items = document.createElement('ul');
    items.className = 'board-group-items';
    items.setAttribute('aria-label', `${group.name} iterations`);
    boards.forEach((board) => items.appendChild(buildBoardItem(board, activeId)));

    const groupEl = document.createElement('li');
    groupEl.className = `board-group${isCollapsed ? ' is-collapsed' : ''}${synthetic ? ' board-group--ungrouped' : ''}`;
    groupEl.dataset.groupId = group.id;
    groupEl.append(header, items);
    return groupEl;
  };

  const render = () => {
    ensureBoardsInitialized();
    const boards = listBoards();
    const activeId = getActiveBoardId();
    const groups = listGroups();
    const boardGroupMap = readBoardGroupMap();

    pruneBoardGroups(boards.map((board) => board.id));

    const knownGroupIds = new Set(groups.map((group) => group.id));
    const buckets = new Map(groups.map((group) => [group.id, []]));
    const ungrouped = [];

    for (const board of boards) {
      const groupId = boardGroupMap[board.id];
      if (groupId && knownGroupIds.has(groupId)) buckets.get(groupId).push(board);
      else ungrouped.push(board);
    }

    listEl.innerHTML = '';
    groups.forEach((group) => {
      listEl.appendChild(buildGroupElement(group, buckets.get(group.id) || [], activeId));
    });
    listEl.appendChild(
      buildGroupElement(
        { id: UNGROUPED_GROUP_ID, name: 'Ungrouped', collapsed: ungroupedCollapsed },
        ungrouped,
        activeId,
        { synthetic: true }
      )
    );

    renderIcons();
  };

  render();
  on(DATA_CHANGED, render);

  document.getElementById('add-group-btn')?.addEventListener('click', () => {
    const group = createGroup();
    render();
    startGroupRename(group.id);
  });
}
