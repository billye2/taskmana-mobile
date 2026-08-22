// Unit tests for schema v2 (modifiedAt) and mergeStates — the task-level sync
// merge. Loads model.js the same way model.test.mjs does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  fileURLToPath(new URL('../../js/model.js', import.meta.url)),
  'utf8'
);
const M = new Function(`${src}; return TaskmanaModel;`)();

const DAY = '2026-07-18';
const NEXT_DAY = '2026-07-19';
const NOW = 1_800_000_000_000; // fixed clock for deterministic pruning

/** Minimal v2 task with controllable fields. */
function mk(id, over = {}) {
  return {
    id,
    text: id,
    createdAt: 1,
    status: 'inbox',
    order: null,
    migrationCount: 0,
    ackMigrations: 0,
    completedAt: null,
    completedOn: null,
    modifiedAt: 1,
    ...over,
  };
}

/** Minimal v2 state. */
function st(tasks, over = {}) {
  return {
    version: 2,
    tasks,
    lastRolloverDate: DAY,
    tomorrowQueue: [],
    lastReviewDate: null,
    settings: { focusMode: false },
    ...over,
  };
}

/** Merge must be commutative and idempotent for every case. */
function merge(a, b) {
  const ab = M.mergeStates(a, b, NOW);
  const ba = M.mergeStates(b, a, NOW);
  assert.deepEqual(ab, ba, 'merge is not commutative');
  assert.deepEqual(M.mergeStates(ab, ab, NOW), ab, 'merge is not idempotent');
  return ab;
}

// ---- migration --------------------------------------------------------------

test('migration 1->2 backfills modifiedAt from the newest known timestamp', () => {
  const v1 = st([
    mk('a', { createdAt: 10, modifiedAt: undefined }),
    mk('b', { createdAt: 10, completedAt: 50, modifiedAt: undefined }),
    mk('c', { createdAt: 10, droppedAt: 99, status: 'dropped', modifiedAt: undefined }),
  ], { version: 1 });
  delete v1.tasks[0].modifiedAt;
  delete v1.tasks[1].modifiedAt;
  delete v1.tasks[2].modifiedAt;
  const s = M.migrateState(v1);
  assert.equal(s.version, M.STATE_VERSION);
  assert.deepEqual(s.tasks.map((t) => t.modifiedAt), [10, 50, 99]);
});

test('legacy pre-versioning state chains v0 -> v2', () => {
  const legacy = {
    tasks: [{ id: 'a', text: 'old', createdAt: 7, status: 'inbox', order: null, migrationCount: 0 }],
    lastRolloverDate: DAY,
    tomorrowQueue: [],
    lastReviewDate: null,
    settings: { focusMode: false },
  };
  const s = M.migrateState(legacy);
  assert.equal(s.version, M.STATE_VERSION);
  assert.equal(s.tasks[0].modifiedAt, 7);
});

test('every task mutation stamps modifiedAt', () => {
  const s = M.initialState(DAY);
  const t = M.addTask(s, 'x');
  assert.equal(t.modifiedAt, t.createdAt);

  const stamps = [];
  const record = () => stamps.push(t.modifiedAt);
  t.modifiedAt = 0; M.editTask(s, t.id, 'renamed'); record();
  t.modifiedAt = 0; M.promoteToToday(s, t.id); record();
  t.modifiedAt = 0; M.toggleDone(s, t.id, DAY); record();
  t.modifiedAt = 0; M.toggleDone(s, t.id, DAY); record(); // un-complete
  t.modifiedAt = 0; M.keepMigrated(s, t.id); record();
  t.modifiedAt = 0; M.demoteToInbox(s, t.id); record();
  t.modifiedAt = 0; M.sendToSomeday(s, t.id); record();
  t.modifiedAt = 0; M.dropTask(s, t.id); record();
  assert.ok(stamps.every((v) => v > 0), `unstamped mutation: ${stamps}`);

  const a = M.addTask(s, 'a');
  const b = M.addTask(s, 'b');
  M.promoteToToday(s, a.id);
  M.promoteToToday(s, b.id);
  a.modifiedAt = 0; b.modifiedAt = 0;
  M.moveInToday(s, b.id, -1);
  assert.ok(a.modifiedAt > 0 && b.modifiedAt > 0, 'moveInToday must stamp both tasks');
});

// ---- merge matrix -----------------------------------------------------------

test('both edited: the newer copy of a task wins wholesale', () => {
  const a = st([mk('t', { text: 'from desktop', modifiedAt: 200 })]);
  const b = st([mk('t', { text: 'from phone', modifiedAt: 300 })]);
  const m = merge(a, b);
  assert.equal(m.tasks.length, 1);
  assert.equal(m.tasks[0].text, 'from phone');
});

test('tasks added on different devices both survive', () => {
  const a = st([mk('desk', { modifiedAt: 100 })]);
  const b = st([mk('phone', { modifiedAt: 100 })]);
  const m = merge(a, b);
  assert.deepEqual(m.tasks.map((t) => t.id).sort(), ['desk', 'phone']);
});

