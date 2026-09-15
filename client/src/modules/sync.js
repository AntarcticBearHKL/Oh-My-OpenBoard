import PocketBase from 'pocketbase';
import {
  loadColumnsForBoard,
  loadTasksForBoard,
  loadLabelsForBoard,
  loadSettingsForBoard,
  loadDeletedColumnsForBoard,
  loadDeletedTasksForBoard,
  loadDeletedLabelsForBoard,
  purgeDeleted,
  saveColumnsForBoard,
  saveTasksForBoard,
  saveLabelsForBoard,
  saveSettingsForBoard,
  mergeBoardsFromRemote,
  getBoardById,
  setActiveBoardId,
  getActiveBoardId,
} from './storage.js';
import { readLocalJson } from './utils.js';

const PB_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PB_URL) || '/';
const pb = new PocketBase(PB_URL);

const SYNC_MAP_KEY = 'kanbanSyncMap';

pb.authStore.onChange(() => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth-changed'));
  }
});

export function getPb() {
  return pb;
}

export function isAuthenticated() {
  return Boolean(pb.authStore.token && pb.authStore.record);
}

export async function ensureAuthenticated() {
  if (!pb.authStore.token || !pb.authStore.record) return false;
  if (pb.authStore.isValid) return true;
  try {
    await pb.collection('users').authRefresh();
    return Boolean(pb.authStore.token && pb.authStore.record);
  } catch {
    return false;
  }
}

export function getUser() {
  return pb.authStore.record;
}

export async function loginUser(email, password) {
  return pb.collection('users').authWithPassword(email, password);
}

export async function registerUser(email, password, name) {
  return pb.collection('users').create({
    email,
    password,
    passwordConfirm: password,
    name: name || '',
  });
}

export function logoutUser() {
  pb.authStore.clear();
}

export async function loginWithProvider(provider) {
  return pb.collection('users').authWithOAuth2({ provider });
}

// ── syncMap ────────────────────────────────────────────────────────────────────

function emptySyncMap() {
  return { boards: {}, columns: {}, labels: {}, tasks: {}, task_relationships: {}, events: {} };
}

function loadSyncMap() {
  const parsed = readLocalJson(SYNC_MAP_KEY, null);
  // Ensure new entity-type buckets exist in stored maps from older versions.
  return { ...emptySyncMap(), ...(parsed ?? {}) };
}

function saveSyncMap(map) {
  localStorage.setItem(SYNC_MAP_KEY, JSON.stringify(map));
}

function getPbId(syncMap, entityType, localId) {
  return syncMap[entityType]?.[localId] || null;
}

function setPbId(syncMap, entityType, localId, pbId) {
  if (!syncMap[entityType]) syncMap[entityType] = {};
  syncMap[entityType][localId] = pbId;
}

async function deleteMappedRecord(collection, syncMap, entityType, localId) {
  const pbId = getPbId(syncMap, entityType, localId);
  if (!pbId) return;
  try { await pb.collection(collection).delete(pbId); } catch { /* 404 ok */ }
  delete syncMap[entityType][localId];
}

async function upsertRecord(collection, syncMap, entityType, localId, data) {
  const pbId = getPbId(syncMap, entityType, localId);
  if (pbId) {
    try {
      return await pb.collection(collection).update(pbId, data);
    } catch (err) {
      if (err?.status !== 404) throw err;
    }
  }
  const record = await pb.collection(collection).create(data);
  setPbId(syncMap, entityType, localId, record.id);
  return record;
}


export async function deleteBoardRemote(boardId) {
  if (!(await ensureAuthenticated())) throw new Error('Not authenticated');

  const syncMap = loadSyncMap();
  const boardPbId = getPbId(syncMap, 'boards', boardId);
  if (!boardPbId) return false;

  const columns = [...loadColumnsForBoard(boardId), ...loadDeletedColumnsForBoard(boardId)];
  const labels = [...loadLabelsForBoard(boardId), ...loadDeletedLabelsForBoard(boardId)];
  const tasks = [...loadTasksForBoard(boardId), ...loadDeletedTasksForBoard(boardId)];

  const taskIds = new Set(tasks.map((task) => task.id).filter(Boolean));
  const relationshipIds = new Set();

  for (const task of tasks) {
    for (const rel of (task.relationships || [])) {
      if (rel?.targetTaskId) relationshipIds.add(`${task.id}::${rel.targetTaskId}`);
    }
  }

  for (const localId of Object.keys(syncMap.task_relationships || {})) {
    const [sourceId, targetId] = localId.split('::');
    if (taskIds.has(sourceId) || taskIds.has(targetId)) relationshipIds.add(localId);
  }

  for (const localId of relationshipIds) {
    await deleteMappedRecord('task_relationships', syncMap, 'task_relationships', localId);
  }
  for (const task of tasks) {
    await deleteMappedRecord('tasks', syncMap, 'tasks', task.id);
  }
  for (const label of labels) {
    await deleteMappedRecord('labels', syncMap, 'labels', label.id);
  }
  for (const column of columns) {
    await deleteMappedRecord('columns', syncMap, 'columns', column.id);
  }

  try { await pb.collection('boards').delete(boardPbId); } catch { /* 404 ok */ }
  delete syncMap.boards[boardId];
  saveSyncMap(syncMap);
  return true;
}

