import { createAIClient } from './ai.js';
import { initVoiceActivation } from './voice.js';

function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('assistant-root');
  if (!root) return;

  const toggleBtn = document.getElementById('assistant-toggle');
  const panel = document.getElementById('assistant-panel');
  const closeBtn = document.getElementById('assistant-close');
  const micBtn = document.getElementById('assistant-mic-toggle');
  const statusEl = document.getElementById('assistant-status');
  const form = document.getElementById('assistant-form');
  const input = document.getElementById('assistant-input');
  const messages = document.getElementById('assistant-messages');

  if (!toggleBtn || !panel || !closeBtn || !micBtn || !statusEl || !form || !input || !messages) {
    return;
  }

  const client = createAIClient();
  const history = [];
  let busy = false;
  let isOpen = false;

  const setOpen = (open) => {
    isOpen = open;
    root.classList.toggle('assistant-open', open);
    panel.setAttribute('aria-hidden', String(!open));
    toggleBtn.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(() => input.focus(), 600);
  };

  const appendMessage = (role, text) => {
    const safeText = escapeHtml(text || '');
    const row = document.createElement('div');
    row.className = `assistant-msg assistant-msg-${role}`;
    row.innerHTML = `
      <div class="assistant-msg-bubble">${safeText}</div>
      <div class="assistant-msg-time">${formatTime()}</div>
    `;
    messages.appendChild(row);
    messages.scrollTop = messages.scrollHeight;
  };

  const setStatus = (text) => {
    statusEl.textContent = text;
  };

  const sendMessage = async (text) => {
    const trimmed = (text || '').trim();
    if (!trimmed || busy) return;

    busy = true;
    appendMessage('user', trimmed);
    setStatus('Analyzing...');
    input.value = '';

    try {
      const assistantText = await client.askAssistant({
        message: trimmed,
        history
      });
      history.push({ role: 'user', content: trimmed });
      history.push({ role: 'assistant', content: assistantText });
      appendMessage('assistant', assistantText);
      setStatus('Online');
    } catch (error) {
       console.error('[AI] Assistant Request Failed:', error);
       appendMessage('assistant', `System Error: ${error.message}`);
       setStatus('Error');
    } finally {
      busy = false;
    }
  };

  const voiceController = initVoiceActivation({
    wakeWord: 'hey gesture',
    onWakeWord: () => {
      setOpen(true);
      setStatus('Listening...');
    },
    onCommand: (transcript) => {
      if (!transcript) return;
      setOpen(true);
      sendMessage(transcript);
    },
    onStateChange: ({ supported, running, mode }) => {
      if (!supported) {
        micBtn.disabled = true;
        setStatus('Voice Disabled');
        return;
      }

      micBtn.disabled = false;
      micBtn.classList.toggle('assistant-mic-on', running);
      if (!running) {
        setStatus('Voice Paused');
        return;
      }
      setStatus(mode === 'command' ? 'Listening...' : 'Online');
    }
  });

  if (voiceController.supported) {
    voiceController.start();
  } else {
    setStatus('Voice Native Unavailable');
  }

  // Initial Welcome
  setTimeout(() => {
    appendMessage(
      'assistant',
      client.hasApiKey
        ? 'Neural link established. Gemini AI is online. Say "Hey Gesture" for hands-free assistance.'
        : 'UI Initialized. Please configure VITE_GEMINI_API_KEY for cloud reasoning.'
    );
  }, 1000);

  toggleBtn.addEventListener('click', () => setOpen(!isOpen));
  closeBtn.addEventListener('click', () => setOpen(false));

  micBtn.addEventListener('click', () => {
    if (!voiceController.supported) return;
    const running = micBtn.classList.contains('assistant-mic-on');
    if (running) voiceController.stop();
    else voiceController.start();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    sendMessage(input.value);
  });
});
