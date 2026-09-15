import { ensureBoardsInitialized, listBoards, renameBoard, updateBoardFields } from './storage.js';
import { alertDialog } from './dialog.js';
import { renderIcons } from './icons.js';
import { emit, DATA_CHANGED } from './events.js';
import { $id } from './dom.js';

let editingBoardId = null;

export function showBoardRenameModal(boardId) {
  ensureBoardsInitialized();
  const board = listBoards().find((b) => b.id === boardId);
  if (!board) return;

  editingBoardId = boardId;
  const modal = $id('board-rename-modal');
  const input = $id('board-rename-name');
  const title = $id('board-rename-modal-title');
  const submitBtn = $id('board-rename-submit-btn');

  if (title) title.textContent = 'Edit Board';
  if (submitBtn) submitBtn.textContent = 'Save';
  if (input) input.value = (board.name || '').toString();

  const startDate = $id('board-start-date');
  if (startDate) startDate.value = typeof board.startDate === 'string' ? board.startDate.slice(0, 10) : '';
  const endDate = $id('board-end-date');
  if (endDate) endDate.value = typeof board.endDate === 'string' ? board.endDate.slice(0, 10) : '';
  const goal = $id('board-goal');
  if (goal) goal.value = typeof board.goal === 'string' ? board.goal : '';

  modal?.classList.remove('hidden');
  input?.focus();
}

export function hideBoardRenameModal() {
  const modal = $id('board-rename-modal');
  modal?.classList.add('hidden');
  editingBoardId = null;
}

export function initializeBoardRenameModalHandlers(setupModalCloseHandlers, refreshBoards) {
  $id('board-rename-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingBoardId) return;

    const input = $id('board-rename-name');
    const name = (input?.value || '').trim();
    if (!name) {
      await alertDialog({ title: 'Error', message: 'Board name cannot be empty.' });
      return;
    }

    if (!renameBoard(editingBoardId, name)) {
      await alertDialog({ title: 'Error', message: 'Unable to rename board.' });
      return;
    }

    updateBoardFields(editingBoardId, {
      startDate: $id('board-start-date')?.value ?? '',
      endDate: $id('board-end-date')?.value ?? '',
      goal: $id('board-goal')?.value ?? ''
    });

    hideBoardRenameModal();
    refreshBoards();
    emit(DATA_CHANGED);
    renderIcons();
  });
  setupModalCloseHandlers('board-rename-modal', hideBoardRenameModal);
}
