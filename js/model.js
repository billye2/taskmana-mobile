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
 * @property {number} modifiedAt Last mutation time; drives task-level sync merge.
 *
 * @typedef {Object} Settings
 * @property {boolean} focusMode
 * @property {ThemeName} [theme]
 * @property {boolean} [showHints]
 *
 * @typedef {Object} State
 * @property {number} [version] Schema version; migrateState upgrades older shapes.
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
const HISTORY_DAYS = 14;

/** @param {Date} [d] @returns {string} */
function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const STATE_VERSION = 2;

/** @param {string} date @returns {State} */
function initialState(date) {
  return {
    version: STATE_VERSION,
    tasks: [],
    lastRolloverDate: date,
    tomorrowQueue: [],
    lastReviewDate: null,
    settings: { focusMode: false },
  };
}

// Stepwise migrations: MIGRATIONS[n] upgrades a version-n state to n+1.
// When the State shape changes, bump STATE_VERSION and add one entry here —
// both stored state and imported backups pass through migrateState.
/** @type {Record<number, (s: any) => any>} */
const MIGRATIONS = {
  // 0 -> 1: pre-versioning states; backfill fields added after launch.
  0: (s) => {
    s.settings.theme ??= 'system';
    s.settings.showHints ??= true;
    for (const t of s.tasks) {
      t.ackMigrations ??= t.migrationCount ?? 0;
      t.migrationCount ??= 0;
      t.completedAt ??= null;
      t.completedOn ??= null;
    }
    s.lastReviewDate ??= null;
    return s;
  },
  // 1 -> 2: per-task modifiedAt for task-level sync merge.
  1: (s) => {
    for (const t of s.tasks) {
      t.modifiedAt ??= Math.max(t.createdAt ?? 0, t.completedAt ?? 0, t.droppedAt ?? 0);
    }
    return s;
  },
};

// Upgrade a stored or imported state to the current schema. Returns null for
// null input; unknown future versions are returned untouched.
/** @param {State | null} state @returns {State | null} */
function migrateState(state) {
  if (!state) return null;
  /** @type {any} */
  let s = state;
  let v = typeof s.version === 'number' ? s.version : 0;
  while (v < STATE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) break;
    s = step(s);
    v += 1;
  }
  s.version = Math.max(v, STATE_VERSION);
  return s;
}

/** @returns {string} */
function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

/** @param {State} state @param {string} id @returns {Task | undefined} */
function getTask(state, id) {
  return state.tasks.find((t) => t.id === id);
}

