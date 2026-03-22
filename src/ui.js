const labelMap = {
  palm: 'Palm',
  fist: 'Fist',
  peace: 'Peace',
  thumb: 'Thumb',
  index: 'Index',
  none: 'Searching',
};

export function updateOverlay(state) {
  const fpsCounter = document.getElementById('fps-counter');
  const stabilityCounter = document.getElementById('stability-counter');
  const labelEl = document.getElementById('detected-gesture-label');
  const barEl = document.getElementById('confidence-bar');
  const camContainer = document.getElementById('camera-container');
  const thresholdInput = document.getElementById('confidence-slider');

  if (fpsCounter) fpsCounter.innerText = Math.round(state.fps || 0);
  if (stabilityCounter) stabilityCounter.innerText = `${Math.round((state.stability || 0) * 100)}%`;

  const threshold = parseFloat(thresholdInput?.value || '0.7');
  const visible = state.handDetected && state.gesture !== 'none';
  const stable = visible && state.confidence >= threshold && state.stable;

  if (labelEl && barEl) {
    if (visible) {
      labelEl.classList.add('stable');
      labelEl.innerText = `${labelMap[state.gesture] || state.gesture} Detected`;
      barEl.style.width = `${Math.min((state.confidence || 0) * 100, 100)}%`;
    } else {
      labelEl.classList.remove('stable');
      labelEl.innerText = 'Show Gesture';
      barEl.style.width = '0%';
    }
  }

  camContainer?.classList.toggle('glow-border', stable);
  updateSystemStatus(
    stable
      ? `System Active: ${labelMap[state.gesture] || state.gesture}`
      : state.handDetected
        ? 'Tracking Hand...'
        : 'System Ready',
    stable ? 'bg-accent' : state.handDetected ? 'bg-amber-500' : 'bg-slate-700'
  );
  updateGestureReferenceCards(state.gesture, stable);
}

function updateGestureReferenceCards(activeGesture, isStable) {
  ['palm', 'fist', 'peace', 'thumb', 'index'].forEach((gesture) => {
    const card = document.getElementById(`gesture-${gesture}`);
    if (!card) return;

    const active = gesture === activeGesture && isStable;
    card.classList.toggle('pulse-active', active);
  });
}

export function logAction(gesture, actionDesc) {
  const logContainer = document.getElementById('action-log');
  if (!logContainer) return;

  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const logEntry = document.createElement('div');
  logEntry.className = 'flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 rounded-xl animate-[slideInUp_0.3s_ease-out] pointer-events-auto';
  logEntry.innerHTML = `
    <div class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6 9 17l-5-5"/></svg>
    </div>
    <div class="flex-1">
      <div class="text-[10px] font-black text-slate-500 uppercase tracking-tighter">${time}</div>
      <div class="text-xs font-bold text-slate-200">${actionDesc}</div>
    </div>
  `;
  
  logContainer.prepend(logEntry); // Newest at top
  if (logContainer.children.length > 20) logContainer.lastChild.remove();
}

export function updateSystemStatus(text, dotColor) {
  const textEl = document.getElementById('system-status-text');
  const dot = document.getElementById('system-status-dot');
  if (textEl) textEl.innerText = text;
  if (dot) dot.className = `w-2 h-2 rounded-full ${dotColor}`;
}

export function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const el = document.createElement('div');
  el.className =
    'bg-slate-900/90 backdrop-blur text-white px-4 py-2 mb-2 rounded-lg shadow-xl outline outline-1 outline-white/10 transition-opacity duration-300';
  el.textContent = message;
  container.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

document.addEventListener('DOMContentLoaded', () => {
  const testBtn = document.getElementById('test-bridge-btn');
  if (!testBtn) return;

  testBtn.onclick = async () => {
    if (window.electronAPI?.executeAction) {
      await window.electronAPI.executeAction('scroll_up');
    } else {
      showToast('Electron bridge is unavailable in browser mode.');
    }
  };
});
