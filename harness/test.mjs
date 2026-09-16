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

store.initStore();

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

test('the board exposes five fixed columns with HIL in position two', () => {
  assert.deepEqual(
    store.getColumns(store.DEFAULT_BOARD_ID).map((column) => column.name),
    ['Backlog', 'HIL', 'In Progress', 'Blocked', 'Finished']
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

after(() => {
  store.flushStore();
  rmSync(dataDir, { recursive: true, force: true });
});
