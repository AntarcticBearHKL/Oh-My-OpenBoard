// Wire the task modal notes (key points) input.

import { $id } from './dom.js';
import { generateUUID } from './utils.js';
import { state } from './task-modal-state.js';
import { renderKeyPointsList } from './task-modal-status.js';

export function initializeKeyPointHandlers() {
  const keyPointInput = $id('task-key-point-input');

  function appendKeyPoint() {
    const text = (keyPointInput?.value || '').trim();
    if (!text) {
      keyPointInput?.focus();
      return;
    }
    state.selectedTaskKeyPoints.push({ id: generateUUID(), text, at: new Date().toISOString() });
    if (keyPointInput) keyPointInput.value = '';
    renderKeyPointsList();
  }

  keyPointInput?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    appendKeyPoint();
  });

  $id('task-key-point-add-btn')?.addEventListener('click', appendKeyPoint);
}
