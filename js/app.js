const store = TaskmanaStore;
const M = TaskmanaModel;

/** @type {State} */
let state;

/** @param {string} id @returns {HTMLElement} */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {string} id @returns {HTMLInputElement} */
const $input = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));

/** @param {string} id @returns {HTMLDialogElement} */
const $dialog = (id) => /** @type {HTMLDialogElement} */ (document.getElementById(id));

async function persistAndRender() {
  await store.save(state);
  render();
}

// ---- theme ------------------------------------------------------------------

/** @type {ThemeName[]} */
const THEMES = ['system', 'light', 'dark'];
/** @type {Record<ThemeName, string>} */
const THEME_LABELS = { system: 'Auto', light: 'Light', dark: 'Dark' };

/** @param {string} theme */
function applyTheme(theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  // Mirror synchronously readable so the next tab applies it before async
  // storage loads (no flash of the wrong scheme).
  localStorage.setItem('taskmana-theme', theme);
}

applyTheme(localStorage.getItem('taskmana-theme') ?? 'system');

// ---- method examples (cycle with the ↻ button next to each hint) ------------

/** @type {Record<string, string[]>} */
const EXAMPLES = {
  today: [
    'Tonight, hit Plan tomorrow and queue six: “1. Draft the kickoff doc” first. Tomorrow morning you start working, not deciding.',
    'Overwhelmed? Turn on Focus — everything but one task fades. Finish it, check it off, and the next one lights up.',
    'In 1918 Ivy Lee charged steel magnate Charles Schwab $25,000 for exactly this routine: six tasks, strict order, no skipping.',
    'See ›››› next to “Renew passport”? Four days carried. Either it matters — make it top 3 today — or let Someday hold it.',
    'Finished only the top 3? That’s a won day. Everything under “bonus” is extra credit, not debt.',
  ],
  inbox: [
    'Mid-focus and suddenly remember the plumber? Cmd+T, type “call plumber”, Enter, close the tab. Three seconds, and your head is quiet again.',
    'First time? Do a full brain dump tonight: keep typing until nothing else surfaces — 20+ items is normal, and the relief is immediate.',
    'Don’t sort while dumping. Capture messy now; the weekly Review is where you decide what each item becomes.',
    'Each morning, promote at most 3 items that would make today a win — and ignore the rest of this list guilt-free.',
  ],
  someday: [
    '“Learn watercolor” glared at you from Today for a week. Park it here — parked isn’t abandoned, it’s scheduled for reconsideration.',
    'Every weekly Review shows this list again, so a parked dream stays a choice you keep making on purpose.',
    'Said “someday” to the same item three reviews in a row? Be honest and Drop it. A short list you trust beats a long one you avoid.',
  ],
  review: [
    'Sunday, ten minutes: 14 items in, 3 promoted for the week, 6 kept, 4 parked in Someday, 1 dropped. The list is trustworthy again.',
    '“Fix the garage shelf” has five carry marks. Here you finally admit it’s a Someday — and Today instantly feels lighter.',
    'Hesitating more than ten seconds on an item? That hesitation is the answer: Someday.',
    'The red dot isn’t nagging — it marks 7 days since this list was last honest.',
  ],
  why: [
    'Past me picked this topic with a clear head. Future me will be glad I tried, even if it never gets finished.',
    'Every time I don’t feel like it and do it anyway, I feel better after. That’s the whole argument.',
    'I’ve rehearsed this in my head a hundred times. Actually doing it costs less than rehearsing it again.',
    'Five carry-overs and the why still reads true? Keep it. If it reads hollow, that’s your answer too.',
  ],
  plan: [
    '9pm: queue “1. Finish the deck, 2. Call the bank…”. Overnight your brain stops rehearsing them; morning-you just executes.',
    'Ivy Lee’s rule for Bethlehem Steel executives: never more than six, work them strictly in order, unfinished ones move to tomorrow.',
    'Put the scariest task first. If tomorrow only #1 gets done, it was still the right #1.',
    'What you queue tonight jumps ahead of carried-over tasks at tomorrow’s first open — tonight’s order is tomorrow’s priority.',
  ],
};

/** @type {Record<string, number>} */
const exampleIndex = {};

function setupExamples() {
  for (const p of document.querySelectorAll('.hint-example')) {
    const section = /** @type {HTMLElement} */ (p).dataset.section ?? '';
    const examples = EXAMPLES[section];
    const text = p.querySelector('.example-text');
    const btn = p.querySelector('.example-btn');
    if (!examples || !text || !btn) continue;
    exampleIndex[section] = 0;
    const show = () => {
      const i = exampleIndex[section];
      text.textContent = `${examples[i]}  (${i + 1}/${examples.length})`;
    };
    btn.addEventListener('click', () => {
      exampleIndex[section] = (exampleIndex[section] + 1) % examples.length;
      show();
    });
    show();
  }
}

setupExamples();

// ---- generic row helpers ----------------------------------------------------

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Cube for "to inbox": the box things land in. Stroke follows currentColor.
const CUBE_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>' +
  '<path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>';

/**
 * @param {string} label
 * @param {string} title
 * @param {() => void} onClick
 * @param {{danger?: boolean, disabled?: boolean}} [opts]
 * @returns {HTMLButtonElement}
 */
