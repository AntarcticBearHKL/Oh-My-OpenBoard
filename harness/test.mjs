import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const dataDir = mkdtempSync(join(tmpdir(), 'openagile-harness-test-'));
process.env.OPENAGILE_DATA_DIR = dataDir;

const store = await import('./src/store.mjs');
const { registerTools } = await import('./src/mcp-tools.mjs');
const { appendBridgeEvents, bridgeRequestDenial } = await import('./src/bridge.mjs');

store.initStore();

const tools = new Map();
const groupsBroadcasts = [];
registerTools(
  { registerTool: (name, config, handler) => { tools.set(name, { config, handler }); } },
  { broadcastGroups: () => groupsBroadcasts.push(Date.now()) }
);
const callTool = (name, args = {}) => tools.get(name).handler(args);
const toolValue = async (name, args) => JSON.parse((await callTool(name, args)).content[0].text);

let clock = 1000;
function makeEvent(type, boardId, entityId) {
  clock += 1;
  return {
    id: `evt-${clock}`,
    type,
    hlc: { wallTime: clock, counter: 0, nodeId: 'test-node' },
    at: new Date(clock).toISOString(),
    actor: { type: 'agent', id: 'harness-test' },
    scope: 'board',
    board_id: boardId,
    entity_id: entityId,
    payload: {}
  };
}

function makeTask(boardId, id, fields) {
  const event = makeEvent('task.created', boardId, id);
  event.payload = { task: { id, ...fields } };
  return event;
}

function makeBridgeEvent(type, boardId, entityId, payload) {
  const event = makeEvent(type, boardId, entityId);
  event.actor = { type: 'human', id: null };
  event.payload = payload;
  return event;
}

function bridgeMove(boardId, taskId, column) {
  return makeBridgeEvent('task.moved', boardId, taskId, {
    from_column: null,
    to_column: column,
    order: store.getTasks(boardId).map((task) => ({
      id: task.id,
      column: task.id === taskId ? column : task.column,
      order: task.order ?? 1
    }))
  });
}

const CLAIM_STALE_MS = 5 * 60 * 1000;
const NOW = 1_800_000_000_000;
const STALE_REASON = 'Auto-blocked: no agent sync for over 5 minutes.';
const minutesAgo = (ms) => new Date(NOW - ms).toISOString();
const realMinutesAgo = (ms) => new Date(Date.now() - ms).toISOString();

const BOARD_A = '00000000-0000-4000-8000-0000000000a1';
const BOARD_B = '00000000-0000-4000-8000-0000000000b1';
const BOARD_C = '00000000-0000-4000-8000-0000000000c1';
const BOARD_D = '00000000-0000-4000-8000-0000000000d1';
const BOARD_E = '00000000-0000-4000-8000-0000000000e1';
const BOARD_F = '00000000-0000-4000-8000-0000000000f1';
const BOARD_G = '00000000-0000-4000-8000-0000000000f2';
const FIXED_COLUMN_IDS = [
  '00000000-0000-4000-8000-000000000030',
  '00000000-0000-4000-8000-000000000034',
  '00000000-0000-4000-8000-000000000031',
  '00000000-0000-4000-8000-000000000032',
  '00000000-0000-4000-8000-000000000033'
];

test('the board exposes five fixed columns with Human In The Loop in position two', () => {
  assert.deepEqual(
    store.getColumns(store.DEFAULT_BOARD_ID).map((column) => column.name),
    ['Backlog', 'Human In The Loop', 'In Progress', 'Blocked', 'Finished']
  );
  assert.deepEqual(
    store.getColumns(store.DEFAULT_BOARD_ID).map((column) => column.id),
    FIXED_COLUMN_IDS
  );
});

test('a second board keeps the fixed columns it shares by id with the first board', () => {
  store.appendEvents([makeEvent('board.created', BOARD_A, BOARD_A),
    ...FIXED_COLUMN_IDS.map((id) => makeEvent('column.created', BOARD_A, id))]);

  const accepted = store.appendEvents([makeEvent('board.created', BOARD_B, BOARD_B),
    ...FIXED_COLUMN_IDS.map((id) => makeEvent('column.created', BOARD_B, id))]);

  assert.equal(accepted.length, 6, 'board B and its five columns must all be accepted');
});

test('a repeated scaffold column on the same board is still dropped', () => {
  const accepted = store.appendEvents([makeEvent('column.created', BOARD_A, FIXED_COLUMN_IDS[0])]);
  assert.equal(accepted.length, 0, 'the same column id on the same board is a duplicate');
});

test('the same event id is stored once', () => {
  const event = makeEvent('task.created', BOARD_A, 'task-idempotent');
  assert.equal(store.appendEvents([event]).length, 1);
  assert.equal(store.appendEvents([event]).length, 0);
});

test('a task id used on another board is not treated as a duplicate', () => {
  const onA = makeEvent('task.created', BOARD_A, 'task-shared-id');
  const onB = makeEvent('task.created', BOARD_B, 'task-shared-id');
  assert.equal(store.appendEvents([onA]).length, 1);
  assert.equal(store.appendEvents([onB]).length, 1);
});

test('an event without id or type is rejected', () => {
  assert.equal(store.appendEvents([{ board_id: BOARD_A }]).length, 0);
  assert.equal(store.appendEvents([null]).length, 0);
});

test('compacting the log keeps the read model and reports the trim floor', () => {
  store.appendEvents([makeEvent('task.created', BOARD_A, 'task-before-compaction')]);
  const tasksBefore = store.getTasks(BOARD_A).length;
  const seqBefore = store.getSeq();

  const result = store.compactEvents();
  store.flushStore();

  assert.equal(result.compacted, true);
  assert.equal(store.getTasks(BOARD_A).length, tasksBefore, 'the read model must survive compaction');
  assert.equal(store.getStats().trimSeq, seqBefore, 'the floor is the seq everything was folded at');
  assert.equal(store.getEventsSince(0).length, 0, 'nothing below the floor is served');

  const persisted = JSON.parse(readFileSync(join(dataDir, 'state.json'), 'utf8'));
  assert.equal(persisted.trimSeq, seqBefore);
  assert.equal(persisted.snapshot.seq, seqBefore);
  assert.deepEqual(persisted.events, [], 'the log itself is dropped');
});

