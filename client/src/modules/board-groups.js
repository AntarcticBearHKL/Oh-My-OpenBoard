import { generateUUID, readLocalJson as readJson, writeLocalJson as writeJson } from './utils.js';
import { emit, DATA_CHANGED } from './events.js';

export const GROUPS_KEY = 'openagile:groups';
export const BOARD_GROUP_KEY = 'openagile:boardGroup';
export const UNTITLED_GROUP_NAME = 'Untitled group';

const GROUPS_MIGRATED_KEY = 'openagile:groupsMigrated';
const ITERATION_NAME_PREFIX = 'Iteration';

function markMigrated() {
  try { localStorage.setItem(GROUPS_MIGRATED_KEY, '1'); } catch { /* ignore */ }
}

function isMigrated() {
  try { return localStorage.getItem(GROUPS_MIGRATED_KEY) === '1'; } catch { return false; }
}

const GROUPS_API = '/api/groups';

function normalizeGroup(raw, index) {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : UNTITLED_GROUP_NAME;
  const order = Number.isFinite(raw.order) ? raw.order : index + 1;
  return { id: raw.id, name, order, collapsed: raw.collapsed === true, prefixCollapsed: raw.prefixCollapsed === true };
}

export function iterationLabel(index) {
  return `${ITERATION_NAME_PREFIX} ${index + 1}`;
}

function groupSignature(group) {
  return [group.id, group.name, group.order, group.collapsed === true, group.prefixCollapsed === true];
}

function stateSignature(groups, boardGroups) {
  const groupKeys = (Array.isArray(groups) ? groups : [])
    .slice()
    .sort((a, b) => (a.order - b.order) || String(a.id).localeCompare(String(b.id)))
    .map(groupSignature);
  const mapKeys = Object.keys(boardGroups || {})
    .sort()
    .map((boardId) => [boardId, boardGroups[boardId]]);
  return JSON.stringify([groupKeys, mapKeys]);
}

let syncedSignature = null;
let pushQueued = false;

// The server echoes every POST /api/groups back over SSE: the signature keeps
// that echo from being adopted as a local change and pushed again.
function pushToServer() {
  if (pushQueued) return;
  pushQueued = true;
  queueMicrotask(() => {
    pushQueued = false;
    const groups = listGroups();
    const boardGroups = readBoardGroupMap();
    const signature = stateSignature(groups, boardGroups);
    if (signature === syncedSignature) return;
    syncedSignature = signature;
    fetch(GROUPS_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ groups, boardGroups })
    }).catch(() => {});
  });
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
    collapsed: false,
    prefixCollapsed: false
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

export function setGroupPrefixCollapsed(groupId, collapsed) {
  const id = typeof groupId === 'string' ? groupId : '';
  if (!id) return false;

  const groups = listGroups();
  if (!groups.some((group) => group.id === id)) return false;

  writeJson(
    GROUPS_KEY,
    groups.map((group) => (group.id === id ? { ...group, prefixCollapsed: collapsed === true } : group))
  );
  pushToServer();
  return true;
}

export function toggleGroupPrefixCollapsed(groupId) {
  const group = listGroups().find((entry) => entry.id === groupId);
  if (!group) return false;
  return setGroupPrefixCollapsed(groupId, !group.prefixCollapsed);
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

function normalizeBoardGroupMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const map = {};
  for (const [boardId, groupId] of Object.entries(raw)) {
    if (typeof boardId === 'string' && typeof groupId === 'string' && groupId) {
      map[boardId] = groupId;
    }
  }
  return map;
}

export function readBoardGroupMap() {
  return normalizeBoardGroupMap(readJson(BOARD_GROUP_KEY, {}));
}

export function getGroupIdForBoard(boardId) {
  const id = typeof boardId === 'string' ? boardId : '';
  if (!id) return null;
  return readBoardGroupMap()[id] || null;
}

export function nextIterationName(groupId) {
  const groups = listGroups();
  const requested = typeof groupId === 'string' ? groupId : '';
  const target = requested || groups[groups.length - 1]?.id || '';
  if (!target) return iterationLabel(0);

  const map = readBoardGroupMap();
  const count = Object.values(map).filter((value) => value === target).length;
  return iterationLabel(count);
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
  if (valid.size === 0) return false;
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

export function ensureBoardsGrouped(boardIds) {
  const ids = Array.isArray(boardIds) ? boardIds.filter((boardId) => typeof boardId === 'string' && boardId) : [];
  if (ids.length === 0) return null;

  const groups = listGroups();
  const map = readBoardGroupMap();
  const known = new Set(groups.map((group) => group.id));
  const orphans = ids.filter((boardId) => !known.has(map[boardId]));
  if (orphans.length === 0) return null;

  const targetId = groups.length > 0 ? groups[groups.length - 1].id : createGroup().id;
  for (const boardId of orphans) assignBoardToGroup(boardId, targetId);
  return targetId;
}

export function adoptGroupsState(state) {
  if (!state || typeof state !== 'object') return false;
  const hasGroups = Array.isArray(state.groups);
  const incomingMap = state.boardGroups && typeof state.boardGroups === 'object' && !Array.isArray(state.boardGroups);
  if (!hasGroups && !incomingMap) return false;

  const groups = hasGroups
    ? state.groups.map((group, index) => normalizeGroup(group, index)).filter(Boolean)
    : listGroups();
  const boardGroups = incomingMap ? normalizeBoardGroupMap(state.boardGroups) : readBoardGroupMap();
  const signature = stateSignature(groups, boardGroups);
  if (signature === stateSignature(listGroups(), readBoardGroupMap())) {
    syncedSignature = signature;
    return false;
  }

  if (hasGroups) writeJson(GROUPS_KEY, groups);
  if (incomingMap) writeJson(BOARD_GROUP_KEY, boardGroups);
  syncedSignature = signature;
  return true;
}

export function initGroupSync() {
  if (initGroupSync._started) return;
  initGroupSync._started = true;

  fetch(GROUPS_API, { headers: { accept: 'application/json' } })
    .then((res) => (res.ok ? res.json() : null))
    .then((state) => {
      if (!state) return;
      if (Array.isArray(state.groups) && state.groups.length > 0) {
        if (adoptGroupsState(state)) emit(DATA_CHANGED, { affectsBoard: false });
        markMigrated();
      } else if (!isMigrated() && listGroups().length > 0) {
        pushToServer();
        markMigrated();
      }
    })
    .catch(() => {});

  window.addEventListener('openagile:groups-changed', (event) => {
    if (!adoptGroupsState(event.detail)) return;
    emit(DATA_CHANGED, { affectsBoard: false });
  });
}
