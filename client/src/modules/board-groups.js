import { generateUUID, readLocalJson as readJson, writeLocalJson as writeJson } from './utils.js';
import { emit, DATA_CHANGED } from './events.js';

export const GROUPS_KEY = 'openagile:groups';
export const BOARD_GROUP_KEY = 'openagile:boardGroup';
export const UNGROUPED_GROUP_ID = '__ungrouped__';

const GROUPS_MIGRATED_KEY = 'openagile:groupsMigrated';
const GROUP_NAME_PREFIX = 'Iterations';

function markMigrated() {
  try { localStorage.setItem(GROUPS_MIGRATED_KEY, '1'); } catch { /* ignore */ }
}

function isMigrated() {
  try { return localStorage.getItem(GROUPS_MIGRATED_KEY) === '1'; } catch { return false; }
}

const GROUPS_API = '/api/groups';

function deriveGroupNames(groups) {
  return groups.map((group, index) => ({
    ...group,
    order: index + 1,
    name: `${GROUP_NAME_PREFIX} ${index + 1}`
  }));
}

function normalizeGroup(raw, index) {
  if (!raw || typeof raw.id !== 'string' || !raw.id.trim()) return null;
  const order = Number.isFinite(raw.order) ? raw.order : index + 1;
  return { id: raw.id, order, collapsed: raw.collapsed === true, prefixCollapsed: raw.prefixCollapsed === true };
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
  const groups = raw
    .map((group, index) => normalizeGroup(group, index))
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
  return deriveGroupNames(groups);
}

export function createGroup() {
  const groups = listGroups();
  const order = groups.length + 1;
  const group = {
    id: generateUUID(),
    name: `${GROUP_NAME_PREFIX} ${order}`,
    order,
    collapsed: false,
    prefixCollapsed: false
  };
  writeJson(GROUPS_KEY, [...groups, group]);
  pushToServer();
  return group;
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

  writeJson(GROUPS_KEY, deriveGroupNames(groups.filter((group) => group.id !== id)));

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
  if (!state || typeof state !== 'object') return;
  if (Array.isArray(state.groups)) {
    writeJson(
      GROUPS_KEY,
      deriveGroupNames(state.groups.map((group, index) => normalizeGroup(group, index)).filter(Boolean))
    );
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
        emit(DATA_CHANGED, { affectsBoard: false });
      } else if (!isMigrated() && listGroups().length > 0) {
        pushToServer();
        markMigrated();
      }
    })
    .catch(() => {});

  window.addEventListener('openagile:groups-changed', (event) => {
    adoptGroupsState(event.detail);
    emit(DATA_CHANGED, { affectsBoard: false });
  });
}
