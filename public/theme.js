(function () {
  var COOKIE = 'vault-theme';

  function getTheme() {
    var m = document.cookie.match(/(?:^|;\s*)vault-theme=([^;]*)/);
    return (m && m[1] === 'dark') ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function saveTheme(theme) {
    // Max-Age of ~400 days (Chrome's cap); effectively permanent
    document.cookie = COOKIE + '=' + theme + '; max-age=34560000; path=/; SameSite=Strict';
    applyTheme(theme);
    updateIcon(theme);
  }

  var SUN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">'
    + '<path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clip-rule="evenodd"/>'
    + '</svg>';

  var MOON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">'
    + '<path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>'
    + '</svg>';

  function updateIcon(theme) {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    // In dark mode show sun (click to go light); in light mode show moon (click to go dark)
    btn.innerHTML = theme === 'dark' ? SUN_SVG : MOON_SVG;
    btn.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  }

  function injectButton() {
    var btn = document.createElement('button');
    btn.id = 'theme-toggle';
    btn.className = 'btn btn-icon';
    btn.setAttribute('aria-label', 'Toggle theme');

    var actions = document.querySelector('.vault-header-actions');
    if (actions) {
      actions.insertBefore(btn, actions.firstChild);
    } else {
      btn.classList.add('theme-toggle-float');
      document.body.appendChild(btn);
    }

    var theme = getTheme();
    updateIcon(theme);

    btn.addEventListener('click', function () {
      saveTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }
})();
