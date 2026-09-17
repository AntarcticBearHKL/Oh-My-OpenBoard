// Server-side authoritative event log + read-model projection for the OpenAgile
// harness. It reuses the client's PURE reducer (client/src/modules/reducer.js)
// so the server and every browser project the identical domain events.
//
// Ordering authority: the server appends and assigns a monotonic `seq` in a
// single synchronous turn. SSE delivery follows seq order per connection, which
// is what the browser bridge relies on (live projection is per-event, so arrival
// order must equal commit order).

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { applyEvent, createProjectionState } from '../../client/src/modules/reducer.js';
import { emitLocalSync, initHlc, observeRemote } from './hlc.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.OPENAGILE_DATA_DIR
  ? resolve(process.env.OPENAGILE_DATA_DIR)
  : join(HERE, '..', 'data');
const STATE_FILE = join(DATA_DIR, 'state.json');

// Same stable ids the browser seeds on first run, so both sides converge by id.
export const DEFAULT_BOARD_ID = '00000000-0000-4000-8000-000000000001';

export const STABLE_COLUMNS = [
  { id: '00000000-0000-4000-8000-000000000030', name: 'Backlog', color: '#3583ff', order: 1 },
  { id: '00000000-0000-4000-8000-000000000034', name: 'Human In The Loop', color: '#8b5cf6', order: 2 },
  { id: '00000000-0000-4000-8000-000000000031', name: 'In Progress', color: '#f59e0b', order: 3 },
  { id: '00000000-0000-4000-8000-000000000032', name: 'Blocked', color: '#ef4444', order: 4 },
  { id: '00000000-0000-4000-8000-000000000033', name: 'Finished', color: '#16a34a', order: 5, role: 'done' }
];

export const IN_PROGRESS_COLUMN_ID = STABLE_COLUMNS[2].id;
const BLOCKED_COLUMN_ID = STABLE_COLUMNS[3].id;

export const STABLE_LABELS = [
  { id: '00000000-0000-4000-8000-000000000020', name: 'Task', color: '#f59e0b', group: 'Activity' },
  { id: '00000000-0000-4000-8000-000000000021', name: 'Meeting', color: '#ffd001', group: 'Activity' },
  { id: '00000000-0000-4000-8000-000000000022', name: 'Email', color: '#d4a300', group: 'Activity' },
  { id: '00000000-0000-4000-8000-000000000023', name: 'Idea', color: '#25b631', group: '' },
  { id: '00000000-0000-4000-8000-000000000024', name: 'Goal', color: '#1b7cbd', group: '' }
];

let meta = { nodeId: null, seq: 0 };
let events = [];
let groups = [];
let boardGroups = {};
let noBoards = false;
let skills = [];
let skillsSeeded = false;
const seenIds = new Set();
const appliedIds = new Set();

let boards = [];
const tasksByBoard = new Map();
const columnsByBoard = new Map();
const labelsByBoard = new Map();
const settingsByBoard = new Map();

let persistTimer = null;

// ── Projection (mirrors read-model-projector.js) ──────────────────────────────

function project(event) {
  if (!event?.id || appliedIds.has(event.id)) return;
  appliedIds.add(event.id);

  const boardId = event.board_id;
  if (typeof boardId !== 'string' || !boardId) return;

  const projected = applyEvent(createProjectionState({
    boards,
    tasks: tasksByBoard.get(boardId) || [],
    columns: columnsByBoard.get(boardId) || [],
    labels: labelsByBoard.get(boardId) || [],
    settings: settingsByBoard.get(boardId) || {}
  }), event);

  boards = projected.boards;
  tasksByBoard.set(boardId, projected.tasks);
  columnsByBoard.set(boardId, projected.columns);
  labelsByBoard.set(boardId, projected.labels);
  settingsByBoard.set(boardId, projected.settings);
}

