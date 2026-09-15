// Thin facade — delegates to per-modal sub-modules.
// Keeps shared utilities (setupModalCloseHandlers, Escape handler, help modal)
// and wires cross-modal coordination (task-modal ↔ labels-modal).

import { showModal, showEditModal, hideModal as hideTaskModal,
  initializeTaskModalHandlers, updateTaskLabelsSelection,
  getSelectedTaskLabels, setSelectedTaskLabels,
  getReturnToTaskModalFlag, setReturnToTaskModalFlag,
  getSelectCreatedLabelFlag, setSelectCreatedLabelFlag,
  restoreTaskModalAfterLabelsManager } from './task-modal.js';
import { showLabelsModal, hideLabelModal, hideLabelsModal,
  initializeLabelsModalHandlers, setTaskModalState } from './labels-modal.js';
import { hideBoardsModal,
  initializeBoardsModalHandlers, showBoardsModal } from './boards-modal.js';
import { hideBoardRenameModal } from './board-rename-modal.js';
import { $id } from './dom.js';
import { setupModalCloseHandlers } from './modal-utils.js';

// ── Shared utility ──────────────────────────────────────────────────

function isModalOpen(modalId) {
  const modal = $id(modalId);
  return !!modal && !modal.classList.contains('hidden');
}

// ── Login modal ─────────────────────────────────────────────────────

export function hideLoginModal() {
  const modal = $id('login-modal');
  if (modal) modal.classList.add('hidden');
}

// ── Help modal (tiny — not worth a separate file) ───────────────────

function showHelpModal() {
  const modal = $id('help-modal');
  modal.classList.remove('hidden');
}

function hideHelpModal() {
  const modal = $id('help-modal');
  modal.classList.add('hidden');
}

// ── Cross-modal coordination ────────────────────────────────────────
// Wire the task-modal state into labels-modal so it can auto-select
// newly created labels and return to the task editor.

setTaskModalState({
  getSelectedTaskLabels,
  setSelectedTaskLabels,
  getReturnToTaskModalFlag,
  setReturnToTaskModalFlag,
  getSelectCreatedLabelFlag,
  setSelectCreatedLabelFlag,
  updateTaskLabelsSelection,
  restoreTaskModalAfterLabelsManager
});

// ── Master initializer ──────────────────────────────────────────────

export function initializeModalHandlers() {
  initializeTaskModalHandlers(setupModalCloseHandlers);
  initializeColumnModalHandlers(setupModalCloseHandlers);
  initializeLabelsModalHandlers(setupModalCloseHandlers);
  initializeBoardsModalHandlers(setupModalCloseHandlers);

  // Help modal
  $id('help-btn').addEventListener('click', showHelpModal);
  setupModalCloseHandlers('help-modal', hideHelpModal);

  // Close top-most modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isModalOpen('login-modal')) { hideLoginModal(); return; }
      if (isModalOpen('label-modal')) { hideLabelModal(); return; }
      if (isModalOpen('labels-modal')) { hideLabelsModal(); return; }
      if (isModalOpen('board-rename-modal')) { hideBoardRenameModal(); return; }
      if (isModalOpen('boards-modal')) { hideBoardsModal(); return; }
      if (isModalOpen('help-modal')) { hideHelpModal(); return; }
      if (isModalOpen('task-modal')) { hideTaskModal(); }
    }
  });
}

// ── Public API re-exports ───────────────────────────────────────────

export {
  showModal,
  showEditModal,
  showLabelsModal,
  showBoardsModal
};
