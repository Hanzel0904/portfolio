(function () {
  var pdfGrid = window.PLP_RANGE_PDF_GRID || null;
  var overlay = document.getElementById('pdfModalOverlay');
  var openBtn = document.getElementById('openPdfModalBtn');
  var closeBtn = document.getElementById('closePdfModalBtn');
  var cancelBtn = document.getElementById('cancelPdfModalBtn');
  var downloadBtn = document.getElementById('downloadPdfBtn');
  if (!overlay || !openBtn) return;

  var logos = { l1: 'assets/pasig_seal.png', l2: 'assets/pasig_logo.png', l3: 'assets/logo.png' };
  var defaultLogos = { l1: logos.l1, l2: logos.l2, l3: logos.l3 };
  var LOGO_STORE_KEY = 'plp_records_pdf_logos_v1';
  var undoBtn = document.getElementById('pdfLogoUndoBtn');
  var redoBtn = document.getElementById('pdfLogoRedoBtn');
  var resetBtn = document.getElementById('pdfLogoResetBtn');
  var logoHistory = [];
  var logoHistoryIdx = -1;

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function logoEl(key, label) {
    if (logos[key]) return '<img src="' + logos[key] + '" alt="' + esc(label) + '" />';
    return '<div class="doc-logo-placeholder">' + esc(label) + '</div>';
  }

  function cloneLogos() {
    return { l1: String(logos.l1 || ''), l2: String(logos.l2 || ''), l3: String(logos.l3 || '') };
  }

  function savePersistedLogos() {
    try { localStorage.setItem(LOGO_STORE_KEY, JSON.stringify(cloneLogos())); } catch (e) {}
  }

  function loadPersistedLogos() {
    try {
      var raw = localStorage.getItem(LOGO_STORE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      return { l1: String(obj.l1 || ''), l2: String(obj.l2 || ''), l3: String(obj.l3 || '') };
    } catch (e) { return null; }
  }

  function applyLogos(state) {
    if (!state) return;
    logos.l1 = String(state.l1 || '');
    logos.l2 = String(state.l2 || '');
    logos.l3 = String(state.l3 || '');
    ['l1', 'l2', 'l3'].forEach(function (key, idx) {
      var prev = document.getElementById('prev-' + key);
      if (!prev) return;
      if (logos[key]) prev.innerHTML = '<img src="' + logos[key] + '" />';
      else prev.innerHTML = '<div class="doc-logo-placeholder">LOGO ' + (idx + 1) + '</div>';
    });
    renderPdfPreview();
  }

  function syncLogoHistoryButtons() {
    if (undoBtn) undoBtn.disabled = !(logoHistoryIdx > 0);
    if (redoBtn) redoBtn.disabled = !(logoHistoryIdx >= 0 && logoHistoryIdx < logoHistory.length - 1);
  }

  function pushLogoHistory() {
    var snap = cloneLogos();
    if (logoHistoryIdx < logoHistory.length - 1) logoHistory = logoHistory.slice(0, logoHistoryIdx + 1);
    logoHistory.push(snap);
    logoHistoryIdx = logoHistory.length - 1;
    syncLogoHistoryButtons();
    savePersistedLogos();
  }

  /** Same header markup as single-date PDF in records.php */
  function buildDocHeaderHtml(ceremonyLabel, dateLine, office, city, dept, addr, landline, email) {
    return '<div class="doc-header">' +
      '<div class="doc-logos-left">' + logoEl('l1', 'LOGO 1') + logoEl('l2', 'LOGO 2') + logoEl('l3', 'LOGO 3') + '</div>' +
      '<div class="doc-right-info"><div class="doc-right-city">' + esc(city) + '</div><div class="doc-right-dept">' + esc(dept) + '</div><div class="doc-right-addr">&#9679; ' + esc(addr) + '<br>&#9742; ' + esc(landline) + ' &nbsp;|&nbsp; &#9993; ' + esc(email) + '</div></div>' +
      '</div>' +
      '<hr class="doc-divider" />' +
      '<div class="doc-ceremony-title">ATTENDANCE FOR ' + esc(ceremonyLabel).toUpperCase() + '</div>' +
      '<div class="doc-date-line"><strong>DATE:</strong> ' + esc(dateLine) + '</div>' +
      '<div class="doc-office-line">NAME OF OFFICE: <strong>' + esc(office) + '</strong></div>' +
      '<div class="doc-instr">Please put a check (\u2713) in the opposite box if present; if absent write <strong>A</strong> and if late write <strong>L</strong>.</div>';
  }

  function buildDocFooterHtml(rec, headOfOfficeName) {
    return '<div class="doc-footer-txt">Recorded by ' + esc(rec) + '<br>Attendance checked/monitored by:</div>' +
      '<div class="doc-sig-area"><div class="doc-sig-line"><div class="doc-sig-name">' + esc(headOfOfficeName) + '</div><div class="doc-sig-caption">Signature Over Printed Name<br>Head of Office</div></div></div>' +
      '<div class="doc-note">* All erasures / corrections shall be countersigned by the HRD Head</div>';
  }

  function wrapDocSheet(headerHtml, bodyHtml) {
    return '<table class="doc-sheet" role="presentation" aria-hidden="true"><thead><tr><td>' + headerHtml + '</td></tr></thead><tbody><tr><td>' + bodyHtml + '</td></tr></tbody></table>';
  }

  /** P (internal) → check mark; L and A unchanged (same as single-date PDF). */
  function formatGridMark(mark) {
    var m = String(mark || 'A').toUpperCase();
    if (m === 'P') return '\u2713';
    if (m === 'L') return 'L';
    return 'A';
  }

  function isClassicPdfMode() {
    return !!(pdfGrid && pdfGrid.display_mode === 'classic');
  }

  function columnCeremonyClass(col) {
    var code = String((col && col.ceremony_code) || '').toLowerCase();
    if (code === 'flag_raising') return 'col-flag-raising';
    if (code === 'flag_retreat') return 'col-flag-retreat';
    return '';
  }

  function buildFlagRangeLegendHtml(columns) {
    var hasRaising = false;
    var hasRetreat = false;
    (columns || []).forEach(function (c) {
      var cls = columnCeremonyClass(c);
      if (cls === 'col-flag-raising') hasRaising = true;
      if (cls === 'col-flag-retreat') hasRetreat = true;
    });
    if (!hasRaising && !hasRetreat) return '';

    var items = [];
    if (hasRaising) {
      items.push(
        '<span class="flag-range-legend-item">' +
          '<span class="flag-range-legend-swatch col-flag-raising" aria-hidden="true"></span>' +
          '<span class="flag-range-legend-text flag-range-legend-text--raising">Flag Raising</span>' +
        '</span>'
      );
    }
    if (hasRetreat) {
      items.push(
        '<span class="flag-range-legend-item">' +
          '<span class="flag-range-legend-swatch col-flag-retreat" aria-hidden="true"></span>' +
          '<span class="flag-range-legend-text flag-range-legend-text--retreat">Flag Retreat</span>' +
        '</span>'
      );
    }
    return (
      '<div class="flag-range-legend" role="note">' +
      '<div class="flag-range-legend-label">Legend</div>' +
      '<div class="flag-range-legend-items">' +
      items.join('') +
      '</div></div>'
    );
  }

  /** Original single-date PDF layout (No., Name, PRESENT, ABSENT/LATE). */
  function buildClassicPdfHtml() {
    var city = (document.getElementById('city-name') || {}).value || '';
    var dept = (document.getElementById('department-name') || {}).value || '';
    var addr = (document.getElementById('address-line') || {}).value || '';
    var landline = (document.getElementById('landline-line') || {}).value || '';
    var email = (document.getElementById('email-line') || {}).value || '';
    var office = (document.getElementById('office-name') || {}).value || '';
    var docDateEl = document.getElementById('doc-date');
    var rec = (document.getElementById('recorded-by') || {}).value || '';
    var headOfOfficeName = (document.getElementById('head-of-office-name') || {}).value || '';
    var ceremonyLabel = (pdfGrid && pdfGrid.ceremony_title) ? pdfGrid.ceremony_title : 'ALL CEREMONIES';
    var docDate = (docDateEl && docDateEl.value) ? docDateEl.value : '';
    if (!docDate && pdfGrid && pdfGrid.classic_date_label) {
      docDate = pdfGrid.classic_date_label;
    }
    if (!docDate && pdfGrid && pdfGrid.date_range_label) {
      docDate = pdfGrid.date_range_label;
    }
    if (docDate && /^\d{4}-\d{2}-\d{2}$/.test(docDate)) {
      try {
        var p = docDate.split('-');
        var dt = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
        if (!isNaN(dt.getTime())) {
          docDate = dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
        }
      } catch (e) {}
    }

    var classicRows = (pdfGrid && pdfGrid.classic_rows) ? pdfGrid.classic_rows : [];
    var rowsHtml = classicRows.map(function (r, idx) {
      var presentMark = r.present ? '\u2713' : '';
      var absentLateMark = r.remark || '';
      return '<tr>' +
        '<td class="center">' + esc(String(r.no || (idx + 1))) + '</td>' +
        '<td>' + esc(r.name || '') + '</td>' +
        '<td class="center"><strong>' + presentMark + '</strong></td>' +
        '<td class="center"><strong>' + esc(absentLateMark) + '</strong></td>' +
        '</tr>';
    }).join('');

    var tableHead = '<tr><th style="width:36px">No.</th><th class="left">Name of Employee</th><th style="width:110px">PRESENT</th><th style="width:130px">ABSENT/ LATE</th></tr>';

    var columns = (pdfGrid && pdfGrid.columns) ? pdfGrid.columns : [];
    var legendHtml = buildFlagRangeLegendHtml(columns);

    var headerHtml = buildDocHeaderHtml(ceremonyLabel, docDate, office, city, dept, addr, landline, email);
    var bodyHtml =
      '<table class="doc-att-table"><thead>' + tableHead + '</thead><tbody>' +
      (rowsHtml || '<tr><td colspan="4">No records found.</td></tr>') +
      '</tbody></table>' +
      legendHtml +
      buildDocFooterHtml(rec, headOfOfficeName);

    return wrapDocSheet(headerHtml, bodyHtml);
  }

  function buildFlagRangeGridHtml() {
    var city = (document.getElementById('city-name') || {}).value || '';
    var dept = (document.getElementById('department-name') || {}).value || '';
    var addr = (document.getElementById('address-line') || {}).value || '';
    var landline = (document.getElementById('landline-line') || {}).value || '';
    var email = (document.getElementById('email-line') || {}).value || '';
    var office = (document.getElementById('office-name') || {}).value || '';
    var rec = (document.getElementById('recorded-by') || {}).value || '';
    var headOfOfficeName = (document.getElementById('head-of-office-name') || {}).value || '';
    var ceremonyLabel = (pdfGrid && pdfGrid.ceremony_title) ? pdfGrid.ceremony_title : 'ALL CEREMONIES';
    var dateRangeLabel = (pdfGrid && pdfGrid.date_range_label) ? pdfGrid.date_range_label : '';
    var columns = (pdfGrid && pdfGrid.columns) ? pdfGrid.columns : [];
    var monthSpans = (pdfGrid && pdfGrid.month_spans) ? pdfGrid.month_spans : [];
    var rows = (pdfGrid && pdfGrid.rows) ? pdfGrid.rows : [];

    var monthHead = monthSpans.map(function (m) {
      return '<th class="month-row-th" colspan="' + (m.count || 1) + '">' + esc(m.label || '') + '</th>';
    }).join('');
    var dayHead = columns.map(function (c) {
      var colCls = columnCeremonyClass(c);
      return '<th' + (colCls ? ' class="' + colCls + '"' : '') + '>' + esc(String(c.day || '')) + '</th>';
    }).join('');
    var bodyRows = rows.map(function (r, idx) {
      var cells = (r.marks || []).map(function (mark, colIdx) {
        var colCls = columnCeremonyClass(columns[colIdx]);
        return '<td class="center' + (colCls ? ' ' + colCls : '') + '"><strong>' + esc(formatGridMark(mark)) + '</strong></td>';
      }).join('');
      var no = r.no || (idx + 1);
      return '<tr><td class="center col-no">' + esc(String(no)) + '</td><td class="name-col">' + esc(r.name || '') + '</td>' + cells + '</tr>';
    }).join('');

    var gridTable = '';
    if (columns.length) {
      gridTable =
        '<table class="flag-range-grid doc-att-table"><thead>' +
        '<tr class="month-row"><th class="col-no" rowspan="2">No.</th><th class="name-col" rowspan="2">Name of Employee</th>' + monthHead + '</tr>' +
        '<tr class="day-row">' + dayHead + '</tr></thead><tbody>' +
        (bodyRows || '<tr><td class="col-no"></td><td class="name-col" colspan="' + (columns.length + 1) + '">No employees found.</td></tr>') +
        '</tbody></table>';
    }

    var headerHtml = buildDocHeaderHtml(ceremonyLabel, dateRangeLabel, office, city, dept, addr, landline, email);
    var legendHtml = buildFlagRangeLegendHtml(columns);
    var bodyHtml = gridTable + legendHtml + buildDocFooterHtml(rec, headOfOfficeName);

    return wrapDocSheet(headerHtml, bodyHtml);
  }

  function renderPdfPreview() {
    var target = document.getElementById('doc-inner');
    if (!target) return;
    if (!pdfGrid || !pdfGrid.columns || !pdfGrid.columns.length) {
      target.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px 16px;">No Flag Raising or Flag Retreat logs in this date range. PDF columns are based on actual records only, not the weekly schedule in settings.</p>';
      return;
    }
    target.innerHTML = isClassicPdfMode() ? buildClassicPdfHtml() : buildFlagRangeGridHtml();
  }

  function openPdfModal() {
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    logoHistory = [];
    logoHistoryIdx = -1;
    applyLogos(loadPersistedLogos() || defaultLogos);
    pushLogoHistory();
    if (isClassicPdfMode() && pdfGrid.columns && pdfGrid.columns[0] && pdfGrid.columns[0].ymd) {
      var docDateEl = document.getElementById('doc-date');
      if (docDateEl) {
        docDateEl.value = String(pdfGrid.columns[0].ymd);
      }
    }
    renderPdfPreview();
  }

  function closePdfModal() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  function downloadPdf() {
    renderPdfPreview();
    var content = (document.getElementById('doc-inner') || {}).innerHTML || '';
    var localStyles = Array.from(document.querySelectorAll('style'))
      .map(function (s) { return s.outerHTML; })
      .join('');
    var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title></title>' +
      localStyles +
      '<style>' +
      'html,body,*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}' +
      'body{margin:0;padding:0;background:#fff;color:#111;}' +
      '#doc-inner{padding:0;font-size:13.5px !important;}' +
      '.doc-right-city{font-size:12.5px !important;}' +
      '.doc-right-dept{font-size:13px !important;}' +
      '.doc-right-addr{font-size:11.5px !important;}' +
      '.doc-ceremony-title{font-size:18px !important;}' +
      '.doc-date-line,.doc-office-line{font-size:13.5px !important;}' +
      '.doc-instr{font-size:11.8px !important;}' +
      '.doc-att-table,.flag-range-grid{font-size:13px !important;}' +
      '.doc-att-table th,.flag-range-grid th{font-size:12px !important;padding:8px 10px !important;}' +
      '.doc-att-table td,.flag-range-grid td{padding:7px 10px !important;}' +
      '.flag-range-grid th.name-col,.flag-range-grid td.name-col{text-align:left !important;}' +
      '.flag-range-grid th.col-no,.flag-range-grid td.col-no,.flag-range-grid td.center{text-align:center !important;}' +
      '.doc-footer-txt{font-size:11.8px !important;}' +
      '.doc-sig-name{font-size:12px !important;}' +
      '.doc-sig-caption{font-size:11px !important;}' +
      '.doc-note{font-size:10.5px !important;}' +
      '.doc-att-table th,.flag-range-grid thead th:not(.col-flag-raising):not(.col-flag-retreat){background:#003366 !important;color:#fff !important;border:0.5px solid #002244 !important;}' +
      '.flag-range-grid thead th.col-flag-raising{background:#1565c0 !important;border-color:#0d47a1 !important;color:#fff !important;}' +
      '.flag-range-grid thead th.col-flag-retreat{background:#e65100 !important;border-color:#bf360c !important;color:#fff !important;}' +
      '.flag-range-grid tbody td.col-flag-raising{background:#e3f2fd !important;}' +
      '.flag-range-grid tbody td.col-flag-retreat{background:#fff3e0 !important;}' +
      '.doc-att-table tr:nth-child(even) td,.flag-range-grid tbody tr:nth-child(even) td:not(.col-flag-raising):not(.col-flag-retreat){background:#f0f4ff !important;}' +
      '.flag-range-grid tbody tr:nth-child(even) td.col-flag-raising{background:#bbdefb !important;}' +
      '.flag-range-grid tbody tr:nth-child(even) td.col-flag-retreat{background:#ffe0b2 !important;}' +
      '.flag-range-legend{margin-top:14px;padding:10px 12px;border:0.5px solid #cbd5e1;background:#f8fafc !important;font-size:11px !important;}' +
      '.flag-range-legend-label{font-weight:700;margin-bottom:6px;font-size:10px !important;color:#475569 !important;}' +
      '.flag-range-legend-items{display:flex;flex-wrap:wrap;gap:16px 24px;}' +
      '.flag-range-legend-item{display:inline-flex;align-items:center;gap:8px;font-weight:600 !important;}' +
      '.flag-range-legend-swatch{width:28px;height:16px;border-radius:3px;border:0.5px solid #64748b;display:inline-block;}' +
      '.flag-range-legend-swatch.col-flag-raising{background:#1565c0 !important;border-color:#0d47a1 !important;}' +
      '.flag-range-legend-swatch.col-flag-retreat{background:#e65100 !important;border-color:#bf360c !important;}' +
      '.flag-range-legend-text--raising{color:#0d47a1 !important;}' +
      '.flag-range-legend-text--retreat{color:#bf360c !important;}' +
      '.doc-divider{border-top:1.5px solid #003366 !important;}' +
      '.doc-right-city{color:#003366 !important;border-bottom:1px solid #003366 !important;}' +
      '.doc-sheet{width:100%;border-collapse:collapse;}' +
      '.doc-sheet td{padding:0;border:0;vertical-align:top;}' +
      '@media print{.doc-sheet thead{display:table-header-group;} .doc-sheet tfoot{display:table-footer-group;} .doc-sheet thead, .doc-sheet tr{break-inside:avoid;}}' +
      '@page{size:auto;margin:20px;}' +
      '</style></head><body><div id="doc-inner">' + content + '</div></body></html>';

    var printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    printFrame.setAttribute('aria-hidden', 'true');
    document.body.appendChild(printFrame);

    var cleanup = function () {
      setTimeout(function () {
        if (printFrame.parentNode) printFrame.parentNode.removeChild(printFrame);
      }, 300);
    };

    var doc = printFrame.contentWindow && printFrame.contentWindow.document;
    if (!doc || !printFrame.contentWindow) {
      cleanup();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(function () {
      try {
        printFrame.contentWindow.focus();
        printFrame.contentWindow.print();
      } finally {
        cleanup();
      }
    }, 200);
  }

  openBtn.addEventListener('click', openPdfModal);
  if (closeBtn) closeBtn.addEventListener('click', closePdfModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closePdfModal);
  if (downloadBtn) downloadBtn.addEventListener('click', downloadPdf);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closePdfModal();
  });

  ['city-name', 'department-name', 'address-line', 'landline-line', 'email-line', 'office-name', 'recorded-by', 'head-of-office-name'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', renderPdfPreview);
  });

  ['l1', 'l2', 'l3'].forEach(function (key) {
    var btn = document.getElementById('rm-' + key);
    if (btn) {
      btn.addEventListener('click', function () {
        logos[key] = '';
        var prev = document.getElementById('prev-' + key);
        if (prev) prev.innerHTML = '<div class="doc-logo-placeholder">LOGO ' + key.slice(1) + '</div>';
        pushLogoHistory();
        renderPdfPreview();
      });
    }
    var input = document.getElementById('f-' + key);
    if (input) {
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          logos[key] = String(reader.result || '');
          var prev = document.getElementById('prev-' + key);
          if (prev) prev.innerHTML = '<img src="' + logos[key] + '" />';
          pushLogoHistory();
          renderPdfPreview();
        };
        reader.readAsDataURL(file);
      });
    }
  });

  if (undoBtn) {
    undoBtn.addEventListener('click', function () {
      if (logoHistoryIdx <= 0) return;
      logoHistoryIdx -= 1;
      applyLogos(logoHistory[logoHistoryIdx]);
      syncLogoHistoryButtons();
      savePersistedLogos();
    });
  }
  if (redoBtn) {
    redoBtn.addEventListener('click', function () {
      if (logoHistoryIdx < 0 || logoHistoryIdx >= logoHistory.length - 1) return;
      logoHistoryIdx += 1;
      applyLogos(logoHistory[logoHistoryIdx]);
      syncLogoHistoryButtons();
      savePersistedLogos();
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      applyLogos(defaultLogos);
      logoHistory = [];
      logoHistoryIdx = -1;
      pushLogoHistory();
    });
  }
})();