function actionBtn(label, title, onClick, { danger = false, disabled = false } = {}) {
  const b = el('button', 'icon-btn' + (danger ? ' danger' : ''));
  // Labels are plain text except the few inline SVG icons declared above.
  if (label.startsWith('<svg')) b.innerHTML = label;
  else b.textContent = label;
  b.title = title;
  // Visible text would win the accessible-name computation over title alone,
  // leaving e.g. every row's button announced as just "Today".
  b.setAttribute('aria-label', title);
  b.disabled = disabled;
  b.addEventListener('click', onClick);
  return b;
}

/** @param {Task} task @returns {HTMLElement | null} */
function migrationMarks(task) {
  if (!task.migrationCount) return null;
  const span = el('span', 'migrations', '›'.repeat(Math.min(task.migrationCount, 8)));
  span.title = `Carried over ${task.migrationCount} day${task.migrationCount === 1 ? '' : 's'} (Bullet Journal migration — Ryder Carroll)`;
  return span;
}

// No hover implies no double-click either (touch device) — edit on tap there.
const coarsePointer = matchMedia('(hover: none)').matches;

/**
 * Wire an inline editor. Enter and blur commit, Escape discards.
 *
 * Enter commits, then the re-render tears the input out — which can fire
 * blur and commit a second time. Escape has the same problem in reverse:
 * its render() would blur into a commit and save the very edit it meant to
 * discard. One latch settles both. A sync pull mid-edit re-renders too, and
 * that blur commits the typing against the merged state instead of losing it.
 * @param {HTMLInputElement} input
 * @param {(value: string) => void} apply
 */
function wireInlineInput(input, apply) {
  input.enterKeyHint = 'done';
  let settled = false;
  const commit = async () => {
    if (settled) return;
    settled = true;
    apply(input.value);
    await persistAndRender();
  };
  const cancel = () => {
    if (settled) return;
    settled = true;
    render();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });
  input.addEventListener('blur', commit);
  input.focus();
  input.select();
}

/** @param {Task} task @returns {HTMLElement} */
function editableText(task) {
  const span = el('span', 'text', task.text);
  const startEdit = () => {
    // A finger that drifted a few px on the way to a swipe must not also open
    // the editor. TaskmanaSwipe reports that window.
    if (TaskmanaSwipe.isSwallowing()) return;
    const input = el('input', 'edit-input');
    input.value = task.text;
    input.setAttribute('aria-label', 'Edit task');
    span.replaceWith(input);
    wireInlineInput(input, (v) => M.editTask(state, task.id, v));
  };
  span.addEventListener(coarsePointer ? 'click' : 'dblclick', startEdit);
  if (!coarsePointer) span.title = 'Double-click to edit';
  return span;
}

const WHY_PLACEHOLDER = 'Why is this on the list?';

/**
 * Open the why editor in a row. `replacing` is the element the input swaps in
 * for (the existing why line, or the prompt's choices), or null to append a
 * fresh input at the end of `body`.
 * @param {Task} task
 * @param {HTMLElement} body
 * @param {HTMLElement | null} replacing
 * @param {() => void} [alsoApply] extra mutation on a non-empty save
 */
function startWhyEdit(task, body, replacing, alsoApply) {
  if (TaskmanaSwipe.isSwallowing()) return;
  const input = el('input', 'edit-input why-input');
  input.value = task.why ?? '';
  input.placeholder = WHY_PLACEHOLDER;
  input.setAttribute('aria-label', `Why: ${task.text}`);
  if (replacing) replacing.replaceWith(input);
  else body.appendChild(input);
  wireInlineInput(input, (v) => {
    M.setWhy(state, task.id, v);
    if (v.trim()) alsoApply?.();
  });
}

/**
 * The why line under a task, editable in place. Returns null when the task
 * has no why yet; the row offers a "Why" action in that case.
 * @param {Task} task @param {HTMLElement} body @returns {HTMLElement | null}
 */
function whyLine(task, body) {
  if (!task.why) return null;
  const span = el('span', 'why', task.why);
  span.addEventListener(coarsePointer ? 'click' : 'dblclick', () => startWhyEdit(task, body, span));
  if (!coarsePointer) span.title = 'Double-click to edit';
  return span;
}

/**
 * Text + carry marks + why, appended to a row body.
 * @param {Task} task @param {HTMLElement} body
 */
function fillTaskBody(task, body) {
  body.appendChild(editableText(task));
  const marks = migrationMarks(task);
  if (marks) body.appendChild(marks);
  const why = whyLine(task, body);
  if (why) body.appendChild(why);
}

/**
 * "Why" row action for a task without one; goes first in the button row so
 * it is visible on touch too. Null when the task already has a why.
 * @param {Task} task @param {HTMLElement} body @returns {HTMLButtonElement | null}
 */
function whyActionBtn(task, body) {
  if (task.why) return null;
  const btn = actionBtn('?', `Write why: ${task.text}`, () => startWhyEdit(task, body, null));
  btn.classList.add('primary');
  return btn;
}

// ---- row actions ------------------------------------------------------------

// One description of what can be done to a task, consumed by two surfaces:
// the inline button row and the swipe gestures. Kept in one place so they
// can't drift apart — and so "every swipe also exists as a button" is true by
// construction rather than by discipline.

/**
 * @typedef {object} RowAction
 * @property {string} label            short text for the inline button
 * @property {string} title            full accessible name
 * @property {() => void} run
 * @property {() => void} [undo]       makes a destructive action safe
 * @property {string} [undoneMessage]  toast shown after run(), with Undo
 * @property {boolean} [danger]
 * @property {boolean} [disabled]
 * @property {'left' | 'right'} [swipe]
 * @property {string} [swipeLabel]     wording on the revealed swipe background
 * @property {boolean} [primary]       visible on the row even on touch; the
 *                                     rest are desktop-hover-only (their job
 *                                     is done elsewhere on touch, e.g. the
 *                                     checkbox for Done)
 */