test('completion beats an older copy; a later edit beats the completion', () => {
  const done = mk('t', { status: 'done', completedAt: 500, completedOn: DAY, modifiedAt: 500 });
  const stale = mk('t', { modifiedAt: 100 });
  assert.equal(merge(st([done]), st([stale])).tasks[0].status, 'done');

  // expected LWW semantics: editing after someone completed reverts the completion
  const editedLater = mk('t', { text: 'reworded', modifiedAt: 600 });
  const m = merge(st([done]), st([editedLater]));
  assert.equal(m.tasks[0].status, 'inbox');
  assert.equal(m.tasks[0].text, 'reworded');
});

test('pruned dropped tasks do not resurrect; recent dropped tasks survive', () => {
  const OLD = NOW - 31 * 86400000;
  const RECENT = NOW - 86400000;
  const a = st([]); // device that already pruned
  const b = st([
    mk('old', { status: 'dropped', droppedAt: OLD, modifiedAt: OLD }),
    mk('recent', { status: 'dropped', droppedAt: RECENT, modifiedAt: RECENT }),
  ]);
  const m = merge(a, b);
  assert.deepEqual(m.tasks.map((t) => t.id), ['recent']);
});

test('duplicate order slots are renumbered deterministically', () => {
  const a = st([mk('a1', { status: 'today', order: 0, modifiedAt: 100 })]);
  const b = st([mk('b1', { status: 'today', order: 0, modifiedAt: 200 })]);
  const m = merge(a, b);
  const today = m.tasks
    .filter((t) => t.status === 'today')
    .sort((x, y) => x.order - y.order);
  assert.deepEqual(today.map((t) => [t.id, t.order]), [['a1', 0], ['b1', 1]]);
});

test('more than 6 today slots after merge: overflow returns to inbox, done rows keep their log place', () => {
  const mkToday = (id, order, over = {}) =>
    mk(id, { status: 'today', order, modifiedAt: 10 + order, ...over });
  const a = st([0, 1, 2, 3].map((i) => mkToday(`a${i}`, i)));
  const b = st([
    ...[0, 1, 2].map((i) => mkToday(`b${i}`, i)),
    mk('bdone', { status: 'done', order: 3, completedAt: 999, completedOn: DAY, modifiedAt: 999 }),
  ]);
  const m = merge(a, b);
  const slotted = m.tasks.filter((t) => t.order !== null);
  assert.equal(slotted.length, M.TODAY_CAP);
  const overflow = m.tasks.filter((t) => t.order === null);
  assert.ok(overflow.every((t) => t.status === 'inbox' || t.status === 'done'));
  assert.equal(m.tasks.filter((t) => t.status === 'today').length + m.tasks.filter((t) => t.status === 'done' && t.order !== null).length, M.TODAY_CAP);
});

test('rollover on one device then merge: migrationCount never double-increments', () => {
  const s = M.initialState(DAY);
  const t = M.addTask(s, 'carried');
  M.promoteToToday(s, t.id);

  const rolled = structuredClone(s);
  M.rollover(rolled, NEXT_DAY); // stamps with real Date.now(), far newer than s
  assert.equal(M.getTask(rolled, t.id).migrationCount, 1);

  // stale device merges in the rolled-over copy
  const m = M.mergeStates(structuredClone(s), rolled, Date.now());
  assert.equal(m.lastRolloverDate, NEXT_DAY);
  assert.equal(M.getTask(m, t.id).migrationCount, 1);
  // the stale device then runs its own rollover — must no-op
  assert.equal(M.rollover(m, NEXT_DAY), false);
  assert.equal(M.getTask(m, t.id).migrationCount, 1);
});

test('scalars follow the side with newer activity; queue drops vanished ids', () => {
  const a = st([mk('x', { modifiedAt: 100 })], {
    tomorrowQueue: ['x'],
    settings: { focusMode: true, theme: 'dark' },
    lastReviewDate: '2026-07-10',
  });
  const b = st([mk('y', { modifiedAt: 200 })], {
    tomorrowQueue: ['y', 'gone'],
    settings: { focusMode: false, theme: 'light' },
    lastReviewDate: '2026-07-14',
  });
  const m = merge(a, b);
  assert.deepEqual(m.tomorrowQueue, ['y']); // b is newer; 'gone' filtered out
  assert.equal(m.settings.theme, 'light');
  assert.equal(m.lastReviewDate, '2026-07-14'); // max non-null
  assert.equal(merge(a, st([], { lastReviewDate: null })).lastReviewDate, '2026-07-10');
});

test('mergeStates is pure — neither input is mutated', () => {
  const a = st([mk('a1', { status: 'today', order: 0, modifiedAt: 100 })]);
  const b = st([mk('a1', { status: 'today', order: 0, modifiedAt: 200 }), mk('b1', { status: 'today', order: 0, modifiedAt: 300 })]);
  const aBefore = JSON.stringify(a);
  const bBefore = JSON.stringify(b);
  M.mergeStates(a, b, NOW);
  assert.equal(JSON.stringify(a), aBefore);
  assert.equal(JSON.stringify(b), bBefore);
});

test('merge keeps the newer copy’s why, including a cleared one', () => {
  const a = st([mk('t', { why: 'written on laptop', modifiedAt: 5 })]);
  const b = st([mk('t', { why: null, modifiedAt: 2 })]);
  assert.equal(merge(a, b).tasks[0].why, 'written on laptop');
  const cleared = st([mk('t', { why: null, modifiedAt: 9 })]);
  assert.equal(merge(a, cleared).tasks[0].why, null);
});
