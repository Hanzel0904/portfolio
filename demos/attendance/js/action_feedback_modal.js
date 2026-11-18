(function () {
  'use strict';

  function byId(id) {
    return document.getElementById(id);
  }

  var backdrop = null;
  var modal = null;
  var titleEl = null;
  var msgEl = null;
  var okBtn = null;
  var successIcon = null;
  var errorIcon = null;
  var iconWrap = null;
  var cardEl = null;
  var isOpen = false;
  var resolver = null;

  function init() {
    backdrop = byId('actionFeedbackBackdrop');
    modal = byId('actionFeedbackModal');
    titleEl = byId('actionFeedbackTitle');
    msgEl = byId('actionFeedbackMessage');
    okBtn = byId('actionFeedbackOkBtn');
    successIcon = byId('actionFeedbackSuccessIcon');
    errorIcon = byId('actionFeedbackErrorIcon');
    iconWrap = byId('actionFeedbackIconWrap');
    cardEl = byId('actionFeedbackCard') || (modal ? modal.querySelector('.af-card') : null);

    if (!backdrop || !modal || !titleEl || !msgEl || !okBtn || !successIcon || !errorIcon) {
      return false;
    }

    okBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) close();
    });
    return true;
  }

  function close() {
    if (!isOpen) return;
    modal.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove('af-modal-open');
    isOpen = false;
    if (resolver) {
      var r = resolver;
      resolver = null;
      r();
    }
  }

  function show(options) {
    if (!backdrop && !init()) {
      var fallback = (options && options.message) ? String(options.message) : 'Action completed.';
      window.alert(fallback);
      return Promise.resolve();
    }

    // Prevent overlapping dialogs by resetting previous one first.
    if (isOpen) {
      close();
    }

    var rawType = options && options.type;
    var type = (rawType === 'error' || rawType === 'failure' || rawType === false) ? 'error' : 'success';
    var explicitTitle = (options && options.title) ? String(options.title).trim() : '';
    var explicitMsg = (options && options.message) ? String(options.message).trim() : '';
    // Callers sometimes set title "Action Failed" but omit type — treat as error.
    if (type === 'success' && /^action failed$/i.test(explicitTitle)) {
      type = 'error';
    }
    if (type === 'success' && explicitMsg && /^(cannot save|unable to|invalid request|an error occurred|failed to)/i.test(explicitMsg)) {
      type = 'error';
    }

    titleEl.textContent = explicitTitle || (type === 'error' ? 'Action Failed' : 'Action Complete');
    msgEl.textContent = explicitMsg || (type === 'error' ? 'Something went wrong. Please try again.' : 'Your request was completed successfully.');

    if (iconWrap) {
      iconWrap.setAttribute('data-af-state', type === 'error' ? 'error' : 'success');
    }
    if (type === 'success') {
      successIcon.removeAttribute('hidden');
      errorIcon.setAttribute('hidden', '');
    } else {
      errorIcon.removeAttribute('hidden');
      successIcon.setAttribute('hidden', '');
    }
    successIcon.setAttribute('aria-hidden', type === 'success' ? 'false' : 'true');
    errorIcon.setAttribute('aria-hidden', type === 'error' ? 'false' : 'true');

    if (cardEl) {
      cardEl.classList.remove('af-card--success', 'af-card--error');
      cardEl.classList.add(type === 'error' ? 'af-card--error' : 'af-card--success');
    }

    backdrop.hidden = false;
    modal.hidden = false;
    isOpen = true;
    document.body.classList.add('af-modal-open');
    setTimeout(function () {
      okBtn.focus();
    }, 0);

    return new Promise(function (resolve) {
      resolver = resolve;
    });
  }

  window.ActionFeedback = {
    show: show,
    close: close
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