function entityExists(type, entityId, boardId) {
  if (!entityId) return false;
  if (type === 'board.created') return boards.some((b) => b.id === entityId);
  if (type === 'column.created') return (columnsByBoard.get(boardId) || []).some((c) => c.id === entityId);
  if (type === 'label.created') return (labelsByBoard.get(boardId) || []).some((l) => l.id === entityId);
  if (type === 'task.created') return (tasksByBoard.get(boardId) || []).some((t) => t.id === entityId);
  return false;
}

// Append one already-built event. Idempotent: duplicate ids and duplicate
// *.created entities (browser scaffold vs server scaffold) are dropped.
function appendEvent(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id || !raw.type) return null;
  if (seenIds.has(raw.id)) return null;
  if (raw.type.endsWith('.created') && entityExists(raw.type, raw.entity_id, raw.board_id)) return null;

  const nextSeq = meta.seq + 1;
  const event = { ...raw, seq: nextSeq };

  try {
    project(event);
  } catch (err) {
    console.error('[OpenAgile] Rejected an event that failed to project:', raw.type, err);
    return null;
  }

  if (raw.hlc) observeRemote(raw.hlc);
  meta.seq = nextSeq;
  events.push(event);
  seenIds.add(event.id);
  schedulePersist();
  if (events.length >= COMPACT_AFTER_EVENTS) compactEvents();
  return event;
}

export function appendEvents(list) {
  const out = [];
  for (const raw of (Array.isArray(list) ? list : [list])) {
    const event = appendEvent(raw);
    if (event) out.push(event);
  }
  return out;
}

// Build + append a domain event authored by the server (MCP tools).
export function emit(type, {
  boardId = DEFAULT_BOARD_ID,
  entityId = '',
  payload = {},
  actor = { type: 'agent', id: 'openagile-harness' },
  scope = 'board'
} = {}) {
  const event = {
    id: randomUUID(),
    type,
    hlc: emitLocalSync(),
    at: new Date().toISOString(),
    actor,
    scope,
    board_id: scope === 'board' ? boardId : null,
    entity_id: entityId,
    payload
  };
  return appendEvent(event);
}

// ── Compaction ────────────────────────────────────────────────────────────────

// Highest seq already folded into the persisted read-model snapshot (0 = never
// compacted). Clients that are behind hydrate from /api/snapshot at boot and tail
// from snapshot.seq, so a trimmed range is never replayed.
let trimSeq = 0;
const COMPACT_AFTER_EVENTS = 5000;

function snapshotReadModel() {
  return {
    seq: meta.seq,
    boards,
    tasksByBoard: [...tasksByBoard.entries()],
    columnsByBoard: [...columnsByBoard.entries()],
    labelsByBoard: [...labelsByBoard.entries()],
    settingsByBoard: [...settingsByBoard.entries()]
  };
}

function hydrateReadModel(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (Array.isArray(snapshot.boards)) boards = snapshot.boards;
  const restore = (map, entries) => {
    map.clear();
    for (const [key, value] of Array.isArray(entries) ? entries : []) map.set(key, value);
  };
  restore(tasksByBoard, snapshot.tasksByBoard);
  restore(columnsByBoard, snapshot.columnsByBoard);
  restore(labelsByBoard, snapshot.labelsByBoard);
  restore(settingsByBoard, snapshot.settingsByBoard);
  return true;
}

// ── Persistence ───────────────────────────────────────────────────────────────

function persistNow() {
  const payload = JSON.stringify({
    nodeId: meta.nodeId,
    seq: meta.seq,
    trimSeq,
    snapshot: trimSeq > 0 ? snapshotReadModel() : null,
    events,
    groups,
    boardGroups,
    noBoards,
    skills,
    skillsSeeded
  });
  const tmp = `${STATE_FILE}.tmp`;
  writeFileSync(tmp, payload);
  renameSync(tmp, STATE_FILE);
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try { persistNow(); } catch (err) { console.error('[harness] persist failed', err); }
  }, 200);
}

