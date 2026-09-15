import { loadSettings, saveSettings } from './storage.js';
import { normalizeCollapsedLaneKeys } from './swimlane-lane-model.js';

export function isSwimLaneCollapsed(laneKey, settings = loadSettings()) {
  const normalizedLaneKey = (laneKey || '').toString().trim();
  if (!normalizedLaneKey) return false;
  return normalizeCollapsedLaneKeys(settings?.swimLaneCollapsedKeys).includes(normalizedLaneKey);
}

export function toggleSwimLaneCollapsed(laneKey) {
  const normalizedLaneKey = (laneKey || '').toString().trim();
  if (!normalizedLaneKey) return false;

  const current = loadSettings();
  const collapsedKeys = normalizeCollapsedLaneKeys(current.swimLaneCollapsedKeys);
  const nextCollapsedKeys = collapsedKeys.includes(normalizedLaneKey)
    ? collapsedKeys.filter((key) => key !== normalizedLaneKey)
    : [...collapsedKeys, normalizedLaneKey];

  saveSettings({
    ...current,
    swimLaneCollapsedKeys: nextCollapsedKeys
  });

  return true;
}

const CELL_KEY_DELIMITER = '::';

export function makeCellCollapseKey(laneKey, columnId) {
  return `${(laneKey || '').toString().trim()}${CELL_KEY_DELIMITER}${(columnId || '').toString().trim()}`;
}

function normalizeCellCollapsedKeys(keys) {
  if (!Array.isArray(keys)) return [];
  const seen = new Set();
  return keys
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => {
      if (!entry || seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
}

export function isSwimLaneCellCollapsed(laneKey, columnId, settings = loadSettings()) {
  const key = makeCellCollapseKey(laneKey, columnId);
  if (!key || key === CELL_KEY_DELIMITER) return false;
  return normalizeCellCollapsedKeys(settings?.swimLaneCellCollapsedKeys).includes(key);
}

export function toggleSwimLaneCellCollapsed(laneKey, columnId) {
  const key = makeCellCollapseKey(laneKey, columnId);
  if (!key || key === CELL_KEY_DELIMITER) return false;

  const current = loadSettings();
  const collapsedKeys = normalizeCellCollapsedKeys(current.swimLaneCellCollapsedKeys);
  const nextCollapsedKeys = collapsedKeys.includes(key)
    ? collapsedKeys.filter((k) => k !== key)
    : [...collapsedKeys, key];

  saveSettings({
    ...current,
    swimLaneCellCollapsedKeys: nextCollapsedKeys
  });

  return true;
}
