// Keeps the UI clear of the soft keyboard.
//
// iOS Safari does not resize the layout viewport when the keyboard opens, so
// `position: fixed; bottom: 0` elements stay pinned to the layout viewport and
// end up underneath it, and page content can't be scrolled past it. Only
// visualViewport reports the real thing.
//
// env(keyboard-inset-height) is not an option: it needs the VirtualKeyboard
// API, which is Chromium-only and will never fire on the target device.
const TaskmanaViewport = (() => {
  /**
   * Scroll a focused field out from behind the keyboard.
   *
   * Fields inside the fixed dock or inside a sheet need nothing — the dock
   * translates by --kb-inset and sheets anchor to the top edge, clear of the
   * keyboard entirely. This is for fields in the
   * scrolling page, i.e. the inline task editor, which otherwise opens
   * underneath the keyboard with no way to bring it into view.
   *
   * scrollIntoView is not enough on its own: it centres within the *layout*
   * viewport, which iOS doesn't shrink for the keyboard, so "centred" can
   * still be behind it.
   *
   * @param {number} inset
   */
  function keepFocusVisible(inset) {
    if (inset <= 0) return;
    const node = document.activeElement;
    if (!(node instanceof HTMLElement)) return;
    if (!node.matches('input, textarea, [contenteditable]')) return;
    if (node.closest('.bottom-dock, dialog')) return;

    const appbar = document.querySelector('.appbar');
    const top = appbar ? appbar.getBoundingClientRect().bottom : 0;
    const bottom = window.innerHeight - inset;
    const r = node.getBoundingClientRect();

    if (r.bottom > bottom - 12) {
      window.scrollBy({ top: r.bottom - bottom + 24, behavior: 'smooth' });
    } else if (r.top < top + 12) {
      window.scrollBy({ top: r.top - top - 24, behavior: 'smooth' });
    }
  }

  let lastInset = 0;

  /**
   * Publish the keyboard inset and react to it. Exported so tests can drive
   * the real code path — Playwright cannot raise a soft keyboard, and a test
   * that only set the CSS variable would exercise none of this.
   * @param {number} inset
   */
  function applyInset(inset) {
    // Belt for measure()'s braces: iOS leaves visualViewport offset after some
    // keyboard dismissals, and no soft keyboard takes more than ~60% of the
    // screen — anything bigger is a measurement artefact, not a keyboard.
    inset = Math.min(inset, window.innerHeight * 0.6);
    document.documentElement.style.setProperty('--kb-inset', `${Math.round(inset)}px`);
    // A threshold, not `inset > 0` — browser chrome collapsing on scroll moves
    // the visual viewport by a few px and must not read as a keyboard.
    document.body.classList.toggle('kb-open', inset > 120);

    // Dismissing the keyboard with its own Done/✓ key hides it *without*
    // blurring the field, so an inline editor's blur-to-commit never fires and
    // the row appears stuck as a text box until you press Enter. Treat the
    // keyboard closing as the end of editing.
    if (lastInset > 120 && inset <= 120) {
      const node = document.activeElement;
      if (node instanceof HTMLElement && node.classList.contains('edit-input')) node.blur();
    }
    lastInset = inset;

    keepFocusVisible(inset);
  }

  const vv = window.visualViewport;

  function measure() {
    if (!vv) return 0;
    // Pinch or iOS auto-zoom shrinks vv.height with no keyboard anywhere —
    // height/offset arithmetic is meaningless while zoomed, and a phantom
    // "keyboard" here is exactly what crushed every sheet to a sliver.
    if (vv.scale > 1.05) return 0;
    // offsetTop matters as well as height: with the keyboard up the visual
    // viewport can be scrolled within the layout viewport.
    return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  }

  if (vv) {
    const sync = () => applyInset(measure());
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    // The keyboard opens after focus, so a viewport event usually follows —
    // but a field focused while the keyboard is already up gets none.
    document.addEventListener('focusin', sync);
    sync();
  }

  return { applyInset, measure, keepFocusVisible };
})();
