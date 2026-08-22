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

test('doneHistory is empty on a fresh state and excludes today’s dones', () => {
  const s = freshState();
  assert.deepEqual(M.doneHistory(s, DAY), []);
  const t = add(s, 'x');
  M.promoteToToday(s, t.id);
  M.toggleDone(s, t.id, DAY);
  assert.deepEqual(M.doneHistory(s, DAY), []); // today's dones live in doneToday
});

test('doneHistory groups by day, newest day first, newest completion first within a day', () => {
  const s = freshState();
  const [a, b, c] = ['a', 'b', 'c'].map((x) => add(s, x));
  M.toggleDone(s, a.id, '2026-07-16');
  M.toggleDone(s, b.id, '2026-07-17');
  M.toggleDone(s, c.id, '2026-07-17');
  b.completedAt = 1000;
  c.completedAt = 2000;
  assert.deepEqual(
    M.doneHistory(s, DAY).map((g) => [g.date, g.tasks.map((t) => t.text)]),
    [['2026-07-17', ['c', 'b']], ['2026-07-16', ['a']]]
  );
});

test('doneHistory omits un-toggled tasks and includes pre-rollover dones', () => {
  const s = freshState();
  const undone = add(s, 'undone');
  M.toggleDone(s, undone.id, '2026-07-16');
  M.toggleDone(s, undone.id, '2026-07-16'); // unchecked again
  const kept = add(s, 'kept');
  M.promoteToToday(s, kept.id);
  M.toggleDone(s, kept.id, DAY); // tab open past midnight: no rollover, order still set
  assert.deepEqual(
    M.doneHistory(s, NEXT_DAY).map((g) => g.tasks.map((t) => t.text)),
    [['kept']]
  );
});

test('doneHistory caps the days shown at the limit', () => {
  const s = freshState();
  for (const day of ['2026-07-14', '2026-07-15', '2026-07-16']) {
    M.toggleDone(s, add(s, `done ${day}`).id, day);
  }
  assert.deepEqual(
    M.doneHistory(s, DAY, 2).map((g) => g.date),
    ['2026-07-16', '2026-07-15']
  );
});

