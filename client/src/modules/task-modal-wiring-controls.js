// Wire the task modal description, label, relationship and header controls.

import { $id } from './dom.js';
import { state, CREATE_LABEL_SENTINEL, RELATIONSHIP_DESCRIPTIONS } from './task-modal-state.js';
import { scrollHighlightedLabelIntoView, updateTaskLabelsSelection } from './task-modal-labels.js';
import { setTaskModalFullscreen, updateDescriptionLinks } from './task-modal-chrome.js';
import { updateRelationshipSearchResults } from './task-modal-relationships.js';
import { showEditModal } from './task-modal-form.js';

export function initializeDescriptionHandlers() {
  $id('task-description')?.addEventListener('input', (e) => {
    updateDescriptionLinks(e.target.value);
  });
}

export function initializeLabelSearchHandlers() {
  const taskLabelSearch = $id('task-label-search');
  taskLabelSearch?.addEventListener('input', () => {
    state.labelSearchHighlightIndex = 0;
    updateTaskLabelsSelection();
  });
  taskLabelSearch?.addEventListener('keydown', (e) => {
    if (state.filteredLabelIds.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.labelSearchHighlightIndex = Math.min(state.labelSearchHighlightIndex + 1, state.filteredLabelIds.length - 1);
      updateTaskLabelsSelection();
      scrollHighlightedLabelIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.labelSearchHighlightIndex = Math.max(state.labelSearchHighlightIndex - 1, 0);
      updateTaskLabelsSelection();
      scrollHighlightedLabelIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const highlightedId = state.filteredLabelIds[state.labelSearchHighlightIndex];
      if (!highlightedId) return;
      if (highlightedId === CREATE_LABEL_SENTINEL) {
        // Trigger create label flow
        const query = taskLabelSearch.value.trim();
        if (query) {
          document.dispatchEvent(new CustomEvent('kanban:open-label-modal', {
            detail: { openedFromTaskEditor: true, initialName: query }
          }));
        }
      } else {
        // Toggle existing label selection
        if (state.selectedTaskLabels.includes(highlightedId)) {
          state.selectedTaskLabels = state.selectedTaskLabels.filter(id => id !== highlightedId);
        } else {
          state.selectedTaskLabels.push(highlightedId);
        }
        // Clear search and reset
        taskLabelSearch.value = '';
        state.labelSearchHighlightIndex = 0;
        updateTaskLabelsSelection();
      }
    }
  });
}

export function initializeRelationshipHandlers() {
  const relTypeSelect = $id('task-relationship-type');
  const relTypeTooltip = $id('rel-type-tooltip');
  if (relTypeSelect && relTypeTooltip) {
    relTypeSelect.addEventListener('change', () => {
      relTypeTooltip.textContent = RELATIONSHIP_DESCRIPTIONS[relTypeSelect.value] || '';
    });
  }

  const relSearch = $id('task-relationship-search');
  relSearch?.addEventListener('input', (e) => updateRelationshipSearchResults(e.target.value, showEditModal));
  relSearch?.addEventListener('focus', (e) => { if (e.target.value.trim()) updateRelationshipSearchResults(e.target.value, showEditModal); });
}

export function initializeRelationshipOutsideClickHandlers() {
  document.addEventListener('click', (e) => {
    const resultsEl = $id('task-relationship-results');
    if (!resultsEl || resultsEl.hidden) return;
    const fieldset = $id('task-relationships-fieldset');
    if (fieldset && !fieldset.contains(e.target)) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
    }
  });
}

export function initializeAddLabelHandlers() {
  $id('task-add-label-btn')?.addEventListener('click', () => {
    state.returnToTaskModalAfterLabelsManager = false;
    document.dispatchEvent(new CustomEvent('kanban:open-label-modal', {
      detail: { openedFromTaskEditor: true }
    }));
  });
}

export function initializeFullpageHandlers() {
  $id('task-fullpage-btn')?.addEventListener('click', () => {
    const modal = $id('task-modal');
    if (!modal) return;
    setTaskModalFullscreen(!modal.classList.contains('fullscreen'));
  });
}
