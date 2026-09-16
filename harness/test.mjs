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

store.initStore();

const tools = new Map();
registerTools({ registerTool: (name, config, handler) => { tools.set(name, { config, handler }); } });
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

const CLAIM_STALE_MS = 5 * 60 * 1000;
const NOW = 1_800_000_000_000;
const STALE_REASON = 'Auto-blocked: no agent sync for over 5 minutes.';
const minutesAgo = (ms) => new Date(NOW - ms).toISOString();

const BOARD_A = '00000000-0000-4000-8000-0000000000a1';
const BOARD_B = '00000000-0000-4000-8000-0000000000b1';
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

after(() => {
  store.flushStore();
  rmSync(dataDir, { recursive: true, force: true });
});
