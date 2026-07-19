// Unit tests for js/model.js (pure logic). The file is a classic browser
// script, so we evaluate it and grab the TaskmanaModel namespace it defines.
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

function freshState() {
  return M.initialState(DAY);
}

/** Add a task and return it (asserts creation succeeded). */
function add(state, text) {
  const t = M.addTask(state, text);
  assert.ok(t, `addTask failed for ${JSON.stringify(text)}`);
  return t;
}

test('addTask trims text and rejects empty input', () => {
  const s = freshState();
  const t = add(s, '  hello  ');
  assert.equal(t.text, 'hello');
  assert.equal(t.status, 'inbox');
  assert.equal(M.addTask(s, '   '), null);
  assert.equal(s.tasks.length, 1);
});

test('promoteToToday caps the today list at 6', () => {
  const s = freshState();
  for (let i = 0; i < 8; i++) add(s, `task ${i}`);
  const results = s.tasks.map((t) => M.promoteToToday(s, t.id));
  assert.deepEqual(results, [true, true, true, true, true, true, false, false]);
  assert.equal(M.todayList(s).length, 6);
  assert.equal(M.todayHasRoom(s), false);
});

test('today list preserves promotion order and reorders via moveInToday', () => {
  const s = freshState();
  const [a, b, c] = ['a', 'b', 'c'].map((x) => add(s, x));
  [a, b, c].forEach((t) => M.promoteToToday(s, t.id));
  assert.deepEqual(M.todayList(s).map((t) => t.text), ['a', 'b', 'c']);
  M.moveInToday(s, c.id, -1);
  assert.deepEqual(M.todayList(s).map((t) => t.text), ['a', 'c', 'b']);
  M.moveInToday(s, a.id, -1); // already first: no-op
  assert.deepEqual(M.todayList(s).map((t) => t.text), ['a', 'c', 'b']);
});

test('toggleDone marks done with date and back to today', () => {
  const s = freshState();
  const t = add(s, 'x');
  M.promoteToToday(s, t.id);
  M.toggleDone(s, t.id, DAY);
  assert.equal(t.status, 'done');
  assert.equal(t.completedOn, DAY);
  assert.deepEqual(M.doneToday(s, DAY).map((d) => d.id), [t.id]);
  M.toggleDone(s, t.id, DAY);
  assert.equal(t.status, 'today'); // still held a today slot
  assert.equal(t.completedOn, null);
});

test('currentFocusTask is the first unfinished today task', () => {
  const s = freshState();
  const [a, b] = ['a', 'b'].map((x) => add(s, x));
  [a, b].forEach((t) => M.promoteToToday(s, t.id));
  assert.equal(M.currentFocusTask(s).id, a.id);
  M.toggleDone(s, a.id, DAY);
  assert.equal(M.currentFocusTask(s).id, b.id);
});

test('rollover increments migrationCount on unfinished today tasks', () => {
  const s = freshState();
  const t = add(s, 'lingering');
  M.promoteToToday(s, t.id);
  assert.equal(M.rollover(s, NEXT_DAY), true);
  assert.equal(t.migrationCount, 1);
  assert.equal(t.status, 'today'); // carried over
  assert.equal(M.rollover(s, NEXT_DAY), false); // idempotent per day
  assert.equal(t.migrationCount, 1);
});

test('rollover promotes tomorrowQueue in order, ahead of carried tasks', () => {
  const s = freshState();
  const carried = add(s, 'carried');
  const q1 = add(s, 'queued first');
  const q2 = add(s, 'queued second');
  M.promoteToToday(s, carried.id);
  M.setTomorrowQueue(s, [q1.id, q2.id]);
  M.rollover(s, NEXT_DAY);
  assert.deepEqual(M.todayList(s).map((t) => t.text), [
    'queued first',
    'queued second',
    'carried',
  ]);
  assert.deepEqual(s.tomorrowQueue, []);
});

test('rollover dedupes a task that is both queued and carried', () => {
  const s = freshState();
  const t = add(s, 'both');
  M.promoteToToday(s, t.id);
  M.setTomorrowQueue(s, [t.id]);
  M.rollover(s, NEXT_DAY);
  assert.deepEqual(M.todayList(s).map((x) => x.text), ['both']);
});

test('rollover archives done tasks off the today list', () => {
  const s = freshState();
  const t = add(s, 'finished');
  M.promoteToToday(s, t.id);
  M.toggleDone(s, t.id, DAY);
  M.rollover(s, NEXT_DAY);
  assert.equal(t.status, 'done');
  assert.equal(t.order, null);
  assert.equal(M.todayList(s).length, 0);
  assert.deepEqual(M.doneToday(s, NEXT_DAY), []); // done log is per-day
});

