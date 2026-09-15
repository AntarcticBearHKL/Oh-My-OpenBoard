import {
  loadTasks,
  loadColumns,
  loadLabels,
  loadSettings
} from './storage.js';

import { getActiveBoardName, listBoards, loadTasksForBoard, loadColumnsForBoard, loadLabelsForBoard, loadSettingsForBoard } from './storage.js';
import { normalizePriority, isHexColor, boardDisplayName, normalizeDueDate, normalizeSubTasks } from './normalize.js';
import { DONE_COLUMN_ID } from './constants.js';
import { alertDialog } from './dialog.js';
import { inspectImportPayload } from './import-payload.js';

const EXPORT_SCHEMA_VERSION = 1;

function getCurrentAppVersion() {
  if (typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim()) {
    return __APP_VERSION__.trim();
  }
  return 'unknown';
}

function buildExportMeta() {
  return {
    appVersion: getCurrentAppVersion(),
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString()
  };
}

// normalizePriority, isHexColor imported from normalize.js

function normalizeSettingsForExport(settings) {
  const obj = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  const showPriority = obj.showPriority !== false;
  const showDueDate = obj.showDueDate !== false;
  const showAge = obj.showAge !== false;
  const showChangeDate = obj.showChangeDate !== false;
  const locale = typeof obj.locale === 'string' && obj.locale.trim()
    ? obj.locale.trim()
    : (typeof navigator !== 'undefined' && typeof navigator.language === 'string' ? navigator.language : 'en-US');
  const defaultPriority = normalizePriority(obj.defaultPriority);
  const swimLanesEnabled = obj.swimLanesEnabled === true;
  const swimLaneGroupBy = ['label', 'label-group', 'priority'].includes(obj.swimLaneGroupBy)
    ? obj.swimLaneGroupBy
    : 'label';
  const swimLaneLabelGroup = typeof obj.swimLaneLabelGroup === 'string' ? obj.swimLaneLabelGroup.trim() : '';
  const swimLaneCollapsedKeys = Array.isArray(obj.swimLaneCollapsedKeys)
    ? obj.swimLaneCollapsedKeys
        .filter((entry) => typeof entry === 'string' && entry.trim())
        .map((entry) => entry.trim())
    : [];
  const swimLaneOrder = Array.isArray(obj.swimLaneOrder)
    ? obj.swimLaneOrder
        .filter((entry) => typeof entry === 'string' && entry.trim())
        .map((entry) => entry.trim())
    : [];
  const swimLaneCellCollapsedKeys = Array.isArray(obj.swimLaneCellCollapsedKeys)
    ? obj.swimLaneCellCollapsedKeys
        .filter((entry) => typeof entry === 'string' && entry.trim())
        .map((entry) => entry.trim())
    : [];
  return {
    showPriority,
    showDueDate,
    showAge,
    showChangeDate,
    locale,
    defaultPriority,
    swimLanesEnabled,
    swimLaneGroupBy,
    swimLaneLabelGroup,
    swimLaneCollapsedKeys,
    swimLaneOrder,
    swimLaneCellCollapsedKeys
  };
}

// normalizeDueDate imported from normalize.js as normalizeDueDateFn

