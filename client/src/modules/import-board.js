import {
  loadSettings,
  saveColumns,
  saveTasks,
  saveLabels,
  saveSettings
} from './storage.js';

import { createBoard, listBoards, setActiveBoardId } from './storage.js';
import { emit, DATA_CHANGED } from './events.js';
import { boardDisplayName } from './normalize.js';
import { APP_NAME } from './constants.js';
import { alertDialog, confirmDialog } from './dialog.js';
import { validateImportFileMetadata, inspectImportPayload, buildImportConfirmationMessage } from './import-payload.js';

function refreshBoardsUI(activeBoardId) {
  const brandEl = document.getElementById('brand-text') || document.querySelector('.brand-text');
  if (brandEl) brandEl.textContent = APP_NAME;

  const selectEl = document.getElementById('board-select');
  if (!selectEl) return;

  const boards = listBoards();
  selectEl.innerHTML = '';

  boards.forEach((b) => {
    const option = document.createElement('option');
    option.value = b.id;
    option.textContent = boardDisplayName(b);
    selectEl.appendChild(option);
  });

  if (activeBoardId) selectEl.value = activeBoardId;
}

// Import tasks and columns from JSON file
export function importTasks(file) {
  const metadataPreview = validateImportFileMetadata(file);
  if (metadataPreview.errors.length > 0) {
    void alertDialog({
      title: 'Import Error',
      message: metadataPreview.errors.join(' ')
    });
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);

      const preview = inspectImportPayload(data, file);
      if (preview.errors.length > 0) {
        await alertDialog({ title: 'Import Error', message: preview.errors.join(' ') });
        return;
      }

      const confirmed = await confirmDialog({
        title: 'Review Import',
        message: buildImportConfirmationMessage(preview),
        confirmText: 'Import Board',
        cancelText: 'Cancel'
      });

      if (!confirmed) return;

      const importedName = preview.importedName || 'Imported board';
      const newBoard = createBoard(importedName);
      if (newBoard?.id) setActiveBoardId(newBoard.id);

      if (preview.normalizedColumns) saveColumns(preview.normalizedColumns);
      saveTasks(preview.normalizedTasks);
      if (preview.normalizedLabels) saveLabels(preview.normalizedLabels);
      if (preview.normalizedSettings) {
        // Merge with current defaults (e.g., locale)
        const current = loadSettings();
        saveSettings({ ...current, ...preview.normalizedSettings });
      }

      refreshBoardsUI(newBoard?.id);

      emit(DATA_CHANGED);
      document.dispatchEvent(new CustomEvent('kanban:boards-changed'));
      await alertDialog({ title: 'Import Complete', message: 'Board imported successfully!' });
    } catch (error) {
      await alertDialog({ title: 'Import Error', message: 'Error parsing JSON file: ' + error.message });
    }
  };
  reader.readAsText(file);
}