/**
 * @param {Task} task
 * @param {'today' | 'inbox' | 'someday' | 'recycle'} kind
 * @param {{idx?: number, count?: number, room?: boolean, today?: string}} ctx
 * @returns {RowAction[]}
 */
function rowActions(task, kind, ctx) {
  const { idx = 0, count = 0, room = false, today = M.todayStr() } = ctx;

  /** @type {RowAction} */
  const drop = {
    label: '✕',
    title: `Drop: ${task.text}`,
    danger: true,
    primary: true,
    swipe: 'left',
    swipeLabel: 'Drop',
    undoneMessage: 'Dropped',
    run: () => M.dropTask(state, task.id),
    undo: () => M.restoreDropped(state, task.id),
  };

  if (kind === 'today') {
    /** @type {RowAction[]} */
    const list = [
      {
        label: '↑',
        title: `Move up: ${task.text}`,
        disabled: idx === 0,
        primary: task.status !== 'done',
        run: () => M.moveInToday(state, task.id, -1),
      },
      {
        label: '↓',
        title: `Move down: ${task.text}`,
        disabled: idx === count - 1,
        primary: task.status !== 'done',
        run: () => M.moveInToday(state, task.id, 1),
      },
    ];
    if (task.status !== 'done') {
      list.push({
        label: CUBE_ICON,
        title: `Send back to inbox: ${task.text}`,
        primary: true,
        swipe: 'left',
        swipeLabel: 'To inbox',
        undoneMessage: 'Moved to Inbox',
        run: () => M.demoteToInbox(state, task.id),
        undo: () => M.promoteToToday(state, task.id),
      });
    }
    // Swiping right completes, mirroring the checkbox.
    list.unshift({
      label: task.status === 'done' ? 'Undo' : 'Done',
      title: task.status === 'done' ? `Mark not done: ${task.text}` : `Mark done: ${task.text}`,
      swipe: 'right',
      swipeLabel: task.status === 'done' ? 'Undo' : '✓ Done',
      run: () => M.toggleDone(state, task.id, today),
    });
    return list;
  }

  if (kind === 'inbox') {
    return [
      {
        label: 'Today',
        title: room ? `Add to today: ${task.text}` : 'Today is full (6 max)',
        disabled: !room,
        primary: true,
        swipe: 'right',
        swipeLabel: 'To today',
        undoneMessage: 'Added to Today',
        run: () => M.promoteToToday(state, task.id),
        undo: () => M.demoteToInbox(state, task.id),
      },
      {
        // "SD" on touch: next to "Today" inside the squeezed 44px tap boxes,
        // the two full words read as one run of text. The accessible name
        // below stays "Park in Someday" either way.
        label: coarsePointer ? 'SD' : 'Someday',
        title: `Park in Someday: ${task.text}`,
        primary: true,
        undoneMessage: 'Parked in Someday',
        run: () => M.sendToSomeday(state, task.id),
        undo: () => M.demoteToInbox(state, task.id),
      },
      drop,
    ];
  }

  if (kind === 'someday') {
    return [
      {
        label: CUBE_ICON,
        title: `Move back to inbox: ${task.text}`,
        primary: true,
        swipe: 'right',
        swipeLabel: 'To inbox',
        undoneMessage: 'Moved to Inbox',
        run: () => M.demoteToInbox(state, task.id),
        undo: () => M.sendToSomeday(state, task.id),
      },
      drop,
    ];
  }

  // recycle: restore only. model.js has no permanent delete, and the 30-day
  // prune is the daily rollover's job.
  return [
    {
      label: CUBE_ICON,
      title: `Restore to inbox: ${task.text}`,
      primary: true,
      swipe: 'right',
      swipeLabel: 'Restore',
      run: () => M.restoreDropped(state, task.id),
    },
  ];
}

/** Run an action, persist, and offer Undo when it has an inverse. */
/** @param {RowAction} action */
async function runAction(action) {
  if (action.disabled) {
    TaskmanaUI.toast(action.title);
    return;
  }
  action.run();
  await persistAndRender();
  if (action.undoneMessage && action.undo) {
    const undo = action.undo;
    TaskmanaUI.toast(action.undoneMessage, {
      action: 'Undo',
      onAction: async () => {
        undo();
        await persistAndRender();
      },
    });
  }
}

/**
 * Build a task row: swipe background, then the foreground that slides over it.
 * @param {Task} task
 * @param {'today' | 'inbox' | 'someday' | 'recycle'} kind
 * @param {{idx?: number, count?: number, room?: boolean, today?: string}} [ctx]
 * @returns {{row: HTMLLIElement, fg: HTMLElement, body: HTMLElement,
 *            actions: RowAction[], actionsEl: HTMLElement}}
 */
