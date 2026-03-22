const SpeechRecognitionCtor =
  window.SpeechRecognition || window.webkitSpeechRecognition || null;

function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function initVoiceActivation({
  wakeWord = 'hey gesture',
  commandWindowMs = 7000,
  onWakeWord = () => {},
  onCommand = () => {},
  onStateChange = () => {}
} = {}) {
  if (!SpeechRecognitionCtor) {
    onStateChange({ supported: false, running: false, mode: 'unsupported' });
    return {
      supported: false,
      start: () => false,
      stop: () => false,
      destroy: () => {}
    };
  }

  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  let shouldRun = false;
  let mode = 'wake';
  let commandTimer = null;
  let lastWakeAt = 0;
  const wakeWordNormalized = normalize(wakeWord);

  const emitState = () => {
    onStateChange({ supported: true, running: shouldRun, mode });
  };

  const resetToWakeMode = () => {
    mode = 'wake';
    if (commandTimer) {
      clearTimeout(commandTimer);
      commandTimer = null;
    }
    emitState();
  };

  const enterCommandMode = () => {
    mode = 'command';
    if (commandTimer) {
      clearTimeout(commandTimer);
    }
    commandTimer = setTimeout(() => {
      resetToWakeMode();
    }, commandWindowMs);
    emitState();
  };

  const processTranscript = (text, isFinal) => {
    const cleaned = normalize(text);
    if (!cleaned) {
      return;
    }

    if (mode === 'wake') {
      const wakeIndex = cleaned.indexOf(wakeWordNormalized);
      if (wakeIndex >= 0) {
        const now = Date.now();
        if (now - lastWakeAt < 1200) {
          return;
        }
        lastWakeAt = now;
        onWakeWord(text);
        enterCommandMode();

        const afterWake = cleaned
          .slice(wakeIndex + wakeWordNormalized.length)
          .trim();
        if (afterWake && isFinal) {
          onCommand(afterWake);
          resetToWakeMode();
        }
      }
      return;
    }

    if (mode === 'command' && isFinal) {
      onCommand(cleaned);
      resetToWakeMode();
    }
  };

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript = result[0]?.transcript || '';
      processTranscript(transcript, Boolean(result.isFinal));
    }
  };

  recognition.onend = () => {
    if (shouldRun) {
      setTimeout(() => {
        try {
          recognition.start();
        } catch (_) {}
      }, 250);
    } else {
      resetToWakeMode();
    }
  };

  recognition.onerror = () => {
    onStateChange({ supported: true, running: shouldRun, mode, error: true });
  };

  const start = () => {
    if (shouldRun) {
      return true;
    }
    shouldRun = true;
    emitState();
    try {
      recognition.start();
      return true;
    } catch (_) {
      shouldRun = false;
      emitState();
      return false;
    }
  };

  const stop = () => {
    if (!shouldRun) {
      return true;
    }
    shouldRun = false;
    try {
      recognition.stop();
    } catch (_) {}
    resetToWakeMode();
    return true;
  };

  const destroy = () => {
    shouldRun = false;
    if (commandTimer) {
      clearTimeout(commandTimer);
      commandTimer = null;
    }
    try {
      recognition.abort();
    } catch (_) {}
    resetToWakeMode();
  };

  emitState();

  return {
    supported: true,
    start,
    stop,
    destroy
  };
}