test('a restart rebuilds the read model from the snapshot, not from the log', () => {
  store.flushStore();
  const script = [
    'const store = await import(' + JSON.stringify(pathToFileURL(join(HERE, 'src', 'store.mjs')).href) + ');',
    'const info = store.initStore();',
    'store.flushStore();',
    'process.stdout.write(JSON.stringify({ info, tasks: store.getTasks(store.DEFAULT_BOARD_ID).length, onA: store.getTasks(' + JSON.stringify(BOARD_A) + ').length, boards: store.getBoards().length, stats: store.getStats() }));'
  ].join('\n');
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: HERE,
    env: { ...process.env, OPENAGILE_DATA_DIR: dataDir },
    encoding: 'utf8'
  });
  const child = JSON.parse(out);
  assert.equal(child.onA, store.getTasks(BOARD_A).length, 'the child rebuilt the same board-A tasks');
  assert.equal(child.boards, store.getBoards().length, 'the child rebuilt the same boards');
  assert.equal(child.stats.trimSeq, store.getStats().trimSeq, 'and kept the floor');
});

test('a claimed in-progress task with no update for over five minutes is auto-blocked', () => {
  store.appendEvents([makeTask(BOARD_A, 'task-stale', {
    title: 'Stale claim',
    column: FIXED_COLUMN_IDS[2],
    claimedBy: 'agent-a',
    claimedAt: minutesAgo(10 * 60 * 1000),
    changeDate: minutesAgo(CLAIM_STALE_MS + 1),
    columnHistory: [{ column: FIXED_COLUMN_IDS[2], at: minutesAgo(10 * 60 * 1000) }]
  })]);

  const moved = store.sweepStaleClaims(NOW);

  assert.deepEqual(moved, ['task-stale'], 'the sweep reports the task it moved');
  const task = store.getTasks(BOARD_A).find((entry) => entry.id === 'task-stale');
  assert.equal(task.column, FIXED_COLUMN_IDS[3], 'the task lands in Blocked');
  assert.equal(task.blockedReason, STALE_REASON);
  assert.equal(task.blockedAt, new Date(NOW).toISOString(), 'blockedAt freezes the elapsed timer');
  assert.equal(task.changeDate, new Date(NOW).toISOString());
  assert.equal(task.columnHistory.at(-1).column, FIXED_COLUMN_IDS[3], 'the move is recorded in columnHistory');

  const movedEvent = store.getEventsSince(0).find((event) => event.type === 'task.moved' && event.entity_id === 'task-stale');
  assert.ok(movedEvent, 'a task.moved event is emitted for the watchdog move');
  assert.ok(movedEvent.payload.order.some((entry) => entry.id === 'task-stale' && entry.column === FIXED_COLUMN_IDS[3]));
});

test('a claimed in-progress task updated within five minutes is left alone', () => {
  store.appendEvents([makeTask(BOARD_A, 'task-fresh', {
    title: 'Fresh claim',
    column: FIXED_COLUMN_IDS[2],
    claimedBy: 'agent-a',
    claimedAt: minutesAgo(60 * 1000),
    changeDate: minutesAgo(60 * 1000)
  })]);

  assert.deepEqual(store.sweepStaleClaims(NOW), []);
  assert.equal(store.getTasks(BOARD_A).find((entry) => entry.id === 'task-fresh').column, FIXED_COLUMN_IDS[2]);
});

test('a claim exactly five minutes old is not stale yet', () => {
  store.appendEvents([makeTask(BOARD_A, 'task-boundary', {
    title: 'Boundary claim',
    column: FIXED_COLUMN_IDS[2],
    claimedBy: 'agent-a',
    claimedAt: minutesAgo(CLAIM_STALE_MS),
    changeDate: minutesAgo(CLAIM_STALE_MS)
  })]);

  assert.deepEqual(store.sweepStaleClaims(NOW), []);
  assert.equal(store.getTasks(BOARD_A).find((entry) => entry.id === 'task-boundary').column, FIXED_COLUMN_IDS[2]);
});

test('an unclaimed in-progress task is left alone', () => {
  store.appendEvents([makeTask(BOARD_A, 'task-unclaimed', {
    title: 'Unclaimed',
    column: FIXED_COLUMN_IDS[2],
    changeDate: minutesAgo(30 * 60 * 1000)
  })]);

  assert.deepEqual(store.sweepStaleClaims(NOW), []);
  assert.equal(store.getTasks(BOARD_A).find((entry) => entry.id === 'task-unclaimed').column, FIXED_COLUMN_IDS[2]);
});

test('a stale claimed task outside In Progress is left alone', () => {
  store.appendEvents([makeTask(BOARD_A, 'task-backlog', {
    title: 'Stale in Backlog',
    column: FIXED_COLUMN_IDS[0],
    claimedBy: 'agent-a',
    claimedAt: minutesAgo(30 * 60 * 1000),
    changeDate: minutesAgo(30 * 60 * 1000)
  })]);

  assert.deepEqual(store.sweepStaleClaims(NOW), []);
  assert.equal(store.getTasks(BOARD_A).find((entry) => entry.id === 'task-backlog').column, FIXED_COLUMN_IDS[0]);
});

test('a task already in Blocked is not touched again by a second sweep', () => {
  store.appendEvents([makeTask(BOARD_A, 'task-settled', {
    title: 'Settled in Blocked',
    column: FIXED_COLUMN_IDS[3],
    claimedBy: 'agent-a',
    claimedAt: minutesAgo(30 * 60 * 1000),
    changeDate: minutesAgo(30 * 60 * 1000),
    blockedReason: 'waiting on review',
    blockedAt: minutesAgo(30 * 60 * 1000)
  })]);

  assert.deepEqual(store.sweepStaleClaims(NOW), []);
  assert.deepEqual(store.sweepStaleClaims(NOW), [], 'a repeat sweep is still a no-op');
  const task = store.getTasks(BOARD_A).find((entry) => entry.id === 'task-settled');
  assert.equal(task.column, FIXED_COLUMN_IDS[3]);
  assert.equal(task.blockedReason, 'waiting on review', 'the existing reason is preserved');
  assert.equal(task.blockedAt, minutesAgo(30 * 60 * 1000));
});

test('the sweep covers every board, not just the first one', () => {
  store.appendEvents([
    makeTask(BOARD_A, 'task-stale-a', {
      title: 'Stale on A',
      column: FIXED_COLUMN_IDS[2],
      claimedBy: 'agent-a',
      claimedAt: minutesAgo(10 * 60 * 1000),
      changeDate: minutesAgo(10 * 60 * 1000)
    }),
    makeTask(BOARD_B, 'task-stale-b', {
      title: 'Stale on B',
      column: FIXED_COLUMN_IDS[2],
      claimedBy: 'agent-b',
      claimedAt: minutesAgo(10 * 60 * 1000),
      changeDate: minutesAgo(10 * 60 * 1000)
    })
  ]);

  assert.deepEqual(store.sweepStaleClaims(NOW), ['task-stale-a', 'task-stale-b']);
  assert.equal(store.getTasks(BOARD_A).find((entry) => entry.id === 'task-stale-a').column, FIXED_COLUMN_IDS[3]);
  assert.equal(store.getTasks(BOARD_B).find((entry) => entry.id === 'task-stale-b').column, FIXED_COLUMN_IDS[3]);
});

