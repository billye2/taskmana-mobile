// Swipe-to-action on task rows.
//
// Right = constructive, left = removing, following the mail-app convention.
// Every gesture also exists as a button (inline on desktop, in the per-row
// overflow sheet on touch) — swipe is never the only way to do anything.
const TaskmanaSwipe = (() => {
  const START = 10; // px of movement before committing to scroll or swipe
  const RATIO = 1.5; // horizontal must beat vertical by this much to be a swipe
  const MAX = 96; // travel at which the action is armed
  const RUBBER = 0.35; // resistance past MAX

  /** @type {(row: HTMLElement, dir: 'left' | 'right') => void} */
  let onAction = () => {};

  /** Suppresses the click the browser fires after a gesture ends. */
  let swallowClick = false;

  /** @param {number} width */
  function threshold(width) {
    return Math.min(88, width * 0.25);
  }

  /** @param {HTMLElement} listEl */
  function attach(listEl) {
    /** @type {HTMLElement | null} */
    let fg = null;
    /** @type {HTMLElement | null} */
    let row = null;
    let x0 = 0;
    let y0 = 0;
    let dx = 0;
    let mode = /** @type {'idle' | 'maybe' | 'scroll' | 'swipe'} */ ('idle');
    let armed = false;
    let pointerId = -1;

    /** @param {boolean} animate */
    function reset(animate) {
      if (fg) {
        fg.style.transition = animate ? 'transform 0.18s ease-out' : '';
        fg.style.transform = '';
      }
      row?.classList.remove('swiping', 'armed-lead', 'armed-trail');
      fg = null;
      row = null;
      mode = 'idle';
      armed = false;
      dx = 0;
    }

    listEl.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const target = /** @type {HTMLElement} */ (e.target);
      // Let the real controls have their taps.
      if (target.closest('button, input, .edit-input')) return;
      const candidate = /** @type {HTMLElement | null} */ (target.closest('.task'));
      const candidateFg = candidate?.querySelector('.swipe-fg');
      if (!candidate || !candidateFg || !candidate.querySelector('.swipe-bg')) return;

      row = candidate;
      fg = /** @type {HTMLElement} */ (candidateFg);
      fg.style.transition = '';
      x0 = e.clientX;
      y0 = e.clientY;
      pointerId = e.pointerId;
      mode = 'maybe';
    });

    listEl.addEventListener(
      'pointermove',
      (e) => {
        if (mode === 'idle' || mode === 'scroll' || e.pointerId !== pointerId) return;
        const ddx = e.clientX - x0;
        const ddy = e.clientY - y0;

        if (mode === 'maybe') {
          if (Math.abs(ddy) > START && Math.abs(ddy) >= Math.abs(ddx)) {
            // Vertical intent: hand it back to the browser's scroller.
            mode = 'scroll';
            reset(false);
            return;
          }
          if (Math.abs(ddx) > START && Math.abs(ddx) > Math.abs(ddy) * RATIO) {
            mode = 'swipe';
            // Capture only now — capturing on pointerdown kills native scroll.
            listEl.setPointerCapture(pointerId);
            row?.classList.add('swiping');
          } else {
            return;
          }
        }

        // touch-action: pan-y already gave vertical scrolling to the
        // compositor, so this only cancels the horizontal default.
        e.preventDefault();
        const over = Math.max(0, Math.abs(ddx) - MAX);
        dx = Math.sign(ddx) * (Math.min(Math.abs(ddx), MAX) + over * RUBBER);
        if (fg) fg.style.transform = `translateX(${dx}px)`;

        const nowArmed = Math.abs(dx) >= threshold(row?.offsetWidth ?? 320);
        if (nowArmed !== armed) {
          armed = nowArmed;
          if (armed) navigator.vibrate?.(10);
        }
        row?.classList.toggle('armed-lead', armed && dx > 0);
        row?.classList.toggle('armed-trail', armed && dx < 0);
      },
      { passive: false }
    );

    /** @param {PointerEvent} e */
    function finish(e) {
      if (e.pointerId !== pointerId) return;
      if (mode !== 'swipe') {
        reset(false);
        return;
      }
      const fired = armed;
      const dir = dx > 0 ? 'right' : 'left';
      const target = row;

      // A gesture is always followed by a click on whatever was under the
      // finger. On touch that click opens the inline editor (editableText
      // binds click), so every swipe would leave an open text field behind.
      swallowClick = true;
      setTimeout(() => {
        swallowClick = false;
      }, 350);

      reset(true);
      if (fired && target) onAction(target, dir);
    }

    listEl.addEventListener('pointerup', finish);
    listEl.addEventListener('pointercancel', (e) => {
      if (e.pointerId === pointerId) reset(true);
    });

    listEl.addEventListener(
      'click',
      (e) => {
        if (!swallowClick) return;
        e.stopPropagation();
        e.preventDefault();
      },
      true // capture phase, so it lands before the row's own handlers
    );
  }

  /** @param {(row: HTMLElement, dir: 'left' | 'right') => void} cb */
  function init(cb) {
    onAction = cb;
    for (const listEl of document.querySelectorAll('.task-list[data-swipe]')) {
      // Delegated once per list: rows are destroyed and rebuilt on every
      // render, so per-row listeners would leak and go stale.
      attach(/** @type {HTMLElement} */ (listEl));
    }
  }

  /** True while a just-finished gesture's trailing click is still pending. */
  function isSwallowing() {
    return swallowClick;
  }

  return { init, isSwallowing };
})();
