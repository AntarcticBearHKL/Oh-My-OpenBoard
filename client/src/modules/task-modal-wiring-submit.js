// The task modal form submit handler.

import { $id } from './dom.js';
import { state } from './task-modal-state.js';
import { addTask } from './tasks.js';
import { updateTask } from './task-update.js';
import { validateAndShowTaskTitleError } from './validation.js';
import { normalizeEstimate } from './agile.js';
import { hideModal } from './task-modal-form.js';

export function initializeSubmitHandler() {
  $id('task-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const titleInput = $id('task-title');

    if (!validateAndShowTaskTitleError(titleInput)) return;

    const title = titleInput.value.trim();
    const description = $id('task-description').value;
    const fields = {
      type: $id('task-type')?.value,
      estimate: normalizeEstimate($id('task-estimate')?.value),
      keyPoints: state.selectedTaskKeyPoints,
      comments: state.selectedTaskComments,
      relationships: state.selectedTaskRelationships
    };

    if (state.editingTaskId) {
      updateTask(state.editingTaskId, title, description, fields);
    } else {
      addTask(title, description, fields);
    }
    hideModal();
  });
}
