// View routing for the mobile app shell.
//
// The active view lives in the URL hash rather than in memory or in saved
// settings. Two reasons: Android's Back button and iOS's edge-swipe then do
// the expected thing (in-memory state means Back exits the installed app from
// the Inbox tab, which is the most jarring failure available), and it needs no
// change to the persisted State shape.
//
// The last view is deliberately not remembered across cold starts — a task app
// should open on Today.
const TaskmanaNav = (() => {
  const VIEWS = ['today', 'inbox', 'someday', 'more'];
  /** @type {(view: string) => void} */
  let onChange = () => {};

  /** @returns {string} */
  function current() {
    const v = location.hash.slice(1);
    return VIEWS.includes(v) ? v : 'today';
  }

  function apply() {
    document.body.dataset.view = current();
    // Views swap by CSS, so the page keeps whatever scroll offset the last one
    // left behind — jarring when arriving at the top of a fresh list.
    window.scrollTo(0, 0);
    onChange(current());
  }

  /** @param {string} view */
  function go(view) {
    if (view === current()) return;
    location.hash = view; // pushes history, so Back returns to the last tab
  }

  function init() {
    // replaceState, not a hash assignment: a pushed entry would make the first
    // Back press land on the same page with no hash.
    if (!VIEWS.includes(location.hash.slice(1))) {
      history.replaceState(null, '', '#today');
    }
    addEventListener('hashchange', apply);
    apply();
  }

  return {
    VIEWS,
    current,
    go,
    init,
    /** @param {(view: string) => void} cb */
    subscribe: (cb) => {
      onChange = cb;
    },
  };
})();
