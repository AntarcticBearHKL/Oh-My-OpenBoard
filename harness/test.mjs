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

const BOARD_A = '00000000-0000-4000-8000-0000000000a1';
const BOARD_B = '00000000-0000-4000-8000-0000000000b1';
const FIXED_COLUMN_IDS = [
  '00000000-0000-4000-8000-000000000030',
  '00000000-0000-4000-8000-000000000031',
  '00000000-0000-4000-8000-000000000032',
  '00000000-0000-4000-8000-000000000033'
];

test('a second board keeps the fixed columns it shares by id with the first board', () => {
  store.appendEvents([makeEvent('board.created', BOARD_A, BOARD_A),
    ...FIXED_COLUMN_IDS.map((id) => makeEvent('column.created', BOARD_A, id))]);

  const accepted = store.appendEvents([makeEvent('board.created', BOARD_B, BOARD_B),
    ...FIXED_COLUMN_IDS.map((id) => makeEvent('column.created', BOARD_B, id))]);

  assert.equal(accepted.length, 5, 'board B and its four columns must all be accepted');
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
after(() => {
  store.flushStore();
  rmSync(dataDir, { recursive: true, force: true });
});
