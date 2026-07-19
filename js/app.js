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

/**
 * @param {string} label
 * @param {string} title
 * @param {() => void} onClick
 * @param {{danger?: boolean, disabled?: boolean}} [opts]
 * @returns {HTMLButtonElement}
 */
function actionBtn(label, title, onClick, { danger = false, disabled = false } = {}) {
  const b = el('button', 'icon-btn' + (danger ? ' danger' : ''), label);
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

/** @param {Task} task @returns {HTMLElement} */
function editableText(task) {
  const span = el('span', 'text', task.text);
  span.title = 'Double-click to edit';
  span.addEventListener('dblclick', () => {
    const input = el('input', 'edit-input');
    input.value = task.text;
    input.setAttribute('aria-label', 'Edit task');
    span.replaceWith(input);
    input.focus();
    input.select();
    const commit = async () => {
      M.editTask(state, task.id, input.value);
      await persistAndRender();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') render();
    });
    input.addEventListener('blur', commit);
  });
  return span;
}

// ---- render -----------------------------------------------------------------

function render() {
  const today = M.todayStr();
  renderMasthead(today);
  renderToday(today);
  renderInbox();
  renderSomeday();
  renderFooter(today);
}

/** @param {string} today */
function renderMasthead(today) {
  $('date-line').textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  $('focus-toggle').classList.toggle('active', state.settings.focusMode);
  $('review-badge').hidden = !M.reviewDue(state, today);
  const theme = state.settings.theme ?? 'system';
  $('theme-toggle').textContent = THEME_LABELS[theme];
  $('theme-toggle').classList.toggle('active', theme !== 'system');
  const hints = state.settings.showHints ?? true;
  $('hints-toggle').classList.toggle('active', hints);
  document.body.classList.toggle('hints-off', !hints);
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

    const row = el('li', 'task');
    if (idx < M.TOP_COUNT) row.classList.add('top');
    if (task.status === 'done') row.classList.add('done-row');
    if (state.settings.focusMode && task.status === 'today' && task !== focusTask) {
      row.classList.add('locked');
    }

    const check = el('input', 'check');
    check.type = 'checkbox';
    check.checked = task.status === 'done';
    check.setAttribute('aria-label', `Mark done: ${task.text}`);
    check.addEventListener('change', async () => {
      M.toggleDone(state, task.id, today);
      await persistAndRender();
    });

    const body = el('div', 'body');
    body.appendChild(editableText(task));
    const marks = migrationMarks(task);
    if (marks) body.appendChild(marks);

    if (M.needsMigrationDecision(task)) {
      const prompt = el('div', 'migration-prompt');
      prompt.appendChild(el('span', 'q', `Carried over ${task.migrationCount}×. Still worth doing?`));
      prompt.appendChild(actionBtn('Keep', 'Keep it on the list', async () => {
        M.keepMigrated(state, task.id);
        await persistAndRender();
      }));
      prompt.appendChild(actionBtn('Someday', 'Park it in Someday', async () => {
        M.sendToSomeday(state, task.id);
        await persistAndRender();
      }));
      prompt.appendChild(actionBtn('Drop', 'Drop this task', async () => {
        M.dropTask(state, task.id);
        await persistAndRender();
      }, { danger: true }));
      body.appendChild(prompt);
    }

    const actions = el('div', 'actions');
    actions.appendChild(actionBtn('↑', `Move up: ${task.text}`, async () => {
      M.moveInToday(state, task.id, -1);
      await persistAndRender();
    }, { disabled: idx === 0 }));
    actions.appendChild(actionBtn('↓', `Move down: ${task.text}`, async () => {
      M.moveInToday(state, task.id, 1);
      await persistAndRender();
    }, { disabled: idx === list.length - 1 }));
    if (task.status !== 'done') {
      actions.appendChild(actionBtn('Inbox', `Send back to inbox: ${task.text}`, async () => {
        M.demoteToInbox(state, task.id);
        await persistAndRender();
      }));
    }

    row.append(check, body, actions);
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
    const row = el('li', 'task');
    const body = el('div', 'body');
    body.appendChild(editableText(task));
    const marks = migrationMarks(task);
    if (marks) body.appendChild(marks);

    const actions = el('div', 'actions');
    actions.appendChild(actionBtn('Today', room ? `Add to today: ${task.text}` : 'Today is full (6 max)', async () => {
      M.promoteToToday(state, task.id);
      await persistAndRender();
    }, { disabled: !room }));
    actions.appendChild(actionBtn('Someday', `Park in Someday: ${task.text}`, async () => {
      M.sendToSomeday(state, task.id);
      await persistAndRender();
    }));
    actions.appendChild(actionBtn('✕', `Drop: ${task.text}`, async () => {
      M.dropTask(state, task.id);
      await persistAndRender();
    }, { danger: true }));

    row.append(body, actions);
    listEl.appendChild(row);
  }
}

