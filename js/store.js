// Storage layer: localStorage under a single key.

// Classic script (not an ES module) so the app has no build step — every file
// is a plain <script> and top-level consts are the cross-file namespace.
const TaskmanaStore = (() => {
  const KEY = 'taskmana-state';

  /** @returns {Promise<State | null>} */
  async function load() {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  }

  /** @param {State} state */
  async function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      // Quota exceeded, or Safari private mode where setItem always throws.
      // Keep going — the in-memory state is still correct and sync may carry it.
      console.error('taskmana: could not save state', err);
    }
    // Optional sync layer (js/sync.js); absent in tests and when signed out.
    /** @type {any} */ (globalThis).TaskmanaSync?.onLocalSave?.();
  }

  return { load, save };
})();