function taskRow(task, kind, ctx = {}) {
  const actions = rowActions(task, kind, ctx);
  const row = el('li', 'task');
  row.dataset.id = task.id;

  const lead = actions.find((a) => a.swipe === 'right');
  const trail = actions.find((a) => a.swipe === 'left');
  if (lead || trail) {
    const bg = el('div', 'swipe-bg');
    bg.setAttribute('aria-hidden', 'true');
    bg.append(
      el('span', 'bg-lead' + (lead?.danger ? ' danger' : ''), lead?.swipeLabel ?? ''),
      el('span', 'bg-trail' + (trail?.danger ? ' danger' : ''), trail?.swipeLabel ?? '')
    );
    row.appendChild(bg);
  }

  const fg = el('div', 'swipe-fg');
  const body = el('div', 'body');
  row.appendChild(fg);

  // Inline buttons: all of them on desktop; on touch the primary ones —
  // swiping never announced itself, so every action anyone needs is a
  // visible button. (No overflow menu: on touch the only non-primary actions
  // are covered elsewhere — Done by the checkbox — or hidden as noise, like
  // reordering a done row.)
  const actionsEl = el('div', 'actions');
  for (const a of actions) {
    const btn = actionBtn(a.label, a.title, () => runAction(a), {
      danger: a.danger,
      disabled: a.disabled,
    });
    if (a.primary) btn.classList.add('primary');
    actionsEl.appendChild(btn);
  }

  return { row, fg, body, actions, actionsEl };
}

/** @param {string} dateStr @param {string} today */
function historyDayLabel(dateStr, today) {
  // new Date('YYYY-MM-DD') parses as UTC midnight and renders the previous
  // day in negative-offset timezones — build from parts to stay local.
  const [y, m, d] = dateStr.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const ago = M.daysBetween(dateStr, today);
  return `${label} · ${ago === 1 ? 'yesterday' : `${ago} days ago`}`;
}

// ---- render -----------------------------------------------------------------

function render() {
  const today = M.todayStr();
  renderAppbar(today);
  renderToday(today);
  renderInbox();
  renderSomeday();
  renderRecycle();
  renderDone(today);
  renderSettings();
  renderTabs(today);
}

/** @param {string} today */
function renderAppbar(today) {
  $('date-line').textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  $('focus-toggle').classList.toggle('active', state.settings.focusMode);
  $('review-badge').hidden = !M.reviewDue(state, today);
}

/** Theme + hints, which live on the More screen. */
function renderSettings() {
  const theme = state.settings.theme ?? 'system';
  for (const node of $('theme-select').querySelectorAll('.seg')) {
    const btn = /** @type {HTMLButtonElement} */ (node);
    const on = btn.dataset.theme === theme;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
    const key = /** @type {ThemeName} */ (btn.dataset.theme ?? 'system');
    btn.setAttribute('aria-label', `Theme: ${THEME_LABELS[key]}`);
  }

  const hints = state.settings.showHints ?? true;
  $('hints-toggle').setAttribute('aria-pressed', String(hints));
  $('hints-state').textContent = hints ? 'On' : 'Off';
  document.body.classList.toggle('hints-off', !hints);
}