test('digesting key points stamps the points and clears needsDigest', () => {
  store.appendEvents([makeTask(BOARD_A, 'task-digest', {
    title: 'Digest me',
    column: FIXED_COLUMN_IDS[0],
    keyPoints: [
      { id: 'kp1', text: 'First', at: minutesAgo(0) },
      { id: 'kp2', text: 'Second', at: minutesAgo(0) }
    ],
    needsDigest: true
  })]);

  const first = store.digestKeyPoints('task-digest', ['kp1']);
  assert.deepEqual(first.digested, ['kp1']);

  const afterFirst = store.getTasks(BOARD_A).find((entry) => entry.id === 'task-digest');
  assert.equal(afterFirst.needsDigest, false, 'needsDigest is cleared');
  assert.ok(afterFirst.keyPoints[0].digestedAt, 'the requested point is stamped');
  assert.equal(afterFirst.keyPoints[1].digestedAt, undefined, 'the other point is untouched');

  const second = store.digestKeyPoints('task-digest');
  assert.deepEqual(second.digested, ['kp2'], 'omitting ids stamps the remaining points only');

  const afterSecond = store.getTasks(BOARD_A).find((entry) => entry.id === 'task-digest');
  assert.equal(afterSecond.keyPoints[0].digestedAt, afterFirst.keyPoints[0].digestedAt, 'an already digested point keeps its stamp');
  assert.ok(afterSecond.keyPoints[1].digestedAt);

  const updateEvents = store.getEventsSince(0).filter((event) => event.type === 'task.updated' && event.entity_id === 'task-digest');
  assert.equal(updateEvents.length, 2, 'each digest emits one task.updated event');
  assert.equal(updateEvents.at(-1).payload.fields.needsDigest, false);
});

test('digesting a missing task throws', () => {
  assert.throws(() => store.digestKeyPoints('missing-task'), /Task not found/);
});

test('claiming is refused while notes are undigested and allowed right after digest_key_points', async () => {
  store.appendEvents([makeTask(BOARD_A, 'task-guarded', {
    title: 'Guarded',
    column: FIXED_COLUMN_IDS[0],
    keyPoints: [{ id: 'note-1', text: 'Change the copy', at: minutesAgo(0) }],
    needsDigest: true
  })]);

  await assert.rejects(
    () => callTool('claim_task', { taskId: 'task-guarded' }),
    /digest_key_points/
  );
  assert.equal(store.getTasks(BOARD_A).find((entry) => entry.id === 'task-guarded').claimedBy, undefined, 'a refused claim writes nothing');

  await callTool('update_task', { taskId: 'task-guarded', description: 'still not digested' });
  assert.equal(store.getTasks(BOARD_A).find((entry) => entry.id === 'task-guarded').needsDigest, true, 'update_task cannot clear the flag');

  await callTool('digest_key_points', { taskId: 'task-guarded' });
  const digested = store.getTasks(BOARD_A).find((entry) => entry.id === 'task-guarded');
  assert.equal(digested.needsDigest, false, 'digest_key_points clears the flag');
  assert.ok(digested.keyPoints[0].digestedAt, 'the note is stamped');

  const claimed = await toolValue('claim_task', { taskId: 'task-guarded', agent: 'agent-b' });
  assert.equal(claimed.claimedBy, 'agent-b', 'the claim is allowed once the notes are digested');
});

test('moving a task into In Progress is refused while its notes are undigested', async () => {
  store.appendEvents([makeTask(BOARD_A, 'task-move-guarded', {
    title: 'Move guarded',
    column: FIXED_COLUMN_IDS[0],
    keyPoints: [{ id: 'note-2', text: 'Do it this way', at: minutesAgo(0) }],
    needsDigest: true
  })]);

  await assert.rejects(
    () => callTool('move_task', { taskId: 'task-move-guarded', column: FIXED_COLUMN_IDS[2] }),
    /digest_key_points/
  );
  assert.equal(store.getTasks(BOARD_A).find((entry) => entry.id === 'task-move-guarded').column, FIXED_COLUMN_IDS[0], 'a refused move changes nothing');

  const parked = await toolValue('move_task', { taskId: 'task-move-guarded', column: FIXED_COLUMN_IDS[3] });
  assert.equal(parked.column, FIXED_COLUMN_IDS[3], 'moving somewhere other than In Progress stays allowed');

  await callTool('digest_key_points', { taskId: 'task-move-guarded' });
  const moved = await toolValue('move_task', { taskId: 'task-move-guarded', column: FIXED_COLUMN_IDS[2] });
  assert.equal(moved.column, FIXED_COLUMN_IDS[2], 'the move is allowed once the notes are digested');
});

test('the removed tools are gone', () => {
  for (const name of ['add_comment', 'remove_comment', 'add_relationship', 'remove_relationship']) {
    assert.equal(tools.has(name), false, `${name} must not be registered`);
  }
});

test('a group keeps the name it was given', async () => {
  assert.deepEqual(Object.keys(tools.get('create_group').config.inputSchema), ['name']);

  const group = await toolValue('create_group', { name: 'Frontend Page' });

  assert.equal(group.name, 'Frontend Page');
  assert.equal(store.getGroups().find((entry) => entry.id === group.id).name, 'Frontend Page');
  assert.equal(store.getGroups().some((entry) => /^Iterations \d+$/.test(entry.name)), false, 'no group is auto-named');
});

test('rename_group renames a group, refuses unknown groups, and never renames an iteration', async () => {
  assert.deepEqual(Object.keys(tools.get('rename_group').config.inputSchema), ['groupId', 'name']);

  const group = await toolValue('create_group', { name: 'Draft' });
  const renamed = await toolValue('rename_group', { groupId: group.id, name: '  Q3 Delivery  ' });

  assert.equal(renamed.name, 'Q3 Delivery');
  assert.equal(store.getGroups().find((entry) => entry.id === group.id).name, 'Q3 Delivery');

  const listed = (await toolValue('list_groups', {})).groups.find((entry) => entry.id === group.id);
  assert.equal(listed.name, 'Q3 Delivery', 'the renamed group keeps the name it was given');
  assert.equal(groupsBroadcasts.length, 1, 'the rename is published the way the client publishes it');

  await assert.rejects(
    () => callTool('rename_group', { groupId: 'no-such-group', name: 'Nope' }),
    /Group not found/
  );
  await assert.rejects(
    () => callTool('rename_group', { groupId: group.id, name: '   ' }),
    /name is required/
  );
  assert.equal(store.getGroups().find((entry) => entry.id === group.id).name, 'Q3 Delivery', 'a refused rename changed nothing');

  const board = await toolValue('create_board', { groupId: group.id });
  await assert.rejects(
    () => callTool('rename_board', { boardId: board.id, name: 'Renamed by hand' }),
    /numbered by their position in a group and cannot be renamed/
  );
  assert.equal(store.getBoard(board.id).name, 'Iteration 1', 'the iteration still cannot be renamed');
});

