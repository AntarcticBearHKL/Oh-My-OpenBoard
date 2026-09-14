// MCP tools for the Kanvana harness. Each tool mutates the shared board by
// appending domain events through store.emit(); the browser's event-sourcing
// pipeline projects the same events, so the UI updates live.

import { randomUUID } from 'node:crypto';
import * as z from 'zod/v4';
import {
  DEFAULT_BOARD_ID,
  createBoard,
  deleteBoard,
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
  getSnapshot,
  getTasks,
  renameBoard,
  setBoardGroupMap,
  setGroups
} from './store.mjs';

const AGENT_ID = process.env.KANVANA_AGENT_NAME || 'kanvana-harness';
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

function resolveLabel(boardId, ref) {
  const labels = getLabels(boardId);
  const byId = labels.find((l) => l.id === ref);
  if (byId) return byId;
  const lower = String(ref).toLowerCase();
  const byName = labels.find((l) => String(l.name).toLowerCase() === lower);
  if (byName) return byName;
  throw new Error(`Label not found: ${ref}`);
}

function findTaskOrThrow(taskId) {
  const found = findTask(taskId);
  if (!found) throw new Error(`Task not found: ${taskId}`);
  return found;
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

export function registerTools(server) {
  // ── Boards / reads ──────────────────────────────────────────────────────────

  server.registerTool('list_boards', {
    title: 'List boards',
    description: 'List all boards (iterations) with id, name and groupId.'
  }, async () => ok(getBoards()));

  server.registerTool('create_board', {
    title: 'Create board',
    description: 'Create a new board (iteration). Optionally assign it to a group.',
    inputSchema: {
      name: z.string(),
      groupId: z.string().optional()
    }
  }, async ({ name, groupId = '' }) => ok(createBoard(name, { groupId })));

  server.registerTool('rename_board', {
    title: 'Rename board',
    description: 'Rename a board (iteration).',
    inputSchema: { boardId: z.string(), name: z.string() }
  }, async ({ boardId, name }) => ok(renameBoard(boardId, name)));

  server.registerTool('delete_board', {
    title: 'Delete board',
    description: 'Delete a board and its tasks. The last board can also be deleted; the app then shows an empty state until another board is created.',
    inputSchema: { boardId: z.string() }
  }, async ({ boardId }) => ok(deleteBoard(boardId)));

  server.registerTool('list_groups', {
    title: 'List groups',
    description: 'List groups and the boardId to groupId mapping.',
    inputSchema: {}
  }, async () => ok({ groups: getGroups(), boardGroups: getBoardGroupMap() }));

  server.registerTool('create_group', {
    title: 'Create group',
    description: 'Create a group: a top-level container for boards (iterations).',
    inputSchema: { name: z.string().optional() }
  }, async ({ name } = {}) => {
    const groups = getGroups();
    const order = groups.reduce((max, group) => Math.max(max, group.order ?? 0), 0) + 1;
    const trimmed = typeof name === 'string' && name.trim() ? name.trim() : 'New Group';
    const group = { id: randomUUID(), name: trimmed, order, collapsed: false };
    setGroups([...groups, group]);
    return ok(group);
  });

  server.registerTool('rename_group', {
    title: 'Rename group',
    description: 'Rename a group.',
    inputSchema: { groupId: z.string(), name: z.string() }
  }, async ({ groupId, name }) => {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) throw new Error('name is required');
    const groups = getGroups();
    if (!groups.some((group) => group.id === groupId)) throw new Error(`Group not found: ${groupId}`);
    setGroups(groups.map((group) => (group.id === groupId ? { ...group, name: trimmed } : group)));
    return ok({ groupId, name: trimmed });
  });

  server.registerTool('delete_group', {
    title: 'Delete group',
    description: 'Delete a group. Its boards are not deleted; they become ungrouped.',
    inputSchema: { groupId: z.string() }
  }, async ({ groupId }) => {
    const groups = getGroups();
    if (!groups.some((group) => group.id === groupId)) throw new Error(`Group not found: ${groupId}`);
    setGroups(groups.filter((group) => group.id !== groupId));
    const map = getBoardGroupMap();
    const next = {};
    for (const [boardId, mappedGroupId] of Object.entries(map)) {
      if (mappedGroupId !== groupId) next[boardId] = mappedGroupId;
    }
    setBoardGroupMap(next);
    return ok({ deleted: groupId });
  });

  server.registerTool('assign_board_to_group', {
    title: 'Assign board to group',
    description: 'Move a board into a group. Pass an empty groupId to make it ungrouped.',
    inputSchema: { boardId: z.string(), groupId: z.string().optional() }
  }, async ({ boardId, groupId = '' }) => {
    if (!getBoard(boardId)) throw new Error(`Board not found: ${boardId}`);
    const map = getBoardGroupMap();
    if (groupId) {
      if (!getGroups().some((group) => group.id === groupId)) throw new Error(`Group not found: ${groupId}`);
      map[boardId] = groupId;
    } else {
      delete map[boardId];
    }
    setBoardGroupMap(map);
    return ok({ boardId, groupId: groupId || '' });
  });

  server.registerTool('get_board', {
    title: 'Get board',
    description: 'Get a board with its columns, labels and tasks.',
    inputSchema: { boardId: z.string().optional() }
  }, async ({ boardId }) => {
    const bid = resolveBoard(boardId);
    const board = getBoard(bid);
    const columns = getColumns(bid).map((c) => ({ id: c.id, name: c.name, color: c.color, order: c.order, role: c.role || '', wipLimit: c.wipLimit || 0 }));
    const labels = getLabels(bid).map((l) => ({ id: l.id, name: l.name, color: l.color, group: l.group || '' }));
    const tasks = getTasks(bid)
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((t) => ({ id: t.id, title: t.title, column: t.column, priority: t.priority, dueDate: t.dueDate || '', labels: t.labels || [] }));
    return ok({ board, columns, labels, tasks, settings: getSettings(bid) });
  });

  server.registerTool('list_columns', {
    title: 'List columns',
    description: 'List the columns of a board (id, name, order).',
    inputSchema: { boardId: z.string().optional() }
  }, async ({ boardId }) => ok(getColumns(resolveBoard(boardId)).map((c) => ({ id: c.id, name: c.name, color: c.color, order: c.order, role: c.role || '', wipLimit: c.wipLimit || 0 }))));

  server.registerTool('list_labels', {
    title: 'List labels',
    description: 'List the labels of a board.',
    inputSchema: { boardId: z.string().optional() }
  }, async ({ boardId }) => ok(getLabels(resolveBoard(boardId)).map((l) => ({ id: l.id, name: l.name, color: l.color, group: l.group || '' }))));

  server.registerTool('list_tasks', {
    title: 'List tasks',
    description: 'List tasks, optionally filtered by column (id or name), priority, label (id or name), or a text search over title/description.',
    inputSchema: {
      boardId: z.string().optional(),
      column: z.string().optional(),
      priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']).optional(),
      label: z.string().optional(),
      search: z.string().optional()
    }
  }, async ({ boardId, column, priority, label, search }) => {
    const bid = resolveBoard(boardId);
    const columnId = column ? resolveColumn(bid, column).id : null;
    const labelId = label ? resolveLabel(bid, label).id : null;
    const needle = search ? String(search).toLowerCase() : null;
    const columnsById = new Map(getColumns(bid).map((c) => [c.id, c.name]));
    const tasks = getTasks(bid)
      .filter((t) => (columnId ? t.column === columnId : true))
      .filter((t) => (priority ? (t.priority || 'none') === priority : true))
      .filter((t) => (labelId ? (t.labels || []).includes(labelId) : true))
      .filter((t) => (needle ? `${t.title || ''} ${t.description || ''}`.toLowerCase().includes(needle) : true))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((t) => ({
        id: t.id, title: t.title, description: t.description || '',
        column: t.column, columnName: columnsById.get(t.column) || '',
        priority: t.priority || 'none', dueDate: t.dueDate || '',
        labels: t.labels || [], subTasks: t.subTasks || [], relationships: t.relationships || []
      }));
    return ok(tasks);
  });

  server.registerTool('get_task', {
    title: 'Get task',
    description: 'Get a single task by id, including subtasks and relationships.',
    inputSchema: { taskId: z.string() }
  }, async ({ taskId }) => {
    const { task, boardId } = findTaskOrThrow(taskId);
    const column = getColumns(boardId).find((c) => c.id === task.column);
    return ok({ boardId, columnName: column?.name || '', task });
  });

  // ── Task mutations ──────────────────────────────────────────────────────────

  server.registerTool('create_task', {
    title: 'Create task',
    description: 'Create a task. Supports type, story-point estimate, assignee, parent (epic) and acceptance criteria.',
    inputSchema: {
      title: z.string().describe('Task title'),
      description: z.string().optional(),
      column: z.string().optional(),
      priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']).optional(),
      type: z.enum(['story', 'bug', 'task', 'spike']).optional(),
      estimate: z.number().optional().describe('Story points'),
      assignee: z.string().optional(),
      parentId: z.string().optional().describe('Parent / epic task id'),
      acceptanceCriteria: z.array(z.string()).optional(),
      labels: z.array(z.string()).optional(),
      dueDate: z.string().optional().describe('ISO date, e.g. 2026-09-30'),
      boardId: z.string().optional()
    }
  }, async ({ title, description = '', column, priority = 'none', type = 'task', estimate = null, assignee = '', parentId = '', acceptanceCriteria = [], labels = [], dueDate = '', boardId }) => {
    const bid = resolveBoard(boardId);
    if (!title || !String(title).trim()) throw new Error('title is required');
    const targetColumn = resolveColumn(bid, column);
    const labelIds = labels.map((ref) => resolveLabel(bid, ref).id);
    const tasks = getTasks(bid);
    const now = new Date().toISOString();
    const id = randomUUID();
    const task = {
      id,
      key: nextTaskKey(bid, tasks),
      title: String(title).trim(),
      description,
      priority,
      type,
      estimate: Number.isFinite(estimate) ? estimate : null,
      assignee,
      parentId: parentId || null,
      acceptanceCriteria: acceptanceCriteria.map((text) => ({ id: randomUUID(), text: String(text), done: false })),
      dueDate,
      column: targetColumn.id,
      order: maxOrder(targetColumn.id, tasks) + 1,
      labels: labelIds,
      creationDate: now,
      changeDate: now,
      columnHistory: [{ column: targetColumn.id, at: now }],
      subTasks: [],
      comments: [],
      attachments: [],
      customFields: {}
    };
    emit('task.created', { boardId: bid, entityId: id, payload: { task }, actor: AGENT });
    return ok({ id, key: task.key, boardId: bid, column: targetColumn.id, columnName: targetColumn.name, task });
  });

  server.registerTool('update_task', {
    title: 'Update task',
    description: 'Update task fields: title, description, priority, type, estimate, assignee, parentId, dueDate, blockedReason, customFields or labels.',
    inputSchema: {
      taskId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']).optional(),
      type: z.enum(['story', 'bug', 'task', 'spike']).optional(),
      estimate: z.number().nullable().optional(),
      assignee: z.string().optional(),
      parentId: z.string().nullable().optional(),
      dueDate: z.string().optional(),
      blockedReason: z.string().optional(),
      customFields: z.record(z.string(), z.any()).optional(),
      labels: z.array(z.string()).optional()
    }
  }, async ({ taskId, title, description, priority, type, estimate, assignee, parentId, dueDate, blockedReason, customFields, labels }) => {
    const { boardId } = findTaskOrThrow(taskId);
    const fields = {};
    if (title !== undefined) fields.title = title;
    if (description !== undefined) fields.description = description;
    if (priority !== undefined) fields.priority = priority;
    if (type !== undefined) fields.type = type;
    if (estimate !== undefined) fields.estimate = estimate;
    if (assignee !== undefined) fields.assignee = assignee;
    if (parentId !== undefined) fields.parentId = parentId || null;
    if (dueDate !== undefined) fields.dueDate = dueDate;
    if (blockedReason !== undefined) {
      fields.blockedReason = blockedReason;
      fields.blockedAt = blockedReason ? new Date().toISOString() : null;
    }
    if (customFields !== undefined) fields.customFields = customFields;
    if (labels !== undefined) fields.labels = labels.map((ref) => resolveLabel(boardId, ref).id);
    if (Object.keys(fields).length === 0) throw new Error('No fields to update');
    fields.changeDate = new Date().toISOString();
    emit('task.updated', { boardId, entityId: taskId, payload: { fields }, actor: AGENT });
    return ok({ taskId, fields });
  });

  server.registerTool('move_task', {
    title: 'Move task',
    description: 'Move a task to a column (id or name). Emits the full per-column ordering so the board converges.',
    inputSchema: {
      taskId: z.string(),
      column: z.string(),
      position: z.number().int().optional().describe('0-based position within the target column; default appends')
    }
  }, async ({ taskId, column, position }) => {
    const { boardId } = findTaskOrThrow(taskId);
    const targetColumn = resolveColumn(boardId, column);
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

  // ── Subtasks ────────────────────────────────────────────────────────────────

  server.registerTool('add_subtask', {
    title: 'Add subtask',
    description: 'Add a subtask to a task.',
    inputSchema: { taskId: z.string(), title: z.string() }
  }, async ({ taskId, title }) => {
    const { boardId } = findTaskOrThrow(taskId);
    const id = randomUUID();
    const subtask = { id, title: String(title), completed: false };
    emit('subtask.added', { boardId, entityId: taskId, payload: { subtask }, actor: AGENT });
    return ok(subtask);
  });

  server.registerTool('toggle_subtask', {
    title: 'Toggle subtask',
    description: 'Mark a subtask complete or incomplete.',
    inputSchema: { taskId: z.string(), subtaskId: z.string(), completed: z.boolean() }
  }, async ({ taskId, subtaskId, completed }) => {
    const { boardId } = findTaskOrThrow(taskId);
    emit('subtask.toggled', { boardId, entityId: taskId, payload: { subtask_id: subtaskId, completed: completed === true }, actor: AGENT });
    return ok({ taskId, subtaskId, completed: completed === true });
  });

  server.registerTool('update_subtask', {
    title: 'Update subtask title',
    description: 'Rename a subtask.',
    inputSchema: { taskId: z.string(), subtaskId: z.string(), title: z.string() }
  }, async ({ taskId, subtaskId, title }) => {
    const { boardId } = findTaskOrThrow(taskId);
    emit('subtask.text_changed', { boardId, entityId: taskId, payload: { subtask_id: subtaskId, title }, actor: AGENT });
    return ok({ taskId, subtaskId, title });
  });

  server.registerTool('remove_subtask', {
    title: 'Remove subtask',
    description: 'Remove a subtask from a task.',
    inputSchema: { taskId: z.string(), subtaskId: z.string() }
  }, async ({ taskId, subtaskId }) => {
    const { boardId } = findTaskOrThrow(taskId);
    emit('subtask.removed', { boardId, entityId: taskId, payload: { subtask_id: subtaskId }, actor: AGENT });
    return ok({ removed: subtaskId });
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

  server.registerTool('add_label_to_task', {
    title: 'Add label to task',
    description: 'Attach a label (id or name) to a task.',
    inputSchema: { taskId: z.string(), label: z.string() }
  }, async ({ taskId, label }) => {
    const { boardId } = findTaskOrThrow(taskId);
    const resolved = resolveLabel(boardId, label);
    emit('label.added_to_task', { boardId, entityId: taskId, payload: { label_id: resolved.id }, actor: AGENT });
    return ok({ taskId, labelId: resolved.id, labelName: resolved.name });
  });

  server.registerTool('remove_label_from_task', {
    title: 'Remove label from task',
    description: 'Detach a label (id or name) from a task.',
    inputSchema: { taskId: z.string(), label: z.string() }
  }, async ({ taskId, label }) => {
    const { boardId } = findTaskOrThrow(taskId);
    const resolved = resolveLabel(boardId, label);
    emit('label.removed_from_task', { boardId, entityId: taskId, payload: { label_id: resolved.id }, actor: AGENT });
    return ok({ taskId, labelId: resolved.id });
  });

  // ── Columns ─────────────────────────────────────────────────────────────────

  server.registerTool('create_column', {
    title: 'Create column',
    description: 'Add a column to a board. `role: "done"` is rejected if a Done column already exists.',
    inputSchema: {
      name: z.string(),
      color: z.string().optional(),
      wipLimit: z.number().int().optional(),
      role: z.enum(['done']).optional(),
      boardId: z.string().optional()
    }
  }, async () => {
    throw new Error('Columns are fixed: Backlog, In Progress, Blocked, Archived.');
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
    description: 'Delete a column and its tasks. The Done column cannot be deleted.',
    inputSchema: { columnId: z.string(), boardId: z.string().optional() }
  }, async () => {
    throw new Error('Columns are fixed and cannot be deleted.');
  });

  server.registerTool('reorder_columns', {
    title: 'Reorder columns',
    description: 'Reorder columns. Pass the full array of { id, order }.',
    inputSchema: {
      order: z.array(z.object({ id: z.string(), order: z.number() })),
      boardId: z.string().optional()
    }
  }, async () => {
    throw new Error('Columns are fixed and cannot be reordered.');
  });

  // ── Diagnostics ─────────────────────────────────────────────────────────────

  server.registerTool('add_comment', {
    title: 'Add comment',
    description: 'Append a comment to a task.',
    inputSchema: { taskId: z.string(), text: z.string(), author: z.string().optional() }
  }, async ({ taskId, text, author = AGENT_ID }) => {
    const { task, boardId } = findTaskOrThrow(taskId);
    const comment = { id: randomUUID(), author, text: String(text), at: new Date().toISOString() };
    const comments = [...(Array.isArray(task.comments) ? task.comments : []), comment];
    emit('task.updated', { boardId, entityId: taskId, payload: { fields: { comments, changeDate: comment.at } }, actor: AGENT });
    return ok(comment);
  });

  server.registerTool('remove_comment', {
    title: 'Remove comment',
    description: 'Remove a comment from a task.',
    inputSchema: { taskId: z.string(), commentId: z.string() }
  }, async ({ taskId, commentId }) => {
    const { task, boardId } = findTaskOrThrow(taskId);
    const comments = (Array.isArray(task.comments) ? task.comments : []).filter((comment) => comment.id !== commentId);
    emit('task.updated', { boardId, entityId: taskId, payload: { fields: { comments, changeDate: new Date().toISOString() } }, actor: AGENT });
    return ok({ removed: commentId });
  });

  server.registerTool('add_attachment', {
    title: 'Add attachment',
    description: 'Attach a link/file reference to a task.',
    inputSchema: {
      taskId: z.string(),
      name: z.string(),
      url: z.string(),
      size: z.number().optional(),
      type: z.string().optional()
    }
  }, async ({ taskId, name, url, size = null, type = '' }) => {
    const { task, boardId } = findTaskOrThrow(taskId);
    const attachment = { id: randomUUID(), name: String(name), url: String(url), size, type };
    const attachments = [...(Array.isArray(task.attachments) ? task.attachments : []), attachment];
    emit('task.updated', { boardId, entityId: taskId, payload: { fields: { attachments, changeDate: new Date().toISOString() } }, actor: AGENT });
    return ok(attachment);
  });

  server.registerTool('remove_attachment', {
    title: 'Remove attachment',
    description: 'Remove an attachment from a task.',
    inputSchema: { taskId: z.string(), attachmentId: z.string() }
  }, async ({ taskId, attachmentId }) => {
    const { task, boardId } = findTaskOrThrow(taskId);
    const attachments = (Array.isArray(task.attachments) ? task.attachments : []).filter((entry) => entry.id !== attachmentId);
    emit('task.updated', { boardId, entityId: taskId, payload: { fields: { attachments, changeDate: new Date().toISOString() } }, actor: AGENT });
    return ok({ removed: attachmentId });
  });

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
    description: 'Set start/end dates and an optional goal for a board (iteration). Needed for burndown.',
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
    description: 'Velocity (story points), burndown series (needs board dates) and lead/cycle time stats.',
    inputSchema: { boardId: z.string().optional() }
  }, async ({ boardId }) => ok(computeMetrics(resolveBoard(boardId))));

  server.registerTool('list_roadmap', {
    title: 'List roadmap',
    description: 'List iterations (boards) with dates, goal, task counts and completed story points.',
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

  server.registerTool('get_board_snapshot', {
    title: 'Get raw board snapshot',
    description: 'Return the raw projected read model for a board (boards, tasks, columns, labels, settings) and current event seq.',
    inputSchema: { boardId: z.string().optional() }
  }, async ({ boardId }) => ok(getSnapshot(resolveBoard(boardId))));

  server.registerTool('get_settings', {
    title: 'Get board settings',
    description: 'Return the settings object for a board.',
    inputSchema: { boardId: z.string().optional() }
  }, async ({ boardId }) => ok(getSettings(resolveBoard(boardId))));

  server.registerTool('update_settings', {
    title: 'Update board settings',
    description: 'Merge fields into a board settings object (e.g. showPriority, showDueDate, swimLanesEnabled).',
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
