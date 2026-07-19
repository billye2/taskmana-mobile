// Storage layer: chrome.storage.local inside the extension, localStorage when
// newtab.html is opened as a plain page (development / preview).

// Classic script (not an ES module) so newtab.html also works opened straight
// from file://, where module imports are blocked by CORS.
const TaskmanaStore = (() => {
  const KEY = 'taskmana-state';

  const hasChromeStorage =
    typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  /** @returns {Promise<State | null>} */
  async function load() {
    if (hasChromeStorage) {
      const res = await chrome.storage.local.get(KEY);
      return res[KEY] ?? null;
    }
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  }

  /** @param {State} state */
  async function save(state) {
    if (hasChromeStorage) {
      await chrome.storage.local.set({ [KEY]: state });
    } else {
      localStorage.setItem(KEY, JSON.stringify(state));
    }
  }

  return { load, save };
})();
