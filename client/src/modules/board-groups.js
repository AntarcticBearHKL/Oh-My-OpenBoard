import { generateUUID } from './utils.js';
import { emit, DATA_CHANGED } from './events.js';

export const GROUPS_KEY = 'kanvana:groups';
export const BOARD_GROUP_KEY = 'kanvana:boardGroup';
export const UNGROUPED_GROUP_ID = '__ungrouped__';

const GROUPS_MIGRATED_KEY = 'kanvana:groupsMigrated';

function markMigrated() {
  try { localStorage.setItem(GROUPS_MIGRATED_KEY, '1'); } catch { /* ignore */ }
}

function isMigrated() {
  try { return localStorage.getItem(GROUPS_MIGRATED_KEY) === '1'; } catch { return false; }
}

const GROUPS_API = '/api/groups';

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / storage disabled: groups are best-effort.
  }
}

function normalizeGroup(raw, index) {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled group';
  const order = Number.isFinite(raw.order) ? raw.order : index + 1;
  return { id: raw.id, name, order, collapsed: raw.collapsed === true };
}

function pushToServer() {
  const body = { groups: listGroups(), boardGroups: readBoardGroupMap() };
  fetch(GROUPS_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(() => {});
}

export function listGroups() {
  const raw = readJson(GROUPS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((group, index) => normalizeGroup(group, index))
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
}

export function createGroup(name = 'New Group') {
  const groups = listGroups();
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const group = {
    id: generateUUID(),
    name: trimmed || 'New Group',
    order: groups.length + 1,
    collapsed: false
  };
  writeJson(GROUPS_KEY, [...groups, group]);
  pushToServer();
  return group;
}

export function renameGroup(groupId, newName) {
  const id = typeof groupId === 'string' ? groupId : '';
  const name = typeof newName === 'string' ? newName.trim() : '';
  if (!id || !name) return false;

  const groups = listGroups();
  if (!groups.some((group) => group.id === id)) return false;

  writeJson(GROUPS_KEY, groups.map((group) => (group.id === id ? { ...group, name } : group)));
  pushToServer();
  return true;
}

export function setGroupCollapsed(groupId, collapsed) {
  const id = typeof groupId === 'string' ? groupId : '';
  if (!id) return false;

  const groups = listGroups();
  if (!groups.some((group) => group.id === id)) return false;

  writeJson(
    GROUPS_KEY,
    groups.map((group) => (group.id === id ? { ...group, collapsed: collapsed === true } : group))
  );
  pushToServer();
  return true;
}

export function toggleGroupCollapsed(groupId) {
  const group = listGroups().find((entry) => entry.id === groupId);
  if (!group) return false;
  return setGroupCollapsed(groupId, !group.collapsed);
}

export function deleteGroup(groupId) {
  const id = typeof groupId === 'string' ? groupId : '';
  if (!id) return false;

  const groups = listGroups();
  if (!groups.some((group) => group.id === id)) return false;

  writeJson(GROUPS_KEY, groups.filter((group) => group.id !== id));

  const map = readBoardGroupMap();
  let changed = false;
  for (const boardId of Object.keys(map)) {
    if (map[boardId] === id) {
      delete map[boardId];
      changed = true;
    }
  }
  if (changed) writeJson(BOARD_GROUP_KEY, map);
  pushToServer();
  return true;
}

export function readBoardGroupMap() {
  const raw = readJson(BOARD_GROUP_KEY, {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const map = {};
  for (const [boardId, groupId] of Object.entries(raw)) {
    if (typeof boardId === 'string' && typeof groupId === 'string' && groupId) {
      map[boardId] = groupId;
    }
  }
  return map;
}

export function getGroupIdForBoard(boardId) {
  const id = typeof boardId === 'string' ? boardId : '';
  if (!id) return null;
  return readBoardGroupMap()[id] || null;
}

export function assignBoardToGroup(boardId, groupId) {
  const id = typeof boardId === 'string' ? boardId : '';
  if (!id) return false;

  const map = readBoardGroupMap();
  const target = typeof groupId === 'string' ? groupId : '';
  const groupExists = target ? listGroups().some((group) => group.id === target) : false;

  if (groupExists) map[id] = target;
  else delete map[id];

  writeJson(BOARD_GROUP_KEY, map);
  pushToServer();
  return true;
}

export function pruneBoardGroups(validBoardIds) {
  const valid = new Set(Array.isArray(validBoardIds) ? validBoardIds : []);
  const map = readBoardGroupMap();

  let changed = false;
  for (const boardId of Object.keys(map)) {
    if (!valid.has(boardId)) {
      delete map[boardId];
      changed = true;
    }
  }
  if (changed) {
    writeJson(BOARD_GROUP_KEY, map);
    pushToServer();
  }
  return changed;
}

export function adoptGroupsState(state) {
  if (!state || typeof state !== 'object') return;
  if (Array.isArray(state.groups)) {
    writeJson(GROUPS_KEY, state.groups.map((group, index) => normalizeGroup(group, index)).filter(Boolean));
  }
  if (state.boardGroups && typeof state.boardGroups === 'object' && !Array.isArray(state.boardGroups)) {
    writeJson(BOARD_GROUP_KEY, state.boardGroups);
  }
}

export function initGroupSync() {
  if (initGroupSync._started) return;
  initGroupSync._started = true;

  fetch(GROUPS_API, { headers: { accept: 'application/json' } })
    .then((res) => (res.ok ? res.json() : null))
    .then((state) => {
      if (!state) return;
      if (Array.isArray(state.groups) && state.groups.length > 0) {
        adoptGroupsState(state);
        markMigrated();
        emit(DATA_CHANGED);
      } else if (!isMigrated() && listGroups().length > 0) {
        pushToServer();
        markMigrated();
      }
    })
    .catch(() => {});

  window.addEventListener('kanvana:groups-changed', (event) => {
    adoptGroupsState(event.detail);
    emit(DATA_CHANGED);
  });
}
