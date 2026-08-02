// Opt-in cross-device sync through Supabase. Local-first: the app renders and
// works entirely from local storage; this layer pulls/merges in the background
// and pushes debounced snapshots with optimistic concurrency (revision column).
// Signed out (or unconfigured), every call here is a free no-op.

const TaskmanaSync = (() => {
  const META_KEY = 'taskmana-sync-meta'; // { revision } — last revision this device synced to
  const M = TaskmanaModel;

  /** @type {any} */ let client = null;
  /** @type {{ getState: () => State, applyRemote: (s: State) => Promise<void> } | null} */
  let hooks = null;
  /** @type {string | null} */ let userId = null;
  /** @type {string | null} */ let userEmail = null;
  let dirty = false;
  let inflight = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */ let timer;
  /** @type {((s: string) => void) | null} */ let statusListener = null;
  let lastStatus = 'signed-out'; // signed-out | syncing | idle | offline

  function isConfigured() {
    return !!(TaskmanaConfig.SUPABASE_URL && TaskmanaConfig.SUPABASE_ANON_KEY);
  }

  function hasStoredSession() {
    try {
      return Object.keys(localStorage).some((k) => k.startsWith('sb-'));
    } catch {
      return false;
    }
  }

  /** @param {string} s */
  function setStatus(s) {
    lastStatus = s;
    statusListener?.(s);
  }

  // ---- lazy client ----------------------------------------------------------
  // The vendored bundle is ~200KB of parse cost; a new tab that never syncs
  // must not pay it. Inject only when a session exists or the dialog is used.

  /** @type {Promise<void> | null} */ let libPromise = null;
  function loadLib() {
    libPromise ??= new Promise((resolve, reject) => {
      if (/** @type {any} */ (globalThis).supabase) return resolve();
      const s = document.createElement('script');
      s.src = 'js/vendor/supabase.js';
      s.onload = () => resolve();
      s.onerror = () => {
        libPromise = null;
        reject(new Error('failed to load supabase vendor script'));
      };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  async function getClient() {
    if (client) return client;
    await loadLib();
    client = /** @type {any} */ (globalThis).supabase.createClient(
      TaskmanaConfig.SUPABASE_URL,
      TaskmanaConfig.SUPABASE_ANON_KEY,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }
    );
    return client;
  }

  // Prefixed because the Supabase project is shared with other apps — a bare
  // `states` table there is a collision waiting to happen.
  function db() {
    return client.from('taskmana_states');
  }

  // ---- sync meta ------------------------------------------------------------

  function getRevision() {
    try {
      return JSON.parse(localStorage.getItem(META_KEY) ?? '{}').revision ?? 0;
    } catch {
      return 0;
    }
  }

  /** @param {number} revision */
  function setRevision(revision) {
    localStorage.setItem(META_KEY, JSON.stringify({ revision }));
  }

  // ---- engine ---------------------------------------------------------------

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(push, 2000);
  }

  // Called by store.save() after every local persist.
  function onLocalSave() {
    if (!userId) return; // signed out → free no-op
    dirty = true;
    schedule();
  }

  async function push() {
    if (inflight || !userId || !hooks) return;
    inflight = true;
    dirty = false;
    setStatus('syncing');
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const local = hooks.getState();
        const expected = getRevision();
        if (expected === 0) {
          const { error } = await db().insert({ user_id: userId, state: local, revision: 1 });
          if (!error) {
            setRevision(1);
            setStatus('idle');
            return;
          }
          if (error.code !== '23505') throw error; // 23505: row exists → pull+merge below
        } else {
          const { data, error } = await db()
            .update({ state: local, revision: expected + 1, updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('revision', expected)
            .select('revision');
          if (error) throw error;
          if (data.length === 1) {
            setRevision(expected + 1);
            setStatus('idle');
            return;
          }
        }
        await pullAndMerge(); // lost the optimistic race → converge, then retry
      }
      setStatus('idle');
    } catch {
      dirty = true; // offline or 5xx: stay quiet, local data is safe
      setStatus('offline');
    } finally {
      inflight = false;
      if (dirty) schedule();
    }
  }

  async function pullAndMerge() {
    if (!hooks) return;
    const { data, error } = await db().select('state, revision').maybeSingle();
    if (error) throw error;
    if (!data) {
      setRevision(0);
      dirty = true;
      schedule();
      return;
    }
    const remote = M.migrateState(data.state);
    const local = hooks.getState();
    const merged = M.mergeStates(local, /** @type {State} */ (remote));
    M.rollover(merged, M.todayStr()); // idempotent; a stale side can't undo the day
    setRevision(data.revision);
    if (JSON.stringify(merged) !== JSON.stringify(local)) await hooks.applyRemote(merged);
    if (JSON.stringify(merged) !== JSON.stringify(remote)) {
      dirty = true;
      schedule();
    }
  }

  async function boot() {
    const c = await getClient();
    const { data } = await c.auth.getSession();
    if (!data.session) {
      setStatus('signed-out');
      return;
    }
    userId = data.session.user.id;
    userEmail = data.session.user.email ?? null;
    setStatus('syncing');
    try {
      await pullAndMerge();
      setStatus('idle');
    } catch {
      setStatus('offline');
    }
  }

  // ---- public API -----------------------------------------------------------

  /** @param {{ getState: () => State, applyRemote: (s: State) => Promise<void> }} h */
  function init(h) {
    hooks = h;
    if (isConfigured() && hasStoredSession()) {
      boot(); // fire-and-forget: first render never waits on the network
    }
    window.addEventListener('online', () => {
      if (userId && dirty) schedule();
    });
  }

  /** @param {string} email */
  async function sendCode(email) {
    const c = await getClient();
    const { error } = await c.auth.signInWithOtp({ email });
    if (error) throw error;
  }

  /** @param {string} email @param {string} token */
  async function verifyCode(email, token) {
    const c = await getClient();
    const { data, error } = await c.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw error;
    userId = data.session?.user?.id ?? null;
    userEmail = data.session?.user?.email ?? null;
    setRevision(0); // unknown remote → next push inserts or converges via merge
    setStatus('syncing');
    try {
      await pullAndMerge();
      dirty = true;
      schedule(); // make sure this device's pre-sign-in tasks reach the server
      setStatus('idle');
    } catch {
      setStatus('offline');
    }
  }

  async function signOut() {
    const c = await getClient();
    await c.auth.signOut();
    userId = null;
    userEmail = null;
    localStorage.removeItem(META_KEY);
    setStatus('signed-out');
  }

  return {
    init,
    onLocalSave,
    isConfigured,
    sendCode,
    verifyCode,
    signOut,
    status: () => lastStatus,
    account: () => userEmail,
    /** @param {(s: string) => void} cb */
    onStatus: (cb) => {
      statusListener = cb;
    },
  };
})();

// Top-level const is a global lexical binding, not a globalThis property —
// expose it explicitly so store.js can reference it optionally (and so tests
// that load store.js alone see it as simply absent).
/** @type {any} */ (globalThis).TaskmanaSync = TaskmanaSync;
