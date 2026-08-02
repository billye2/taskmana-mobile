// Keeps the fixed bottom dock above the soft keyboard.
//
// iOS Safari does not resize the layout viewport when the keyboard opens, so a
// `position: fixed; bottom: 0` element stays pinned to the layout viewport and
// ends up underneath it. Only visualViewport reports the real thing.
//
// env(keyboard-inset-height) is not an option: it needs the VirtualKeyboard
// API, which is Chromium-only and will never fire on the target device.
(() => {
  const vv = window.visualViewport;
  if (!vv) return;
  const vp = vv; // narrowed for the closures below

  function sync() {
    // offsetTop matters as well as height: with the keyboard up the visual
    // viewport can be scrolled within the layout viewport.
    const inset = Math.max(0, window.innerHeight - vp.height - vp.offsetTop);
    document.documentElement.style.setProperty('--kb-inset', `${Math.round(inset)}px`);
    // A threshold, not `inset > 0` — browser chrome collapsing on scroll moves
    // the visual viewport by a few px and must not read as a keyboard.
    document.body.classList.toggle('kb-open', inset > 120);
  }

  vp.addEventListener('resize', sync);
  vp.addEventListener('scroll', sync);
  sync();
})();