/** @param {string} today */
function renderTabs(today) {
  const inbox = M.inboxTasks(state).length;
  const someday = M.somedayTasks(state).length;
  $('tab-count-today').textContent = String(M.todayList(state).length);
  $('tab-count-inbox').textContent = inbox ? String(inbox) : '';
  $('tab-count-someday').textContent = someday ? String(someday) : '';
  // Mirror the review nudge onto the tab so it's visible from any view.
  $('tab-dot-inbox').hidden = !M.reviewDue(state, today);

  const view = TaskmanaNav.current();
  for (const node of document.querySelectorAll('.tab')) {
    const btn = /** @type {HTMLButtonElement} */ (node);
    const on = btn.dataset.view === view;
    btn.classList.toggle('active', on);
    if (on) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
}

/** @param {string} today */
function renderToday(today) {
  const list = M.todayList(state);
  const listEl = $('today-list');
  listEl.replaceChildren();
  $('today-count').textContent = `${list.length}/${M.TODAY_CAP}`;
  $('today-empty').hidden = list.length > 0;

  const note = $('tomorrow-note');
  note.hidden = state.tomorrowQueue.length === 0;
  note.textContent = `Tomorrow is planned: ${state.tomorrowQueue.length} task${state.tomorrowQueue.length === 1 ? '' : 's'} queued.`;

  const focusTask = M.currentFocusTask(state);

  list.forEach((task, idx) => {
    if (idx === M.TOP_COUNT && list.length > M.TOP_COUNT) {
      listEl.appendChild(el('li', 'bonus-divider', 'bonus'));
    }

    const { row, fg, body, actionsEl } = taskRow(task, 'today', {
      idx,
      count: list.length,
      today,
    });
    if (idx < M.TOP_COUNT) row.classList.add('top');
    if (task.status === 'done') row.classList.add('done-row');
    if (state.settings.focusMode && task.status === 'today') {
      row.classList.add(task === focusTask ? 'focused' : 'locked');
    }

    const check = el('input', 'check');
    check.type = 'checkbox';
    check.checked = task.status === 'done';
    check.setAttribute('aria-label', `Mark done: ${task.text}`);
    check.addEventListener('change', async () => {
      M.toggleDone(state, task.id, today);
      await persistAndRender();
    });
    // The box stays visually small; the label around it is the 44px tap target.
    const checkWrap = el('label', 'check-wrap');
    checkWrap.appendChild(check);

    fillTaskBody(task, body);

    const askingWhy = M.needsMigrationDecision(task);
    /** @type {HTMLElement | null} */
    let prompt = null;
    if (askingWhy) {
      const box = el('div', 'migration-prompt');
      prompt = box;
      box.appendChild(el('span', 'q', `Carried over ${task.migrationCount}×. Still worth doing?`));
      const choices = el('span', 'choices');
      if (!task.why) {
        // Writing the why is the keep decision. A reason that survives the
        // stall is the honest version of "Keep".
        choices.appendChild(actionBtn('Why?', 'Write why it matters and keep it', () => {
          // The input takes the choices' place inside the amber box: the
          // prompt spans the row, so the sentence gets the full width.
          startWhyEdit(task, box, choices, () => M.keepMigrated(state, task.id));
        }));
      }
      choices.appendChild(actionBtn('Keep', 'Keep it on the list', async () => {
        M.keepMigrated(state, task.id);
        await persistAndRender();
      }));
      choices.appendChild(actionBtn('Someday', 'Park it in Someday', async () => {
        M.sendToSomeday(state, task.id);
        await persistAndRender();
      }));
      choices.appendChild(actionBtn('Drop', 'Drop this task', async () => {
        M.dropTask(state, task.id);
        await persistAndRender();
      }, { danger: true }));
      box.appendChild(choices);
    }

    // The prompt already offers Why; done rows have nothing left to justify.
    const why = whyActionBtn(task, body);
    if (why && task.status !== 'done' && !askingWhy) actionsEl.prepend(why);

    fg.append(checkWrap, body, actionsEl);
    // Below the row, full width: four choices at tap size don't fit in the
    // text column next to the action buttons on a phone.
    if (prompt) fg.appendChild(prompt);
    listEl.appendChild(row);
  });
}

function renderInbox() {
  const tasks = M.inboxTasks(state);
  const listEl = $('inbox-list');
  listEl.replaceChildren();
  $('inbox-count').textContent = tasks.length ? String(tasks.length) : '';
  $('inbox-empty').hidden = tasks.length > 0;
  const room = M.todayHasRoom(state);

  for (const task of tasks) {
    const { row, fg, body, actionsEl } = taskRow(task, 'inbox', { room });
    fillTaskBody(task, body);
    const why = whyActionBtn(task, body);
    if (why) actionsEl.prepend(why);
    fg.append(body, actionsEl);
    listEl.appendChild(row);
  }
}

function renderSomeday() {
  const tasks = M.somedayTasks(state);
  const listEl = $('someday-list');
  listEl.replaceChildren();
  $('someday-count').textContent = tasks.length ? String(tasks.length) : '';
  // Never hide the section itself: it is a whole view now, and an inline
  // style.display would beat the body[data-view] rule and blank the tab.
  $('someday-empty').hidden = tasks.length > 0;

  for (const task of tasks) {
    const { row, fg, body, actionsEl } = taskRow(task, 'someday', {});
    fillTaskBody(task, body);
    const why = whyActionBtn(task, body);
    if (why) actionsEl.prepend(why);
    fg.append(body, actionsEl);
    listEl.appendChild(row);
  }
}

function renderRecycle() {
  const tasks = M.droppedTasks(state);
  const listEl = $('recycle-list');
  listEl.replaceChildren();
  $('recycle-count').textContent = tasks.length ? String(tasks.length) : '';
  $('recycle-section').hidden = tasks.length === 0;

  for (const task of tasks) {
    const { row, fg, body, actionsEl } = taskRow(task, 'recycle', {});
    body.appendChild(el('span', 'text', task.text));
    const left = M.droppedDaysLeft(task);
    body.appendChild(
      el('span', 'expires', left === 0 ? 'expires today' : `expires in ${left} day${left === 1 ? '' : 's'}`)
    );
    fg.append(body, actionsEl);
    listEl.appendChild(row);
  }
}

/** Done-today lives at the foot of Today; the day log lives under More. */
/** @param {string} today */
function renderDone(today) {
  const done = M.doneToday(state, today);
  const toggle = $('done-toggle');
  const listEl = $('done-list');
  toggle.hidden = done.length === 0;
  if (done.length === 0) listEl.hidden = true;
  toggle.textContent = `✓ ${done.length} done today`;

  listEl.replaceChildren();
  for (const task of done) {
    const row = el('li', 'task');
    row.appendChild(el('span', 'text', task.text));
    listEl.appendChild(row);
  }

  // Only the inner body is rebuilt — recreating the <details> itself would
  // reset its open state on every persistAndRender.
  const history = M.doneHistory(state, today);
  $('history-section').hidden = history.length === 0;
  $('history-empty').hidden = history.length > 0;
  const body = $('history-body');
  body.replaceChildren();
  for (const day of history) {
    body.appendChild(el('h3', 'history-date', historyDayLabel(day.date, today)));
    const ul = el('ul', 'task-list plain done-log');
    for (const task of day.tasks) {
      const row = el('li', 'task');
      row.appendChild(el('span', 'text', task.text));
      ul.appendChild(row);
    }
    body.appendChild(ul);
  }
}

// ---- capture ----------------------------------------------------------------

$('capture-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $input('capture-input');
  const text = input.value.trim();
  if (M.addTask(state, text)) {
    input.value = '';
    await persistAndRender();
    // addTask always files to the Inbox, so from any other view the capture
    // looks like it did nothing. Say where it went, and offer the shortcut.
    if (TaskmanaNav.current() !== 'inbox') {
      const task = M.inboxTasks(state).find((t) => t.text === text);
      const canPromote = !!task && M.todayHasRoom(state);
      TaskmanaUI.toast('Added to Inbox', {
        action: canPromote ? 'Add to Today' : undefined,
        onAction: canPromote
          ? async () => {
              M.promoteToToday(state, /** @type {Task} */ (task).id);
              await persistAndRender();
            }
          : undefined,
      });
    }
  }
  input.focus();
});

