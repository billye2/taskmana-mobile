// In-app replacements for the browser's alert()/confirm(), plus the toast used
// for feedback that has nowhere else to appear (undo, capacity limits, and
// captures filed to a list you aren't currently looking at).
const TaskmanaUI = (() => {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let toastTimer;

  /** @param {string} id */
  const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

  // ---- toast ----------------------------------------------------------------

  /**
   * @param {string} message
   * @param {{action?: string, onAction?: () => void, timeout?: number}} [opts]
   */
  function toast(message, { action, onAction, timeout = 5000 } = {}) {
    const root = $('toast');
    const text = /** @type {HTMLElement} */ (root.querySelector('.toast-text'));
    const btn = /** @type {HTMLButtonElement} */ (root.querySelector('.toast-action'));

    clearTimeout(toastTimer);
    text.textContent = message;

    // Replace the button outright rather than removing listeners one by one —
    // a stale handler here would fire the previous toast's undo.
    const fresh = /** @type {HTMLButtonElement} */ (btn.cloneNode(false));
    fresh.textContent = action ?? '';
    fresh.hidden = !action;
    if (action && onAction) {
      fresh.addEventListener('click', () => {
        hideToast();
        onAction();
      });
    }
    btn.replaceWith(fresh);

    root.hidden = false;
    // Force a reflow so the transition runs when a toast replaces a toast.
    void root.offsetWidth;
    root.classList.add('show');
    toastTimer = setTimeout(hideToast, timeout);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    const root = $('toast');
    root.classList.remove('show');
    // Stay in the DOM until the fade finishes, then leave the a11y tree.
    toastTimer = setTimeout(() => {
      root.hidden = true;
    }, 200);
  }

  // ---- confirm --------------------------------------------------------------

  /**
   * @param {{title: string, body: string, confirmLabel?: string, danger?: boolean}} opts
   * @returns {Promise<boolean>}
   */
  function confirmSheet({ title, body, confirmLabel = 'Confirm', danger = false }) {
    const dlg = /** @type {HTMLDialogElement} */ ($('confirm-dialog'));
    $('confirm-title').textContent = title;
    $('confirm-body').textContent = body;
    const ok = /** @type {HTMLButtonElement} */ ($('confirm-ok'));
    ok.textContent = confirmLabel;
    ok.classList.toggle('danger', danger);

    dlg.returnValue = '';
    dlg.showModal();

    return new Promise((resolve) => {
      dlg.addEventListener(
        'close',
        // Escape and backdrop taps both land here with an empty returnValue,
        // so anything that isn't an explicit confirm reads as cancel.
        () => resolve(dlg.returnValue === 'confirm'),
        { once: true }
      );
    });
  }

  // ---- sheet plumbing shared by every dialog ---------------------------------

  function initSheets() {
    for (const node of document.querySelectorAll('dialog')) {
      const dlg = /** @type {HTMLDialogElement} */ (node);

      // A <dialog> does not close on a backdrop click by itself. Clicks inside
      // the sheet bubble up from children, so identify the backdrop by testing
      // the point against the dialog's own box rather than by target alone —
      // otherwise a text-selection drag ending outside would close it.
      dlg.addEventListener('click', (e) => {
        if (e.target !== dlg) return;
        const r = dlg.getBoundingClientRect();
        const outside =
          e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right;
        if (outside) dlg.close();
      });

      for (const btn of dlg.querySelectorAll('[data-close]')) {
        btn.addEventListener('click', () => dlg.close());
      }

      // With the keyboard up, a focused field can sit behind it.
      dlg.addEventListener('focusin', (e) => {
        const t = e.target;
        if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
          t.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      });
    }

    $('confirm-ok').addEventListener('click', () => {
      /** @type {HTMLDialogElement} */ ($('confirm-dialog')).close('confirm');
    });
    $('confirm-cancel').addEventListener('click', () => {
      /** @type {HTMLDialogElement} */ ($('confirm-dialog')).close('cancel');
    });

    $('toast').addEventListener('click', (e) => {
      if (!(e.target instanceof HTMLButtonElement)) hideToast();
    });
  }

  return { toast, hideToast, confirmSheet, initSheets };
})();