// Every task mutation stamps modifiedAt so mergeStates can pick the newer
// copy of a task when two devices diverge.
/** @param {Task} t */
function touch(t) {
  t.modifiedAt = Date.now();
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

// Recycle bin contents: dropped tasks, newest drop first. Rollover prunes
// them after DROPPED_RETENTION_DAYS, so this is also the restore window.
/** @param {State} state @returns {Task[]} */
function droppedTasks(state) {
  return state.tasks
    .filter((t) => t.status === 'dropped')
    .sort((a, b) => (b.droppedAt ?? 0) - (a.droppedAt ?? 0));
}

// Whole days until rollover prunes a dropped task; 0 means it can vanish at
// the next day rollover.
/** @param {Task} task @param {number} [now] @returns {number} */
function droppedDaysLeft(task, now = Date.now()) {
  const elapsed = Math.floor((now - (task.droppedAt ?? now)) / 86400000);
  return Math.max(0, DROPPED_RETENTION_DAYS - elapsed);
}

/** @param {State} state @param {string} date @returns {Task[]} */
function doneToday(state, date) {
  return state.tasks
    .filter((t) => t.status === 'done' && t.completedOn === date)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}

// Done tasks from before `date`, grouped by day, newest day first. Filtered by
// completedOn (not order) so a tab left open past midnight still shows
// yesterday's dones; `limit` only caps the display — nothing is deleted.
/**
 * @param {State} state @param {string} date @param {number} [limit]
 * @returns {{ date: string, tasks: Task[] }[]}
 */
function doneHistory(state, date, limit = HISTORY_DAYS) {
  /** @type {Map<string, Task[]>} */
  const byDay = new Map();
  for (const t of state.tasks) {
    if (t.status !== 'done' || !t.completedOn || t.completedOn >= date) continue;
    const group = byDay.get(t.completedOn);
    if (group) group.push(t);
    else byDay.set(t.completedOn, [t]);
  }
  return [...byDay.keys()]
    .sort()
    .reverse()
    .slice(0, limit)
    .map((day) => ({
      date: day,
      tasks: /** @type {Task[]} */ (byDay.get(day)).sort(
        (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)
      ),
    }));
}

// Ordered candidates for the next day's Today list: valid queued ids first
// (Ivy Lee order), then carried-over unfinished today tasks, deduped. Shared
// by rollover() and tomorrowPreview() so the preview can never drift.
/** @param {State} state @param {string[]} queueIds @returns {Task[]} */
function tomorrowMerge(state, queueIds) {
  const carried = todayList(state).filter((t) => t.status === 'today');
  const queued = queueIds
    .map((id) => getTask(state, id))
    .filter(
      /** @returns {t is Task} */
      (t) => !!t && (t.status === 'inbox' || t.status === 'today' || t.status === 'someday')
    );
  /** @type {Task[]} */
  const merged = [];
  for (const t of [...queued, ...carried]) {
    if (!merged.includes(t)) merged.push(t);
  }
  return merged;
}

// What Today will look like after the next rollover if `queueIds` is saved as
// the plan. Pure — mutates nothing; rollover() additionally bumps
// migrationCount on carried tasks.
/**
 * @param {State} state @param {string[]} queueIds
 * @returns {{ today: Task[], overflow: Task[] }}
 */
function tomorrowPreview(state, queueIds) {
  const merged = tomorrowMerge(state, queueIds);
  return { today: merged.slice(0, TODAY_CAP), overflow: merged.slice(TODAY_CAP) };
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
  const now = Date.now();
  /** @type {Task} */
  const task = {
    id: makeId(),
    text: trimmed,
    createdAt: now,
    status: 'inbox',
    order: null,
    migrationCount: 0,
    ackMigrations: 0,
    completedAt: null,
    completedOn: null,
    modifiedAt: now,
  };
  state.tasks.push(task);
  return task;
}

/** @param {State} state @param {string} id @param {string} text */
function editTask(state, id, text) {
  const t = getTask(state, id);
  const trimmed = text.trim();
  if (t && trimmed) {
    t.text = trimmed;
    touch(t);
  }
}

/** @param {State} state @param {string} id @returns {boolean} */
function promoteToToday(state, id) {
  const t = getTask(state, id);
  if (!t || !todayHasRoom(state)) return false;
  t.status = 'today';
  t.order = nextOrder(state);
  touch(t);
  return true;
}

/** @param {State} state @param {string} id */
function demoteToInbox(state, id) {
  const t = getTask(state, id);
  if (!t) return;
  t.status = 'inbox';
  t.order = null;
  touch(t);
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
  touch(t);
}

/** @param {State} state @param {string} id @param {number} delta */
function moveInToday(state, id, delta) {
  const list = todayList(state);
  const idx = list.findIndex((t) => t.id === id);
  const swapWith = list[idx + delta];
  if (idx === -1 || !swapWith) return;
  const t = list[idx];
  [t.order, swapWith.order] = [swapWith.order, t.order];
  touch(t);
  touch(swapWith);
}

/** @param {State} state @param {string} id */
function sendToSomeday(state, id) {
  const t = getTask(state, id);
  if (!t) return;
  t.status = 'someday';
  t.order = null;
  touch(t);
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
  touch(t);
  removeFromQueue(state, id);
  renumber(state);
}

/** @param {State} state @param {string} id */
function restoreDropped(state, id) {
  const t = getTask(state, id);
  if (!t || t.status !== 'dropped') return;
  t.status = 'inbox';
  t.order = null;
  delete t.droppedAt;
  touch(t);
}

/** @param {State} state @param {string} id */
function keepMigrated(state, id) {
  const t = getTask(state, id);
  if (t) {
    t.ackMigrations = t.migrationCount;
    touch(t);
  }
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
    if (t.order !== i) {
      t.order = i;
      touch(t);
    }
  });
}

// Shape check for imported backups — enough to guarantee the app can render
// and mutate the state without crashing.
/** @param {unknown} value @returns {value is State} */
function isValidState(value) {
  if (typeof value !== 'object' || value === null) return false;
  const s = /** @type {Record<string, unknown>} */ (value);
  /** @type {string[]} */
  const statuses = ['inbox', 'today', 'someday', 'done', 'dropped'];
  return (
    Array.isArray(s.tasks) &&
    s.tasks.every((raw) => {
      const t = /** @type {Record<string, unknown>} */ (raw);
      return (
        !!t &&
        typeof t === 'object' &&
        typeof t.id === 'string' &&
        typeof t.text === 'string' &&
        typeof t.status === 'string' &&
        statuses.includes(t.status)
      );
    }) &&
    typeof s.lastRolloverDate === 'string' &&
    Array.isArray(s.tomorrowQueue) &&
    typeof s.settings === 'object' &&
    s.settings !== null
  );
}

// ---- sync merge -------------------------------------------------------------

/** @param {Task} x @param {Task} y @returns {Task} */
function newerTask(x, y) {
  if ((x.modifiedAt ?? 0) !== (y.modifiedAt ?? 0)) {
    return (x.modifiedAt ?? 0) > (y.modifiedAt ?? 0) ? x : y;
  }
  // Exact-tie fallback (near-always identical copies): any deterministic,
  // argument-order-independent pick keeps the merge commutative.
  return JSON.stringify(x) >= JSON.stringify(y) ? x : y;
}

