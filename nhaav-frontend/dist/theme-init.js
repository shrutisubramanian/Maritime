/*
 * Theme boot: apply the persisted theme BEFORE first paint.
 *
 * This used to be an inline <script> in index.html. It now lives in its own
 * file so the production Content-Security-Policy can forbid inline scripts
 * (`script-src 'self'`) without a nonce or 'unsafe-inline'. A classic
 * (non-deferred) script in <head> still runs synchronously, so the correct
 * class is present for the very first paint and no theme flash occurs.
 *
 * Must stay in sync with the localStorage key and default in
 * src/context/ThemeContext.tsx.
 */
(function () {
  var theme = 'light';
  try {
    var saved = localStorage.getItem('nhaav_theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch (e) {
    /* storage unavailable (private mode) - fall back to light */
  }
  var root = document.documentElement;
  root.classList.add(theme);
  root.classList.remove(theme === 'dark' ? 'light' : 'dark');
  root.style.colorScheme = theme;
})();