export function flushStore() {
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  try { persistNow(); } catch { /* ignore */ }
}

// Fold the whole log into a read-model snapshot and drop it. `getStats().trimSeq`
// reports the floor. Note this forgets event ids: a client that re-posts an event
// from before the floor after a restart is no longer rejected by id (the
// *.created dedupe still applies).
export function compactEvents() {
  if (events.length === 0) return { compacted: false, seq: meta.seq, trimSeq };
  trimSeq = meta.seq;
  events = [];
  schedulePersist();
  return { compacted: true, seq: meta.seq, trimSeq };
}

// ── Seed ──────────────────────────────────────────────────────────────────────

function seedDefaultBoardIfEmpty() {
  if (boards.length > 0 || noBoards) return;
  const now = new Date().toISOString();
  appendEvent({
    id: randomUUID(), type: 'board.created', hlc: emitLocalSync(), at: now,
    actor: { type: 'agent', id: 'openagile-harness' }, scope: 'board',
    board_id: DEFAULT_BOARD_ID, entity_id: DEFAULT_BOARD_ID,
    payload: { board: { id: DEFAULT_BOARD_ID, name: 'Default Board', createdAt: now } }
  });
  for (const column of STABLE_COLUMNS) {
    appendEvent({
      id: randomUUID(), type: 'column.created', hlc: emitLocalSync(), at: now,
      actor: { type: 'agent', id: 'openagile-harness' }, scope: 'board',
      board_id: DEFAULT_BOARD_ID, entity_id: column.id,
      payload: { column: { ...column } }
    });
  }
  for (const label of STABLE_LABELS) {
    appendEvent({
      id: randomUUID(), type: 'label.created', hlc: emitLocalSync(), at: now,
      actor: { type: 'agent', id: 'openagile-harness' }, scope: 'board',
      board_id: DEFAULT_BOARD_ID, entity_id: label.id,
      payload: { label: { ...label } }
    });
  }
}

