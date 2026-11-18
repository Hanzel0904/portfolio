/**
 * Employee directory: debounced AJAX search (no reload), preserves focus.
 * Department filter uses plain links in the markup.
 */
(function () {
  'use strict';

  var searchInput = document.getElementById('employeeSearchInput');
  var dropdown = document.getElementById('directoryFilterDropdown');
  var toggle = document.getElementById('directoryFilterToggle');
  var panel = document.getElementById('directoryFilterPanel');
  var tableBody = document.getElementById('employeeTableBody');
  var deckFaceValue = document.getElementById('deckFaceValue');
  var deckStatusLabel = document.getElementById('deckStatusLabel');
  var deckStatusValue = document.getElementById('deckStatusValue');

  if (!searchInput) return;

  // Store defaults so we can restore deck labels/values when q is cleared.
  var defaultStatusLabel = deckStatusLabel ? deckStatusLabel.textContent : '';
  var defaultStatusValue = deckStatusValue ? deckStatusValue.textContent : '';
  var defaultFaceValue = deckFaceValue ? deckFaceValue.textContent : '';

  function buildUrl(q) {
    var u = new URL(window.location.href);
    var params = new URLSearchParams();
    var dept = u.searchParams.get('dept');
    if (q) {
      params.set('q', q);
    }
    if (dept) {
      params.set('dept', dept);
    }
    if (u.searchParams.has('archive')) {
      params.set('archive', u.searchParams.get('archive') || '');
    }
    if (u.searchParams.get('date_from')) {
      params.set('date_from', u.searchParams.get('date_from'));
    }
    if (u.searchParams.get('date_to')) {
      params.set('date_to', u.searchParams.get('date_to'));
    }
    if (u.searchParams.get('show_end_date') === '1') {
      params.set('show_end_date', '1');
    }
    var qs = params.toString();
    return qs ? 'employee_management.php?' + qs : 'employee_management.php';
  }

  function setUrl(q) {
    try {
      var url = buildUrl(q);
      window.history.replaceState({}, '', url);
    } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function badgeHtml(status) {
    var isActive = String(status || '').toLowerCase() !== 'inactive';
    var cls = isActive ? 'badge-active' : 'badge-inactive';
    var label = isActive ? 'Active' : 'Inactive';
    return '<span class="badge ' + cls + '">' + label + '</span>';
  }

  function enrollmentHtml(hasFace, hasQr) {
    var out = '<div style="display:flex;align-items:center;justify-content:flex-start;gap:10px;min-height:28px;">';
    if (hasFace) {
      out += '<span title="Face enrolled" aria-label="Face enrolled" style="width:42px;height:26px;border-radius:999px;background:#dcfce7;border:1px solid #86efac;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;letter-spacing:0.4px;color:#0f5132;font-family:inherit;">FACE</span>';
    }
    if (hasQr) {
      out += '<span title="QR assigned" aria-label="QR assigned" style="width:38px;height:26px;border-radius:999px;background:#dcfce7;border:1px solid #86efac;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;letter-spacing:0.4px;color:#0f5132;font-family:inherit;">QR</span>';
    }
    if (!hasFace && !hasQr) out += '<span style="color:#94a3b8;">—</span>';
    out += '</div>';
    return out;
  }

  function renderRows(rows) {
    if (!tableBody) return;
    if (!rows || rows.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" class="table-empty">No employees match your search.</td></tr>';
      return;
    }
    tableBody.innerHTML = rows.map(function (r) {
      var dept = r.department_name && String(r.department_name).trim() ? r.department_name : '—';
      var pos = r.position_name && String(r.position_name).trim() ? r.position_name : '—';
      var email = r.email || '';
      var statusLabel = String(r.status || 'active').toLowerCase() === 'inactive' ? 'Inactive' : 'Active';

      return (
        '<tr class="employee-directory-row"' +
          ' data-id="' + esc(r.id) + '"' +
          ' data-name="' + esc(r.full_name || '') + '"' +
          ' data-employee-id="' + esc(r.employee_id || '') + '"' +
          ' data-email="' + esc(email) + '"' +
          ' data-department="' + esc(dept) + '"' +
          ' data-position="' + esc(pos) + '"' +
          ' data-status="' + esc(statusLabel) + '"' +
          ' data-enrollment="' + esc((r.has_face ? 'Face, ' : '') + (r.has_qr ? 'QR' : '')) + '"' +
        '>' +
          '<td>' +
            '<div class="employee-cell">' +
              '<div class="avatar"><span class="avatar-initials">' + esc(r.initials || '—') + '</span></div>' +
              '<div>' +
                '<div class="employee-name">' + esc(r.full_name || '') + '</div>' +
                '<div class="employee-id">' + esc(r.employee_id || '') + '</div>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td>' +
            '<div class="dept-cell">' +
              '<svg class="icon" viewBox="0 0 24 24"><use href="#ico-building"/></svg>' +
              '<div><div class="dept-name">' + esc(dept) + '</div><div class="dept-title">' + esc(pos) + '</div></div>' +
            '</div>' +
          '</td>' +
          '<td><div class="contact-cell"><div class="email"><svg class="icon" viewBox="0 0 24 24"><use href="#ico-envelope"/></svg> ' + esc(email) + '</div></div></td>' +
          '<td>' + enrollmentHtml(!!r.has_face, !!r.has_qr) + '</td>' +
          '<td>' + badgeHtml(r.status) + '</td>' +
          '<td><button type="button" class="actions-btn" aria-label="Actions"><svg class="icon" viewBox="0 0 24 24"><use href="#ico-ellipsis"/></svg></button></td>' +
        '</tr>'
      );
    }).join('');
  }

  var inFlight = null;
  function runSearch(q) {
    if (!tableBody) return;
    setUrl(q);
    if (inFlight && typeof inFlight.abort === 'function') inFlight.abort();
    var ctrl = new AbortController();
    inFlight = ctrl;

    var u = new URL('ajax/employee_search.php', window.location.href);
    if (q) u.searchParams.set('q', q);
    var cur = new URL(window.location.href);
    if (cur.searchParams.get('dept')) u.searchParams.set('dept', cur.searchParams.get('dept'));
    if (cur.searchParams.has('archive')) u.searchParams.set('archive', cur.searchParams.get('archive') || '');
    if (cur.searchParams.get('date_from')) u.searchParams.set('date_from', cur.searchParams.get('date_from'));
    if (cur.searchParams.get('date_to')) u.searchParams.set('date_to', cur.searchParams.get('date_to'));
    if (cur.searchParams.get('show_end_date') === '1') u.searchParams.set('show_end_date', '1');

    fetch(u.toString(), { signal: ctrl.signal, cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.success) throw new Error((data && data.error) ? data.error : 'Search failed.');
        renderRows(data.rows || []);
        if (deckStatusLabel && deckStatusValue) {
          if (q) {
            deckStatusLabel.textContent = 'Results';
            deckStatusValue.textContent = String(data.total || 0);
          } else {
            deckStatusLabel.textContent = defaultStatusLabel;
            deckStatusValue.textContent = defaultStatusValue;
          }
        }
        if (deckFaceValue) {
          deckFaceValue.textContent = q ? String(data.withFace || 0) : defaultFaceValue;
        }
      })
      .catch(function (e) {
        if (e && e.name === 'AbortError') return;
        tableBody.innerHTML = '<tr><td colspan="6" class="table-empty" style="color:#991b1b">Search failed. Please try again.</td></tr>';
      });
  }

  var t = null;
  searchInput.addEventListener('input', function () {
    clearTimeout(t);
    t = setTimeout(function () {
      var q = (searchInput.value || '').trim();
      runSearch(q);
    }, 450);
  });

  searchInput.addEventListener('search', function () {
    clearTimeout(t);
    var q = (searchInput.value || '').trim();
    runSearch(q);
  });

  function closeFilterPanel() {
    if (!panel || !toggle) return;
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }

  function openFilterPanel() {
    if (!panel || !toggle) return;
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  }

  function toggleFilterPanel() {
    if (!panel || !toggle) return;
    if (panel.hidden) {
      openFilterPanel();
    } else {
      closeFilterPanel();
    }
  }

  if (toggle && panel) {
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleFilterPanel();
    });

    document.addEventListener('click', function () {
      closeFilterPanel();
    });

    if (dropdown) {
      dropdown.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeFilterPanel();
    });
  }
})();
