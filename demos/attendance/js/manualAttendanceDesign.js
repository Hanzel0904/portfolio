(function () {
  'use strict';

  function formatTime() {
    return new Date().toLocaleTimeString('en-PH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }

  function formatDate() {
    return new Date().toLocaleDateString('en-PH', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function getFullscreenElement() {
    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement ||
      null
    );
  }

  function exitFullscreenDoc() {
    if (document.exitFullscreen) return document.exitFullscreen();
    if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
    if (document.msExitFullscreen) return document.msExitFullscreen();
    return undefined;
  }

  /**
   * Wait until this container is no longer the fullscreen element.
   * Required before hiding the panel / navigating away — otherwise the page can stay non-interactive until ESC.
   */
  function exitFullscreenThen(root) {
    return new Promise(function (resolve) {
      if (getFullscreenElement() !== root) {
        resolve();
        return;
      }
      var settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        document.removeEventListener('fullscreenchange', onFs);
        document.removeEventListener('webkitfullscreenchange', onFs);
        document.removeEventListener('MSFullscreenChange', onFs);
        resolve();
      }
      function onFs() {
        if (getFullscreenElement() !== root) {
          finish();
        }
      }
      document.addEventListener('fullscreenchange', onFs);
      document.addEventListener('webkitfullscreenchange', onFs);
      document.addEventListener('MSFullscreenChange', onFs);
      try {
        var r = exitFullscreenDoc();
        if (r && typeof r.then === 'function') {
          r.then(function () {
            requestAnimationFrame(function () {
              if (getFullscreenElement() !== root) finish();
            });
          }).catch(finish);
        }
      } catch (e) {
        finish();
      }
      setTimeout(finish, 500);
    });
  }

  /**
   * Fullscreen only the Manual Attendance block (.manual-attendance-design-root),
   * not the whole page (navbar / rest of capture stay outside).
   */
  function requestFullscreenOnContainer(el) {
    if (!el) return Promise.reject();
    if (el.requestFullscreen) return el.requestFullscreen();
    if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
    if (el.msRequestFullscreen) return el.msRequestFullscreen();
    return Promise.reject();
  }

  /**
   * @param {HTMLElement} fsTarget Element that receives requestFullscreen / :fullscreen (must be .manual-attendance-design-root).
   */
  function initFullscreen(fsTarget) {
    var fsBtn = fsTarget.querySelector('#fullscreenBtn');
    var fsIcon = fsTarget.querySelector('#fsIcon');
    if (!fsBtn || !fsIcon) return;

    var EXPAND_SVG =
      '<polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line>';
    var COMPRESS_SVG =
      '<polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="10" y1="14" x2="3" y2="21"></line><line x1="21" y1="3" x2="14" y2="10"></line>';

    function syncFullscreenUi() {
      var fsEl = getFullscreenElement();
      var on = fsEl === fsTarget;
      fsIcon.innerHTML = on ? COMPRESS_SVG : EXPAND_SVG;
      fsTarget.classList.toggle('is-fullscreen', on);
    }

    fsBtn.addEventListener('click', function () {
      var fsEl = getFullscreenElement();
      if (fsEl === fsTarget) {
        exitFullscreenDoc();
      } else {
        requestFullscreenOnContainer(fsTarget).catch(function () {});
      }
    });

    document.addEventListener('fullscreenchange', syncFullscreenUi);
    document.addEventListener('webkitfullscreenchange', syncFullscreenUi);
    document.addEventListener('MSFullscreenChange', syncFullscreenUi);
  }

  window.initManualAttendanceDesignModule = function (opts) {
    opts = opts || {};
    var root = opts.root;
    if (!root) {
      root = document.querySelector('.manual-attendance-design-root');
    }
    if (!root || typeof root.getAttribute !== 'function') {
      return;
    }
    if (root.getAttribute('data-mad-bound') === '1') {
      return;
    }
    root.setAttribute('data-mad-bound', '1');

    /* Embed passes #manualModeView; fullscreen + .is-fullscreen must target inner .manual-attendance-design-root or scaled CSS never applies. */
    var fsRoot =
      root.classList && root.classList.contains('manual-attendance-design-root')
        ? root
        : root.querySelector('.manual-attendance-design-root') || root;

    var input = root.querySelector('#empIdInput');
    var emptyState = root.querySelector('#emptyState');
    var filledState = root.querySelector('#filledState');
    var confirmBanner = root.querySelector('#confirmationBanner');
    var countdownBadge = root.querySelector('#countdownBadge');
    var entryMsg = root.querySelector('#entryMsg');
    var confirmText = root.querySelector('#madConfirmBannerText');
    var backBtn = root.querySelector('#mad-back-to-camera');
    var resetTimer = null;
    var countdownTimer = null;
    var isShowingResult = false;

    if (!input || !emptyState || !filledState) {
      return;
    }

    function setMsg(text) {
      if (entryMsg) {
        entryMsg.textContent = text || '';
      }
    }

    function showSuccess(data) {
      var emp = data && data.employee ? data.employee : {};
      var logStatus = (data && data.log_status) || 'time_in';

      var nameEl = root.querySelector('#empName');
      var idEl = root.querySelector('#empIdDisplay');
      var deptEl = root.querySelector('#empDept');
      var posEl = root.querySelector('#empPosition');
      var timeEl = root.querySelector('#empTime');
      var dateEl = root.querySelector('#empDate');

      if (nameEl) nameEl.textContent = emp.full_name || '';
      if (idEl) idEl.textContent = emp.employee_code || emp.employee_id || '';
      if (deptEl) deptEl.textContent = emp.department || '—';
      if (posEl) posEl.textContent = emp.position || '—';
      if (timeEl) timeEl.textContent = formatTime();
      if (dateEl) dateEl.textContent = formatDate();

      if (confirmText) {
        confirmText.textContent =
          logStatus === 'time_out'
            ? 'Time Out Recorded Successfully'
            : (logStatus === 'late' ? 'Late Attendance Recorded' : 'Time In Recorded Successfully');
      }

      emptyState.classList.add('hidden');
      emptyState.classList.remove('mad-panel-reveal');
      filledState.classList.remove('hidden');
      filledState.classList.remove('mad-panel-reveal');
      void filledState.offsetWidth;
      filledState.classList.add('mad-panel-reveal');
      input.disabled = true;
      isShowingResult = true;
      setMsg('');

      if (confirmBanner) {
        confirmBanner.classList.remove('hidden');
        confirmBanner.offsetHeight;
        confirmBanner.classList.add('show');
      }

      var secs = 3;
      if (countdownBadge) countdownBadge.textContent = String(secs);
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = setInterval(function () {
        secs--;
        if (countdownBadge) countdownBadge.textContent = String(Math.max(0, secs));
        if (secs <= 0) clearInterval(countdownTimer);
      }, 1000);

      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(resetToEntry, 3500);
    }

    function resetToEntry() {
      if (resetTimer) {
        clearTimeout(resetTimer);
        resetTimer = null;
      }
      if (countdownTimer) clearInterval(countdownTimer);
      isShowingResult = false;

      if (confirmBanner) {
        confirmBanner.classList.remove('show');
        setTimeout(function () {
          confirmBanner.classList.add('hidden');
        }, 320);
      }

      filledState.classList.add('hidden');
      filledState.classList.remove('mad-panel-reveal');
      emptyState.classList.remove('hidden');
      emptyState.classList.remove('mad-panel-reveal');
      void emptyState.offsetWidth;
      emptyState.classList.add('mad-panel-reveal');

      input.disabled = false;
      input.value = '';
      input.classList.remove('input-error');
      setMsg('');
      input.focus();
    }

    function submitId() {
      var empId = input.value.trim();
      if (!empId) {
        setMsg('Enter an Employee ID.');
        return;
      }
      setMsg('Recording…');
      input.classList.remove('input-error');

      var fd = new FormData();
      fd.append('employee_id', empId);
      var now = new Date();
      fd.append('client_now', now.toISOString());
      fd.append('client_tz_offset_min', String(now.getTimezoneOffset()));

      fetch('ajax/log_attendance.php', { method: 'POST', body: fd })
        .then(function (res) {
          return res.json().then(function (j) {
            return { ok: res.ok, json: j };
          });
        })
        .then(function (_ref) {
          var j = _ref.json;
          if (j && j.success) {
            showSuccess(j);
            if (typeof window.loadRecentDetections === 'function') {
              window.loadRecentDetections();
            }
            return;
          }
          var err =
            (j && j.message) ||
            (j && j.error) ||
            'Could not record attendance.';
          if (j && j.cooldown) {
            err = j.message || err;
          }
          if (j && j.no_active_event) {
            err = j.message || 'No active scheduled event at this time.';
          }
          setMsg(err);
          input.classList.add('input-error');
        })
        .catch(function () {
          setMsg('Network error. Try again.');
          input.classList.add('input-error');
        });
    }

    input.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        submitId();
      }
    });

    filledState.addEventListener('click', function () {
      if (isShowingResult) {
        resetToEntry();
      }
    });

    document.addEventListener('keydown', function onMadKey(e) {
      if (!isShowingResult) {
        return;
      }
      if (opts.embed && root.hidden === true) {
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        resetToEntry();
      }
    });

    input.addEventListener('input', function () {
      input.classList.remove('input-error');
      setMsg('');
    });

    if (backBtn && typeof opts.onBackToCamera === 'function') {
      backBtn.addEventListener('click', function () {
        resetToEntry();
        exitFullscreenThen(fsRoot).then(function () {
          opts.onBackToCamera();
        });
      });
    }

    initFullscreen(fsRoot);

    if (opts.embed) {
      setTimeout(function () {
        input.focus();
      }, 50);
    }
  };

  window.initManualAttendanceModule = window.initManualAttendanceDesignModule;
})();
