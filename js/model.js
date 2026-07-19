// Pure task/state logic — no DOM, no storage.

/**
 * @typedef {'inbox' | 'today' | 'someday' | 'done' | 'dropped'} TaskStatus
 * @typedef {'system' | 'light' | 'dark'} ThemeName
 *
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} text
 * @property {number} createdAt
 * @property {TaskStatus} status
 * @property {number | null} order Position within the today queue; null when not on it.
 * @property {number} migrationCount Bullet-journal ›› carry-over count.
 * @property {number} ackMigrations Migration count the user last confirmed "Keep" at.
 * @property {number | null} completedAt
 * @property {string | null} completedOn YYYY-MM-DD the task was completed.
 * @property {number} [droppedAt]
 *
 * @typedef {Object} Settings
 * @property {boolean} focusMode
 * @property {ThemeName} [theme]
 * @property {boolean} [showHints]
 *
 * @typedef {Object} State
 * @property {Task[]} tasks
 * @property {string} lastRolloverDate YYYY-MM-DD of the last day rollover.
 * @property {string[]} tomorrowQueue Task ids picked for tomorrow, in Ivy Lee order.
 * @property {string | null} lastReviewDate
 * @property {Settings} settings
 */

const TaskmanaModel = (() => {

const TODAY_CAP = 6;
const TOP_COUNT = 3;
const MIGRATION_WARN = 5;
const REVIEW_INTERVAL_DAYS = 7;
const DROPPED_RETENTION_DAYS = 30;

/** @param {Date} [d] @returns {string} */
function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** @param {string} date @returns {State} */
function initialState(date) {
  return {
    tasks: [],
    lastRolloverDate: date,
    tomorrowQueue: [],
    lastReviewDate: null,
    settings: { focusMode: false },
  };
}

/** @returns {string} */
function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

/** @param {State} state @param {string} id @returns {Task | undefined} */
function getTask(state, id) {
  return state.tasks.find((t) => t.id === id);
}

// ---- queries ----------------------------------------------------------------

// Today list = active today tasks plus tasks completed today that still hold a
// slot (they show crossed out until the next rollover archives them).
/** @param {State} state @returns {Task[]} */
function todayList(state) {
  return state.tasks
    .filter((t) => (t.status === 'today' || t.status === 'done') && t.order !== null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** @param {State} state @returns {Task[]} */
function inboxTasks(state) {
  return state.tasks
    .filter((t) => t.status === 'inbox')
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** @param {State} state @returns {Task[]} */
function somedayTasks(state) {
  return state.tasks
    .filter((t) => t.status === 'someday')
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** @param {State} state @param {string} date @returns {Task[]} */
function doneToday(state, date) {
  return state.tasks
    .filter((t) => t.status === 'done' && t.completedOn === date)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}

/** @param {State} state @returns {boolean} */
function todayHasRoom(state) {
  return todayList(state).length < TODAY_CAP;
}

// First not-yet-done task in the ordered today list (the Ivy Lee "work this one").
/** @param {State} state @returns {Task | null} */
function currentFocusTask(state) {
  return todayList(state).find((t) => t.status === 'today') ?? null;
}

/** @param {Task} task @returns {boolean} */
function needsMigrationDecision(task) {
  return (
    task.status === 'today' &&
    task.migrationCount >= MIGRATION_WARN &&
    task.ackMigrations !== task.migrationCount
  );
}

/** @param {State} state @returns {Task[]} */
function reviewCandidates(state) {
  const migrated = todayList(state).filter(
    (t) => t.status === 'today' && t.migrationCount >= MIGRATION_WARN
  );
  return [...migrated, ...inboxTasks(state), ...somedayTasks(state)];
}

/** @param {State} state @param {string} date @returns {boolean} */
function reviewDue(state, date) {
  if (state.tasks.length === 0) return false;
  if (!state.lastReviewDate) {
    return reviewCandidates(state).length > 0;
  }
  return daysBetween(state.lastReviewDate, date) >= REVIEW_INTERVAL_DAYS;
}

/** @param {string} fromStr @param {string} toStr @returns {number} */
function daysBetween(fromStr, toStr) {
  return Math.round((new Date(toStr).getTime() - new Date(fromStr).getTime()) / 86400000);
}

// ---- mutations --------------------------------------------------------------

/** @param {State} state @param {string} text @returns {Task | null} */
function addTask(state, text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  /** @type {Task} */
  const task = {
    id: makeId(),
    text: trimmed,
    createdAt: Date.now(),
    status: 'inbox',
    order: null,
    migrationCount: 0,
    ackMigrations: 0,
    completedAt: null,
    completedOn: null,
  };
  state.tasks.push(task);
  return task;
}

/** @param {State} state @param {string} id @param {string} text */
function editTask(state, id, text) {
  const t = getTask(state, id);
  const trimmed = text.trim();
  if (t && trimmed) t.text = trimmed;
}

/** @param {State} state @param {string} id @returns {boolean} */
function promoteToToday(state, id) {
  const t = getTask(state, id);
  if (!t || !todayHasRoom(state)) return false;
  t.status = 'today';
  t.order = nextOrder(state);
  return true;
}

/** @param {State} state @param {string} id */
function demoteToInbox(state, id) {
  const t = getTask(state, id);
  if (!t) return;
  t.status = 'inbox';
  t.order = null;
  renumber(state);
}

/** @param {State} state @param {string} id @param {string} date */
function toggleDone(state, id, date) {
  const t = getTask(state, id);
  if (!t) return;
  if (t.status === 'done') {
    t.status = t.order !== null ? 'today' : 'inbox';
    t.completedAt = null;
    t.completedOn = null;
  } else {
    t.status = 'done';
    t.completedAt = Date.now();
    t.completedOn = date;
  }
}

/** @param {State} state @param {string} id @param {number} delta */
function moveInToday(state, id, delta) {
  const list = todayList(state);
  const idx = list.findIndex((t) => t.id === id);
  const swapWith = list[idx + delta];
  if (idx === -1 || !swapWith) return;
  const t = list[idx];
  [t.order, swapWith.order] = [swapWith.order, t.order];
}

/** @param {State} state @param {string} id */
function sendToSomeday(state, id) {
  const t = getTask(state, id);
  if (!t) return;
  t.status = 'someday';
  t.order = null;
  removeFromQueue(state, id);
  renumber(state);
}

/** @param {State} state @param {string} id */
function dropTask(state, id) {
  const t = getTask(state, id);
  if (!t) return;
  t.status = 'dropped';
  t.order = null;
  t.droppedAt = Date.now();
  removeFromQueue(state, id);
  renumber(state);
}

/** @param {State} state @param {string} id */
function keepMigrated(state, id) {
  const t = getTask(state, id);
  if (t) t.ackMigrations = t.migrationCount;
}

/** @param {State} state @param {string[]} ids */
function setTomorrowQueue(state, ids) {
  state.tomorrowQueue = ids.slice(0, TODAY_CAP);
}

/** @param {State} state @param {string} date */
function markReviewed(state, date) {
  state.lastReviewDate = date;
}

/** @param {State} state @param {string} id */
function removeFromQueue(state, id) {
  state.tomorrowQueue = state.tomorrowQueue.filter((qid) => qid !== id);
}

/** @param {State} state @returns {number} */
function nextOrder(state) {
  const list = todayList(state);
  return list.length ? (list[list.length - 1].order ?? -1) + 1 : 0;
}

/** @param {State} state */
function renumber(state) {
  todayList(state).forEach((t, i) => {
    t.order = i;
  });
}

// ---- day rollover -----------------------------------------------------------

// Runs on every page load; only acts when the stored date is behind today.
// Archives yesterday's dones, migrates unfinished tasks (›+1), promotes the
// planned tomorrow queue, and prunes old dropped tasks. Returns true if the
// state changed.
/** @param {State} state @param {string} date @returns {boolean} */
function rollover(state, date) {
  if (state.lastRolloverDate === date) return false;

  for (const t of state.tasks) {
    if (t.status === 'done') t.order = null; // off the today list, into the log
    if (t.status === 'today' && t.order !== null) t.migrationCount += 1;
  }

  // New today list: planned queue first (Ivy Lee order), then carried-over
  // unfinished tasks. Overflow past the cap goes back to the inbox.
  const carried = todayList(state).filter((t) => t.status === 'today');
  const queued = state.tomorrowQueue
    .map((id) => getTask(state, id))
    .filter(
      /** @returns {t is Task} */
      (t) => !!t && (t.status === 'inbox' || t.status === 'today' || t.status === 'someday')
    );

  /** @type {Task[]} */
  const newToday = [];
  for (const t of [...queued, ...carried]) {
    if (!newToday.includes(t)) newToday.push(t);
  }
  for (const t of state.tasks) {
    if (t.status === 'today') {
      t.status = 'inbox';
      t.order = null;
    }
  }
  newToday.slice(0, TODAY_CAP).forEach((t, i) => {
    t.status = 'today';
    t.order = i;
  });

  const cutoff = Date.now() - DROPPED_RETENTION_DAYS * 86400000;
  state.tasks = state.tasks.filter(
    (t) => !(t.status === 'dropped' && (t.droppedAt ?? 0) < cutoff)
  );

  state.tomorrowQueue = [];
  state.lastRolloverDate = date;
  return true;
}

return {
  TODAY_CAP, TOP_COUNT, MIGRATION_WARN, REVIEW_INTERVAL_DAYS,
  todayStr, initialState, getTask,
  todayList, inboxTasks, somedayTasks, doneToday, todayHasRoom,
  currentFocusTask, needsMigrationDecision, reviewCandidates, reviewDue,
  addTask, editTask, promoteToToday, demoteToInbox, toggleDone,
  moveInToday, sendToSomeday, dropTask, keepMigrated,
  setTomorrowQueue, markReviewed, rollover,
};
})();