test('an iteration is numbered from its position in its group', async () => {
  assert.deepEqual(Object.keys(tools.get('create_board').config.inputSchema), ['groupId'], 'create_board takes no name');

  const alpha = await toolValue('create_group', { name: 'Alpha' });
  const beta = await toolValue('create_group', { name: 'Beta' });
  const alpha1 = await toolValue('create_board', { groupId: alpha.id });
  const alpha2 = await toolValue('create_board', { groupId: alpha.id });
  const beta1 = await toolValue('create_board', { groupId: beta.id });

  assert.equal(alpha1.name, 'Iteration 1');
  assert.equal(alpha2.name, 'Iteration 2');
  assert.equal(beta1.name, 'Iteration 1', 'numbering restarts in another group');

  await assert.rejects(
    () => callTool('rename_board', { boardId: alpha1.id, name: 'Renamed by hand' }),
    /numbered by their position in a group and cannot be renamed/
  );
  assert.equal(store.getBoard(alpha1.id).name, 'Iteration 1', 'the refused rename changed nothing');
});

test('a board cannot be left outside a group', async () => {
  const group = await toolValue('create_group', { name: 'Held Group' });
  const board = await toolValue('create_board', { groupId: group.id });

  const assigned = await toolValue('assign_board_to_group', { boardId: board.id, groupId: '' });
  assert.ok(assigned.groupId, 'an empty groupId lands the board on a group');
  assert.equal(store.getBoards().find((entry) => entry.id === board.id).groupId, assigned.groupId);
  assert.equal(store.getGroups().some((entry) => entry.id === assigned.groupId), true, 'the group exists');

  const groupless = await toolValue('assign_board_to_group', { boardId: board.id });
  assert.ok(groupless.groupId, 'an omitted groupId also lands the board on a group');
  assert.equal(store.getBoards().find((entry) => entry.id === board.id).groupId, groupless.groupId);

  const auto = await toolValue('create_board', {});
  assert.ok(store.getBoards().find((entry) => entry.id === auto.id).groupId, 'a board created without a group still belongs to one');

  await assert.rejects(
    () => callTool('assign_board_to_group', { boardId: board.id, groupId: 'no-such-group' }),
    /Group not found/
  );
  assert.throws(() => store.createBoard({ groupId: 'no-such-group' }), /Group not found/);
});

test('delete_group deletes the iterations it holds', async () => {
  const group = await toolValue('create_group', { name: 'Doomed Group' });
  const first = await toolValue('create_board', { groupId: group.id });
  const second = await toolValue('create_board', { groupId: group.id });

  const result = await toolValue('delete_group', { groupId: group.id });

  assert.deepEqual([...result.deletedBoards].sort(), [first.id, second.id].sort());
  for (const boardId of [first.id, second.id]) {
    assert.equal(store.getBoard(boardId), null, 'the iteration is deleted, not stranded');
    assert.equal(store.getBoardGroupMap()[boardId], undefined, 'no group mapping survives');
  }
  assert.equal(store.getGroups().some((entry) => entry.id === group.id), false);
});

test('the agent cannot add, edit or delete a note', async () => {
  for (const name of ['create_task', 'update_task']) {
    const keys = Object.keys(tools.get(name).config.inputSchema);
    for (const field of ['type', 'estimate', 'parentId', 'keyPoints']) {
      assert.equal(keys.includes(field), false, `${name} must not advertise ${field}`);
    }
  }

  const created = await toolValue('create_task', {
    title: 'Notes stay human',
    keyPoints: [{ id: 'injected', text: 'injected note' }],
    type: 'bug',
    estimate: 8,
    parentId: 'epic'
  });
  assert.deepEqual(created.task.keyPoints ?? [], [], 'create_task writes no notes');
  assert.equal('type' in created.task, false);
  assert.equal('estimate' in created.task, false);
  assert.equal('parentId' in created.task, false);

  store.appendEvents([makeTask(BOARD_A, 'task-notes', {
    title: 'Human notes',
    column: FIXED_COLUMN_IDS[0],
    keyPoints: [
      { id: 'note-1', text: 'Keep me', at: '2026-01-01T00:00:00.000Z' },
      { id: 'note-2', text: 'Keep me too', at: '2026-01-01T00:00:00.000Z' }
    ],
    needsDigest: true
  })]);

  const before = store.getTasks(BOARD_A).find((entry) => entry.id === 'task-notes').keyPoints.map((point) => ({ ...point }));
  await callTool('digest_key_points', { taskId: 'task-notes', pointIds: ['note-1'] });
  const afterDigest = store.getTasks(BOARD_A).find((entry) => entry.id === 'task-notes');

  assert.equal(afterDigest.keyPoints.length, before.length, 'digesting deletes nothing');
  assert.equal(afterDigest.keyPoints[0].id, before[0].id);
  assert.equal(afterDigest.keyPoints[0].text, before[0].text, 'note text is never edited');
  assert.equal(afterDigest.keyPoints[0].at, before[0].at, 'the original stamp is kept');
  assert.ok(afterDigest.keyPoints[0].digestedAt, 'only the digestion stamp is written');
  assert.deepEqual(afterDigest.keyPoints[1], before[1], 'the untargeted note is untouched');
  assert.equal(afterDigest.needsDigest, false);

  await callTool('update_task', { taskId: 'task-notes', description: 'folded in', keyPoints: [{ id: 'x', text: 'nope' }] });
  const afterUpdate = store.getTasks(BOARD_A).find((entry) => entry.id === 'task-notes');
  assert.equal(afterUpdate.keyPoints.length, before.length, 'update_task cannot add or delete notes');
  assert.equal(afterUpdate.keyPoints[1].text, 'Keep me too', 'update_task cannot edit notes');
});

