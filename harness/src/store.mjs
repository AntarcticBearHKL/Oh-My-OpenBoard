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
  { id: '00000000-0000-4000-8000-000000000031', name: 'In Progress', color: '#f59e0b', order: 2 },
  { id: '00000000-0000-4000-8000-000000000032', name: 'Blocked', color: '#ef4444', order: 3 },
  { id: '00000000-0000-4000-8000-000000000033', name: 'Finished', color: '#16a34a', order: 4, role: 'done' }
];

const IN_PROGRESS_COLUMN_ID = STABLE_COLUMNS[1].id;
const BLOCKED_COLUMN_ID = STABLE_COLUMNS[2].id;

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

export function createBoard(name, { groupId = '' } = {}) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const boardId = randomUUID();
  const board = { id: boardId, name: trimmed || 'Untitled board', createdAt: new Date().toISOString() };
  emit('board.created', { boardId, entityId: boardId, payload: { board } });
  noBoards = false;
  if (groupId) boardGroups[boardId] = String(groupId);
  schedulePersist();
  return { ...board, groupId: boardGroups[boardId] || '' };
}

export function renameBoard(boardId, name) {
  const board = getBoard(boardId);
  if (!board) throw new Error(`Board not found: ${boardId}`);
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) throw new Error('name is required');
  emit('board.updated', { boardId, entityId: boardId, payload: { fields: { name: trimmed } } });
  return { id: boardId, name: trimmed };
}

export function deleteBoard(boardId) {
  if (!getBoard(boardId)) throw new Error(`Board not found: ${boardId}`);
  emit('board.deleted', { boardId, entityId: boardId, payload: {} });
  if (boardGroups[boardId]) delete boardGroups[boardId];
  if (getBoards().length === 0) noBoards = true;
  schedulePersist();
  return { deleted: boardId };
}