test('rollover moves yesterday’s dones from doneToday into doneHistory', () => {
  const s = freshState();
  const t = add(s, 'finished');
  M.promoteToToday(s, t.id);
  M.toggleDone(s, t.id, DAY);
  M.rollover(s, NEXT_DAY);
  assert.deepEqual(M.doneToday(s, NEXT_DAY), []);
  assert.deepEqual(
    M.doneHistory(s, NEXT_DAY).map((g) => [g.date, g.tasks.map((x) => x.text)]),
    [[DAY, ['finished']]]
  );
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

test('rollover refuses to run backwards past a synced-in later date', () => {
  // Sync merges keep the max lastRolloverDate, so a phone in an earlier
  // timezone can hold a state already rolled to "tomorrow".
  const s = freshState();
  const t = add(s, 'lingering');
  M.promoteToToday(s, t.id);
  M.rollover(s, NEXT_DAY);
  s.tomorrowQueue = [t.id];
  assert.equal(M.rollover(s, DAY), false); // local date behind stored date
  assert.equal(M.rollover(s, NEXT_DAY), false); // equal still idempotent
  assert.equal(t.migrationCount, 1);
  assert.deepEqual(s.tomorrowQueue, [t.id]);
  assert.equal(s.lastRolloverDate, NEXT_DAY);
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

test('tomorrowPreview orders picks first, dedupes, splits at the cap, skips invalid ids', () => {
  const s = freshState();
  const carried = add(s, 'carried');
  M.promoteToToday(s, carried.id);
  const picks = [];
  for (let i = 0; i < 6; i++) picks.push(add(s, `pick ${i}`));
  const done = add(s, 'already done');
  M.toggleDone(s, done.id, DAY);

  const ids = [...picks.map((t) => t.id), done.id, carried.id, 'no-such-id'];
  const { today, overflow } = M.tomorrowPreview(s, ids);
  assert.deepEqual(today.map((t) => t.text), ['pick 0', 'pick 1', 'pick 2', 'pick 3', 'pick 4', 'pick 5']);
  assert.deepEqual(overflow.map((t) => t.text), ['carried']); // deduped: queued once, not twice
});

test('tomorrowPreview matches what rollover actually produces', () => {
  const s = freshState();
  for (let i = 0; i < 4; i++) M.promoteToToday(s, add(s, `carried ${i}`).id);
  const inboxPick = add(s, 'inbox pick');
  const somedayPick = add(s, 'someday pick');
  M.sendToSomeday(s, somedayPick.id);
  // queue an inbox task, a someday task, and a task that is also carried
  const dup = M.todayList(s)[0];
  M.setTomorrowQueue(s, [inboxPick.id, somedayPick.id, dup.id]);

  const preview = M.tomorrowPreview(s, s.tomorrowQueue);
  const clone = structuredClone(s);
  M.rollover(clone, NEXT_DAY);
  assert.deepEqual(preview.today.map((t) => t.id), M.todayList(clone).map((t) => t.id));
  for (const t of preview.overflow) {
    assert.equal(M.getTask(clone, t.id)?.status, 'inbox');
  }
});

test('tomorrowPreview is pure — no migration bumps or status changes', () => {
  const s = freshState();
  M.promoteToToday(s, add(s, 'carried').id);
  const pick = add(s, 'picked');
  const before = JSON.stringify(s);
  M.tomorrowPreview(s, [pick.id]);
  assert.equal(JSON.stringify(s), before);
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

test('droppedTasks lists the recycle bin newest drop first', () => {
  const s = freshState();
  const [a, b] = ['first drop', 'second drop'].map((x) => add(s, x));
  M.dropTask(s, a.id);
  M.dropTask(s, b.id);
  a.droppedAt = Date.now() - 1000; // force a stable order despite same-ms drops
  assert.deepEqual(M.droppedTasks(s).map((t) => t.text), ['second drop', 'first drop']);
});

test('restoreDropped returns a dropped task to the inbox', () => {
  const s = freshState();
  const t = add(s, 'oops');
  M.dropTask(s, t.id);
  M.restoreDropped(s, t.id);
  assert.equal(t.status, 'inbox');
  assert.equal(t.droppedAt, undefined);
  assert.deepEqual(M.inboxTasks(s).map((x) => x.id), [t.id]);
  assert.deepEqual(M.droppedTasks(s), []);
});

test('restoreDropped ignores tasks that are not in the recycle bin', () => {
  const s = freshState();
  const t = add(s, 'active');
  M.promoteToToday(s, t.id);
  M.restoreDropped(s, t.id);
  assert.equal(t.status, 'today');
});

test('droppedDaysLeft counts down from 30 and bottoms out at 0', () => {
  const s = freshState();
  const t = add(s, 'x');
  M.dropTask(s, t.id);
  const now = Date.now();
  assert.equal(M.droppedDaysLeft(t, now), 30);
  assert.equal(M.droppedDaysLeft(t, now + 29 * 86400000), 1);
  assert.equal(M.droppedDaysLeft(t, now + 30 * 86400000), 0);
  assert.equal(M.droppedDaysLeft(t, now + 45 * 86400000), 0);
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

test('isValidState accepts real states and rejects malformed backups', () => {
  const s = freshState();
  assert.equal(M.isValidState(s), true);
  add(s, 'a task');
  assert.equal(M.isValidState(JSON.parse(JSON.stringify(s))), true);

  assert.equal(M.isValidState(null), false);
  assert.equal(M.isValidState('[]'), false);
  assert.equal(M.isValidState({}), false);
  assert.equal(M.isValidState({ ...s, tasks: 'nope' }), false);
  assert.equal(M.isValidState({ ...s, tasks: [{ id: 1, text: 'x', status: 'inbox' }] }), false);
  assert.equal(M.isValidState({ ...s, tasks: [{ id: 'x', text: 'x', status: 'bogus' }] }), false);
  assert.equal(M.isValidState({ ...s, lastRolloverDate: null }), false);
  assert.equal(M.isValidState({ ...s, tomorrowQueue: null }), false);
  assert.equal(M.isValidState({ ...s, settings: null }), false);
});

test('migrateState upgrades a pre-versioning state and backfills new fields', () => {
  // Shape of a state saved before schema versioning existed
  const legacy = {
    tasks: [{ id: 'a', text: 'old task', createdAt: 1, status: 'today', order: 0, migrationCount: 3 }],
    lastRolloverDate: '2026-07-01',
    tomorrowQueue: [],
    lastReviewDate: null,
    settings: { focusMode: true },
  };
  const migrated = M.migrateState(legacy);
  assert.equal(migrated.version, M.STATE_VERSION);
  assert.equal(migrated.settings.theme, 'system');
  assert.equal(migrated.settings.showHints, true);
  const t = migrated.tasks[0];
  assert.equal(t.ackMigrations, 3); // backfilled to migrationCount: no surprise prompts
  assert.equal(t.completedAt, null);
  assert.equal(t.completedOn, null);
  assert.equal(migrated.settings.focusMode, true); // existing data untouched
  assert.equal(M.isValidState(migrated), true);
});

test('migrateState is idempotent and passes through null and future versions', () => {
  const s = freshState();
  assert.equal(s.version, M.STATE_VERSION);
  const once = M.migrateState(JSON.parse(JSON.stringify(s)));
  const twice = M.migrateState(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(once, twice);
  assert.equal(M.migrateState(null), null);
  const future = { ...freshState(), version: M.STATE_VERSION + 5 };
  assert.equal(M.migrateState(future).version, M.STATE_VERSION + 5); // never downgraded
});

test('demoteToInbox renumbers the remaining today list contiguously', () => {
  const s = freshState();
  const [a, b, c] = ['a', 'b', 'c'].map((x) => add(s, x));
  [a, b, c].forEach((t) => M.promoteToToday(s, t.id));
  M.demoteToInbox(s, b.id);
  assert.deepEqual(M.todayList(s).map((t) => [t.text, t.order]), [['a', 0], ['c', 1]]);
});

test('setWhy trims, clears on empty, and stamps modifiedAt only when it changes', () => {
  const s = freshState();
  const t = add(s, 'dissertation');
  assert.equal(t.why, null);
  const before = t.modifiedAt;
  M.setWhy(s, t.id, '   '); // no why -> no why: not a change
  assert.equal(t.why, null);
  assert.equal(t.modifiedAt, before);
  t.modifiedAt = 1;
  M.setWhy(s, t.id, '  past me chose it  ');
  assert.equal(t.why, 'past me chose it');
  assert.ok(t.modifiedAt > 1);
  t.modifiedAt = 1;
  M.setWhy(s, t.id, 'past me chose it');
  assert.equal(t.modifiedAt, 1); // same value, not touched
  M.setWhy(s, t.id, '');
  assert.equal(t.why, null);
  assert.ok(t.modifiedAt > 1);
  M.setWhy(s, 'missing', 'x'); // unknown id is a no-op
});

test('migration 2->3 backfills why and isValidState rejects a non-string why', () => {
  const v2 = { ...freshState(), version: 2 };
  const t = { ...add(v2, 'old'), why: undefined };
  v2.tasks = [t];
  const s = M.migrateState(v2);
  assert.equal(s.version, M.STATE_VERSION);
  assert.equal(s.tasks[0].why, null);
  assert.equal(M.isValidState(s), true);
  assert.equal(M.isValidState({ ...s, tasks: [{ ...s.tasks[0], why: 'a reason' }] }), true);
  assert.equal(M.isValidState({ ...s, tasks: [{ ...s.tasks[0], why: { nope: 1 } }] }), false);
  assert.equal(M.isValidState({ ...s, tasks: [{ ...s.tasks[0], why: 3 }] }), false);
});