/** @param {State} s @returns {number} */
function activityStamp(s) {
  return s.tasks.reduce((m, t) => Math.max(m, t.modifiedAt ?? 0), 0);
}

// Deterministic task-level merge of two same-version states (migrate both
// first). Pure — returns a new state, mutates neither input, stamps nothing:
// per-device stamping here would make the two devices' merges diverge.
/** @param {State} a @param {State} b @param {number} [now] @returns {State} */
function mergeStates(a, b, now = Date.now()) {
  /** @type {Map<string, Task>} */
  const byId = new Map();
  for (const t of a.tasks) byId.set(t.id, t);
  for (const t of b.tasks) {
    const mine = byId.get(t.id);
    byId.set(t.id, mine ? newerTask(mine, t) : t);
  }

  // In-merge prune: a dropped task past retention was (or will be) pruned by
  // rollover on some device — dropping it here stops resurrection ping-pong
  // without needing tombstones (drop-then-prune is the only true deletion).
  const cutoff = now - DROPPED_RETENTION_DAYS * 86400000;
  const tasks = [...byId.values()]
    .filter((t) => !(t.status === 'dropped' && (t.droppedAt ?? 0) < cutoff))
    .map((t) => ({ ...t })) // copies: normalization below must not touch inputs
    .sort((x, y) => (x.id < y.id ? -1 : 1)); // canonical order → commutative merge
  const surviving = new Set(tasks.map((t) => t.id));

  // Scalars come from the side with the newer overall activity; tie broken
  // deterministically so merge(a, b) and merge(b, a) agree.
  const sa = activityStamp(a);
  const sb = activityStamp(b);
  const newer =
    sa !== sb ? (sa > sb ? a : b) : JSON.stringify(a) >= JSON.stringify(b) ? a : b;

  /** @type {State} */
  const merged = {
    version: STATE_VERSION,
    tasks,
    lastRolloverDate:
      a.lastRolloverDate > b.lastRolloverDate ? a.lastRolloverDate : b.lastRolloverDate,
    lastReviewDate:
      a.lastReviewDate && b.lastReviewDate
        ? a.lastReviewDate > b.lastReviewDate
          ? a.lastReviewDate
          : b.lastReviewDate
        : a.lastReviewDate ?? b.lastReviewDate,
    tomorrowQueue: newer.tomorrowQueue.filter((id) => surviving.has(id)),
    settings: { ...newer.settings },
  };

  // The union can hold duplicate `order` values or more than TODAY_CAP slot
  // holders. Re-slot deterministically: total sort, renumber, overflow out.
  const slotted = merged.tasks
    .filter((t) => (t.status === 'today' || t.status === 'done') && t.order !== null)
    .sort(
      (x, y) =>
        (x.order ?? 0) - (y.order ?? 0) ||
        (x.modifiedAt ?? 0) - (y.modifiedAt ?? 0) ||
        (x.id < y.id ? -1 : 1)
    );
  slotted.forEach((t, i) => {
    t.order = i;
  });
  for (const t of slotted.slice(TODAY_CAP)) {
    if (t.status === 'today') t.status = 'inbox';
    t.order = null;
  }

  return merged;
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
    if (t.status === 'done' && t.order !== null) {
      t.order = null; // off the today list, into the log
      touch(t);
    }
    if (t.status === 'today' && t.order !== null) {
      t.migrationCount += 1;
      touch(t);
    }
  }

  // New today list: planned queue first (Ivy Lee order), then carried-over
  // unfinished tasks. Overflow past the cap goes back to the inbox.
  const newToday = tomorrowMerge(state, state.tomorrowQueue);
  for (const t of state.tasks) {
    if (t.status === 'today') {
      t.status = 'inbox';
      t.order = null;
      touch(t);
    }
  }
  newToday.slice(0, TODAY_CAP).forEach((t, i) => {
    t.status = 'today';
    t.order = i;
    touch(t);
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
  TODAY_CAP, TOP_COUNT, MIGRATION_WARN, REVIEW_INTERVAL_DAYS, STATE_VERSION,
  DROPPED_RETENTION_DAYS,
  todayStr, initialState, migrateState, getTask,
  todayList, inboxTasks, somedayTasks, droppedTasks, droppedDaysLeft,
  doneToday, doneHistory, todayHasRoom, tomorrowPreview,
  currentFocusTask, needsMigrationDecision, reviewCandidates, reviewDue, daysBetween,
  addTask, editTask, promoteToToday, demoteToInbox, toggleDone,
  moveInToday, sendToSomeday, dropTask, restoreDropped, keepMigrated,
  setTomorrowQueue, markReviewed, rollover, isValidState, mergeStates,
};
})();
