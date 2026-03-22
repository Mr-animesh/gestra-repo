import './style.css';
import { initGestureEngine, startGestureEngine } from './gesture-mediapipe.js';
import { fireAction, updateGestureActivity } from './actions.js';
import { initTTS } from './tts.js';
import { updateOverlay, updateSystemStatus } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('start-btn');
  const landingPage = document.getElementById('landing-page');
  const appContainer = document.getElementById('app-container');
  const videoElement = document.getElementById('webcam-feed');
  const clearLogBtn = document.getElementById('clear-log-btn');
  const actionLog = document.getElementById('action-log');
  const slider = document.getElementById('confidence-slider');
  const valLabel = document.getElementById('threshold-value');
  const loadingText = document.getElementById('loading-text');
  const loadingBar = document.getElementById('loading-bar');
  const loadingOverlay = document.getElementById('loading-overlay');
  const overlayModeToggle = document.getElementById('overlay-mode-toggle');

  if (!startBtn || !landingPage || !appContainer || !videoElement) {
    console.error('Missing required DOM elements');
    return;
  }

  startBtn.addEventListener('click', async () => {
    try {
      updateSystemStatus('Neural Link Initializing...', 'bg-accent');
      landingPage.style.opacity = '0';
      setTimeout(() => {
        landingPage.classList.add('hidden');
        appContainer.classList.remove('hidden');
      }, 700);

      if (loadingText) loadingText.innerText = 'Synchronizing Hand Tracking...';
      if (loadingBar) loadingBar.style.width = '30%';

      await initGestureEngine();

      if (loadingText) loadingText.innerText = 'Calibrating Vision Stream...';
      if (loadingBar) loadingBar.style.width = '65%';

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60, max: 60 },
        },
      });

      videoElement.srcObject = stream;
      await videoElement.play();

      initTTS().catch((error) => console.warn('TTS init failed:', error));

      startGestureEngine(videoElement, {
        onFrame: (state) => {
          updateOverlay(state);
          updateGestureActivity(state);
        },
        onGesture: (state) => fireAction(state),
      });

      if (loadingText) loadingText.innerText = 'Neural Engine Ready.';
      if (loadingBar) loadingBar.style.width = '100%';
      setTimeout(() => loadingOverlay?.classList.add('hidden'), 500);
      updateSystemStatus('Neural Interface: Active', 'bg-accent');

      if (overlayModeToggle) {
        overlayModeToggle.checked = true;
        window.electronAPI?.toggleOverlayMode(true);
      }
    } catch (error) {
      console.error('App startup failed:', error);
      updateSystemStatus('Fatal Error', 'bg-red-500');
      if (loadingText) loadingText.innerText = error?.message || 'Initialization failed.';
    }
  });

  if (clearLogBtn && actionLog) {
    clearLogBtn.addEventListener('click', () => {
      actionLog.innerHTML =
        '<div class="text-center text-sm text-gray-600 mt-10 italic">Waiting for gesture input...</div>';
    });
  }

  if (slider && valLabel) {
    slider.addEventListener('input', (event) => {
      valLabel.innerText = parseFloat(event.target.value).toFixed(2);
    });
  }

  if (overlayModeToggle) {
    overlayModeToggle.checked = false;
    window.electronAPI?.toggleOverlayMode(false);
    overlayModeToggle.addEventListener('change', (event) => {
      window.electronAPI?.toggleOverlayMode(Boolean(event.target.checked));
    });
  }
});
