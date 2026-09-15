import { generateUUID } from './utils.js';
import { setupModalCloseHandlers } from './modal-utils.js';
import { emit, on, DATA_CHANGED } from './events.js';
import {
  ensureBoardsInitialized,
  createBoard,
  setActiveBoardId,
  getActiveBoardName
} from './storage.js';
import { applyBoardTemplate, getBuiltInBoardTemplates, populateTemplateSelect } from './board-templates.js';
import { alertDialog } from './dialog.js';
import { assignBoardToGroup } from './board-groups.js';
import { refreshBoardSelect, boardSelectMatchesState, refreshBrandText } from './board-select.js';

let pendingGroupId = null;

// Board Create Modal helpers
export function showBoardCreateModal() {
  const modal = document.getElementById('board-create-modal');
  const nameInput = document.getElementById('board-create-name');
  const templateSelect = document.getElementById('board-create-template');
  if (!modal || !nameInput) return;

  const titleEl = document.getElementById('board-create-modal-title');
  const submitBtn = document.getElementById('board-create-submit-btn');
  const isIteration = Boolean(pendingGroupId);
  if (titleEl) titleEl.textContent = isIteration ? 'New Iteration' : 'Create New Board';
  if (submitBtn) submitBtn.textContent = isIteration ? 'Create Iteration' : 'Create Board';

  nameInput.value = '';
  if (templateSelect) templateSelect.value = '';
  modal.classList.remove('hidden');
  nameInput.focus();
}

function hideBoardCreateModal() {
  const modal = document.getElementById('board-create-modal');
  if (modal) modal.classList.add('hidden');
  pendingGroupId = null;
}

export function initializeBoardsUI() {
  ensureBoardsInitialized();

  const selectEl = document.getElementById('board-select');

  if (!selectEl) return;

  refreshBoardSelect(selectEl);
  refreshBrandText();

  // A remote board.created/renamed (catch-up or SSE) updates state.boards and
  // emits DATA_CHANGED, but the dropdown was built once at startup. Rebuild it
  // when the board list changes so new boards appear without a reload.
  on(DATA_CHANGED, () => {
    refreshBrandText();
    if (!boardSelectMatchesState(selectEl)) {
      refreshBoardSelect(selectEl);
    }
  });

  document.addEventListener('kanban:open-board-create', (event) => {
    pendingGroupId = event?.detail?.groupId || null;
    showBoardCreateModal();
  });

  selectEl.addEventListener('change', () => {
    const id = selectEl.value;
    if (!id) return;
    setActiveBoardId(id);
    refreshBrandText();
    emit(DATA_CHANGED);

    // Collapse the dropdown menu after a selection.
    const controlsActions = document.getElementById('board-controls-menu');
    const menuBtn = document.getElementById('desktop-menu-btn');
    controlsActions?.classList.remove('show');
    menuBtn?.setAttribute('aria-expanded', 'false');
  });

  // Board Create Modal handlers
  const createModal = document.getElementById('board-create-modal');
  const createForm = document.getElementById('board-create-form');
  const cancelCreateBtn = document.getElementById('cancel-board-create-btn');
  const templateSelect = document.getElementById('board-create-template');

  populateTemplateSelect(templateSelect);

  if (createModal) {
    // Backdrop click closes modal
    const backdrop = createModal.querySelector('.modal-backdrop');
    backdrop?.addEventListener('click', hideBoardCreateModal);

    // Escape key closes modal
    createModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideBoardCreateModal();
    });
  }

  if (cancelCreateBtn) {
    cancelCreateBtn.addEventListener('click', hideBoardCreateModal);
  }

  setupModalCloseHandlers('board-create-modal', hideBoardCreateModal);

  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('board-create-name');
      const trimmed = (nameInput?.value || '').trim();

      if (!trimmed) {
        await alertDialog({ title: 'Error', message: 'Board name cannot be empty.' });
        nameInput?.focus();
        return;
      }

      const selectedTemplateId = (templateSelect?.value || '').trim();
      const templates = selectedTemplateId ? getBuiltInBoardTemplates() : [];
      const template = selectedTemplateId ? templates.find((t) => t.id === selectedTemplateId) : null;

      const board = createBoard(trimmed);
      setActiveBoardId(board.id);

      if (pendingGroupId) assignBoardToGroup(board.id, pendingGroupId);
      if (template?.board) applyBoardTemplate(template.board);

      refreshBoardSelect(selectEl);
      refreshBrandText();
      emit(DATA_CHANGED);
      hideBoardCreateModal();

      // Let other UI modules (e.g., Manage Boards modal) react without introducing
      // cross-module imports that can complicate bundling/chunking.
      document.dispatchEvent(new CustomEvent('kanban:boards-changed'));
    });
  }
}