test('comments and relationships are gone from the tools and ignored on read', async () => {
  store.appendEvents([makeTask(BOARD_A, 'task-legacy-fields', {
    title: 'Legacy fields',
    column: FIXED_COLUMN_IDS[0],
    comments: [{ id: 'comment-1', author: 'You', text: 'old comment', at: '2026-01-01T00:00:00.000Z' }],
    relationships: [{ type: 'prerequisite', targetTaskId: 'other-task' }]
  })]);

  const listed = (await toolValue('list_tasks', { boardId: BOARD_A })).find((task) => task.id === 'task-legacy-fields');
  assert.ok(listed, 'the task stays readable');
  assert.equal('comments' in listed, false);
  assert.equal('relationships' in listed, false);

  const fetched = (await toolValue('get_task', { taskId: 'task-legacy-fields' })).task;
  assert.equal('comments' in fetched, false);
  assert.equal('relationships' in fetched, false);

  const snapshot = await toolValue('get_board_snapshot', { boardId: BOARD_A });
  const snapshotTask = snapshot.state.tasks.find((task) => task.id === 'task-legacy-fields');
  assert.equal('comments' in snapshotTask, false);
  assert.equal('relationships' in snapshotTask, false);

  const created = await toolValue('create_task', { title: 'No comments', comments: [{ id: 'injected' }] });
  assert.equal('comments' in created.task, false, 'create_task writes no comments');
});

test('the browser bridge refuses a forged move into In Progress while notes are undigested', () => {
  store.appendEvents([makeTask(BOARD_A, 'task-bridge-forged', {
    title: 'Bridge guarded',
    column: FIXED_COLUMN_IDS[0],
    order: 1,
    keyPoints: [{ id: 'kp-bridge', text: 'Fold me into the description first', at: minutesAgo(0) }],
    needsDigest: true
  })]);
  const seqBefore = store.getSeq();

  assert.throws(
    () => appendBridgeEvents([bridgeMove(BOARD_A, 'task-bridge-forged', FIXED_COLUMN_IDS[2])]),
    /digest_key_points/
  );
  assert.equal(store.findTask('task-bridge-forged').task.column, FIXED_COLUMN_IDS[0], 'a refused move is not applied');
  assert.equal(store.getSeq(), seqBefore, 'a refused move is not appended');
});

test('the forged bridge move lands once the agent has digested the notes', () => {
  store.digestKeyPoints('task-bridge-forged');

  const accepted = appendBridgeEvents([bridgeMove(BOARD_A, 'task-bridge-forged', FIXED_COLUMN_IDS[2])]);

  assert.equal(accepted.length, 1, 'the move is accepted after digest_key_points');
  assert.equal(store.findTask('task-bridge-forged').task.column, FIXED_COLUMN_IDS[2]);
});

test('the bridge still accepts the events the browser legitimately publishes', () => {
  const created = makeBridgeEvent('task.created', BOARD_A, 'task-bridge-hil', {
    task: {
      id: 'task-bridge-hil',
      title: 'Created in the dialog',
      column: FIXED_COLUMN_IDS[1],
      order: 1,
      keyPoints: [],
      needsDigest: false,
      changeDate: minutesAgo(0)
    }
  });
  assert.equal(appendBridgeEvents([created]).length, 1, 'a hand-created Human In The Loop task lands');

  store.appendEvents([makeTask(BOARD_A, 'task-bridge-rework', {
    title: 'Finished work',
    column: FIXED_COLUMN_IDS[4],
    order: 1,
    keyPoints: [{ id: 'kp-done', text: 'Already folded', at: minutesAgo(60 * 1000), digestedAt: minutesAgo(50 * 1000) }],
    needsDigest: false,
    changeDate: minutesAgo(0)
  })]);

  const appendedNote = makeBridgeEvent('task.updated', BOARD_A, 'task-bridge-rework', {
    fields: {
      keyPoints: [
        { id: 'kp-done', text: 'Already folded', at: minutesAgo(60 * 1000), digestedAt: minutesAgo(50 * 1000) },
        { id: 'kp-new', text: 'New note from the human', at: minutesAgo(0) }
      ],
      needsDigest: true,
      isRework: true
    }
  });
  assert.equal(appendBridgeEvents([appendedNote]).length, 1, 'appending a note from the dialog lands');

  assert.equal(
    appendBridgeEvents([bridgeMove(BOARD_A, 'task-bridge-rework', FIXED_COLUMN_IDS[0])]).length,
    1,
    'the internal rework move back to Backlog lands'
  );

  const reworked = store.findTask('task-bridge-rework').task;
  assert.equal(reworked.column, FIXED_COLUMN_IDS[0]);
  assert.equal(reworked.isRework, true);
  assert.equal(reworked.needsDigest, true);
  assert.equal(reworked.keyPoints[1].digestedAt, undefined, 'the new note stays undigested');
  assert.ok(reworked.keyPoints[0].digestedAt, 'the already digested note keeps its stamp');
});

test('the browser bridge refuses events that would bypass the digest workflow', () => {
  store.appendEvents([makeTask(BOARD_A, 'task-bridge-bypass', {
    title: 'Bypass attempts',
    column: FIXED_COLUMN_IDS[0],
    order: 1,
    keyPoints: [{ id: 'kp-open', text: 'Still open', at: minutesAgo(0) }],
    needsDigest: true
  })]);

  assert.throws(
    () => appendBridgeEvents([makeBridgeEvent('task.updated', BOARD_A, 'task-bridge-bypass', {
      fields: { keyPoints: [{ id: 'kp-open', text: 'Still open', at: minutesAgo(0), digestedAt: minutesAgo(0) }] }
    })]),
    /digest_key_points/,
    'stamping an undigested note from the browser is refused'
  );

  assert.throws(
    () => appendBridgeEvents([makeBridgeEvent('task.updated', BOARD_A, 'task-bridge-bypass', {
      fields: { needsDigest: false }
    })]),
    /digest_key_points/,
    'clearing the flag while a note is still pending is refused'
  );

  assert.throws(
    () => appendBridgeEvents([makeBridgeEvent('task.updated', BOARD_A, 'task-bridge-bypass', {
      fields: { column: FIXED_COLUMN_IDS[2] }
    })]),
    /task\.moved/,
    'writing the column through task.updated is refused'
  );

  assert.throws(
    () => appendBridgeEvents([makeBridgeEvent('task.updated', BOARD_A, 'task-bridge-bypass', {
      fields: { claimedBy: 'forged-agent', claimedAt: minutesAgo(0) }
    })]),
    /claim_task/,
    'claiming from the browser is refused'
  );

  const task = store.findTask('task-bridge-bypass').task;
  assert.equal(task.needsDigest, true, 'the flag is untouched');
  assert.equal(task.column, FIXED_COLUMN_IDS[0], 'the column is untouched');
  assert.equal(task.claimedBy, undefined, 'no claim was written');
  assert.equal(task.keyPoints[0].digestedAt, undefined, 'no note was stamped');
});