test('rollover overflow past the cap returns tasks to the inbox', () => {
  const s = freshState();
  const carried = [];
  for (let i = 0; i < 5; i++) {
    const t = add(s, `carried ${i}`);
    M.promoteToToday(s, t.id);
    carried.push(t);
  }
  const queued = [];
  for (let i = 0; i < 3; i++) queued.push(add(s, `queued ${i}`));
  M.setTomorrowQueue(s, queued.map((t) => t.id));
  M.rollover(s, NEXT_DAY);
  const today = M.todayList(s);
  assert.equal(today.length, 6);
  assert.deepEqual(today.slice(0, 3).map((t) => t.text), ['queued 0', 'queued 1', 'queued 2']);
  // 5 carried, 3 slots left: the last 2 fall back to inbox with their marks
  const overflow = M.inboxTasks(s).filter((t) => t.text.startsWith('carried'));
  assert.equal(overflow.length, 2);
  assert.ok(overflow.every((t) => t.migrationCount === 1));
});

test('rollover prunes dropped tasks older than 30 days but keeps recent ones', () => {
  const s = freshState();
  const oldDrop = add(s, 'old drop');
  const newDrop = add(s, 'new drop');
  M.dropTask(s, oldDrop.id);
  M.dropTask(s, newDrop.id);
  oldDrop.droppedAt = Date.now() - 31 * 86400000;
  M.rollover(s, NEXT_DAY);
  assert.deepEqual(s.tasks.filter((t) => t.status === 'dropped').map((t) => t.text), ['new drop']);
});

test('migration decision appears at 5 carries and is silenced by keepMigrated', () => {
  const s = freshState();
  const t = add(s, 'stale');
  M.promoteToToday(s, t.id);
  t.migrationCount = 4;
  assert.equal(M.needsMigrationDecision(t), false);
  t.migrationCount = 5;
  assert.equal(M.needsMigrationDecision(t), true);
  M.keepMigrated(s, t.id);
  assert.equal(M.needsMigrationDecision(t), false); // acknowledged at 5
  t.migrationCount = 6;
  assert.equal(M.needsMigrationDecision(t), true); // re-asks on the next carry
});

test('reviewDue: first review nudges only when candidates exist, then every 7 days', () => {
  const s = freshState();
  assert.equal(M.reviewDue(s, DAY), false); // no tasks at all
  add(s, 'inbox item');
  assert.equal(M.reviewDue(s, DAY), true); // never reviewed, candidates exist
  M.markReviewed(s, DAY);
  assert.equal(M.reviewDue(s, '2026-07-24'), false); // 6 days later
  assert.equal(M.reviewDue(s, '2026-07-25'), true); // 7 days later
});

test('reviewCandidates = heavily migrated today + inbox + someday', () => {
  const s = freshState();
  const migrated = add(s, 'migrated');
  M.promoteToToday(s, migrated.id);
  migrated.migrationCount = 5;
  const fresh = add(s, 'fresh today');
  M.promoteToToday(s, fresh.id);
  const inbox = add(s, 'inbox item');
  const someday = add(s, 'someday item');
  M.sendToSomeday(s, someday.id);
  assert.deepEqual(M.reviewCandidates(s).map((t) => t.text), [
    'migrated',
    'inbox item',
    'someday item',
  ]);
});

test('sendToSomeday and dropTask also remove the task from tomorrowQueue', () => {
  const s = freshState();
  const [a, b] = ['a', 'b'].map((x) => add(s, x));
  M.setTomorrowQueue(s, [a.id, b.id]);
  M.sendToSomeday(s, a.id);
  M.dropTask(s, b.id);
  assert.deepEqual(s.tomorrowQueue, []);
});

test('setTomorrowQueue caps at 6', () => {
  const s = freshState();
  const ids = Array.from({ length: 8 }, (_, i) => add(s, `t${i}`).id);
  M.setTomorrowQueue(s, ids);
  assert.equal(s.tomorrowQueue.length, 6);
});

test('demoteToInbox renumbers the remaining today list contiguously', () => {
  const s = freshState();
  const [a, b, c] = ['a', 'b', 'c'].map((x) => add(s, x));
  [a, b, c].forEach((t) => M.promoteToToday(s, t.id));
  M.demoteToInbox(s, b.id);
  assert.deepEqual(M.todayList(s).map((t) => [t.text, t.order]), [['a', 0], ['c', 1]]);
});
