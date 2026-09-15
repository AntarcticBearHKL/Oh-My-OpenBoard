// Task add/edit modal — extracted from modals.js

import { hideModal, showEditModal, showModal } from './task-modal-form.js';
import {
  initializeDescriptionHandlers,
  initializeLabelSearchHandlers,
  initializeRelationshipHandlers,
  initializeRelationshipOutsideClickHandlers,
  initializeAddLabelHandlers,
  initializeFullpageHandlers
} from './task-modal-wiring-controls.js';
import {
  initializeSubtaskHandlers,
  initializeAcceptanceHandlers,
  initializeCommentHandlers,
  initializeAttachmentHandlers,
  initializeCustomFieldHandlers,
  initializeAnnotationHandlers,
  initializeSummarySyncHandlers
} from './task-modal-wiring-agile.js';
import { initializeSubmitHandler } from './task-modal-wiring-submit.js';

export {
  getSelectedTaskLabels,
  setSelectedTaskLabels,
  getReturnToTaskModalFlag,
  setReturnToTaskModalFlag,
  getSelectCreatedLabelFlag,
  setSelectCreatedLabelFlag
} from './task-modal-state.js';

export { updateTaskLabelsSelection, restoreTaskModalAfterLabelsManager } from './task-modal-labels.js';
export { updateDescriptionLinks } from './task-modal-chrome.js';
export { showModal, showEditModal, hideModal };

export function initializeTaskModalHandlers(setupModalCloseHandlers) {
  initializeDescriptionHandlers();
  initializeLabelSearchHandlers();
  initializeRelationshipHandlers();
  initializeRelationshipOutsideClickHandlers();
  initializeAddLabelHandlers();
  initializeFullpageHandlers();
  initializeSubtaskHandlers();
  initializeAcceptanceHandlers();
  initializeCommentHandlers();
  initializeAttachmentHandlers();
  initializeCustomFieldHandlers();
  initializeAnnotationHandlers();
  initializeSummarySyncHandlers();
  initializeSubmitHandler();
  setupModalCloseHandlers('task-modal', hideModal);
}
