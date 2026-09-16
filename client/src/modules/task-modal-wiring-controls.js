// Wire the task modal description, relationship and header controls.

import { $id } from './dom.js';
import { RELATIONSHIP_DESCRIPTIONS } from './task-modal-state.js';
import { setTaskModalFullscreen, updateDescriptionLinks } from './task-modal-chrome.js';
import { updateRelationshipSearchResults } from './task-modal-relationships.js';
import { showEditModal } from './task-modal-form.js';

export function initializeDescriptionHandlers() {
  $id('task-description')?.addEventListener('input', (e) => {
    updateDescriptionLinks(e.target.value);
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

export function initializeFullpageHandlers() {
  $id('task-fullpage-btn')?.addEventListener('click', () => {
    const modal = $id('task-modal');
    if (!modal) return;
    setTaskModalFullscreen(!modal.classList.contains('fullscreen'));
  });
}