$('focus-toggle').addEventListener('click', async () => {
  state.settings.focusMode = !state.settings.focusMode;
  await persistAndRender();
});

// A segmented control rather than the old cycling chip: on touch you can't
// discover the options of a cycler without tapping through them.
$('theme-select').addEventListener('click', async (e) => {
  const seg = /** @type {HTMLElement | null} */ (
    /** @type {HTMLElement} */ (e.target).closest('.seg')
  );
  const theme = seg?.dataset.theme;
  if (!theme || !THEMES.includes(/** @type {ThemeName} */ (theme))) return;
  state.settings.theme = /** @type {ThemeName} */ (theme);
  applyTheme(theme);
  await persistAndRender();
});

$('hints-toggle').addEventListener('click', async () => {
  state.settings.showHints = !(state.settings.showHints ?? true);
  await persistAndRender();
});

// Desktop settings popover: the ⚙ chip presents the More section as a panel
// anchored under the masthead instead of a dump at the bottom of the page.
// Mobile never shows the chip — the More tab owns that surface there.
{
  const btn = $('settings-btn');
  const close = () => {
    document.body.classList.remove('more-open');
    btn.setAttribute('aria-expanded', 'false');
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = document.body.classList.toggle('more-open');
    btn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('more-open')) return;
    const t = e.target;
    if (t instanceof Element && t.closest('#more-section, #settings-btn')) return;
    close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('more-open')) close();
  });
}

// ---- view routing -----------------------------------------------------------

// Delegated: one listener on the bar rather than four on buttons.
document.querySelector('.tabbar')?.addEventListener('click', (e) => {
  const tab = /** @type {HTMLElement | null} */ (
    /** @type {HTMLElement} */ (e.target).closest('.tab')
  );
  const view = tab?.dataset.view;
  if (view) TaskmanaNav.go(view);
});

$('done-toggle').addEventListener('click', () => {
  $('done-list').hidden = !$('done-list').hidden;
});

// ---- backup: export / import ------------------------------------------------

/** Installed-app mode, where an <a download> click is unreliable on iOS. */
function isStandalone() {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    /** @type {any} */ (navigator).standalone === true
  );
}

async function exportBackup() {
  const json = JSON.stringify(state, null, 2);
  const name = `taskmana-backup-${M.todayStr()}.json`;

  // In an installed iOS PWA, clicking an <a download> either does nothing or
  // navigates the app away with no way back — and this is the only backup
  // route. Hand it to the share sheet instead. Called from a click handler, so
  // the user activation navigator.share() requires is present.
  if (isStandalone() && navigator.canShare) {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Taskmana backup' });
        return;
      } catch (err) {
        // AbortError just means the user dismissed the sheet — don't then
        // spring a download on them. Anything else falls through to the anchor.
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
  }

  const blob = new Blob([json], { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

$('export-btn').addEventListener('click', exportBackup);
$('review-export').addEventListener('click', exportBackup);

$('import-btn').addEventListener('click', () => $input('import-file').click());

$input('import-file').addEventListener('change', async () => {
  const fileInput = $input('import-file');
  const file = fileInput.files?.[0];
  fileInput.value = ''; // allow picking the same file again later
  if (!file) return;

  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    TaskmanaUI.toast('That file isn’t valid JSON.');
    return;
  }
  if (!M.isValidState(parsed)) {
    TaskmanaUI.toast('That file isn’t a Taskmana backup.');
    return;
  }
  const current = state.tasks.length;
  const incoming = parsed.tasks.length;
  const ok = await TaskmanaUI.confirmSheet({
    title: 'Replace everything?',
    body: `This swaps your current ${current} task${current === 1 ? '' : 's'} for the backup’s ${incoming}. There's no undo.`,
    confirmLabel: 'Replace',
    danger: true,
  });
  if (!ok) return;
  state = /** @type {State} */ (M.migrateState(parsed));
  // The backup may be from an earlier day — run the normal morning rollover.
  M.rollover(state, M.todayStr());
  state.settings.theme ??= 'system';
  applyTheme(state.settings.theme);
  await persistAndRender();
});

// ---- weekly review ----------------------------------------------------------

/** @type {Task[]} */
let reviewQueue = [];
let reviewIndex = 0;

$('review-btn').addEventListener('click', () => {
  reviewQueue = M.reviewCandidates(state);
  reviewIndex = 0;
  $dialog('review-dialog').showModal();
  renderReviewCard();
});

function renderReviewCard() {
  const total = reviewQueue.length;
  const task = reviewQueue[reviewIndex];
  const actions = $('review-actions');

  if (!task) {
    $('review-text').textContent = total === 0
      ? 'Nothing to review — inbox is clear.'
      : 'Review done. Your list is honest again.';
    $('review-meta').textContent =
      total === 0 ? '' : 'Fresh list — a good moment to back it up.';
    $('review-progress').textContent = '';
    $input('review-why-input').value = '';
    actions.hidden = true;
    $('review-done-actions').hidden = total === 0;
    return;
  }

  actions.hidden = false;
  $('review-done-actions').hidden = true;
  $('review-text').textContent = task.text;
  const bits = [];
  if (task.status === 'someday') bits.push('parked in Someday');
  if (task.status === 'today') bits.push('on today’s list');
  if (task.migrationCount) bits.push(`carried over ${task.migrationCount}×`);
  const ageDays = Math.floor((Date.now() - task.createdAt) / 86400000);
  bits.push(ageDays === 0 ? 'added today' : `added ${ageDays} day${ageDays === 1 ? '' : 's'} ago`);
  $('review-meta').textContent = bits.join(' · ');
  $input('review-why-input').value = task.why ?? '';
  $('review-progress').textContent = `${reviewIndex + 1} of ${total}`;
  const todayBtn = /** @type {HTMLButtonElement} */ (actions.querySelector('[data-act="today"]'));
  todayBtn.disabled = !M.todayHasRoom(state) || task.status === 'today';
}

$('review-actions').addEventListener('click', async (e) => {
  const act = /** @type {HTMLElement} */ (e.target).dataset?.act;
  if (!act) return;
  const task = reviewQueue[reviewIndex];
  if (!task) return;
  M.setWhy(state, task.id, $input('review-why-input').value);
  if (act === 'today') M.promoteToToday(state, task.id);
  if (act === 'keep' && task.status === 'someday') M.demoteToInbox(state, task.id);
  if (act === 'keep' && task.status === 'today') M.keepMigrated(state, task.id);
  if (act === 'someday') M.sendToSomeday(state, task.id);
  if (act === 'drop') M.dropTask(state, task.id);
  reviewIndex += 1;
  if (reviewIndex >= reviewQueue.length) M.markReviewed(state, M.todayStr());
  await store.save(state);
  render();
  renderReviewCard();
});

// The why field is always on the card. The review is where you're meant to
// be honest, so it shouldn't cost a click. Enter and blur save without advancing.
async function commitReviewWhy() {
  const task = reviewQueue[reviewIndex];
  if (!task) return;
  const value = $input('review-why-input').value;
  if (value.trim() === (task.why ?? '')) return;
  M.setWhy(state, task.id, value);
  await store.save(state);
  render();
}
$('review-why-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') commitReviewWhy();
});
$('review-why-input').addEventListener('blur', commitReviewWhy);

