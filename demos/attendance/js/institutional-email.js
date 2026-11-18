/**
 * Client-side check for @plpasig.edu.ph (must match includes/institutional_email.php).
 */
(function (global) {
  'use strict';
  var DOMAIN = 'plpasig.edu.ph';
  var SUFFIX = '@' + DOMAIN;

  function isValid(email) {
    var v = String(email || '').trim();
    if (!v) return false;
    var lower = v.toLowerCase();
    var idx = lower.lastIndexOf('@');
    if (idx < 1) return false;
    var local = lower.slice(0, idx);
    var dom = lower.slice(idx + 1);
    if (!local || local.length > 64) return false;
    if (dom !== DOMAIN) return false;
    if (/\s/.test(local)) return false;
    return true;
  }

  function hintMessage() {
    return 'Use your institutional email ending with ' + SUFFIX + '.';
  }

  global.plpInstitutionalEmail = {
    domain: DOMAIN,
    suffix: SUFFIX,
    isValid: isValid,
    hintMessage: hintMessage
  };
})(typeof window !== 'undefined' ? window : this);
