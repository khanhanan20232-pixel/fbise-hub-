// FBISE Study Hub — shared client-side behaviour.
// Dark mode, delete confirmations, active nav highlighting, search shortcut,
// admin subject filtering and publish toggling. No dependencies.

(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------------- Dark mode ----------------
     Single source of truth for the theme. The saved value lives in
     localStorage under 'fbise-theme' and is applied as data-theme on <html>. */
  var THEME_KEY = 'fbise-theme';
  var themeBtn = document.getElementById('dark-mode-toggle') || document.getElementById('theme-toggle');

  function savedTheme() {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function paintThemeIcon(theme) {
    if (themeBtn) themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    // Keep the legacy 'dark' class in sync for any older selectors.
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) { /* private mode etc. — theme just won't persist */ }
    paintThemeIcon(theme);
  }

  applyTheme(root.getAttribute('data-theme') || savedTheme());

  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------------- Delete confirmations ---------------- */
  Array.prototype.forEach.call(document.querySelectorAll('form.confirm-delete'), function (form) {
    form.addEventListener('submit', function (e) {
      var msg = form.getAttribute('data-confirm') || 'Are you sure? This cannot be undone.';
      if (!window.confirm(msg)) e.preventDefault();
    });
  });

  /* ---------------- Active nav link ----------------
     Longest matching data-nav wins, so nested pages highlight their section. */
  (function markActiveNav() {
    var path = window.location.pathname;
    var best = null;
    var bestLen = -1;
    Array.prototype.forEach.call(document.querySelectorAll('a[data-nav]'), function (a) {
      var nav = a.getAttribute('data-nav');
      if (!nav) return;
      var match = nav === path || (nav !== '/' && (path === nav || path.indexOf(nav + '/') === 0));
      if (match && nav.length > bestLen) {
        best = a;
        bestLen = nav.length;
      }
    });
    if (best) best.classList.add('active');
  })();

  /* ---------------- Search shortcut ----------------
     Press "/" anywhere (outside a form field) to jump to the search box. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    var box = document.querySelector('input[type="search"][name="q"], input[data-search]');
    if (box) {
      e.preventDefault();
      box.focus();
    }
  });

  /* ---------------- Admin: filter subjects by class ----------------
     Used by the paper and quiz-question forms. Each subject <option>
     carries data-class-id; options for other classes are hidden. */
  (function wireSubjectFilter() {
    var classSel = document.getElementById('class_id');
    var subjSel = document.getElementById('subject_id');
    if (!classSel || !subjSel) return;

    var opts = Array.prototype.slice.call(subjSel.querySelectorAll('option[data-class-id]'));

    function apply() {
      var cid = classSel.value;
      var firstVisible = null;
      opts.forEach(function (o) {
        var show = !cid || o.getAttribute('data-class-id') === cid;
        o.hidden = !show;
        o.disabled = !show;
        if (show && !firstVisible) firstVisible = o;
      });
      var current = subjSel.options[subjSel.selectedIndex];
      if (current && (current.hidden || current.disabled) && firstVisible) {
        subjSel.value = firstVisible.value;
      }
    }

    classSel.addEventListener('change', apply);
    apply();
  })();

  /* ---------------- Admin: publish / unpublish toggle ---------------- */
  Array.prototype.forEach.call(document.querySelectorAll('.toggle-publish'), function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-id');
      btn.disabled = true;
      fetch('/admin/papers/' + encodeURIComponent(id) + '/toggle', {
        method: 'POST',
        headers: { Accept: 'application/json' },
      })
        .then(function (res) {
          if (!res.ok) throw new Error('bad status');
          return res.json();
        })
        .then(function (data) {
          if (!data || !data.ok) throw new Error('toggle failed');
          var published = data.is_published === 1 || data.is_published === true;
          btn.textContent = published ? 'Unpublish' : 'Publish';
          btn.classList.toggle('is-off', !published);
          var row = btn.closest('tr');
          var cell = row && row.querySelector('.pub-status');
          if (cell) {
            cell.innerHTML = published
              ? '<span class="pill pill-on">Published</span>'
              : '<span class="pill pill-off">Draft</span>';
          }
        })
        .catch(function () {
          window.alert('Could not update the paper status. Please try again.');
        })
        .then(function () {
          btn.disabled = false;
        });
    });
  });
})();
