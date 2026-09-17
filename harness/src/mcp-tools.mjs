// MCP tools for the OpenAgile harness. Each tool mutates the shared board by
// appending domain events through store.emit(); the browser's event-sourcing
// pipeline projects the same events, so the UI updates live.

import { randomUUID } from 'node:crypto';
import * as z from 'zod/v4';
import {
  DEFAULT_BOARD_ID,
  createBoard,
  deleteBoard,
  digestKeyPoints,
  emit,
  findTask,
  getBoard,
  getBoardGroupMap,
  getBoards,
  getColumns,
  getGroups,
  getLabels,
  getRecentEvents,
  getSettings,
  getSkills,
  getSnapshot,
  getTasks,
  resolveGroup,
  setBoardGroupMap,
  setGroups,
  setSkills
} from './store.mjs';

const AGENT_ID = process.env.OPENAGILE_AGENT_NAME || 'openagile-harness';
const AGENT = { type: 'agent', id: AGENT_ID };

const ok = (data) => ({
  content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }]
});

const isDoneColumn = (column) => column?.role === 'done' || column?.id === 'done';

function resolveBoard(boardId) {
  if (boardId) {
    if (!getBoard(boardId)) throw new Error(`Board not found: ${boardId}`);
    return boardId;
  }
  if (getBoard(DEFAULT_BOARD_ID)) return DEFAULT_BOARD_ID;
  const first = getBoards()[0];
  if (!first) throw new Error('No boards exist');
  return first.id;
}

function resolveColumn(boardId, ref) {
  const columns = getColumns(boardId);
  if (columns.length === 0) throw new Error(`Board ${boardId} has no columns`);
  if (ref === undefined || ref === null || ref === '') {
    return columns.find((c) => !isDoneColumn(c)) || columns[0];
  }
  const byId = columns.find((c) => c.id === ref);
  if (byId) return byId;
  const lower = String(ref).toLowerCase();
  const byName = columns.find((c) => String(c.name).toLowerCase() === lower);
  if (byName) return byName;
  throw new Error(`Column not found: ${ref}`);
}

const BACKLOG_COLUMN_ID = '00000000-0000-4000-8000-000000000030';
const IN_PROGRESS_COLUMN_ID = '00000000-0000-4000-8000-000000000031';

function resolveBacklogColumn(boardId) {
  const columns = getColumns(boardId);
  if (columns.length === 0) throw new Error(`Board ${boardId} has no columns`);
  return columns.find((c) => c.id === BACKLOG_COLUMN_ID)
    || columns.find((c) => String(c.name).toLowerCase() === 'backlog')
    || columns.find((c) => !isDoneColumn(c))
    || columns[0];
}

function findTaskOrThrow(taskId) {
  const found = findTask(taskId);
  if (!found) throw new Error(`Task not found: ${taskId}`);
  return found;
}

function assertNotesDigested(task) {
  const keyPoints = Array.isArray(task?.keyPoints) ? task.keyPoints : [];
  const pending = keyPoints.filter((point) => !point?.digestedAt);
  if (task?.needsDigest !== true && pending.length === 0) return;
  throw new Error(
    `Task ${task.key || task.id} still has notes from the human that the agent has not digested; run digest_key_points first to fold them into the description before starting.`
  );
}

function withoutRemovedFields(task) {
  const { comments, relationships, ...rest } = task;
  return rest;
}

function maxOrder(columnId, tasks) {
  return tasks
    .filter((t) => t.column === columnId)
    .reduce((max, t) => Math.max(max, Number.isFinite(t.order) ? t.order : 0), 0);
}

function boardKeyPrefix(board) {
  const name = (board?.name || '').replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length >= 2 ? words.map((word) => word[0]).join('') : (words[0] || 'BRD').slice(0, 3);
  return letters.toUpperCase().slice(0, 4) || 'BRD';
}

