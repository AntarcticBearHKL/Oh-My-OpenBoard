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
  { id: '00000000-0000-4000-8000-000000000033', name: 'Archived', color: '#16a34a', order: 4, role: 'done' }
];

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
      '- 只有验收标准全部满足，才移入 Archived。',
      '- 任何时候新增或移动 item，都要顺手刷新那一列的总结 set_column_summary。',
      '',
      '【四列的语义（固定，不可增删）】',
      '- Backlog：已立项、待认领。人在这里读需求、写批注。',
      '- In Progress：已被某个 subagent 认领并在处理中 → 任务内容完全锁定（只读，含批注）。',
      '- Blocked：卡住了，必须写原因；连续两次日报仍卡住就升级。',
      '- Archived：已完成，是速度/完成点数的统计来源。',
      '',
      '【交接约定】',
      '- 同一时刻一个任务只应被一个 subagent 认领；已被别人认领的任务不要动。',
      '- 交接前把进展写进 comments 并刷新列总结，让人不用逐个点开也知道发生了什么。',
      '- 人写完批注后，agent 应把它当成新的输入，并在 comments 里回应。'
    ].join('\n')
  },
  {
    name: 'How to run this board with an AI agent',
    description: 'The intended division of labour between you and the agent.',
    content: [
      'This board is the shared state between the human and the AI agent.',
      '',
      'Human owns: what the work is, priority, acceptance criteria, and the final call on "done".',
      'Agent owns: reading the board via MCP before acting, keeping tasks and sub-tasks current,',
      'recording why something is blocked, and reporting progress with evidence.',
      '',
      'Rules of engagement:',
      '- Never invent work that is not on the board; add it first (create_task) then do it.',
      '- Move a task only when it truly moved: In Progress when you start, Blocked with a reason',
      '  when you cannot continue, Archived only when the acceptance criteria are met.',
      '- Prefer small tasks with story points over one large task.',
      '- Comment on the task for anything a reviewer would need to know.',
    ].join('\n')
  },
  {
    name: 'Task breakdown and acceptance criteria',
    description: 'How to slice work so it can be finished in one sitting.',
    content: [
      'A task is ready when it has, at minimum: a title, a type, an estimate, and acceptance criteria.',
      '',
      'Acceptance criteria: a short checklist of verifiable statements ("X returns 200 for Y").',
      'If you cannot write a test or a check for it, it is not a criterion yet.',
      '',
      'Slicing rules:',
      '- One task = one outcome, deliverable within a day.',
      '- Use sub-tasks for the steps of a task; use parentId for the epic it belongs to.',
      '- Estimate in points (1,2,3,5,8). Anything above 8 must be split.',
      '- Bugs get a type of bug and a repro in the description; spikes are timeboxed investigation.',
    ].join('\n')
  },
  {
    name: 'Iteration planning and estimation',
    description: 'How to fill a group/iteration and how velocity is read.',
    content: [
      'A group is a container; an iteration is one board inside it.',
      '',
      'Planning flow:',
      '- Set the iteration dates (startDate/endDate) and a one-line goal before starting.',
      '- Pull only what fits the recent velocity into the iteration; leave the rest unassigned.',
      '- Keep the four columns honest: Backlog, In Progress, Blocked, Archived.',
      '',
      'Reading the numbers:',
      '- Velocity = completed story points per iteration (Reports).',
      '- Burndown compares remaining points against the ideal line for the iteration window.',
      '- Cycle time distribution tells you where work waits; attack the p90, not the average.',
    ].join('\n')
  },
  {
    name: 'Claiming work and column summaries',
    description: 'Subagent ownership rules and the column summary the human reads.',
    content: [
      'This board is a subagent-level collaboration tool: a subagent picks a task up, works it, and puts it down.',
      '',
      'Claiming:',
      '- Before starting, claim the task (claim_task with your agent name) so the human can see who owns it.',
      '- Release it (release_task) when you stop, even if the task is not finished.',
      '- Never work an unclaimed task; if it is claimed by someone else, leave it alone.',
      '',
      'Column summaries:',
      '- Whenever you add or move an item, refresh the summary of the column you touched',
      '  (set_column_summary) with one or two plain sentences: what is queued, what is moving,',
      '  what is stuck and why.',
      '- The human reads it by clicking the button next to the column count, so keep it current and',
      '  concrete - no filler, no restating the column name.',
      '',
      'Annotations:',
      '- Annotations belong to the human. Read them (get_task) before starting and never overwrite them. While a task is In Progress the whole form, annotations included, is read-only.',
      '- Use comments for your own progress notes; use add_annotation only if the human asked you to.',
    ].join('\n')
  },
  {
    name: 'Blocked work and daily sync',
    description: 'What to do when work stalls, and what a daily update looks like.',
    content: [
      'Blocked means: it cannot progress without something outside your control.',
      '',
      '- Always set a blocked reason (set_blocked_reason); "blocked" without a reason is useless.',
      '- Blocked tasks keep their points; they are still burnable work, not done work.',
      '- Escalate when a task stays blocked across two daily updates.',
      '',
      'Daily update (agent writes it as a comment on the iteration task):',
      '- Moved: what changed column today.',
      '- Next: what will move next.',
      '- Blocked: what is stuck and what we need.',
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
