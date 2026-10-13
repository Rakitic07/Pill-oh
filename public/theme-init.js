// Applies the saved theme before first paint. Kept as a file (not inline) so the CSP can forbid inline scripts.
(function () {
  var root = document.documentElement;
  try {
    var theme = JSON.parse(localStorage.getItem('pill-oh.theme')) || 'ember';
    root.dataset.theme = theme;
    if (theme === 'custom') {
      var vars = JSON.parse(localStorage.getItem('pill-oh.customVars') || '{}');
      for (var k in vars) {
        if (/^(--[a-z0-9-]+|color-scheme)$/.test(k) && /^[#a-z0-9(),. ]+$/i.test(vars[k])) {
          root.style.setProperty(k, vars[k]);
        }
      }
    }
  } catch (e) {
    root.dataset.theme = 'ember';
  }
})();