function normalizeTaskForExport(task, doneColumnIds = new Set([DONE_COLUMN_ID])) {
  const legacyTitle = typeof task?.text === 'string' ? task.text : '';
  const title = typeof task?.title === 'string' ? task.title : legacyTitle;
  const description = typeof task?.description === 'string' ? task.description : '';
  const dueDate = normalizeDueDate(task?.dueDate ?? task?.['due-date']);
  const changeDate =
    typeof task?.changeDate === 'string'
      ? task.changeDate
      : (typeof task?.changedDate === 'string' ? task.changedDate : undefined);

  const isDone = doneColumnIds.has(task?.column) || task?.column === DONE_COLUMN_ID;
  const doneDate = typeof task?.doneDate === 'string' ? task.doneDate.toString().trim() : '';

  const columnHistory = Array.isArray(task?.columnHistory)
    ? task.columnHistory
        .map((e) => {
          const column = typeof e?.column === 'string' ? e.column.trim() : '';
          const at = typeof e?.at === 'string' ? e.at.trim() : '';
          if (!column || !at) return null;
          return { column, at };
        })
        .filter(Boolean)
    : undefined;

  return {
    ...task,
    title: title.toString().trim(),
    description: description.toString().trim(),
    priority: normalizePriority(task?.priority),
    dueDate,
    subTasks: normalizeSubTasks(task?.subTasks),
    ...(typeof changeDate === 'string' ? { changeDate: changeDate.toString().trim() } : {}),
    ...(isDone && doneDate ? { doneDate } : { doneDate: undefined }),
    ...(columnHistory && columnHistory.length ? { columnHistory } : { columnHistory: undefined }),
    ...(typeof task?.swimlaneLabelId === 'string' ? { swimlaneLabelId: task.swimlaneLabelId } : {}),
    ...(typeof task?.swimlaneLabelGroup === 'string' ? { swimlaneLabelGroup: task.swimlaneLabelGroup } : {}),
    // Avoid exporting the legacy field name.
    changedDate: undefined
  };
}

// Export tasks and columns to JSON file
export function exportTasks() {
  const columns = loadColumns().map((c) => ({
    ...c,
    color: isHexColor(c?.color) ? c.color.trim() : '#3b82f6'
  }));
  const doneColumnIds = new Set(columns.filter((column) => column.role === 'done' || column.id === DONE_COLUMN_ID).map((column) => column.id));
  doneColumnIds.add(DONE_COLUMN_ID);
  const tasks = loadTasks().map((task) => normalizeTaskForExport(task, doneColumnIds));
  const labels = loadLabels();
  const settings = loadSettings();
  const boardName = getActiveBoardName();
  const exportMeta = buildExportMeta();
  const exportData = { boardName, columns, tasks, labels, settings, exportMeta };

  const integrity = inspectImportPayload(exportData, null);
  if (integrity.errors.length > 0) {
    void alertDialog({
      title: 'Export Blocked',
      message: integrity.errors.join(' ')
    });
    return;
  }

  const dataStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${boardName.replaceAll(' ', '_').replaceAll('.', '_')}_board_${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Export a specific board to JSON by boardId (does not switch active board).
export function exportBoard(boardId) {
  const id = typeof boardId === 'string' ? boardId.trim() : '';
  if (!id) return;

  const board = listBoards().find((b) => b.id === id);
  const boardName = boardDisplayName(board);

  const rawTasks = loadTasksForBoard(id);
  const rawColumns = loadColumnsForBoard(id);
  const rawLabels = loadLabelsForBoard(id);
  const rawSettings = loadSettingsForBoard(id);

  const columns = rawColumns.map((c) => ({
    ...c,
    color: isHexColor(c?.color) ? c.color.trim() : '#3b82f6',
    collapsed: c?.collapsed === true
  }));
  const doneColumnIds = new Set(columns.filter((column) => column.role === 'done' || column.id === DONE_COLUMN_ID).map((column) => column.id));
  doneColumnIds.add(DONE_COLUMN_ID);
  const tasks = rawTasks.map((task) => normalizeTaskForExport(task, doneColumnIds));
  const labels = Array.isArray(rawLabels) ? rawLabels : [];
  const settings = normalizeSettingsForExport(rawSettings);
  const exportMeta = buildExportMeta();
  const exportData = { boardName, columns, tasks, labels, settings, exportMeta };

  const integrity = inspectImportPayload(exportData, null);
  if (integrity.errors.length > 0) {
    void alertDialog({
      title: 'Export Blocked',
      message: integrity.errors.join(' ')
    });
    return;
  }

  const dataStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${boardName.replaceAll(' ', '_').replaceAll('.', '_')}_board_${new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
