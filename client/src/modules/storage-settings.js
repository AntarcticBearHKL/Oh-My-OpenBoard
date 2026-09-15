import { schedulePersist, keyFor } from './idb-store.js';
import { ensureBoardsInitialized, getActiveBoardId } from './storage-boards.js';
import { defaultSettings } from './storage-defaults.js';
import { normalizeSettings } from './storage-normalize.js';
import { state, safeParseObject, DEFAULT_BOARD_ID } from './storage-state.js';

// ── Settings ───────────────────────────────────────────────────────────────────

export function loadColumnSummaries() {
  const summaries = loadSettings()?.columnSummaries;
  return summaries && typeof summaries === 'object' && !Array.isArray(summaries) ? summaries : {};
}

export function saveColumnSummary(columnId, text, by = 'human') {
  const id = typeof columnId === 'string' ? columnId : '';
  if (!id) return false;

  const settings = loadSettings();
  const summaries = { ...(settings.columnSummaries || {}) };
  const trimmed = String(text || '').trim();

  if (trimmed) summaries[id] = { text: trimmed, at: new Date().toISOString(), by };
  else delete summaries[id];

  saveSettings({ ...settings, columnSummaries: summaries });
  return true;
}

export function loadSettings() {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  const raw = state.settings[boardId];
  const parsed = safeParseObject(raw);
  if (parsed) return normalizeSettings(parsed);

  const defaults = defaultSettings();
  state.settings[boardId] = defaults;
  schedulePersist(keyFor(boardId, 'settings'), defaults);
  return defaults;
}

export function saveSettings(settings) {
  ensureBoardsInitialized();
  const boardId = getActiveBoardId() || DEFAULT_BOARD_ID;
  const normalized = normalizeSettings(settings);
  state.settings[boardId] = normalized;
  schedulePersist(keyFor(boardId, 'settings'), normalized);
}
