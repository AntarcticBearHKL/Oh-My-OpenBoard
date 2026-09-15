// The task modal form submit handler.

import { $id } from './dom.js';
import { state } from './task-modal-state.js';
import { loadColumns, loadTasks } from './storage.js';
import { addTask, setTaskBlockedReason } from './tasks.js';
import { updateTask } from './task-update.js';
import { validateAndShowTaskTitleError } from './validation.js';
import { promptDialog } from './dialog.js';
import { isBlockedColumnId, normalizeEstimate } from './agile.js';
import { hideModal } from './task-modal-form.js';

export function initializeSubmitHandler() {
  $id('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const titleInput = $id('task-title');

    if (!validateAndShowTaskTitleError(titleInput)) return;

    const title = titleInput.value.trim();
    const description = $id('task-description').value;
    const priority = $id('task-priority')?.value;
    const dueDate = $id('task-due-date')?.value;
    const column = $id('task-column').value;
    const extraFields = {
      type: $id('task-type')?.value,
      estimate: normalizeEstimate($id('task-estimate')?.value),
      assignee: ($id('task-assignee')?.value || '').trim(),
      parentId: $id('task-parent')?.value || null,
      acceptanceCriteria: state.selectedTaskAcceptanceCriteria,
      comments: state.selectedTaskComments,
      attachments: state.selectedTaskAttachments,
      customFields: state.selectedTaskCustomFields
    };

    if (state.editingTaskId) {
      const editingId = state.editingTaskId;
      const previousTask = loadTasks().find((task) => task.id === editingId);
      updateTask(editingId, title, description, priority, dueDate, column, state.selectedTaskLabels, state.selectedTaskRelationships, state.selectedTaskSubTasks, extraFields);

      const columns = loadColumns();
      const enteredBlocked = !isBlockedColumnId(previousTask?.column, columns) && isBlockedColumnId(column, columns);
      if (enteredBlocked) {
        const reason = await promptDialog({
          title: 'Task blocked',
          message: 'Why is this task blocked?',
          placeholder: 'e.g. Waiting on API keys',
          confirmText: 'Save reason',
          cancelText: 'Skip'
        });
        if (typeof reason === 'string' && reason.trim()) {
          setTaskBlockedReason(editingId, reason);
          const { renderBoard } = await import('./render.js');
          renderBoard();
        }
      }
    } else {
      addTask(title, description, priority, dueDate, column, state.selectedTaskLabels, state.selectedTaskRelationships, state.selectedTaskSubTasks, extraFields);
    }
    hideModal();
  });
}
