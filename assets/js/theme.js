/* Theme toggle. Dark by default until the visitor picks a theme. */
(function () {
  var KEY = 'theme';
  var root = document.documentElement;

  function stored() {
    try {
      var value = localStorage.getItem(KEY);
      return value === 'dark' || value === 'light' ? value : null;
    } catch (e) {
      return null;
    }
  }

  function current() {
    return root.getAttribute('data-theme') || 'dark';
  }

  function paint(button) {
    var dark = current() === 'dark';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#000000' : '#f6f3ec');
    if (button) button.textContent = dark ? 'Light mode' : 'Dark mode';
  }

  /* Marks the page as scripted so the stylesheet can hold elements back for
     motion.js to bring in. If motion.js never finishes setting up (GSAP
     blocked or offline, motion.js failing, or a page that doesn't load it),
     the mark comes off again and everything shows. */
  root.classList.add('js');
  function releaseIfNoMotion() {
    if (!window.__motion) root.classList.remove('js');
  }
  window.addEventListener('load', releaseIfNoMotion);
  setTimeout(releaseIfNoMotion, 3000);

  /* Runs in <head>, before first paint, so a saved theme never flashes. */
  var saved = stored();
  if (saved) root.setAttribute('data-theme', saved);

  document.addEventListener('DOMContentLoaded', function () {
    var button = document.querySelector('[data-theme-toggle]');
    paint(button);
    if (!button) return;
    button.hidden = false;

    button.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try {
        localStorage.setItem(KEY, next);
      } catch (e) {
        /* Storage blocked: the choice lasts for this page only. */
      }
      paint(button);
    });

  });
})();