function nextTaskKey(boardId, tasks) {
  const prefix = boardKeyPrefix(getBoard(boardId));
  const re = new RegExp('^' + prefix + '-(\\d+)$');
  let max = 0;
  for (const task of tasks) {
    const match = re.exec(task?.key || '');
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}-${max + 1}`;
}

function dayKey(iso) {
  return typeof iso === 'string' && iso ? iso.slice(0, 10) : '';
}

function dayStats(values) {
  const arr = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (arr.length === 0) return { count: 0, avg: 0, median: 0, p90: 0 };
  const round = (n) => Math.round(n * 100) / 100;
  return {
    count: arr.length,
    avg: round(arr.reduce((sum, n) => sum + n, 0) / arr.length),
    median: round(arr[Math.floor(arr.length / 2)]),
    p90: round(arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.9))])
  };
}

function computeMetrics(boardId) {
  const board = getBoard(boardId) || {};
  const columns = getColumns(boardId);
  const doneColumnId = (columns.find((column) => column.role === 'done') || {}).id || '';
  const tasks = getTasks(boardId);
  const points = (task) => (Number.isFinite(task.estimate) ? task.estimate : 0);

  const doneTasks = tasks.filter((task) => task.column === doneColumnId && task.doneDate);
  const velocity = {
    totalPoints: tasks.reduce((sum, task) => sum + points(task), 0),
    completedPoints: doneTasks.reduce((sum, task) => sum + points(task), 0),
    completedTasks: doneTasks.length
  };

  const burndown = [];
  const start = board.startDate ? new Date(board.startDate) : null;
  const end = board.endDate ? new Date(board.endDate) : null;
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const dayEnd = new Date(cursor);
      dayEnd.setHours(23, 59, 59, 999);
      const remaining = tasks
        .filter((task) => (!task.creationDate || new Date(task.creationDate) <= dayEnd) && (!task.doneDate || new Date(task.doneDate) > dayEnd))
        .reduce((sum, task) => sum + points(task), 0);
      burndown.push({ date: dayKey(cursor.toISOString()), remaining });
    }
  }

  const perTask = doneTasks.map((task) => {
    const created = task.creationDate ? new Date(task.creationDate).getTime() : null;
    const doneAt = task.doneDate ? new Date(task.doneDate).getTime() : null;
    let cycleDays = null;
    if (Array.isArray(task.columnHistory) && doneAt) {
      const firstWorking = task.columnHistory.find((entry) => entry.column && entry.column !== doneColumnId);
      if (firstWorking?.at) cycleDays = (doneAt - new Date(firstWorking.at).getTime()) / 86400000;
    }
    return {
      taskId: task.id,
      key: task.key || '',
      title: task.title,
      leadDays: created && doneAt ? (doneAt - created) / 86400000 : null,
      cycleDays
    };
  });

  return {
    boardId,
    velocity,
    burndown,
    leadTimeDays: dayStats(perTask.map((entry) => entry.leadDays)),
    cycleTimeDays: dayStats(perTask.map((entry) => entry.cycleDays)),
    tasks: perTask
  };
}

export function registerTools(server, { broadcastGroups = () => {} } = {}) {
  // ── Boards / reads ──────────────────────────────────────────────────────────

  server.registerTool('list_boards', {
    title: 'List boards',
    description: 'List all iterations (boards) with id, derived name and groupId. Every iteration belongs to a group.'
  }, async () => ok(getBoards()));

  server.registerTool('create_board', {
    title: 'Create board',
    description: 'Create an iteration (board) inside a group. An iteration is named Iteration N from its position in the group and is not named by hand.',
    inputSchema: {
      groupId: z.string().optional().describe('Group that will hold the iteration; defaults to the last group')
    }
  }, async ({ groupId = '' }) => ok(createBoard({ groupId })));

  server.registerTool('rename_board', {
    title: 'Rename board',
    description: 'Iterations are named Iteration 1, Iteration 2, ... from their position in a group and cannot be renamed by hand; this tool always refuses.',
    inputSchema: { boardId: z.string() }
  }, async () => {
    throw new Error('Iterations are numbered by their position in a group and cannot be renamed.');
  });

  server.registerTool('delete_board', {
    title: 'Delete board',
    description: 'Delete an iteration and its tasks. The last iteration can also be deleted; the app then shows an empty state until another is created.',
    inputSchema: { boardId: z.string() }
  }, async ({ boardId }) => ok(deleteBoard(boardId)));

  server.registerTool('list_groups', {
    title: 'List groups',
    description: 'List the user-named groups and the mapping from each iteration to its group.',
    inputSchema: {}
  }, async () => ok({ groups: getGroups(), boardGroups: getBoardGroupMap() }));

  server.registerTool('create_group', {
    title: 'Create group',
    description: 'Create a group: a user-named container that holds iterations. A group can be renamed.',
    inputSchema: { name: z.string().describe('Group name, as given by the user') }
  }, async ({ name }) => {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) throw new Error('name is required');
    const groups = getGroups();
    const order = groups.reduce((max, group) => Math.max(max, Number.isFinite(group.order) ? group.order : 0), 0) + 1;
    const group = { id: randomUUID(), name: trimmed, order, collapsed: false };
    setGroups([...groups, group]);
    return ok(group);
  });

  server.registerTool('rename_group', {
    title: 'Rename group',
    description: 'Rename a group: a group is the user-named container that holds iterations. The numbered iterations inside it (Iteration 1, Iteration 2, ...) cannot be renamed.',
    inputSchema: {
      groupId: z.string(),
      name: z.string().describe('New group name, as given by the user')
    }
  }, async ({ groupId, name }) => {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) throw new Error('name is required');
    const groups = getGroups();
    if (!groups.some((group) => group.id === groupId)) throw new Error(`Group not found: ${groupId}`);
    const next = groups.map((group) => (group.id === groupId ? { ...group, name: trimmed } : group));
    setGroups(next);
    broadcastGroups();
    return ok(next.find((group) => group.id === groupId));
  });

  server.registerTool('delete_group', {
    title: 'Delete group',
    description: 'Delete a group and the iterations it holds. A board can never live outside a group, so its iterations are deleted with it.',
    inputSchema: { groupId: z.string() }
  }, async ({ groupId }) => {
    const groups = getGroups();
    if (!groups.some((group) => group.id === groupId)) throw new Error(`Group not found: ${groupId}`);
    const deletedBoards = getBoards()
      .filter((board) => board.groupId === groupId)
      .map((board) => board.id);
    for (const boardId of deletedBoards) deleteBoard(boardId);
    setGroups(groups.filter((group) => group.id !== groupId));
    const map = getBoardGroupMap();
    const next = {};
    for (const [boardId, mappedGroupId] of Object.entries(map)) {
      if (mappedGroupId !== groupId) next[boardId] = mappedGroupId;
    }
    setBoardGroupMap(next);
    return ok({ deleted: groupId, deletedBoards });
  });

  server.registerTool('assign_board_to_group', {
    title: 'Assign board to group',
    description: 'Move an iteration into a group. Every iteration belongs to a group and cannot be left outside one: an empty groupId attaches it to the last group.',
    inputSchema: { boardId: z.string(), groupId: z.string().optional() }
  }, async ({ boardId, groupId = '' }) => {
    if (!getBoard(boardId)) throw new Error(`Board not found: ${boardId}`);
    const group = resolveGroup(groupId);
    const map = getBoardGroupMap();
    map[boardId] = group.id;
    setBoardGroupMap(map);
    return ok({ boardId, groupId: group.id });
  });

  server.registerTool('get_board', {
    title: 'Get board',
    description: 'Get an iteration with its columns, labels and tasks.',
    inputSchema: { boardId: z.string().optional() }
  }, async ({ boardId }) => {
    const bid = resolveBoard(boardId);
    const board = getBoard(bid);
    const columns = getColumns(bid).map((c) => ({ id: c.id, name: c.name, color: c.color, order: c.order, role: c.role || '', wipLimit: c.wipLimit || 0 }));
    const labels = getLabels(bid).map((l) => ({ id: l.id, name: l.name, color: l.color, group: l.group || '' }));
    const tasks = getTasks(bid)
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((t) => ({ id: t.id, key: t.key || '', title: t.title, column: t.column, type: t.type || 'task', estimate: Number.isFinite(t.estimate) ? t.estimate : null }));
    return ok({ board, columns, labels, tasks, settings: getSettings(bid) });
  });

  server.registerTool('list_columns', {
    title: 'List columns',
    description: 'List the five fixed columns of an iteration (id, name, order).',
    inputSchema: { boardId: z.string().optional() }
  }, async ({ boardId }) => ok(getColumns(resolveBoard(boardId)).map((c) => ({ id: c.id, name: c.name, color: c.color, order: c.order, role: c.role || '', wipLimit: c.wipLimit || 0 }))));

  server.registerTool('list_labels', {
    title: 'List labels',
    description: 'List the labels of a board.',
    inputSchema: { boardId: z.string().optional() }
  }, async ({ boardId }) => ok(getLabels(resolveBoard(boardId)).map((l) => ({ id: l.id, name: l.name, color: l.color, group: l.group || '' }))));

  server.registerTool('list_tasks', {
    title: 'List tasks',
    description: 'List tasks in an iteration, optionally filtered by column (id or name) or a text search over title/description.',
    inputSchema: {
      boardId: z.string().optional(),
      column: z.string().optional(),
      search: z.string().optional()
    }
  }, async ({ boardId, column, search }) => {
    const bid = resolveBoard(boardId);
    const columnId = column ? resolveColumn(bid, column).id : null;
    const needle = search ? String(search).toLowerCase() : null;
    const columnsById = new Map(getColumns(bid).map((c) => [c.id, c.name]));
    const tasks = getTasks(bid)
      .filter((t) => (columnId ? t.column === columnId : true))
      .filter((t) => (needle ? `${t.title || ''} ${t.description || ''}`.toLowerCase().includes(needle) : true))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((t) => ({
        id: t.id, key: t.key || '', title: t.title, description: t.description || '',
        column: t.column, columnName: columnsById.get(t.column) || '',
        type: t.type || 'task', estimate: Number.isFinite(t.estimate) ? t.estimate : null,
        claimedBy: t.claimedBy || '', assignee: t.assignee || '',
        keyPoints: t.keyPoints || [], needsDigest: t.needsDigest === true, isRework: t.isRework === true
      }));
    return ok(tasks);
  });

  server.registerTool('get_task', {
    title: 'Get task',
    description: 'Get a single task by id: its title, description and the notes to the agent (keyPoints).',
    inputSchema: { taskId: z.string() }
  }, async ({ taskId }) => {
    const { task, boardId } = findTaskOrThrow(taskId);
    const column = getColumns(boardId).find((c) => c.id === task.column);
    return ok({ boardId, columnName: column?.name || '', task: withoutRemovedFields(task) });
  });

  // ── Task mutations ──────────────────────────────────────────────────────────

  server.registerTool('create_task', {
    title: 'Create task',
    description: 'Create a task in Backlog with a title and a description. Notes to the agent (keyPoints) belong to the human: no tool can add, edit or remove them, and the agent only reads and digests them.',
    inputSchema: {
      title: z.string().describe('Task title'),
      description: z.string().optional(),
      assignee: z.string().optional(),
      boardId: z.string().optional()
    }
  }, async ({ title, description = '', assignee = '', boardId }) => {
    const bid = resolveBoard(boardId);
    if (!title || !String(title).trim()) throw new Error('title is required');
    const backlogColumn = resolveBacklogColumn(bid);
    const tasks = getTasks(bid);
    const now = new Date().toISOString();
    const id = randomUUID();
    const task = {
      id,
      key: nextTaskKey(bid, tasks),
      title: String(title).trim(),
      description,
      assignee,
      column: backlogColumn.id,
      order: maxOrder(backlogColumn.id, tasks) + 1,
      creationDate: now,
      changeDate: now,
      columnHistory: [{ column: backlogColumn.id, at: now }],
      blockedReason: '',
      blockedAt: null
    };
    emit('task.created', { boardId: bid, entityId: id, payload: { task }, actor: AGENT });
    return ok({ id, key: task.key, boardId: bid, column: backlogColumn.id, columnName: backlogColumn.name, task });
  });

  server.registerTool('update_task', {
    title: 'Update task',
    description: 'Update a task\'s title, description, assignee or blocked reason. The notes to the agent (keyPoints) cannot be added, edited or removed here, and this tool cannot clear needsDigest: only digest_key_points does that.',
    inputSchema: {
      taskId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      assignee: z.string().optional(),
      blockedReason: z.string().optional()
    }
  }, async ({ taskId, title, description, assignee, blockedReason }) => {
    const { boardId } = findTaskOrThrow(taskId);
    const fields = {};
    if (title !== undefined) fields.title = title;
    if (description !== undefined) fields.description = description;
    if (assignee !== undefined) fields.assignee = assignee;
    if (blockedReason !== undefined) {
      fields.blockedReason = blockedReason;
      fields.blockedAt = blockedReason ? new Date().toISOString() : null;
    }
    if (Object.keys(fields).length === 0) throw new Error('No fields to update');
    fields.changeDate = new Date().toISOString();
    emit('task.updated', { boardId, entityId: taskId, payload: { fields }, actor: AGENT });
    return ok({ taskId, fields });
  });

  server.registerTool('move_task', {
    title: 'Move task',
    description: 'Move a task to a column (id or name). Emits the full per-column ordering so the board converges. Moving a task into In Progress is refused while it has undigested notes from the human; run digest_key_points first.',
    inputSchema: {
      taskId: z.string(),
      column: z.string(),
      position: z.number().int().optional().describe('0-based position within the target column; default appends')
    }
  }, async ({ taskId, column, position }) => {
    const { task, boardId } = findTaskOrThrow(taskId);
    const targetColumn = resolveColumn(boardId, column);
    if (targetColumn.id === IN_PROGRESS_COLUMN_ID) assertNotesDigested(task);
    const tasks = getTasks(boardId).slice();
    const moved = tasks.find((t) => t.id === taskId);
    moved.column = targetColumn.id;

    const byColumn = new Map();
    for (const task of tasks) {
      if (!byColumn.has(task.column)) byColumn.set(task.column, []);
      byColumn.get(task.column).push(task);
    }
    const order = [];
    for (const [columnId, list] of byColumn) {
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      if (columnId === targetColumn.id && Number.isInteger(position)) {
        const current = list.findIndex((t) => t.id === taskId);
        if (current >= 0) { list.splice(current, 1); list.splice(Math.max(0, Math.min(position, list.length)), 0, moved); }
      }
      list.forEach((task, index) => order.push({ id: task.id, column: columnId, order: index + 1 }));
    }
    emit('task.moved', { boardId, entityId: taskId, payload: { order }, actor: AGENT });
    return ok({ taskId, column: targetColumn.id, columnName: targetColumn.name, order });
  });

  server.registerTool('delete_task', {
    title: 'Delete task',
    description: 'Delete a task by id.',
    inputSchema: { taskId: z.string() }
  }, async ({ taskId }) => {
    const { boardId } = findTaskOrThrow(taskId);
    emit('task.deleted', { boardId, entityId: taskId, payload: {}, actor: AGENT });
    return ok({ deleted: taskId });
  });

  // ── Labels ──────────────────────────────────────────────────────────────────

  server.registerTool('create_label', {
    title: 'Create label',
    description: 'Create a label on a board.',
    inputSchema: {
      name: z.string(),
      color: z.string().optional().describe('Hex colour, e.g. #25b631'),
      group: z.string().optional(),
      boardId: z.string().optional()
    }
  }, async ({ name, color = '#3b82f6', group = '', boardId }) => {
    const bid = resolveBoard(boardId);
    const id = randomUUID();
    const label = { id, name: String(name), color, group };
    emit('label.created', { boardId: bid, entityId: id, payload: { label }, actor: AGENT });
    return ok(label);
  });

  // ── Columns ─────────────────────────────────────────────────────────────────

  server.registerTool('create_column', {
    title: 'Create column',
    description: 'Columns are fixed: Backlog, Human In The Loop, In Progress, Blocked, Finished. Adding a column is rejected.',
    inputSchema: {
      name: z.string(),
      color: z.string().optional(),
      wipLimit: z.number().int().optional(),
      role: z.enum(['done']).optional(),
      boardId: z.string().optional()
    }
  }, async () => {
    throw new Error('Columns are fixed: Backlog, Human In The Loop, In Progress, Blocked, Finished.');
  });

  server.registerTool('update_column', {
    title: 'Update column',
    description: 'Set a column colour or WIP limit. Column names are fixed and cannot be changed.',
    inputSchema: {
      columnId: z.string(),
      color: z.string().optional(),
      wipLimit: z.number().int().optional(),
      boardId: z.string().optional()
    }
  }, async ({ columnId, color, wipLimit, boardId }) => {
    const bid = resolveBoard(boardId);
    const column = getColumns(bid).find((c) => c.id === columnId);
    if (!column) throw new Error(`Column not found: ${columnId}`);
    const fields = {};
    if (color !== undefined) fields.color = color;
    if (wipLimit !== undefined) fields.wipLimit = wipLimit;
    if (Object.keys(fields).length === 0) throw new Error('No fields to update');
    emit('column.updated', { boardId: bid, entityId: columnId, payload: { fields }, actor: AGENT });
    return ok({ columnId, fields });
  });

  server.registerTool('delete_column', {
    title: 'Delete column',
    description: 'Columns are fixed and cannot be deleted; this tool is rejected.',
    inputSchema: { columnId: z.string(), boardId: z.string().optional() }
  }, async () => {
    throw new Error('Columns are fixed and cannot be deleted.');
  });

  server.registerTool('reorder_columns', {
    title: 'Reorder columns',
    description: 'Columns are fixed and cannot be reordered; this tool is rejected.',
    inputSchema: {
      order: z.array(z.object({ id: z.string(), order: z.number() })),
      boardId: z.string().optional()
    }
  }, async () => {
    throw new Error('Columns are fixed and cannot be reordered.');
  });

  // ── Diagnostics ─────────────────────────────────────────────────────────────

  server.registerTool('set_blocked_reason', {
    title: 'Set blocked reason',
    description: 'Record why a task is blocked, or clear it by passing an empty reason.',
    inputSchema: { taskId: z.string(), reason: z.string().optional() }
  }, async ({ taskId, reason = '' }) => {
    const { boardId } = findTaskOrThrow(taskId);
    const now = new Date().toISOString();
    emit('task.updated', {
      boardId,
      entityId: taskId,
      payload: { fields: { blockedReason: reason, blockedAt: reason ? now : null, changeDate: now } },
      actor: AGENT
    });
    return ok({ taskId, blockedReason: reason });
  });

  server.registerTool('set_board_dates', {
    title: 'Set iteration dates',
    description: 'Set the start/end dates and the goal of an iteration. Needed for burndown.',
    inputSchema: {
      boardId: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      goal: z.string().optional()
    }
  }, async ({ boardId, startDate, endDate, goal }) => {
    const bid = resolveBoard(boardId);
    const fields = {};
    if (startDate !== undefined) fields.startDate = startDate;
    if (endDate !== undefined) fields.endDate = endDate;
    if (goal !== undefined) fields.goal = goal;
    if (Object.keys(fields).length === 0) throw new Error('No fields to update');
    emit('board.updated', { boardId: bid, entityId: bid, payload: { fields }, actor: AGENT });
    return ok({ boardId: bid, fields });
  });

  server.registerTool('get_metrics', {
    title: 'Get metrics',
    description: 'Velocity, burndown series (needs iteration dates) and lead/cycle time stats.',
    inputSchema: { boardId: z.string().optional() }
  }, async ({ boardId }) => ok(computeMetrics(resolveBoard(boardId))));

  server.registerTool('list_roadmap', {
    title: 'List roadmap',
    description: 'List iterations with dates, goal and task counts.',
    inputSchema: {}
  }, async () => ok(getBoards().map((board) => {
    const row = getBoard(board.id) || {};
    const columns = getColumns(board.id);
    const doneColumnId = (columns.find((column) => column.role === 'done') || {}).id || '';
    const tasks = getTasks(board.id);
    const points = (task) => (Number.isFinite(task.estimate) ? task.estimate : 0);
    const doneTasks = tasks.filter((task) => task.column === doneColumnId);
    return {
      id: board.id,
      name: board.name,
      groupId: board.groupId || '',
      startDate: row.startDate || '',
      endDate: row.endDate || '',
      goal: row.goal || '',
      tasks: tasks.length,
      doneTasks: doneTasks.length,
      points: tasks.reduce((sum, task) => sum + points(task), 0),
      donePoints: doneTasks.reduce((sum, task) => sum + points(task), 0)
    };
  })));

  server.registerTool('update_label', {
    title: 'Update label',
    description: 'Rename or recolour a label, or move it to another group.',
    inputSchema: {
      labelId: z.string(),
      name: z.string().optional(),
      color: z.string().optional(),
      group: z.string().optional(),
      boardId: z.string().optional()
    }
  }, async ({ labelId, name, color, group, boardId }) => {
    const bid = resolveBoard(boardId);
    if (!getLabels(bid).some((label) => label.id === labelId)) throw new Error(`Label not found: ${labelId}`);
    const fields = {};
    if (name !== undefined) fields.name = name;
    if (color !== undefined) fields.color = color;
    if (group !== undefined) fields.group = group;
    if (Object.keys(fields).length === 0) throw new Error('No fields to update');
    emit('label.updated', { boardId: bid, entityId: labelId, payload: { fields }, actor: AGENT });
    return ok({ labelId, fields });
  });

  server.registerTool('delete_label', {
    title: 'Delete label',
    description: 'Delete a label from a board.',
    inputSchema: { labelId: z.string(), boardId: z.string().optional() }
  }, async ({ labelId, boardId }) => {
    const bid = resolveBoard(boardId);
    if (!getLabels(bid).some((label) => label.id === labelId)) throw new Error(`Label not found: ${labelId}`);
    emit('label.deleted', { boardId: bid, entityId: labelId, payload: {}, actor: AGENT });
    return ok({ deleted: labelId });
  });

  server.registerTool('digest_key_points', {
    title: 'Digest key points',
    description: 'Fold the human\'s notes (keyPoints) into the description: stamps digestedAt on the notes and clears the needsDigest flag. This is the only way to clear it; claim_task and moving into In Progress are refused until it runs. Pass pointIds to stamp specific notes, or omit them to stamp every undigested note. Notes are never added, edited or removed here.',
    inputSchema: { taskId: z.string(), pointIds: z.array(z.string()).optional() }
  }, async ({ taskId, pointIds }) => ok(digestKeyPoints(taskId, pointIds)));

  server.registerTool('claim_task', {
    title: 'Claim task',
    description: 'Claim a task for the current subagent: records claimedBy/claimedAt and sets the assignee when empty. Refused while the task still has undigested notes from the human; run digest_key_points first to fold them into the description.',
    inputSchema: { taskId: z.string(), agent: z.string().optional() }
  }, async ({ taskId, agent = AGENT_ID }) => {
    const { task, boardId } = findTaskOrThrow(taskId);
    assertNotesDigested(task);
    const now = new Date().toISOString();
    const fields = { claimedBy: agent, claimedAt: now, changeDate: now };
    if (!task.assignee) fields.assignee = agent;
    emit('task.updated', { boardId, entityId: taskId, payload: { fields }, actor: AGENT });
    return ok({ taskId, claimedBy: agent, claimedAt: now });
  });

  server.registerTool('release_task', {
    title: 'Release task',
    description: 'Release a claimed task: clears claimedBy and keeps claimedAt so the claim duration stays derivable.',
    inputSchema: { taskId: z.string() }
  }, async ({ taskId }) => {
    const { boardId } = findTaskOrThrow(taskId);
    const now = new Date().toISOString();
    emit('task.updated', {
      boardId,
      entityId: taskId,
      payload: { fields: { claimedBy: '', changeDate: now } },
      actor: AGENT
    });
    return ok({ taskId, claimedBy: '' });
  });

  server.registerTool('list_skills', {
    title: 'List skills',
    description: 'List the collaboration skills / usage guides the human wants the agent to follow on this board.',
    inputSchema: {}
  }, async () => ok(getSkills().map((skill) => ({ id: skill.id, name: skill.name, description: skill.description }))));

  server.registerTool('get_skill', {
    title: 'Get skill',
    description: 'Return the full text of one skill, by id or by name.',
    inputSchema: { skill: z.string() }
  }, async ({ skill }) => {
    const skills = getSkills();
    const needle = String(skill).toLowerCase();
    const found = skills.find((entry) => entry.id === skill)
      || skills.find((entry) => entry.name.toLowerCase() === needle);
    if (!found) throw new Error(`Skill not found: ${skill}`);
    return ok(found);
  });

  server.registerTool('create_skill', {
    title: 'Create skill',
    description: 'Create a collaboration skill: a usage guide the agent should follow.',
    inputSchema: { name: z.string(), description: z.string().optional(), content: z.string().optional() }
  }, async ({ name, description = '', content = '' }) => {
    const skills = getSkills();
    const skill = { id: randomUUID(), name: String(name), description, content, order: skills.length + 1 };
    setSkills([...skills, skill]);
    return ok(skill);
  });

  server.registerTool('update_skill', {
    title: 'Update skill',
    description: 'Update a skill name, description or content.',
    inputSchema: { skillId: z.string(), name: z.string().optional(), description: z.string().optional(), content: z.string().optional() }
  }, async ({ skillId, name, description, content }) => {
    const skills = getSkills();
    if (!skills.some((skill) => skill.id === skillId)) throw new Error(`Skill not found: ${skillId}`);
    const next = skills.map((skill) => (skill.id === skillId
      ? {
          ...skill,
          name: name ?? skill.name,
          description: description ?? skill.description,
          content: content ?? skill.content
        }
      : skill));
    setSkills(next);
    return ok(next.find((skill) => skill.id === skillId));
  });

  server.registerTool('delete_skill', {
    title: 'Delete skill',
    description: 'Delete a skill by id.',
    inputSchema: { skillId: z.string() }
  }, async ({ skillId }) => {
    const skills = getSkills();
    if (!skills.some((skill) => skill.id === skillId)) throw new Error(`Skill not found: ${skillId}`);
    setSkills(skills.filter((skill) => skill.id !== skillId));
    return ok({ deleted: skillId });
  });

  server.registerTool('get_board_snapshot', {
    title: 'Get raw board snapshot',
    description: 'Return the projected read model for a board (boards, tasks, columns, labels, settings) and current event seq. Tasks omit the removed comments and relationships fields.',
    inputSchema: { boardId: z.string().optional() }
  }, async ({ boardId }) => {
    const snapshot = getSnapshot(resolveBoard(boardId));
    const tasks = (snapshot.state?.tasks || []).map(withoutRemovedFields);
    return ok({ ...snapshot, state: { ...snapshot.state, tasks } });
  });

  server.registerTool('get_settings', {
    title: 'Get board settings',
    description: 'Return the settings object for a board.',
    inputSchema: { boardId: z.string().optional() }
  }, async ({ boardId }) => ok(getSettings(resolveBoard(boardId))));

  server.registerTool('update_settings', {
    title: 'Update board settings',
    description: 'Merge fields into a board settings object (e.g. showChangeDate, swimLanesEnabled).',
    inputSchema: {
      boardId: z.string().optional(),
      fields: z.record(z.string(), z.any())
    }
  }, async ({ boardId, fields }) => {
    const bid = resolveBoard(boardId);
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('fields must be an object');
    emit('settings.updated', { boardId: bid, entityId: bid, payload: { fields }, actor: AGENT });
    return ok({ boardId: bid, fields });
  });

  server.registerTool('list_events', {
    title: 'List recent events',
    description: 'Return the most recent domain events (the audit trail), oldest first.',
    inputSchema: { limit: z.number().int().optional() }
  }, async ({ limit }) => ok(getRecentEvents(limit)));
}
