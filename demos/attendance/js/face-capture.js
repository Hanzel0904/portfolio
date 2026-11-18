/**
 * Employee Registration – Face capture with Python backend for simple guidance.
 * Hindi na tayo gumagamit ng 5 poses. Gaya ng biometric sa apps:
 * - Indicator lang kung may face
 * - Guide kung ilapit, ilayo, o i-center ang mukha
 * - Progress bar kapag stable na (hold still) bago mag-Done
 */
(function () {
  'use strict';

  var API_URL = 'http://127.0.0.1:5000/api/face-pose';
  var ENROLL_CHECK_API_URL = 'http://127.0.0.1:5000/api/face-enrollment-check';
  var STEP_HOLD_SECONDS = 3;
  var POSE_STEPS = [
    { id: 'forward', label: 'Front' },
    { id: 'left', label: 'Look Left' },
    { id: 'right', label: 'Look Right' },
    { id: 'up', label: 'Look Up' },
    { id: 'down', label: 'Look Down' }
  ];
  var SEND_INTERVAL_MS = 150;

  var video = document.getElementById('faceCaptureVideo');
  var canvas = document.getElementById('faceCaptureCanvas');
  var faceFrameDefault = document.getElementById('faceFrameDefault');
  var faceFrameCapture = document.getElementById('faceFrameCapture');
  var progressBar = document.getElementById('faceProgressBar');
  var poseInstruction = document.getElementById('facePoseInstruction');
  var focusBox = document.getElementById('faceFocusBox');
  var btnCaptureFace = document.getElementById('btnCaptureFace');
  var btnRegisterEmployee = document.getElementById('btnRegisterEmployee');
  var btnFaceCancel = document.getElementById('btnFaceCancel');
  var btnFaceDone = document.getElementById('btnFaceDone');
  var faceFrame = document.getElementById('faceFrame');
  var faceFrameText = document.getElementById('faceFrameText');

  var requiredInputs = [
    document.getElementById('full_name'),
    document.getElementById('employee_id'),
    document.getElementById('department'),
    document.getElementById('position'),  // ← added
    document.getElementById('email')
  ];

  function institutionalEmailOk() {
    var el = document.getElementById('email');
    var v = trimVal(el);
    if (!v) return false;
    if (window.plpInstitutionalEmail && typeof window.plpInstitutionalEmail.isValid === 'function') {
      return window.plpInstitutionalEmail.isValid(v);
    }
    return /@plpasig\.edu\.ph$/i.test(v);
  }

  var stream = null;
  var faceCaptured = false;
  var detectionRunning = false;
  var sendTimeout = null;
  var apiAvailable = false;
  var currentStepIndex = 0;
  var stepCountdown = STEP_HOLD_SECONDS;
  var stepTimer = null;
  var stepInProgress = false;
  var sequenceCompleted = false;
  var countdownSpeechDone = false;
  var faceVerifyInProgress = false;
  var lastSpokenText = '';
  var lastSpokenAt = 0;
  var nextGuidanceSpeechAt = 0;
  var reminderTimer = null;
  function showActionFeedback(opts) {
    if (window.ActionFeedback && typeof window.ActionFeedback.show === 'function') {
      return window.ActionFeedback.show(opts);
    }
    var fallbackMsg = (opts && opts.message) ? String(opts.message) : 'Action completed.';
    window.alert(fallbackMsg);
    return Promise.resolve();
  }

  function trimVal(el) { return (el && el.value) ? el.value.trim() : ''; }
  function allRequiredFilled() {
    if (!requiredInputs.length) return false;
    if (!requiredInputs.every(function (el) { return trimVal(el).length > 0; })) return false;
    return institutionalEmailOk();
  }

  function updateCaptureButton() {
    btnCaptureFace.disabled = !allRequiredFilled();
  }

  function syncRegisterButtonState() {
    if (!btnRegisterEmployee) return;
    var okEmail = institutionalEmailOk();
    var canRegister = !!faceCaptured && okEmail && allRequiredFilled();
    btnRegisterEmployee.disabled = !canRegister;
    if (canRegister) {
      btnRegisterEmployee.classList.remove('btn-disabled');
      btnRegisterEmployee.classList.add('btn-primary');
      btnRegisterEmployee.style.cursor = 'pointer';
    } else {
      btnRegisterEmployee.classList.add('btn-disabled');
      btnRegisterEmployee.classList.remove('btn-primary');
      btnRegisterEmployee.style.cursor = '';
    }
  }
  window.plpSyncRegisterButtonState = syncRegisterButtonState;

  requiredInputs.forEach(function (el) {
    if (el) {
      el.addEventListener('input', function () {
        updateCaptureButton();
        syncRegisterButtonState();
      });
      el.addEventListener('change', function () {
        updateCaptureButton();
        syncRegisterButtonState();
      });
    }
  });

  function startCamera() {
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } });
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    if (video.srcObject) video.srcObject = null;
    if (sendTimeout) {
      clearTimeout(sendTimeout);
      sendTimeout = null;
    }
  }

  function openCapture() {
    if (faceFrameDefault) faceFrameDefault.style.display = 'none';
    if (faceFrameCapture) {
      faceFrameCapture.style.display = 'flex';
      faceFrameCapture.setAttribute('aria-hidden', 'false');
    }
    progressBar.style.width = '0%';
    currentStepIndex = 0;
    stepCountdown = STEP_HOLD_SECONDS;
    stepInProgress = false;
    sequenceCompleted = false;
    if (stepTimer) {
      clearInterval(stepTimer);
      stepTimer = null;
    }
    poseInstruction.textContent = 'Position your face in the oval';
    announceCurrentStep();
    startStepReminder();
    btnFaceDone.disabled = true;
    faceCaptured = false;
    hideFocusBox();
  }

  function closeCapture() {
    detectionRunning = false;
    stopCamera();
    if (stepTimer) {
      clearInterval(stepTimer);
      stepTimer = null;
    }
    if (reminderTimer) {
      clearInterval(reminderTimer);
      reminderTimer = null;
    }
    stepInProgress = false;
    sequenceCompleted = false;
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
    hideFocusBox();
    if (faceFrameDefault) faceFrameDefault.style.display = '';
    if (faceFrameCapture) {
      faceFrameCapture.style.display = 'none';
      faceFrameCapture.setAttribute('aria-hidden', 'true');
    }
  }

  function setProgress(percent) {
    progressBar.style.width = percent + '%';
  }

  function speak(text, force, interrupt) {
    if (!('speechSynthesis' in window) || !text) return;
    var now = Date.now();
    var normalized = String(text).trim();
    if (!force) {
      if (normalized === lastSpokenText && (now - lastSpokenAt) < 1000) return;
      if (now < nextGuidanceSpeechAt) return;
    }
    try {
      if (interrupt) {
        window.speechSynthesis.cancel();
      }
      var u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.pitch = 1.0;
      u.lang = 'en-US';
      window.speechSynthesis.speak(u);
      lastSpokenText = normalized;
      lastSpokenAt = now;
      if (!force) {
        nextGuidanceSpeechAt = now + 1400;
      }
    } catch (e) {}
  }

  function speakCountdownSequence(stepLabel, onDone) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      var parts = [String(stepLabel || 'Step'), '3', '2', '1'];
      var lastIdx = parts.length - 1;
      parts.forEach(function (p, idx) {
        var u = new SpeechSynthesisUtterance(p);
        u.rate = 1.0;
        u.pitch = 1.0;
        u.lang = 'en-US';
        if (idx === lastIdx) {
          u.onend = function () {
            if (typeof onDone === 'function') onDone();
          };
        }
        window.speechSynthesis.speak(u);
      });
      lastSpokenText = parts.join(' ');
      lastSpokenAt = Date.now();
      nextGuidanceSpeechAt = Date.now() + 2400;
    } catch (e) {}
  }

  function updateStepInstruction(extra) {
    if (sequenceCompleted) {
      poseInstruction.textContent = 'Pose capture complete. Tap Done.';
      return;
    }
    var step = POSE_STEPS[currentStepIndex];
    var prefix = 'Step ' + (currentStepIndex + 1) + '/' + POSE_STEPS.length + ': ' + step.label;
    poseInstruction.textContent = extra ? (prefix + ' - ' + extra) : prefix;
  }

  function announceCurrentStep() {
    if (sequenceCompleted) return;
    var step = POSE_STEPS[currentStepIndex];
    updateStepInstruction('Prepare...');
    speak(step.label + '. Get ready.', true, true);
  }

  function resetStepHold() {
    if (stepTimer) {
      clearInterval(stepTimer);
      stepTimer = null;
    }
    stepInProgress = false;
    countdownSpeechDone = false;
    stepCountdown = STEP_HOLD_SECONDS;
    updateStepInstruction('Center your face first');
  }

  function startStepReminder() {
    if (reminderTimer) {
      clearInterval(reminderTimer);
      reminderTimer = null;
    }
    reminderTimer = setInterval(function () {
      if (!detectionRunning || sequenceCompleted) return;
      if (stepInProgress) return;
      var step = POSE_STEPS[currentStepIndex];
      if (!step) return;
      speak(step.label + '. Please keep your face inside the oval.', false, false);
    }, 2600);
  }

  function recomputeProgress() {
    var base = currentStepIndex / POSE_STEPS.length;
    var partial = stepInProgress ? ((STEP_HOLD_SECONDS - stepCountdown) / STEP_HOLD_SECONDS) / POSE_STEPS.length : 0;
    setProgress(Math.max(0, Math.min(100, (base + partial) * 100)));
  }

  function completeCurrentStep() {
    if (stepTimer) {
      clearInterval(stepTimer);
      stepTimer = null;
    }
    stepInProgress = false;
    var completedStep = POSE_STEPS[currentStepIndex];
    if (completedStep && completedStep.id) {
      uploadFaceSnapshot(completedStep.id, true);
    }
    currentStepIndex += 1;
    stepCountdown = STEP_HOLD_SECONDS;
    recomputeProgress();
    if (currentStepIndex >= POSE_STEPS.length) {
      sequenceCompleted = true;
      setProgress(100);
      updateStepInstruction();
      speak('Pose sequence complete', true, true);
      btnFaceDone.disabled = false;
      return;
    }
    announceCurrentStep();
  }

  function startStepHold() {
    if (stepInProgress || sequenceCompleted) return;
    stepInProgress = true;
    countdownSpeechDone = false;
    stepCountdown = STEP_HOLD_SECONDS;
    var step = POSE_STEPS[currentStepIndex];
    updateStepInstruction('Hold still: ' + stepCountdown);
    // Speak numbers as separate queued utterances so 3/2/1 are always heard.
    speakCountdownSequence(step.label, function () {
      countdownSpeechDone = true;
    });
    recomputeProgress();
    stepTimer = setInterval(function () {
      stepCountdown -= 1;
      if (stepCountdown > 0) {
        updateStepInstruction('Hold still: ' + stepCountdown);
        recomputeProgress();
        return;
      }
      if (!countdownSpeechDone) {
        updateStepInstruction('Finishing countdown audio...');
        return;
      }
      completeCurrentStep();
    }, 1000);
  }

  function hideFocusBox() {
    if (!focusBox) return;
    focusBox.classList.remove('is-active');
    focusBox.style.left = '0px';
    focusBox.style.top = '0px';
    focusBox.style.width = '0px';
    focusBox.style.height = '0px';
    focusBox.setAttribute('aria-hidden', 'true');
  }

  function showFocusBox(box, frame) {
    if (!focusBox || !box || !frame || !frame.w || !frame.h) return;
    var wrap = focusBox.parentElement;
    if (!wrap) return;

    // Map from frame pixels -> overlay in object-fit: cover container
    var W = wrap.clientWidth;
    var H = wrap.clientHeight;
    if (!W || !H) return;

    var scale = Math.max(W / frame.w, H / frame.h);
    var dispW = frame.w * scale;
    var dispH = frame.h * scale;
    var offsetX = (W - dispW) / 2;
    var offsetY = (H - dispH) / 2;

    var left = offsetX + (box.x * scale);
    var top = offsetY + (box.y * scale);
    var width = box.w * scale;
    var height = box.h * scale;

    if (width < 2 || height < 2) {
      hideFocusBox();
      return;
    }

    focusBox.style.left = left + 'px';
    focusBox.style.top = top + 'px';
    focusBox.style.width = width + 'px';
    focusBox.style.height = height + 'px';
    focusBox.classList.add('is-active');
    focusBox.setAttribute('aria-hidden', 'false');
  }

  function captureFrame() {
    if (!video.videoWidth || !canvas) return null;
    var w = video.videoWidth;
    var h = video.videoHeight;
    var scale = 0.5;
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    var ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  }

  function sendToApi() {
    if (!detectionRunning || !video.videoWidth) {
      scheduleSend();
      return;
    }

    var dataUrl = captureFrame();
    if (!dataUrl) {
      scheduleSend();
      return;
    }

    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl })
    })
      .then(function (res) {
        if (res.ok) return res.json();
        return res.json().then(function (j) { throw j; });
      })
      .then(function (data) {
        apiAvailable = true;
        if (data && data.box && data.frame) {
          showFocusBox(data.box, data.frame);
        } else {
          hideFocusBox();
        }
        // Walang face
        if (!data.detected) {
          resetStepHold();
          poseInstruction.textContent = data.message || 'Position your face in the oval';
          speak('Please move your face back to the oval.', false, false);
          btnFaceDone.disabled = true;
          return;
        }

        // May face – gamitin ang message ng backend bilang guide
        if (data.message) {
          poseInstruction.textContent = data.message;
        }

        if (data.centered && data.state === 'ok') {
          if (!sequenceCompleted) {
            startStepHold();
            recomputeProgress();
          }
        } else {
          resetStepHold();
          speak('Please move your face back to the oval.', false, false);
          if (!sequenceCompleted) btnFaceDone.disabled = true;
        }
      })
      .catch(function (err) {
        resetStepHold();
        hideFocusBox();
        if (!apiAvailable) {
          poseInstruction.textContent = 'Start C# API: run api\\run_face_api.bat';
          return;
        }
        if (err && (err.error || err.message)) {
          poseInstruction.textContent = err.error || err.message;
        }
      })
      .then(scheduleSend);
  }

  function scheduleSend() {
    if (!detectionRunning) return;
    sendTimeout = setTimeout(sendToApi, SEND_INTERVAL_MS);
  }

  function startCapture() {
    currentStepIndex = 0;
    stepCountdown = STEP_HOLD_SECONDS;
    stepInProgress = false;
    sequenceCompleted = false;
    openCapture();
    startCamera()
      .then(function (s) {
        stream = s;
        video.srcObject = s;
        video.onloadedmetadata = function () {
          video.play();
          detectionRunning = true;
          scheduleSend();
        };
      })
      .catch(function (err) {
        console.error(err);
        poseInstruction.textContent = 'Camera error: ' + (err.message || 'Permission or not found');
        setTimeout(closeCapture, 2500);
      });
  }

  function uploadFaceSnapshot(sampleTag, skipDuplicateCheck) {
    var empId = trimVal(requiredInputs[1]); // employee_id field
    if (!empId) return;

    var dataUrl = captureFrame();
    if (!dataUrl) return;

    var formData = new FormData();
    formData.append('employee_id', empId);
    formData.append('image', dataUrl);
    if (sampleTag) {
      formData.append('sample_tag', sampleTag);
    }
    if (skipDuplicateCheck) {
      formData.append('skip_duplicate_check', '1');
    }

    fetch('ajax/save_face.php', {
      method: 'POST',
      body: formData
    }).catch(function (err) {
      console.warn('save_face error', err);
    });
  }

  function onDone() {
    if (faceVerifyInProgress) return;
    if (stepInProgress) {
      poseInstruction.textContent = 'Please wait for 3, 2, 1 to finish.';
      return;
    }
    if (!sequenceCompleted) {
      poseInstruction.textContent = 'Finish all pose steps first.';
      return;
    }

    var empId = trimVal(requiredInputs[1]);
    var dataUrl = captureFrame();
    if (!empId || !dataUrl) {
      poseInstruction.textContent = 'Unable to capture face image. Please try again.';
      return;
    }

    faceVerifyInProgress = true;
    btnFaceDone.disabled = true;
    poseInstruction.textContent = 'Validating face identity...';
    var verifyCtrl = new AbortController();
    var verifyTimeout = setTimeout(function () {
      try { verifyCtrl.abort(); } catch (e) {}
    }, 5500);

    fetch(ENROLL_CHECK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: empId, image: dataUrl }),
      signal: verifyCtrl.signal
    })
      .then(function (res) {
        if (res.ok) return res.json();
        return res.json().then(function (j) { throw j; });
      })
      .then(function (result) {
        if (!result || result.ok !== true) {
          throw (result || { error: 'Face validation failed.' });
        }
        if (result.duplicate) {
          var dup = String(result.duplicate_employee_id || '').trim();
          var sameEmployee = dup && empId &&
            dup.toLowerCase() === String(empId).trim().toLowerCase();
          if (sameEmployee) {
            // Updating this employee's own face — not a cross-employee duplicate.
          } else {
            var dupLabel = dup || 'another employee';
            poseInstruction.textContent = 'Duplicate face found. Similar to employee ' + dupLabel + '.';
            showActionFeedback({
              type: 'error',
              title: 'Action Failed',
              message: 'This face appears to be already enrolled under employee ID ' + dupLabel + '.'
            });
            return;
          }
        }

        uploadFaceSnapshot('final', false);
        faceCaptured = true;
        closeCapture();
        faceFrame.classList.add('face-captured');
        faceFrame.setAttribute('data-captured', '1');
        faceFrameText.textContent = 'Face captured. You can now register.';
        syncRegisterButtonState();
        showActionFeedback({
          type: 'success',
          title: 'Face Capture Successful',
          message: "The employee's facial data has been captured successfully."
        });
      })
      .catch(function (err) {
        var isAbort = !!(err && (err.name === 'AbortError' || /aborted|timeout/i.test(String(err.message || ''))));
        var msg = isAbort
          ? 'Validation timed out. Please tap Done again while facing the camera.'
          : ((err && (err.error || err.message)) ? (err.error || err.message) : 'Face validation failed.');
        poseInstruction.textContent = msg;
      })
      .then(function () {
        clearTimeout(verifyTimeout);
        if (!faceCaptured) {
          btnFaceDone.disabled = false;
        }
        faceVerifyInProgress = false;
      });
  }

  function registerButtonLabel() {
    var ex = document.getElementById('existing_employee_db_id');
    if (ex && String(ex.value || '').trim().length > 0) {
      return btnRegisterEmployee.getAttribute('data-label-enroll') || 'Save face enrollment';
    }
    return btnRegisterEmployee.getAttribute('data-label-register') || 'Register Employee';
  }

  function registerSubmittingLabel() {
    var ex = document.getElementById('existing_employee_db_id');
    if (ex && String(ex.value || '').trim().length > 0) {
      return 'Saving...';
    }
    return 'Registering...';
  }

  function registerEmployee() {
    if (btnRegisterEmployee.disabled || !faceCaptured) return;
    if (!allRequiredFilled() || !institutionalEmailOk()) {
      showActionFeedback({
        type: 'error',
        title: 'Action Failed',
        message: !institutionalEmailOk() && window.plpInstitutionalEmail
          ? window.plpInstitutionalEmail.hintMessage()
          : 'Please complete all required fields before registering.'
      });
      return;
    }

    btnRegisterEmployee.disabled = true;
    btnRegisterEmployee.textContent = registerSubmittingLabel();

    var formData = new FormData();
    formData.append('full_name',    trimVal(requiredInputs[0]));
    formData.append('employee_id',  trimVal(requiredInputs[1]));
    formData.append('department',   trimVal(requiredInputs[2]));
    formData.append('position',     trimVal(requiredInputs[3]));  // ← added
    formData.append('email',        trimVal(requiredInputs[4]));
    var exId = document.getElementById('existing_employee_db_id');
    if (exId && String(exId.value || '').trim().length > 0) {
      formData.append('existing_id', String(exId.value).trim());
    }

    fetch('ajax/register_employee.php', {
      method: 'POST',
      body: formData
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.success) {
          showActionFeedback({
            type: 'success',
            title: 'Registration Complete',
            message: 'The employee has been successfully registered.'
          }).then(function () {
            window.location.href = 'employee_management.php';
          });
        } else {
          showActionFeedback({
            type: 'error',
            title: 'Action Failed',
            message: data.error || 'Something went wrong. Please try again.'
          });
          btnRegisterEmployee.disabled = false;
          btnRegisterEmployee.textContent = registerButtonLabel();
        }
      })
      .catch(function (err) {
        showActionFeedback({
          type: 'error',
          title: 'Action Failed',
          message: err && err.message ? err.message : 'Something went wrong. Please try again.'
        });
        btnRegisterEmployee.disabled = false;
        btnRegisterEmployee.textContent = registerButtonLabel();
      });
  }

  btnCaptureFace.addEventListener('click', function () {
    if (btnCaptureFace.disabled) return;
    startCapture();
  });

  btnFaceCancel.addEventListener('click', closeCapture);
  btnFaceDone.addEventListener('click', onDone);
  btnRegisterEmployee.addEventListener('click', registerEmployee);

  updateCaptureButton();
  syncRegisterButtonState();
})();