test('the bridge refuses requests that are not local and same-origin', () => {
  const boardPage = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:8787', origin: 'http://127.0.0.1:8787', 'sec-fetch-site': 'same-origin' }
  };
  assert.equal(bridgeRequestDenial(boardPage), null, 'the board page itself is allowed');
  assert.equal(
    bridgeRequestDenial({ socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:8787' } }),
    null,
    'a local process with a loopback Host and no Origin still passes'
  );

  assert.match(
    bridgeRequestDenial({ socket: { remoteAddress: '192.168.1.10' }, headers: { host: '127.0.0.1:8787' } }),
    /local machine/
  );
  assert.match(
    bridgeRequestDenial({ socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'evil.example' } }),
    /loopback Host/
  );
  assert.match(
    bridgeRequestDenial({ socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:8787', origin: 'http://evil.example' } }),
    /same-origin/
  );
  assert.match(
    bridgeRequestDenial({ socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:8787', 'sec-fetch-site': 'cross-site' } }),
    /cross-site/
  );
});

test('the bridge lets the human remove their last note and clear the stale flag', () => {
  store.appendEvents([makeTask(BOARD_A, 'task-bridge-remove', {
    title: 'Note removal',
    column: FIXED_COLUMN_IDS[1],
    order: 1,
    keyPoints: [{ id: 'kp-remove', text: 'Take this back', at: minutesAgo(0) }],
    needsDigest: true
  })]);

  const removed = makeBridgeEvent('task.updated', BOARD_A, 'task-bridge-remove', {
    fields: { keyPoints: [], needsDigest: false }
  });
  assert.equal(appendBridgeEvents([removed]).length, 1, 'removing the only note lands');

  const task = store.findTask('task-bridge-remove').task;
  assert.deepEqual(task.keyPoints, []);
  assert.equal(task.needsDigest, false, 'nothing is left to digest, so the flag is no longer meaningful');
});

test('heartbeat_task rewrites only changeDate and is refused outside a claimed In Progress task', async () => {
  const old = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  store.appendEvents([
    makeTask(BOARD_A, 'task-heartbeat', {
      title: 'Long running work',
      description: 'do not touch me',
      column: FIXED_COLUMN_IDS[2],
      order: 1,
      claimedBy: 'agent-a',
      claimedAt: old,
      changeDate: old,
      keyPoints: [{ id: 'kp-hb', text: 'an already folded note', at: old, digestedAt: old }],
      needsDigest: false,
      isRework: true,
      blockedReason: '',
      blockedAt: null,
      columnHistory: [{ column: FIXED_COLUMN_IDS[2], at: old }]
    }),
    makeTask(BOARD_A, 'task-heartbeat-backlog', {
      title: 'Claimed but not started',
      column: FIXED_COLUMN_IDS[0],
      order: 1,
      claimedBy: 'agent-a',
      claimedAt: old,
      changeDate: old
    }),
    makeTask(BOARD_A, 'task-heartbeat-unclaimed', {
      title: 'Started but not claimed',
      column: FIXED_COLUMN_IDS[2],
      order: 2,
      changeDate: old
    })
  ]);

  const before = store.findTask('task-heartbeat').task;
  const heartbeat = await toolValue('heartbeat_task', { taskId: 'task-heartbeat' });
  assert.ok(Date.parse(heartbeat.changeDate) > Date.parse(old), 'the heartbeat stamps a fresh changeDate');

  const after = store.findTask('task-heartbeat').task;
  assert.notEqual(after.changeDate, before.changeDate, 'changeDate moves');
  assert.deepEqual({ ...after, changeDate: null }, { ...before, changeDate: null }, 'nothing but changeDate moves');
  assert.equal(after.claimedBy, 'agent-a', 'the claim is kept');
  assert.equal(after.isRework, true, 'the heartbeat does not touch the rework marker');

  await assert.rejects(
    () => callTool('heartbeat_task', { taskId: 'task-heartbeat-backlog' }),
    /In Progress/
  );
  await assert.rejects(
    () => callTool('heartbeat_task', { taskId: 'task-heartbeat-unclaimed' }),
    /claim_task/
  );
  assert.equal(store.findTask('task-heartbeat-backlog').task.changeDate, old, 'a refused heartbeat writes nothing');
  assert.equal(store.findTask('task-heartbeat-unclaimed').task.changeDate, old, 'a refused heartbeat writes nothing');
});

test('a move into In Progress restarts the stale clock for MCP and bridge moves', async () => {
  const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  store.appendEvents([
    makeTask(BOARD_A, 'task-clock-mcp', {
      title: 'Moved by MCP',
      column: FIXED_COLUMN_IDS[0],
      order: 1,
      claimedBy: 'agent-a',
      claimedAt: stale,
      changeDate: stale
    }),
    makeTask(BOARD_A, 'task-clock-bridge', {
      title: 'Moved by the browser',
      column: FIXED_COLUMN_IDS[0],
      order: 2,
      claimedBy: 'agent-b',
      claimedAt: stale,
      changeDate: stale
    })
  ]);

  await toolValue('move_task', { taskId: 'task-clock-mcp', column: FIXED_COLUMN_IDS[2] });
  assert.equal(store.findTask('task-clock-mcp').task.column, FIXED_COLUMN_IDS[2], 'the MCP move lands');
  const bridgeEvent = bridgeMove(BOARD_A, 'task-clock-bridge', FIXED_COLUMN_IDS[2]);
  bridgeEvent.at = new Date().toISOString();
  assert.equal(appendBridgeEvents([bridgeEvent]).length, 1, 'the bridge move lands');

  for (const taskId of ['task-clock-mcp', 'task-clock-bridge']) {
    const task = store.findTask(taskId).task;
    assert.equal(task.column, FIXED_COLUMN_IDS[2]);
    const enteredAt = task.columnHistory.at(-1).at;
    const moved = store.sweepStaleClaims(Date.parse(enteredAt) + 1000);
    assert.equal(moved.includes(taskId), false, `${taskId} is not stale right after entering In Progress`);
    assert.equal(store.findTask(taskId).task.column, FIXED_COLUMN_IDS[2]);
  }

  const enteredAt = store.findTask('task-clock-mcp').task.columnHistory.at(-1).at;
  const lateSweep = store.sweepStaleClaims(Date.parse(enteredAt) + CLAIM_STALE_MS + 1);
  assert.ok(lateSweep.includes('task-clock-mcp'), 'the watchdog still fires once the window has really elapsed');
});

test('digest_key_points clears the rework marker it was holding', async () => {
  store.appendEvents([makeTask(BOARD_A, 'task-rework-flag', {
    title: 'Back from Finished',
    column: FIXED_COLUMN_IDS[0],
    order: 1,
    isRework: true,
    needsDigest: true,
    keyPoints: [{ id: 'kp-rework', text: 'Change the ending', at: minutesAgo(0) }]
  })]);

  assert.equal(store.findTask('task-rework-flag').task.isRework, true);

  await callTool('digest_key_points', { taskId: 'task-rework-flag' });

  const after = store.findTask('task-rework-flag').task;
  assert.equal(after.needsDigest, false);
  assert.equal(after.isRework, false, 'digesting the notes is the agent taking the rework on');
  assert.ok(after.keyPoints[0].digestedAt);
});

test('delete_task refuses a finished task and still deletes any other', async () => {
  store.appendEvents([
    makeTask(BOARD_A, 'task-done-guard', {
      title: 'Completed work',
      column: FIXED_COLUMN_IDS[4],
      order: 1,
      doneDate: minutesAgo(0),
      changeDate: minutesAgo(0)
    }),
    makeTask(BOARD_A, 'task-deletable', {
      title: 'Scratch work',
      column: FIXED_COLUMN_IDS[0],
      order: 2,
      changeDate: minutesAgo(0)
    })
  ]);

  await assert.rejects(
    () => callTool('delete_task', { taskId: 'task-done-guard' }),
    /Finished column cannot be deleted/
  );
  assert.ok(store.findTask('task-done-guard'), 'the finished task survives the refusal');

  const result = await toolValue('delete_task', { taskId: 'task-deletable' });
  assert.equal(result.deleted, 'task-deletable');
  assert.equal(store.findTask('task-deletable'), null, 'a task outside Finished is still deletable');
});

test('a live claim by another agent is refused and names the holder', async () => {
  store.appendEvents([makeTask(BOARD_A, 'task-live-lock', {
    title: 'Live lock', column: FIXED_COLUMN_IDS[0], order: 900, changeDate: realMinutesAgo(0)
  })]);

  const first = await toolValue('claim_task', { taskId: 'task-live-lock', agent: 'agent-a' });
  assert.equal(first.claimedBy, 'agent-a');

  await assert.rejects(
    () => callTool('claim_task', { taskId: 'task-live-lock', agent: 'agent-b' }),
    /agent-a/,
    'the refusal names the holder'
  );
  assert.equal(store.findTask('task-live-lock').task.claimedBy, 'agent-a', 'the refused claim changes nothing');
});

test('re-claiming as the same agent renews the claim instead of conflicting', async () => {
  store.appendEvents([makeTask(BOARD_A, 'task-renew', {
    title: 'Renew me', column: FIXED_COLUMN_IDS[0], order: 901, changeDate: realMinutesAgo(60 * 1000)
  })]);

  const first = await toolValue('claim_task', { taskId: 'task-renew', agent: 'agent-a' });
  const second = await toolValue('claim_task', { taskId: 'task-renew', agent: 'agent-a' });

  assert.equal(second.renewed, true, 'the result says it renewed');
  assert.ok(Date.parse(second.claimedAt) >= Date.parse(first.claimedAt), 'the claim timestamp is refreshed');
  assert.equal(store.findTask('task-renew').task.changeDate, second.claimedAt, 'changeDate moves with the renewal');
  assert.equal(store.findTask('task-renew').task.claimedBy, 'agent-a');
});

test('a claim older than the stale window can be taken over', async () => {
  store.appendEvents([makeTask(BOARD_A, 'task-takeover', {
    title: 'Crash recovery',
    column: FIXED_COLUMN_IDS[0],
    order: 902,
    claimedBy: 'agent-a',
    claimedAt: realMinutesAgo(10 * 60 * 1000),
    changeDate: realMinutesAgo(10 * 60 * 1000),
    columnHistory: [{ column: FIXED_COLUMN_IDS[0], at: realMinutesAgo(10 * 60 * 1000) }]
  })]);

  const taken = await toolValue('claim_task', { taskId: 'task-takeover', agent: 'agent-b' });

  assert.equal(taken.tookOver, true, 'the result says it took over');
  assert.equal(taken.previousHolder, 'agent-a');
  assert.equal(store.findTask('task-takeover').task.claimedBy, 'agent-b');
});

test('task reads expose the claim holder, its timestamps and whether the claim is expired', async () => {
  store.appendEvents([
    makeTask(BOARD_A, 'task-expired-read', {
      title: 'Expired read',
      column: FIXED_COLUMN_IDS[0],
      order: 903,
      claimedBy: 'agent-a',
      claimedAt: realMinutesAgo(10 * 60 * 1000),
      changeDate: realMinutesAgo(10 * 60 * 1000)
    }),
    makeTask(BOARD_A, 'task-live-read', {
      title: 'Live read',
      column: FIXED_COLUMN_IDS[0],
      order: 904,
      claimedBy: 'agent-live',
      claimedAt: realMinutesAgo(60 * 1000),
      changeDate: realMinutesAgo(60 * 1000)
    })
  ]);

  const listed = (await toolValue('list_tasks', { boardId: BOARD_A })).find((task) => task.id === 'task-expired-read');
  assert.equal(listed.claimedBy, 'agent-a');
  assert.ok(listed.claimedAt);
  assert.ok(listed.changeDate);
  assert.equal(listed.blockedReason, '');
  assert.equal(listed.claimExpired, true, 'a stale claim is reported as expired');

  const fetched = (await toolValue('get_task', { taskId: 'task-live-read' })).task;
  assert.equal(fetched.claimedBy, 'agent-live');
  assert.equal(fetched.claimExpired, false, 'a fresh claim is reported as live');
});

test('the watchdog does not clear a claim when it auto-blocks a stale task', () => {
  store.appendEvents([makeTask(BOARD_A, 'task-watchdog-claim', {
    title: 'Watchdog keeps the claim',
    column: FIXED_COLUMN_IDS[2],
    claimedBy: 'agent-a',
    claimedAt: minutesAgo(10 * 60 * 1000),
    changeDate: minutesAgo(CLAIM_STALE_MS + 1)
  })]);

  const moved = store.sweepStaleClaims(NOW);

  assert.ok(moved.includes('task-watchdog-claim'));
  const task = store.getTasks(BOARD_A).find((entry) => entry.id === 'task-watchdog-claim');
  assert.equal(task.column, FIXED_COLUMN_IDS[3]);
  assert.equal(task.claimedBy, 'agent-a', 'the owner is still recorded');
  assert.ok(task.claimedAt, 'and the claim timestamp is untouched');
  assert.equal(task.blockedReason, STALE_REASON);
});

test('list_tasks filters by claimedBy, needsDigest and readiness', async () => {
  store.appendEvents([makeEvent('board.created', BOARD_D, BOARD_D)]);
  store.appendEvents([
    makeTask(BOARD_D, 'd-ready', { title: 'Ready', column: FIXED_COLUMN_IDS[0], order: 10, changeDate: realMinutesAgo(2 * 60 * 1000) }),
    makeTask(BOARD_D, 'd-ready-hil', { title: 'Ready in HIL', column: FIXED_COLUMN_IDS[1], order: 11, changeDate: realMinutesAgo(2 * 60 * 1000) }),
    makeTask(BOARD_D, 'd-notes', { title: 'Notes', column: FIXED_COLUMN_IDS[0], order: 12, keyPoints: [{ id: 'd-note-1', text: 'fold me', at: minutesAgo(0) }], needsDigest: true }),
    makeTask(BOARD_D, 'd-claimed', { title: 'Claimed', column: FIXED_COLUMN_IDS[0], order: 13, claimedBy: 'agent-x', claimedAt: realMinutesAgo(60 * 1000), changeDate: realMinutesAgo(60 * 1000) }),
    makeTask(BOARD_D, 'd-started', { title: 'Started', column: FIXED_COLUMN_IDS[2], order: 14, changeDate: realMinutesAgo(60 * 1000) })
  ]);

  const ready = await toolValue('list_tasks', { boardId: BOARD_D, ready: true });
  assert.deepEqual(ready.map((task) => task.id), ['d-ready', 'd-ready-hil']);

  const mine = await toolValue('list_tasks', { boardId: BOARD_D, claimedBy: 'agent-x' });
  assert.deepEqual(mine.map((task) => task.id), ['d-claimed']);

  const undigested = await toolValue('list_tasks', { boardId: BOARD_D, needsDigest: true });
  assert.deepEqual(undigested.map((task) => task.id), ['d-notes']);

  const unclaimed = await toolValue('list_tasks', { boardId: BOARD_D, claimedBy: '' });
  assert.deepEqual(unclaimed.map((task) => task.id).sort(), ['d-notes', 'd-ready', 'd-ready-hil', 'd-started']);
});

test('claim_next deterministically takes the first ready task and never a live claim', async () => {
  store.appendEvents([makeEvent('board.created', BOARD_C, BOARD_C)]);
  store.appendEvents([
    makeTask(BOARD_C, 'c-notes', { title: 'Undigested', column: FIXED_COLUMN_IDS[0], order: 0, keyPoints: [{ id: 'c-note', text: 'fold first', at: realMinutesAgo(0) }], needsDigest: true }),
    makeTask(BOARD_C, 'c-hil', { title: 'HIL task', column: FIXED_COLUMN_IDS[1], order: 1, changeDate: realMinutesAgo(2 * 60 * 1000) }),
    makeTask(BOARD_C, 'c-live', { title: 'Live foreign claim', column: FIXED_COLUMN_IDS[0], order: 1, claimedBy: 'agent-other', claimedAt: realMinutesAgo(60 * 1000), changeDate: realMinutesAgo(60 * 1000) }),
    makeTask(BOARD_C, 'c-backlog', { title: 'Backlog task', column: FIXED_COLUMN_IDS[0], order: 5, changeDate: realMinutesAgo(2 * 60 * 1000) })
  ]);

  const first = await toolValue('claim_next', { boardId: BOARD_C, agent: 'agent-d' });
  assert.equal(first.claimed, true);
  assert.equal(first.taskId, 'c-backlog', 'Backlog beats Human In The Loop even at a higher order');
  assert.equal(store.findTask('c-backlog').task.claimedBy, 'agent-d');

  const second = await toolValue('claim_next', { boardId: BOARD_C, agent: 'agent-d' });
  assert.equal(second.taskId, 'c-hil', 'the next dispatch moves on to the next ready task');

  const third = await toolValue('claim_next', { boardId: BOARD_C, agent: 'agent-d' });
  assert.equal(third.claimed, false, 'a live foreign claim is never returned');
  assert.equal(store.findTask('c-live').task.claimedBy, 'agent-other', 'the live holder is untouched');

  const expire = makeEvent('task.updated', BOARD_C, 'c-live');
  expire.payload = { fields: { changeDate: realMinutesAgo(10 * 60 * 1000) } };
  store.appendEvents([expire]);

  const taken = await toolValue('claim_next', { boardId: BOARD_C, agent: 'agent-d' });
  assert.equal(taken.taskId, 'c-live', 'the expired claim is taken over');
  assert.equal(taken.tookOver, true);
  assert.equal(taken.previousHolder, 'agent-other');
});

test('delete_board refuses a non-last iteration and allows the last', async () => {
  const group = await toolValue('create_group', { name: 'Delete Guard' });
  const first = await toolValue('create_board', { groupId: group.id });
  const second = await toolValue('create_board', { groupId: group.id });

  await assert.rejects(
    () => callTool('delete_board', { boardId: first.id }),
    /not the last iteration/
  );
  assert.ok(store.getBoard(first.id), 'the earlier iteration survives');

  const removed = await toolValue('delete_board', { boardId: second.id });
  assert.equal(removed.deleted, second.id);
  assert.equal(store.getBoard(second.id), null);

  const nowLast = await toolValue('delete_board', { boardId: first.id });
  assert.equal(nowLast.deleted, first.id, 'once it is the last iteration it can be deleted');
});

test('list_roadmap marks unfinished work and the active iteration in group order', async () => {
  const group = await toolValue('create_group', { name: 'Wave Check' });
  const unfinished = await toolValue('create_board', { groupId: group.id });
  const finished = await toolValue('create_board', { groupId: group.id });
  store.appendEvents([
    makeTask(unfinished.id, 'wave-open', { title: 'Open', column: FIXED_COLUMN_IDS[0], order: 1 }),
    makeTask(finished.id, 'wave-done', { title: 'Done', column: FIXED_COLUMN_IDS[4], order: 1 })
  ]);

  const roadmap = await toolValue('list_roadmap', {});

  assert.equal(roadmap.find((row) => row.id === unfinished.id).unfinishedTasks, 1);
  assert.equal(roadmap.find((row) => row.id === finished.id).unfinishedTasks, 0);

  const groups = store.getGroups();
  const ordered = [];
  for (const entry of groups) {
    for (const board of store.getBoards()) {
      if ((board.groupId || '') === entry.id) ordered.push(board.id);
    }
  }
  for (const board of store.getBoards()) {
    if (!groups.some((entry) => entry.id === (board.groupId || ''))) ordered.push(board.id);
  }
  const expectedActive = ordered.find((boardId) => {
    const tasks = store.getTasks(boardId);
    const done = tasks.filter((task) => task.column === FIXED_COLUMN_IDS[4]).length;
    return !(tasks.length > 0 && done === tasks.length);
  });

  const activeRows = roadmap.filter((row) => row.isActive);
  assert.equal(activeRows.length, 1, 'exactly one iteration is active');
  assert.equal(activeRows[0].id, expectedActive);
});

after(() => {
  store.flushStore();
  rmSync(dataDir, { recursive: true, force: true });
});