export function initStore() {
  mkdirSync(DATA_DIR, { recursive: true });

  // Replay persisted events in commit (seq) order to rebuild the read model.
  let loadedEvents = [];
  let loadedSnapshot = null;
  if (existsSync(STATE_FILE)) {
    try {
      const loaded = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
      meta = {
        nodeId: typeof loaded?.nodeId === 'string' ? loaded.nodeId : null,
        seq: Number.isFinite(loaded?.seq) ? loaded.seq : 0
      };
      if (Array.isArray(loaded?.events)) loadedEvents = loaded.events;
      if (Array.isArray(loaded?.groups)) groups = loaded.groups;
      if (loaded?.boardGroups && typeof loaded.boardGroups === 'object') boardGroups = loaded.boardGroups;
      if (loaded?.noBoards === true) noBoards = true;
      if (Array.isArray(loaded?.skills)) skills = loaded.skills;
      if (loaded?.skillsSeeded === true) skillsSeeded = true;
      if (Number.isFinite(loaded?.trimSeq)) trimSeq = loaded.trimSeq;
      if (loaded?.snapshot && typeof loaded.snapshot === "object") loadedSnapshot = loaded.snapshot;
    } catch (err) {
      console.error('[harness] state file unreadable, starting fresh', err?.message);
      meta = { nodeId: null, seq: 0 };
      groups = [];
      boardGroups = {};
      noBoards = false;
      skills = [];
      skillsSeeded = false;
    }
  }
  if (!meta.nodeId) meta.nodeId = randomUUID();
  initHlc(meta.nodeId);

  // A persisted snapshot already contains every event at or below its seq, so
  // those are not replayed (the log holds only what came after it).
  const snapshotSeq = hydrateReadModel(loadedSnapshot) && Number.isFinite(loadedSnapshot.seq) ? loadedSnapshot.seq : 0;

  for (const event of loadedEvents) {
    if (!event?.id || seenIds.has(event.id)) continue;
    if (Number.isFinite(event.seq) && event.seq <= snapshotSeq) { seenIds.add(event.id); continue; }
    if (!Number.isFinite(event.seq)) event.seq = ++meta.seq;
    else meta.seq = Math.max(meta.seq, event.seq);
    if (event.hlc) observeRemote(event.hlc);
    events.push(event);
    seenIds.add(event.id);
    project(event);
  }

  seedDefaultBoardIfEmpty();
  seedDefaultSkillsIfEmpty();
  schedulePersist();

  return { boardId: DEFAULT_BOARD_ID, seq: meta.seq, events: events.length };
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export function getBoards() {
  return boards
    .filter((b) => !b.deleted)
    .map((b) => ({ id: b.id, name: b.name, createdAt: b.createdAt, groupId: boardGroups[b.id] || '' }));
}

export function getBoard(boardId) {
  return boards.find((b) => b.id === boardId && !b.deleted) || null;
}

export function getColumns(boardId) {
  const stored = new Map(
    (columnsByBoard.get(boardId) || [])
      .filter((column) => !column.deleted && typeof column.id === 'string')
      .map((column) => [column.id, column])
  );

  return STABLE_COLUMNS.map((template) => {
    const previous = stored.get(template.id) || {};
    return {
      ...template,
      color: typeof previous.color === 'string' && previous.color ? previous.color : template.color,
      collapsed: previous.collapsed === true,
      wipLimit: Number.isFinite(previous.wipLimit) ? previous.wipLimit : 0
    };
  });
}

export function getLabels(boardId) {
  return (labelsByBoard.get(boardId) || []).filter((l) => !l.deleted);
}

export function getTasks(boardId) {
  return (tasksByBoard.get(boardId) || []).filter((t) => !t.deleted);
}

export function getSettings(boardId) {
  return settingsByBoard.get(boardId) || {};
}

export function findTask(taskId) {
  for (const [boardId, list] of tasksByBoard) {
    const task = (list || []).find((t) => t.id === taskId && !t.deleted);
    if (task) return { task, boardId };
  }
  return null;
}

function buildBoardOrder(boardId, taskId, targetColumnId) {
  const byColumn = new Map();
  for (const task of tasksByBoard.get(boardId) || []) {
    if (task.deleted) continue;
    const column = task.id === taskId ? targetColumnId : task.column;
    if (!byColumn.has(column)) byColumn.set(column, []);
    byColumn.get(column).push({ ...task, column });
  }
  const order = [];
  for (const [columnId, list] of byColumn) {
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    list.forEach((task, index) => order.push({ id: task.id, column: columnId, order: index + 1 }));
  }
  return order;
}

const CLAIM_STALE_MS = 5 * 60 * 1000;
const CLAIM_STALE_REASON = 'Auto-blocked: no agent sync for over 5 minutes.';

// Stale claims move with two events, exactly like a client drag: task.moved plus the blocked task.updated.
export function sweepStaleClaims(now = Date.now()) {
  const stale = [];
  for (const [boardId, tasks] of tasksByBoard) {
    for (const task of tasks) {
      if (task.deleted || task.column !== IN_PROGRESS_COLUMN_ID) continue;
      if (!task.claimedBy && !task.claimedAt) continue;
      const changedAt = Date.parse(task.changeDate);
      if (Number.isFinite(changedAt) && now - changedAt > CLAIM_STALE_MS) stale.push({ boardId, taskId: task.id });
    }
  }

  const moved = [];
  for (const { boardId, taskId } of stale) {
    const task = (tasksByBoard.get(boardId) || []).find((entry) => entry.id === taskId && !entry.deleted && entry.column === IN_PROGRESS_COLUMN_ID);
    if (!task) continue;
    const order = buildBoardOrder(boardId, taskId, BLOCKED_COLUMN_ID);
    emit('task.moved', { boardId, entityId: taskId, payload: { order } });
    const at = new Date(now).toISOString();
    emit('task.updated', {
      boardId,
      entityId: taskId,
      payload: { fields: { blockedReason: CLAIM_STALE_REASON, blockedAt: at, changeDate: at } }
    });
    console.log(`[harness] auto-blocked ${task.key || taskId} (no sync for 5 minutes)`);
    moved.push(taskId);
  }
  return moved;
}

// Digest gate shared by the MCP tools and the browser bridge: both paths must
// refuse the same states, so the predicate and its message live here.
export function pendingNotes(task) {
  return (Array.isArray(task?.keyPoints) ? task.keyPoints : []).filter((point) => !point?.digestedAt);
}

export function pendingNotesMessage(task) {
  if (task?.needsDigest !== true && pendingNotes(task).length === 0) return null;
  return `Task ${task.key || task.id} still has notes from the human that the agent has not digested; run digest_key_points first to fold them into the description before starting.`;
}

export function digestKeyPoints(taskId, pointIds) {
  const found = findTask(taskId);
  if (!found) throw new Error(`Task not found: ${taskId}`);
  const { task, boardId } = found;
  const keyPoints = Array.isArray(task.keyPoints) ? task.keyPoints : [];
  const selected = Array.isArray(pointIds) && pointIds.length > 0 ? new Set(pointIds) : null;
  const now = new Date().toISOString();
  const digested = [];
  const next = keyPoints.map((point) => {
    const target = selected ? selected.has(point.id) : !point.digestedAt;
    if (!target) return point;
    digested.push(point.id);
    return { ...point, digestedAt: now };
  });
  emit('task.updated', {
    boardId,
    entityId: taskId,
    payload: { fields: { keyPoints: next, needsDigest: false, changeDate: now } }
  });
  return { taskId, digested };
}

export function getSeq() {
  return meta.seq;
}

export function getEventsSince(since) {
  return events.filter((e) => (e.seq ?? 0) > since);
}

export function getSnapshot(boardId = DEFAULT_BOARD_ID) {
  return {
    seq: meta.seq,
    boardId,
    state: {
      boards,
      tasks: tasksByBoard.get(boardId) || [],
      columns: getColumns(boardId),
      labels: labelsByBoard.get(boardId) || [],
      settings: settingsByBoard.get(boardId) || {}
    }
  };
}

export function getStats() {
  return {
    boards: getBoards().length,
    events: events.length,
    seq: meta.seq,
    trimSeq,
    nodeId: meta.nodeId
  };
}

export function resolveGroup(groupId = '') {
  const groups = getGroups();
  const target = groupId ? groups.find((entry) => entry.id === groupId) : groups[groups.length - 1];
  if (!target) {
    throw new Error(groupId
      ? `Group not found: ${groupId}`
      : 'No groups exist; create a group first: every iteration belongs to a group');
  }
  return target;
}

export function createBoard({ groupId = '' } = {}) {
  const group = resolveGroup(groupId);
  const position = getBoards().filter((board) => board.groupId === group.id).length + 1;
  const boardId = randomUUID();
  const board = { id: boardId, name: `Iteration ${position}`, createdAt: new Date().toISOString() };
  emit('board.created', { boardId, entityId: boardId, payload: { board } });
  noBoards = false;
  boardGroups[boardId] = group.id;
  schedulePersist();
  return { ...board, groupId: group.id };
}

export function deleteBoard(boardId) {
  if (!getBoard(boardId)) throw new Error(`Board not found: ${boardId}`);
  emit('board.deleted', { boardId, entityId: boardId, payload: {} });
  if (boardGroups[boardId]) delete boardGroups[boardId];
  if (getBoards().length === 0) noBoards = true;
  schedulePersist();
  return { deleted: boardId };
}

export const DEFAULT_SKILLS = [
  {
    name: '人与 subagent 的协作工作方式',
    description: '人与 AI subagent 在这块看板上如何分工与交接。',
    content: [
      '这块看板是「人 + 多个 AI subagent」共享的唯一事实来源。任务主要由 AI 填写与搬动，人负责看、定方向、下指令。',
      '',
      '【职责分工——谁写什么】',
      '- 描述（description）是 agent 的：立项时由 agent 写，之后由 agent 维护，也是 agent 的回复面。',
      '- 给 agent 的备注（notes to the agent，数据字段 keyPoints）是人的：人一次加一条，agent 只读，不得增删改。',
      '- 任务对话框里只有标题、描述和给 agent 的备注这三样；人写备注，agent 把备注折进描述。',
      '',
      '【人的职责】',
      '- 随时点开任务：看清它要干什么（描述、给 agent 的备注）。',
      '- 用「给 agent 的备注」写下想法、决定和要 agent 做的事。',
      '- 加备注：除 In Progress 外都能加（Backlog、Human In The Loop、Blocked、Finished）；In Progress 整份表单只读。',
      '- 非 Human In The Loop 的任务，标题和描述都是 agent 的，人只改备注；Human In The Loop 里人可以改全部。',
      '- 人只在 Human In The Loop 列手工建任务；其他列的任务由 agent 或流程产生。',
      '',
      '【AI / subagent 的职责】',
      '- 动手前先读：get_task（含给 agent 的备注）、list_tasks、list_skills。',
      '- 认领：claim_task 写明是哪个 subagent 在做；做完或中断时 release_task；任务还有未消化的备注时 claim_task 会被拒绝。',
      '- 描述由 agent 维护；人的备注不得删改，只能折进描述后标记已消化。',
      '- 开工前必须先消化：把备注折进描述，再用 digest_key_points 清掉 needsDigest；没消化就 claim_task、或把任务移进 In Progress，都会被拒绝。',
      '- 卡住时移到 Blocked 并写 set_blocked_reason。',
      '',
      '【任务字段（当前模型）】',
      '- 创建任务只需要标题和描述；没有优先级、没有截止日期、没有标签、没有子任务。',
      '- 给 agent 的备注（keyPoints）= 人写的一条条要求；描述（description）= agent 维护的完整说明。',
      '',
      '【五列的语义（固定，不可增删）】',
      '- Backlog：已立项、待认领。人在这里读需求、加备注。',
      '- Human In The Loop：人手工建任务的地方；新任务从这里出发。',
      '- In Progress：已被某个 subagent 认领并在处理中 → 任务表单完全锁定（只读）。',
      '- Blocked：卡住了，必须写原因；连续两次日报仍卡住就升级。',
      '- Finished：已完成，是完成情况的统计来源。',
      '',
      '【交接约定】',
      '- 同一时刻一个任务只应被一个 subagent 认领；已被别人认领的任务不要动。',
      '- 交接前把进展写进描述，让人不用逐个点开也知道发生了什么。',
      '- 人加了备注后，agent 应把它当成新的输入，折进描述，再用 digest_key_points 标记已消化；备注未消化前不能开工，claim_task 会被拒绝。'
    ].join('\n')
  },
  {
    name: '如何与 AI agent 一起运转这块看板',
    description: '人与 agent 之间的分工约定。',
    content: [
      '这块看板是人（human）与 AI agent 之间共享的状态。',
      '',
      '人负责：工作方向、给 agent 的备注（keyPoints），以及最终「算不算完成」的拍板。',
      'agent 负责：动手前先通过 MCP 读看板；写并维护描述（description）；认领任务；把人的备注折进描述；',
      '记录卡住的原因；用证据汇报进展。',
      '',
      '协作规则：',
      '- 看板上没有的工作不要凭空开做：先用 create_task 建任务，再做。建任务只需要标题和描述——',
      '  没有优先级、没有截止日期、没有标签、没有子任务。',
      '- 描述是 agent 的，备注是人的：agent 不得增删改 keyPoints，只能读。',
      '- 动手前先消化：任务带 needsDigest 时，先把新备注折进描述，再用 digest_key_points 标记已消化；没消化就 claim_task、或把任务移进 In Progress，都会被拒绝。',
      '- 只有真的动了才移动任务：开始做时移到 In Progress，做不下去时移到 Blocked 并写原因，',
      '  主工作完成后才移到 Finished。',
      '- 人只通过 Human In The Loop 列手工建任务；Backlog 与其余列由 agent 与流程驱动。',
      '- 与其建一个大任务，不如拆成能一次做完的小任务。',
      '- 人写在「给 agent 的备注」里的指示必须回应：把它折进描述，不要让人的话悬着。',
      '- 评审者需要知道的任何事，都写进任务的描述（description）。',
      '',
      '【计时提醒】任务从 claim_task 那一刻开始计时，任何更新都会重置 5 分钟窗口；细则见「认领工作」。'
    ].join('\n')
  },
  {
    name: '任务拆分与备注',
    description: '如何把工作切到能一次做完的程度。',
    content: [
      '一个任务只需要标题和描述就能创建；没有优先级、没有截止日期、没有标签、没有子任务。',
      '',
      '给 agent 的备注（keyPoints）是人的输入，不是勾选清单：人一次加一条，agent 只读，不得增删改。',
      '描述（description）是 agent 的：动手前先把任务上的备注折进描述，再用 digest_key_points 标记已消化。',
      '只有 needsDigest 清掉之后，才算真正准备好开工；带未消化备注就 claim_task 会被直接拒绝。',
      '',
      '拆分规则：',
      '- 一个任务 = 一个结果，一天内可交付。',
      '- 按结果切，不要按阶段或文档切。',
      '- 一个任务一天内做不完，就继续拆成多个任务。',
      '- 需要交代的背景和步骤，都写进描述，由 agent 维护。',
    ].join('\n')
  },
  {
    name: '迭代规划',
    description: '如何用 group／迭代组织工作。',
    content: [
      'group 是人命名的容器，可以改名（人在界面上改名，agent 用 rename_group），里面装着一个或多个迭代。',
      '迭代（iteration）是 group 里的一块看板，按顺序编号（Iteration 1、Iteration 2……），不能手工命名。',
      '一块看板永远属于某个 group，不会独立存在。',
      'group 开头连续若干个「任务全部在 Finished」的迭代，可以用一个控件折叠起来。',
      '',
      '规划流程：',
      '- 开始前先设好迭代日期（startDate/endDate）和一句话目标。',
      '- 只把近期做得了的工作拉进迭代，其余留在 Backlog。',
      '- 让五列保持如实：Backlog、Human In The Loop、In Progress、Blocked、Finished。',
      '- 人只在 Human In The Loop 列手工建任务；Backlog 是 agent 立项的队列。',
      '',
      '读懂数字：',
      '- 每个迭代的起止日期和 Finished 列一起，说明这一轮做完了什么。',
    ].join('\n')
  },
  {
    name: '认领工作',
    description: 'subagent 的归属规则。',
    content: [
      '这块看板是 subagent 级别的协作工具：subagent 认领任务、推进、然后交回。',
      '',
      '认领：',
      '- 动手前先认领（claim_task 填上你的 agent 名），让人看得见任务归谁；任务还有未消化的备注时认领会被拒绝。',
      '- 停下时释放（release_task），即使任务还没做完。',
      '- 不要做没人认领的任务；已被别人认领的就别碰。',
      '',
      '【计时约定】',
      '- 认领那一刻就开始计时：claim_task 会写入认领时间戳；看门狗按它判断你是否还在线。',
      '- 如果预计还要超过约 5 分钟才能做完，agent 必须在到点前同步一次：任务上的任何更新都算同步',
      '  （改描述、digest_key_points 或重新认领），并重新开始 5 分钟窗口。',
      '- 如果大约 5 分钟内没有任何同步，服务端会把任务移到 Blocked、记录原因，计时随即停止。',
      '- 正常流程是由 agent 自己移动卡片：主工作完成就移到 Finished；做不下去或需要人拍板就移到',
      '  Blocked 并写原因。移动卡片才是停止计时的方式，计时因此始终如实。',
      '- 任务主要由 agent 用 create_task 创建（落在 Backlog）；人只能在 Human In The Loop 列手工建任务。',
      '',
      '【备注与返工】',
      '- 任务带 needsDigest 时先别开工：把给 agent 的备注折进描述，再 digest_key_points 标记已消化；未消化就 claim_task 会被直接拒绝。',
      '- 已 Finished 的任务若被人加了新备注，会自动回到 Backlog 并带上 isRework——按返工处理，',
      '  消化新备注后再做。',
      '',
      '备注与回复：',
      '- 给 agent 的备注（keyPoints）是人给 agent 下指令的通道。动手前先读（get_task），人的话不要删。',
      '- 人的每条备注都要读懂并折进描述（description），再用 digest_key_points 标记已消化。任务处于 In Progress 时整个表单都是只读的。',
    ].join('\n')
  },
  {
    name: '阻塞处理与每日同步',
    description: '工作停摆时怎么办，以及每日更新长什么样。',
    content: [
      'Blocked 的含义：没有你控制之外的东西就无法继续推进。',
      '',
      '- 一定要写阻塞原因（set_blocked_reason）；只写「blocked」而没原因是没用的。',
      '- Blocked 的任务还没完成；它们是进行中的工作，不是已完成的工作。',
      '- 任务连续两次每日更新仍然卡住，就要升级处理。',
      '',
      '每日更新（agent 写进迭代任务的描述 description）：',
      '- 进展：今天有哪些卡换了列。',
      '- 下一步：接下来要动什么。',
      '- 阻塞：卡住了什么、需要我们做什么。',
    ].join('\n')
  }
];

function seedDefaultSkillsIfEmpty() {
  if (skillsSeeded || skills.length > 0) return;
  skills = DEFAULT_SKILLS.map((skill, index) => ({
    id: randomUUID(),
    name: skill.name,
    description: skill.description,
    content: skill.content,
    order: index + 1
  }));
  skillsSeeded = true;
}

export function getSkills() {
  return skills.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function setSkills(list) {
  skills = Array.isArray(list)
    ? list.map((skill, index) => ({
        id: typeof skill?.id === 'string' && skill.id ? skill.id : randomUUID(),
        name: typeof skill?.name === 'string' ? skill.name : 'Untitled skill',
        description: typeof skill?.description === 'string' ? skill.description : '',
        content: typeof skill?.content === 'string' ? skill.content : '',
        order: Number.isFinite(skill?.order) ? skill.order : index + 1
      }))
    : [];
  skillsSeeded = true;
  schedulePersist();
  return getSkills();
}

export function getSkillsState() {
  return { skills: getSkills() };
}

export function getGroups() {
  return groups.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function setGroups(list) {
  groups = Array.isArray(list) ? list.map((group) => ({ ...group })) : [];
  schedulePersist();
  return getGroups();
}

export function getBoardGroupMap() {
  return { ...boardGroups };
}

export function setBoardGroupMap(map) {
  boardGroups = map && typeof map === 'object' ? { ...map } : {};
  schedulePersist();
  return getBoardGroupMap();
}

export function getGroupsState() {
  return { groups: getGroups(), boardGroups: getBoardGroupMap() };
}

export function getRecentEvents(limit = 100) {
  const count = Number.isFinite(limit) ? Math.max(1, Math.min(1000, limit)) : 100;
  return events.slice(-count).map((event) => ({
    seq: event.seq,
    type: event.type,
    boardId: event.board_id,
    entityId: event.entity_id,
    at: event.at,
    actor: event.actor
  }));
}