$('review-close').addEventListener('click', async () => {
  if (reviewQueue.length > 0 && reviewIndex >= reviewQueue.length) {
    M.markReviewed(state, M.todayStr());
    await store.save(state);
    render();
  }
  $dialog('review-dialog').close();
});

// ---- plan tomorrow (Ivy Lee) ------------------------------------------------

/** @type {string[]} */
let planSelection = [];

$('plan-btn').addEventListener('click', () => {
  planSelection = [...state.tomorrowQueue];
  $dialog('plan-dialog').showModal();
  renderPlanList();
});

/** @returns {Task[]} */
function planCandidates() {
  const unfinished = M.todayList(state).filter((t) => t.status === 'today');
  return [...unfinished, ...M.inboxTasks(state)];
}

function renderPlanList() {
  const candidates = planCandidates();
  const listEl = $('plan-list');
  listEl.replaceChildren();
  $('plan-empty').hidden = candidates.length > 0;
  $('plan-count').textContent = `${planSelection.length}/${M.TODAY_CAP} picked`;

  for (const task of candidates) {
    // A real <button> inside the <li> keeps native keyboard support and valid
    // list semantics (role=button on an li breaks the ul's listitem contract).
    const li = el('li');
    const row = el('button', 'task plan-row');
    const pos = planSelection.indexOf(task.id);
    if (pos !== -1) row.classList.add('selected');
    row.type = 'button';
    row.setAttribute('aria-pressed', pos !== -1 ? 'true' : 'false');
    row.setAttribute('aria-label', `${pos !== -1 ? 'Remove from' : 'Add to'} tomorrow: ${task.text}`);

    row.appendChild(el('span', 'plan-num', pos === -1 ? '' : String(pos + 1)));
    const body = el('div', 'body');
    body.appendChild(el('span', 'text', task.text));
    const marks = migrationMarks(task);
    if (marks) body.appendChild(marks);
    row.appendChild(body);

    row.addEventListener('click', () => {
      if (pos === -1) {
        if (planSelection.length < M.TODAY_CAP) planSelection.push(task.id);
      } else {
        planSelection.splice(pos, 1);
      }
      renderPlanList();
    });
    li.appendChild(row);
    listEl.appendChild(li);
  }

  renderPlanPreview();
}

// Live preview of the post-rollover Today list for the current picks — the
// payoff of planning is otherwise invisible until tomorrow's first open.
function renderPlanPreview() {
  const { today, overflow } = M.tomorrowPreview(state, planSelection);
  const wrap = $('plan-preview');
  wrap.hidden = today.length === 0;
  if (wrap.hidden) return;

  const listEl = $('plan-preview-list');
  listEl.replaceChildren();
  for (const task of today) {
    const li = el('li', 'preview-row');
    li.appendChild(el('span', 'text', task.text));
    if (task.status === 'today') {
      // rollover will add one more › mark to any unfinished today task
      const marks = migrationMarks({ ...task, migrationCount: task.migrationCount + 1 });
      if (marks) li.appendChild(marks);
    }
    if (!planSelection.includes(task.id)) li.appendChild(el('span', 'preview-tag', 'carried'));
    listEl.appendChild(li);
  }

  const over = $('plan-preview-overflow');
  over.hidden = overflow.length === 0;
  if (overflow.length) {
    over.textContent = `Past the cap of ${M.TODAY_CAP} — back to inbox: ${overflow
      .map((t) => t.text)
      .join(', ')}`;
  }
}

