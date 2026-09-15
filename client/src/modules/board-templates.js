import { saveColumns, saveTasks, saveLabels, loadSettings, saveSettings } from './storage.js';
import { normalizeBoardModelIds } from './board-serializer.js';

const builtInTemplateModules = import.meta.glob('../templates/*.json', {
  eager: true,
  import: 'default'
});

function templateIdFromPath(path) {
  const base = typeof path === 'string' ? path.split('/').pop() : '';
  return base ? base.replace(/\.json$/i, '') : '';
}

export function getBuiltInBoardTemplates() {
  return Object.entries(builtInTemplateModules)
    .map(([path, data]) => {
      const id = templateIdFromPath(path);
      const name = typeof data?.boardName === 'string' ? data.boardName.trim() : '';
      const columns = Array.isArray(data?.columns) ? data.columns : null;
      const tasks = Array.isArray(data?.tasks) ? data.tasks : null;
      const labels = Array.isArray(data?.labels) ? data.labels : null;
      const settings = data?.settings && typeof data.settings === 'object' ? data.settings : null;
      if (!id || !name || !tasks) return null;

      return {
        id,
        name,
        board: { boardName: name, columns, tasks, labels, settings }
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function populateTemplateSelect(selectEl) {
  if (!selectEl) return;
  const templates = getBuiltInBoardTemplates();

  selectEl.innerHTML = '';
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Blank board';
  blank.selected = true;
  selectEl.appendChild(blank);

  templates.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    selectEl.appendChild(opt);
  });
}

export function applyBoardTemplate(templateBoard) {
  const board = templateBoard && typeof templateBoard === 'object' ? templateBoard : null;
  if (!board) return;

  const normalized = normalizeBoardModelIds({
    columns: board.columns,
    tasks: board.tasks,
    labels: board.labels,
    settings: board.settings
  });

  if (Array.isArray(board.columns)) saveColumns(normalized.columns);
  if (Array.isArray(board.tasks)) saveTasks(normalized.tasks);
  if (Array.isArray(board.labels)) saveLabels(normalized.labels);
  if (board.settings && typeof board.settings === 'object') {
    const current = loadSettings();
    saveSettings({ ...current, ...normalized.settings });
  }
}
