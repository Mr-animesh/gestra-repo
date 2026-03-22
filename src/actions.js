import html2canvas from 'html2canvas';
import { speakFeedback } from './tts.js';
import { logAction, showToast } from './ui.js';

let lastGesture = 'none';
let lastActionTime = 0;
let repeatingGesture = null;
let repeatTimer = null;

const gestureLabels = {
  palm: 'Scroll up',
  fist: 'Scroll down',
  peace: 'Screenshot',
  thumb: 'Play or pause media',
  index: 'Left click',
};

const actionMap = {
  palm: 'scroll_up',
  fist: 'scroll_down',
  peace: 'screenshot',
  thumb: 'media_toggle',
  index: 'left_click',
};

const repeatableGestures = new Set(['palm', 'fist']);
const repeatDelayByGesture = {
  palm: 220,
  fist: 220,
  thumb: 1200,
  peace: 1400,
  index: 900,
};

async function captureCanvasScreenshot() {
  const target = document.getElementById('app-container') || document.body;
  const canvas = await html2canvas(target, {
    backgroundColor: '#081121',
    useCORS: true,
    scale: Math.min(window.devicePixelRatio || 1, 2),
  });

  const link = document.createElement('a');
  link.download = `gestureos-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

async function executeAction(action) {
  if (window.electronAPI?.executeAction) {
    await window.electronAPI.executeAction(action);
    return;
  }

  if (action === 'screenshot') {
    await captureCanvasScreenshot();
    return;
  }

  showToast(`Browser mode: ${action.replace('_', ' ')}`);
}

function stopRepeatingAction() {
  if (repeatTimer) {
    clearInterval(repeatTimer);
    repeatTimer = null;
  }
  repeatingGesture = null;
}

async function triggerGesture(gesture, { silent = false } = {}) {
  const label = gestureLabels[gesture];
  if (!label) {
    return false;
  }

  const now = Date.now();
  const cooldown = repeatDelayByGesture[gesture] || 900;
  if (gesture === lastGesture && now - lastActionTime < cooldown) {
    return false;
  }

  lastGesture = gesture;
  lastActionTime = now;

  await executeAction(actionMap[gesture]);
  if (!silent) {
    logAction(gesture, label);
    speakFeedback(label);
  }
  return true;
}

export function updateGestureActivity(state) {
  const gesture = state?.stable ? state.gesture : 'none';

  if (!repeatableGestures.has(gesture)) {
    stopRepeatingAction();
    return;
  }

  if (repeatingGesture === gesture && repeatTimer) {
    return;
  }

  stopRepeatingAction();
  repeatingGesture = gesture;
  repeatTimer = setInterval(() => {
    triggerGesture(gesture, { silent: true }).catch((error) => {
      console.error('Failed repeating gesture action:', error);
      stopRepeatingAction();
    });
  }, repeatDelayByGesture[gesture]);
}

export async function fireAction(gestureStateOrName) {
  const gesture =
    typeof gestureStateOrName === 'string' ? gestureStateOrName : gestureStateOrName?.gesture;

  if (!gestureLabels[gesture]) {
    return false;
  }

  try {
    await triggerGesture(gesture, { silent: false });
    return true;
  } catch (error) {
    console.error('Failed to execute gesture action:', error);
    showToast(`Action failed: ${gestureLabels[gesture]}`);
    return false;
  }
}