const DEFAULT_SKILLS = [
  {
    name: '人与 subagent 的协作工作方式',
    description: '人与 AI subagent 在这块看板上如何分工与交接。',
    content: [
      '这块看板是「人 + 多个 AI subagent」共享的唯一事实来源。任务主要由 AI 填写与搬动，人负责看、定方向、写批注。',
      '',
      '【人的职责】',
      '- 随时点开任务：看清它要干什么、包含哪些内容（描述、验收标准、子任务、附件、评论）。',
      '- 用「批注 annotations」写下自己的想法和决定。批注是人跟 agent 沟通的通道。',
      '- 决定优先级与验收标准；最终「算不算完成」由人拍板。',
      '- 人一般不直接改 AI 写的内容，要改就用批注说。',
      '',
      '【AI / subagent 的职责】',
      '- 动手前先读：get_task（含 annotations）、list_tasks、list_skills。',
      '- 认领：claim_task 写明是哪个 subagent 在做；做完或中断时 release_task。',
      '- 任务内容由 agent 填写与维护：描述、验收标准、子任务；comments 是 agent 的进度记录，',
      '  annotations 是人的，任何时候都不要覆盖。',
      '- 卡住时移到 Blocked 并写 set_blocked_reason。',
      '- 只有验收标准全部满足，才移入 Finished。',
      '- 任何时候新增或移动 item，都要顺手刷新那一列的总结 set_column_summary。',
      '',
      '【四列的语义（固定，不可增删）】',
      '- Backlog：已立项、待认领。人在这里读需求、写批注。',
      '- In Progress：已被某个 subagent 认领并在处理中 → 任务内容完全锁定（只读，含批注）。',
      '- Blocked：卡住了，必须写原因；连续两次日报仍卡住就升级。',
      '- Finished：已完成，是速度/完成点数的统计来源。',
      '',
      '【交接约定】',
      '- 同一时刻一个任务只应被一个 subagent 认领；已被别人认领的任务不要动。',
      '- 交接前把进展写进 comments 并刷新列总结，让人不用逐个点开也知道发生了什么。',
      '- 人写完批注后，agent 应把它当成新的输入，并在 comments 里回应。'
    ].join('\n')
  },
  {
    name: '如何与 AI agent 一起运转这块看板',
    description: '人与 agent 之间的分工约定。',
    content: [
      '这块看板是人（human）与 AI agent 之间共享的状态。',
      '',
      '人负责：工作内容是什么、优先级、验收标准，以及最终「算不算完成」的拍板。',
      'agent 负责：动手前先通过 MCP 读看板；保持任务与子任务是最新的；记录卡住的原因；',
      '用证据汇报进展。',
      '',
      '协作规则：',
      '- 看板上没有的工作不要凭空开做：先用 create_task 建任务，再做。',
      '- 只有真的动了才移动任务：开始做时移到 In Progress，做不下去时移到 Blocked 并写原因，',
      '  验收标准全部满足后才移到 Finished。',
      '- 与其建一个大任务，不如拆成带故事点（story points）的小任务。',
      '- 评审者需要知道的任何事，都写在任务的评论里。',
      '',
      '【计时提醒】任务从 claim_task 那一刻开始计时，任何更新都会重置 5 分钟窗口；细则见「认领工作与列总结」。'
    ].join('\n')
  },
  {
    name: '任务拆分与验收标准',
    description: '如何把工作切到能一次做完的程度。',
    content: [
      '一个任务至少要有：标题、类型、估算和验收标准，才算就绪。',
      '',
      '验收标准：一组可验证的短句清单（例如「X 对 Y 返回 200」）。',
      '写不出测试或检查方法的，就还不算验收标准。',
      '',
      '拆分规则：',
      '- 一个任务 = 一个结果，一天内可交付。',
      '- 任务的步骤用子任务；它所属的 epic 用 parentId 关联。',
      '- 用点数估算（1、2、3、5、8）；超过 8 的必须拆开。',
      '- Bug 的类型设为 bug，并在描述里写复现步骤；spike 是有时限的调研。',
    ].join('\n')
  },
  {
    name: '迭代规划与估算',
    description: '如何填充 group／迭代，以及如何读懂速度。',
    content: [
      'group 是容器；迭代（iteration）是它里面的一块看板。',
      '',
      '规划流程：',
      '- 开始前先设好迭代日期（startDate/endDate）和一句话目标。',
      '- 只把近期速度（velocity）装得下的工作拉进迭代，其余留作未分配。',
      '- 让四列保持如实：Backlog、In Progress、Blocked、Finished。',
      '',
      '读懂数字：',
      '- 速度 = 每个迭代完成的故事点（见 Reports）。',
      '- 燃尽图把剩余点数与迭代周期内的理想线作对比。',
      '- 周期时间（cycle time）分布告诉你工作卡在哪；盯 p90，不要盯平均值。',
    ].join('\n')
  },
  {
    name: '认领工作与列总结',
    description: 'subagent 的归属规则，以及给人看的列总结。',
    content: [
      '这块看板是 subagent 级别的协作工具：subagent 认领任务、推进、然后交回。',
      '',
      '认领：',
      '- 动手前先认领（claim_task 填上你的 agent 名），让人看得见任务归谁。',
      '- 停下时释放（release_task），即使任务还没做完。',
      '- 不要做没人认领的任务；已被别人认领的就别碰。',
      '',
      '【计时约定】',
      '- 认领那一刻就开始计时：claim_task 会写入认领时间戳。卡片上会显示谁认领的、已经跑了多久。',
      '- 如果预计还要超过约 5 分钟才能做完，agent 必须在到点前同步一次：任务上的任何更新都算同步',
      '  （加评论、改描述或重新认领），并重新开始 5 分钟窗口。',
      '- 如果大约 5 分钟内没有任何同步，服务端会把任务移到 Blocked、记录原因，计时随即停止。',
      '- 正常流程是由 agent 自己移动卡片：验收标准满足就移到 Finished；做不下去或需要人拍板就移到',
      '  Blocked 并写原因。移动卡片才是停止计时的方式，计时因此始终如实。',
      '- 任务不由人手工添加：任务都经由 agent 进入看板，人负责读板、写批注并做最终决定。',
      '',
      '列总结：',
      '- 每次新增或移动 item，都要顺手刷新所动那一列的总结（set_column_summary），用一两句平实的',
      '  话说清：排着什么、在动什么、卡住什么以及为什么。',
      '- 人靠点击列计数旁边的按钮来读它，所以要保持最新、具体——不要凑字数，也不要复述列名。',
      '',
      '批注：',
      '- 批注（annotations）属于人。动手前先读（get_task），任何时候都不要覆盖。任务处于 In Progress 时整个表单（含批注）都是只读的。',
      '- 自己的进度记录写在 comments 里；只有人明确要求时才用 add_annotation。',
    ].join('\n')
  },
  {
    name: '阻塞处理与每日同步',
    description: '工作停摆时怎么办，以及每日更新长什么样。',
    content: [
      'Blocked 的含义：没有你控制之外的东西就无法继续推进。',
      '',
      '- 一定要写阻塞原因（set_blocked_reason）；只写「blocked」而没原因是没用的。',
      '- Blocked 的任务保留点数；它们仍是可燃烧的工作，不是已完成的工作。',
      '- 任务连续两次每日更新仍然卡住，就要升级处理。',
      '',
      '每日更新（agent 以评论形式写在迭代任务上）：',
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