$('plan-save').addEventListener('click', async () => {
  M.setTomorrowQueue(state, planSelection);
  $dialog('plan-dialog').close();
  await persistAndRender();
});

$('plan-cancel').addEventListener('click', () => $dialog('plan-dialog').close());

// ---- sync -------------------------------------------------------------------

/** @type {Record<string, string>} */
const SYNC_STATUS_LABELS = {
  'signed-out': '',
  syncing: 'Syncing…',
  idle: 'Synced',
  offline: 'Offline — will retry',
};

let syncStep = 'email'; // email | code — which sign-in form is showing

function renderSync() {
  const signedIn = !!TaskmanaSync.account();
  const status = TaskmanaSync.status();
  const dot = $('sync-dot');
  dot.hidden = !signedIn;
  dot.dataset.state = status;

  const configured = TaskmanaSync.isConfigured();
  $('sync-unconfigured').hidden = configured;
  $('sync-email-form').hidden = !configured || signedIn || syncStep !== 'email';
  $('sync-code-form').hidden = !configured || signedIn || syncStep !== 'code';
  $('sync-signedin').hidden = !configured || !signedIn;
  if (signedIn) $('sync-account').textContent = `Signed in as ${TaskmanaSync.account()}`;
  $('sync-status').textContent = SYNC_STATUS_LABELS[status] ?? '';

  // The More row carries the state in words; the dot alone was too quiet.
  $('sync-summary').textContent = !configured
    ? 'Not set up'
    : signedIn
      ? SYNC_STATUS_LABELS[status] || 'Signed in'
      : 'Signed out';
}

/** @param {unknown} err */
function showSyncError(err) {
  const p = $('sync-error');
  p.hidden = false;
  p.textContent = err instanceof Error ? err.message : 'Something went wrong — try again.';
}

$('sync-btn').addEventListener('click', () => {
  syncStep = 'email';
  $('sync-error').hidden = true;
  renderSync();
  $dialog('sync-dialog').showModal();
});

$('sync-email-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('sync-error').hidden = true;
  try {
    await TaskmanaSync.sendCode($input('sync-email').value.trim());
    syncStep = 'code';
    renderSync();
    $input('sync-code').focus();
  } catch (err) {
    showSyncError(err);
  }
});

$('sync-code-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('sync-error').hidden = true;
  try {
    await TaskmanaSync.verifyCode($input('sync-email').value.trim(), $input('sync-code').value.trim());
    renderSync();
  } catch (err) {
    showSyncError(err);
  }
});

$('sync-signout').addEventListener('click', async () => {
  await TaskmanaSync.signOut();
  syncStep = 'email';
  renderSync();
});

$('sync-close').addEventListener('click', () => $dialog('sync-dialog').close());

// ---- boot -------------------------------------------------------------------

const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

async function init() {
  state = M.migrateState(await store.load()) ?? M.initialState(M.todayStr());
  state.settings.theme ??= 'system';
  // The hints are long-form teaching text. On a laptop they sit beside the
  // list; on a phone they'd be half the first screen, so a fresh install
  // starts with them off there. Toggle lives under More → Method hints.
  state.settings.showHints ??= !coarsePointer;
  applyTheme(state.settings.theme);
  if (M.rollover(state, M.todayStr())) await store.save(state);

  TaskmanaUI.initSheets();
  // Re-render on view change so the tab bar's active state and counts follow.
  TaskmanaNav.subscribe(() => renderTabs(M.todayStr()));
  TaskmanaNav.init();

  TaskmanaSwipe.init((row, dir) => {
    const task = state.tasks.find((t) => t.id === row.dataset.id);
    const kind = /** @type {'today' | 'inbox' | 'someday' | 'recycle'} */ (
      /** @type {HTMLElement} */ (row.closest('[data-swipe]'))?.dataset.swipe ?? 'inbox'
    );
    if (!task) return;
    const list = M.todayList(state);
    const action = rowActions(task, kind, {
      idx: list.indexOf(task),
      count: list.length,
      room: M.todayHasRoom(state),
      today: M.todayStr(),
    }).find((a) => a.swipe === dir);
    if (action) void runAction(action);
  });

  render();

  // iOS evicts a plain tab's localStorage after ~7 days unused. Asking for
  // persistent storage materially reduces that risk; browsers grant it
  // silently for installed apps and ignore it otherwise.
  navigator.storage?.persist?.().catch(() => {});

  // Keyboard-first on desktop; on touch this would pop the soft keyboard on
  // every single launch of the installed app, which is actively hostile.
  if (finePointer) $input('capture-input').focus();

  TaskmanaSync.onStatus(renderSync);
  TaskmanaSync.init({
    getState: () => state,
    applyRemote: async (s) => {
      state = s;
      applyTheme(state.settings.theme ?? 'system');
      await store.save(state);
      render();
    },
  });
  renderSync();

  // PWA app shell. https-only so the plain http test server never registers a
  // worker (a cached shell across test runs is a flake factory).
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      // iOS restores the app from memory with no navigation, so the browser's
      // own update check never runs and a new release sits unnoticed until a
      // manual refresh. Check on every return to the foreground instead —
      // controllerchange below finishes the job.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    });
    // sw.js calls skipWaiting() + clients.claim(), so a new release can take
    // over mid-session and start serving CSS/JS the live page never parsed.
    // Reload once when that happens rather than run on a half-swapped shell.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  }
}

init();