function renderSomeday() {
  const tasks = M.somedayTasks(state);
  const listEl = $('someday-list');
  listEl.replaceChildren();
  $('someday-count').textContent = tasks.length ? String(tasks.length) : '';
  $('someday-section').style.display = tasks.length ? '' : 'none';

  for (const task of tasks) {
    const row = el('li', 'task');
    const body = el('div', 'body');
    body.appendChild(editableText(task));

    const actions = el('div', 'actions');
    actions.appendChild(actionBtn('Inbox', `Move back to inbox: ${task.text}`, async () => {
      M.demoteToInbox(state, task.id);
      await persistAndRender();
    }));
    actions.appendChild(actionBtn('✕', `Drop: ${task.text}`, async () => {
      M.dropTask(state, task.id);
      await persistAndRender();
    }, { danger: true }));

    row.append(body, actions);
    listEl.appendChild(row);
  }
}

/** @param {string} today */
function renderFooter(today) {
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
}

// ---- capture ----------------------------------------------------------------

$('capture-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $input('capture-input');
  if (M.addTask(state, input.value)) {
    input.value = '';
    await persistAndRender();
  }
  input.focus();
});

$('focus-toggle').addEventListener('click', async () => {
  state.settings.focusMode = !state.settings.focusMode;
  await persistAndRender();
});

$('theme-toggle').addEventListener('click', async () => {
  const cur = state.settings.theme ?? 'system';
  const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
  state.settings.theme = next;
  applyTheme(next);
  await persistAndRender();
});

$('hints-toggle').addEventListener('click', async () => {
  state.settings.showHints = !(state.settings.showHints ?? true);
  await persistAndRender();
});

$('done-toggle').addEventListener('click', () => {
  $('done-list').hidden = !$('done-list').hidden;
});

// ---- backup: export / import ------------------------------------------------

$('export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = `taskmana-backup-${M.todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

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
    alert('That file is not valid JSON.');
    return;
  }
  if (!M.isValidState(parsed)) {
    alert('That file is not a Taskmana backup.');
    return;
  }
  const current = state.tasks.length;
  const incoming = parsed.tasks.length;
  if (!confirm(`Replace your current ${current} task${current === 1 ? '' : 's'} with the backup's ${incoming}?`)) {
    return;
  }
  state = parsed;
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
    $('review-meta').textContent = '';
    $('review-progress').textContent = '';
    actions.hidden = true;
    return;
  }

  actions.hidden = false;
  $('review-text').textContent = task.text;
  const bits = [];
  if (task.status === 'someday') bits.push('parked in Someday');
  if (task.status === 'today') bits.push('on today’s list');
  if (task.migrationCount) bits.push(`carried over ${task.migrationCount}×`);
  const ageDays = Math.floor((Date.now() - task.createdAt) / 86400000);
  bits.push(ageDays === 0 ? 'added today' : `added ${ageDays} day${ageDays === 1 ? '' : 's'} ago`);
  $('review-meta').textContent = bits.join(' · ');
  $('review-progress').textContent = `${reviewIndex + 1} of ${total}`;
  const todayBtn = /** @type {HTMLButtonElement} */ (actions.querySelector('[data-act="today"]'));
  todayBtn.disabled = !M.todayHasRoom(state) || task.status === 'today';
}

$('review-actions').addEventListener('click', async (e) => {
  const act = /** @type {HTMLElement} */ (e.target).dataset?.act;
  if (!act) return;
  const task = reviewQueue[reviewIndex];
  if (!task) return;
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
}

$('plan-save').addEventListener('click', async () => {
  M.setTomorrowQueue(state, planSelection);
  $dialog('plan-dialog').close();
  await persistAndRender();
});

$('plan-cancel').addEventListener('click', () => $dialog('plan-dialog').close());

// ---- boot -------------------------------------------------------------------

async function init() {
  state = (await store.load()) ?? M.initialState(M.todayStr());
  state.settings.theme ??= 'system';
  applyTheme(state.settings.theme);
  if (M.rollover(state, M.todayStr())) await store.save(state);
  render();
  $input('capture-input').focus();
}

init();
