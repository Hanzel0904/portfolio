/**
 * Employee directory: registration date / date range filter (GET navigation).
 */
(function () {
  'use strict';

  var dropdown = document.getElementById('empRegDateDropdown');
  var toggle = document.getElementById('empRegDateToggle');
  var panel = document.getElementById('empRegDatePanel');
  var fromInput = document.getElementById('emp-reg-date-from');
  var toInput = document.getElementById('emp-reg-date-to');
  var rangeEnable = document.getElementById('emp-reg-date-range-enable');
  var toRow = document.getElementById('emp-reg-date-to-row');
  var applyBtn = document.getElementById('empRegDateApply');
  var clearBtn = document.getElementById('empRegDateClear');

  if (!toggle || !panel || !fromInput) return;

  function closePanel() {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }

  function openPanel() {
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  }

  function togglePanel() {
    if (panel.hidden) openPanel();
    else closePanel();
  }

  function syncToRow() {
    if (!toRow || !rangeEnable) return;
    toRow.hidden = !rangeEnable.checked;
  }

  function buildEmpUrl(overrides) {
    var u = new URL(window.location.href);
    var params = new URLSearchParams(u.search);
    var keys = ['q', 'dept', 'archive', 'date_from', 'date_to', 'show_end_date', 'page'];
    keys.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(overrides, k)) {
        var v = overrides[k];
        if (v === '' || v === null || v === undefined) params.delete(k);
        else params.set(k, String(v));
      }
    });
    if (params.get('page') === '1') params.delete('page');
    if (params.get('dept') === '') params.delete('dept');
    if (params.get('q') === '') params.delete('q');
    if (params.get('date_from') === '') params.delete('date_from');
    if (params.get('date_to') === '') params.delete('date_to');
    if (params.get('show_end_date') === '' || params.get('show_end_date') === '0') params.delete('show_end_date');
    var qs = params.toString();
    return qs ? 'employee_management.php?' + qs : 'employee_management.php';
  }

  function applyFilter() {
    var from = (fromInput.value || '').trim();
    if (!from) {
      window.alert('Please select a registration date.');
      fromInput.focus();
      return;
    }
    var overrides = { date_from: from, page: '1' };
    if (rangeEnable && rangeEnable.checked) {
      var to = (toInput && toInput.value) ? toInput.value.trim() : '';
      if (!to) {
        window.alert('Please select an end date for the range.');
        if (toInput) toInput.focus();
        return;
      }
      overrides.date_to = to;
      overrides.show_end_date = '1';
    } else {
      overrides.date_to = '';
      overrides.show_end_date = '';
    }
    window.location.href = buildEmpUrl(overrides);
  }

  function clearFilter() {
    window.location.href = buildEmpUrl({
      date_from: '',
      date_to: '',
      show_end_date: '',
      page: '1',
    });
  }

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    togglePanel();
  });

  if (dropdown) {
    dropdown.addEventListener('click', function (e) {
      e.stopPropagation();
    });
  }

  document.addEventListener('click', function () {
    closePanel();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePanel();
  });

  if (rangeEnable) {
    rangeEnable.addEventListener('change', syncToRow);
    syncToRow();
  }

  if (applyBtn) applyBtn.addEventListener('click', applyFilter);
  if (clearBtn) clearBtn.addEventListener('click', clearFilter);
})();
