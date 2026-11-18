/**
 * department-select.js
 * Department dropdown: neutral trigger (default input look). Option rows use
 * System Settings colors on hover only (see css/department_select.css).
 */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────────────────────────── */

  function findHidden(wrap) {
    var id = wrap.getAttribute('data-dept-input-id');
    if (id) {
      var el = document.getElementById(id);
      if (el) return el;
    }
    return wrap.querySelector('input.dept-value-input');
  }

  /**
   * Normalise any colour string to lowercase 6-digit hex.
   * Returns '#1a7c3e' (the system default green) for anything invalid.
   */
  function normalizeHex6(c) {
    if (c != null && typeof c === 'object' && c.nodeType) return '#1a7c3e';
    var s = (c == null ? '' : String(c)).trim();
    if (/^#([0-9A-Fa-f]{3})$/i.test(s)) {
      var x = s.slice(1);
      s = '#' + x[0] + x[0] + x[1] + x[1] + x[2] + x[2];
    }
    if (/^#([0-9A-Fa-f]{8})$/i.test(s)) {
      s = '#' + s.slice(1, 7);
    }
    if (/^#[0-9A-Fa-f]{6}$/i.test(s)) return s.toLowerCase();
    return '#1a7c3e';
  }

  /* ─────────────────────────────────────────────────────────────────
     TRIGGER — no fill color; matches plain .input-element appearance.
  ───────────────────────────────────────────────────────────────── */

  function clearTriggerPaint(wrap) {
    var outer   = wrap.closest('.input-wrapper');
    var trigger = wrap.querySelector('.dept-custom-trigger');
    var label   = wrap.querySelector('.dept-custom-label');
    var icon    = outer ? outer.querySelector('.input-icon') : null;
    if (!trigger) return;
    trigger.style.backgroundColor = '';
    trigger.style.color           = '';
    trigger.style.borderColor     = '';
    trigger.style.boxShadow       = '';
    trigger.classList.remove('dept-trigger-themed', 'dept-trigger-preview');
    wrap.classList.remove('dept-has-selection');
    wrap.style.removeProperty('--dept-selected');
    if (label) {
      label.style.color = '';
    }
    if (icon) {
      icon.style.color   = '';
      icon.style.opacity = '';
    }
  }

  function restoreSelectedTriggerTheme(wrap) {
    clearTriggerPaint(wrap);
  }

  /* ─────────────────────────────────────────────────────────────────
     DISPLAY / LIST MANAGEMENT
  ───────────────────────────────────────────────────────────────── */

  function setDisplay(wrap, value) {
    var hidden  = findHidden(wrap);
    var label   = wrap.querySelector('.dept-custom-label');
    var text    = (value == null ? '' : String(value)).trim();

    if (label) {
      if (!text) {
        label.textContent = wrap.classList.contains('dept-custom-select--modal') ? 'None' : 'Select department…';
        label.classList.add('dept-custom-placeholder');
      } else {
        label.textContent = text;
        label.classList.remove('dept-custom-placeholder');
      }
    }

    if (hidden) hidden.value = text;

    wrap.querySelectorAll('.dept-custom-option').forEach(function (li) {
      li.setAttribute('aria-selected',
        (li.getAttribute('data-value') || '') === text ? 'true' : 'false');
    });

    clearTriggerPaint(wrap);
  }

  function closeList(wrap) {
    var list    = wrap.querySelector('.dept-custom-list');
    var trigger = wrap.querySelector('.dept-custom-trigger');
    if (list)    list.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    wrap.classList.remove('is-open');
    restoreSelectedTriggerTheme(wrap);
  }

  function buildNoneOption() {
    var li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('tabindex', '-1');
    li.className = 'dept-custom-option dept-option-none';
    li.setAttribute('data-value', '');
    li.textContent = 'None';
    return li;
  }

  /**
   * Rebuild the <ul> from a fresh departments array.
   * Row tint class `css_class` is whitelisted in sanitizeDeptRowClass (matches PHP).
   */
  var DEPT_ROW_CLASS_WHITELIST = {
    'dept-ccs': true,
    'dept-edu': true,
    'dept-hosp': true,
    'dept-arts': true,
    'dept-eng': true,
    'dept-bus': true,
    'dept-nurse': true,
    'dept-from-db': true
  };

  function sanitizeDeptRowClass(c) {
    var s = (c == null ? '' : String(c)).trim();
    return DEPT_ROW_CLASS_WHITELIST[s] ? s : 'dept-from-db';
  }

  function rebuildDeptList(wrap, rows) {
    var list = wrap.querySelector('.dept-custom-list');
    if (!list) return;

    var isModal = wrap.classList.contains('dept-custom-select--modal');
    list.innerHTML = '';
    if (isModal) list.appendChild(buildNoneOption());

    (rows || []).forEach(function (d) {
      var name = d && d.name ? String(d.name).trim() : '';
      if (!name) return;

      // Accept both display_color and color fields from server responses.
      var rawColor = (d.display_color != null ? d.display_color : '') ||
                     (d.color        != null ? d.color         : '') ||
                     '';
      var hex = normalizeHex6(rawColor);
      var rowClass = sanitizeDeptRowClass(d.css_class);

      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('tabindex', '-1');
      li.className = 'dept-custom-option ' + rowClass + ' dept-has-db-color';
      li.style.setProperty('--dept-accent', hex);
      li.setAttribute('data-dept-color', hex);
      li.setAttribute('data-value', name);
      li.textContent = name;

      li.style.transition = 'background-color 0.14s ease, color 0.14s ease';

      list.appendChild(li);
    });

    var hidden = findHidden(wrap);
    if (hidden) {
      setDisplay(wrap, hidden.value);
    }
  }

  function refreshDeptListFromServer(wrap) {
    var url = wrap.getAttribute('data-dept-refresh');
    if (!url) return Promise.resolve();
    return fetch(url, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.success || !Array.isArray(data.departments)) return;
        // Normalise the color field name from the server payload.
        var normalized = data.departments.map(function (d) {
          return {
            name:          d.name,
            display_color: normalizeHex6(d.display_color || d.color || ''),
            css_class:     d.css_class
          };
        });
        rebuildDeptList(wrap, normalized);
      })
      .catch(function () { /* keep existing options on error */ });
  }

  function openList(wrap) {
    // Close any other open dropdowns first.
    document.querySelectorAll('.dept-custom-select.is-open').forEach(function (w) {
      if (w !== wrap) closeList(w);
    });

    var list    = wrap.querySelector('.dept-custom-list');
    var trigger = wrap.querySelector('.dept-custom-trigger');
    var url     = wrap.getAttribute('data-dept-refresh');

    function reveal() {
      if (list)    { list.hidden = false; list.scrollTop = 0; }
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
      wrap.classList.add('is-open');
    }

    if (url) {
      refreshDeptListFromServer(wrap).finally(reveal);
    } else {
      reveal();
    }
  }

  function toggleList(wrap) {
    if (wrap.classList.contains('is-open')) closeList(wrap);
    else openList(wrap);
  }

  /* ─────────────────────────────────────────────────────────────────
     INIT
  ───────────────────────────────────────────────────────────────── */

  function initWrap(wrap) {
    var hidden  = findHidden(wrap);
    var trigger = wrap.querySelector('.dept-custom-trigger');
    var list    = wrap.querySelector('.dept-custom-list');
    if (!hidden || !trigger || !list) return;

    setDisplay(wrap, hidden.value);

    hidden.addEventListener('change', function () {
      setDisplay(wrap, hidden.value);
    });

    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      toggleList(wrap);
    });

    list.addEventListener('click', function (e) {
      var li = e.target.closest('.dept-custom-option');
      if (!li) return;
      e.stopPropagation();
      var val = li.getAttribute('data-value') || '';
      setDisplay(wrap, val);
      closeList(wrap);
      hidden.dispatchEvent(new Event('input',  { bubbles: true }));
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Prevent clicks inside the widget from bubbling to the document
    // close-on-outside-click handler.
    wrap.addEventListener('click', function (e) { e.stopPropagation(); });
  }

  // Expose rebuildDeptList so settings.js refreshAllDeptDropdowns can call it
  // after department CRUD operations without a full page reload.
  window._deptSelectRebuild = function (wrap, rows) {
    rebuildDeptList(wrap, rows);
  };

  document.querySelectorAll('.dept-custom-select').forEach(initWrap);

  // Close all dropdowns when clicking outside.
  document.addEventListener('click', function () {
    document.querySelectorAll('.dept-custom-select.is-open').forEach(function (w) {
      closeList(w);
    });
  });

})();