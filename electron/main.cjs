const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  session,
  screen: electronScreen,
} = require('electron');
const path = require('path');
const { keyboard, Key, mouse, screen } = require('@nut-tree-fork/nut-js');

mouse.config.mouseSpeed = 2000;

/** Python OS bridge (python-core `python main.py --api`). Override with GESTRA_PYTHON_URL. */
const PYTHON_BRIDGE_BASE = String(process.env.GESTRA_PYTHON_URL || 'http://127.0.0.1:8765').replace(/\/+$/, '');

let mainWindow;
let tray;
/** When false, closing the window hides to tray (Python bridge + gestures keep running). */
let appIsQuitting = false;
/** User-toggle: keep small window above other apps (floating palette). */
let pinWindowAbove = false;

const GEMINI_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1';
const GEMINI_DEFAULT_MODEL = 'gemini-1.5-flash';
const XAI_DEFAULT_BASE_URL = 'https://api.x.ai/v1';
const XAI_DEFAULT_MODEL = 'grok-3-latest';

function buildGeminiUrl(baseUrl, model, apiKey) {
  const normalizedBaseUrl = String(baseUrl || GEMINI_DEFAULT_BASE_URL).replace(/\/+$/, '');
  const normalizedModel = String(model || GEMINI_DEFAULT_MODEL)
    .trim()
    .replace(/^models\//, '');

  return `${normalizedBaseUrl}/models/${normalizedModel}:generateContent?key=${apiKey}`;
}

function buildXaiUrl(baseUrl) {
  return `${String(baseUrl || XAI_DEFAULT_BASE_URL).replace(/\/+$/, '')}/chat/completions`;
}

async function proxyAssistantRequest(payload) {
  const {
    provider = 'gemini',
    baseUrl,
    apiKey,
    model,
    prompt,
    history,
    systemPrompt = 'You are GestureOS Assistant. Keep answers concise.'
  } = payload || {};

  if (!apiKey) {
    throw new Error(`Missing ${provider === 'xai' ? 'xAI' : 'Gemini'} API key.`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    if (provider === 'xai') {
      const url = buildXaiUrl(baseUrl);
      console.log(`[BACKEND] Requesting xAI: ${url}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || XAI_DEFAULT_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            ...(history || []).map(item => ({
              role: item.role === 'assistant' ? 'assistant' : 'user',
              content: item.content
            })),
            { role: 'user', content: prompt }
          ]
        }),
        signal: controller.signal,
      });

      const data = await response.json();
      if (!response.ok) {
        console.error(`[BACKEND] xAI Error (${response.status}):`, data);
        throw new Error(`xAI request failed (${response.status}): ${JSON.stringify(data.error || data)}`);
      }

      return data?.choices?.[0]?.message?.content || 'No response from xAI.';
    }

    const url = buildGeminiUrl(baseUrl, model, apiKey);
    console.log(`[BACKEND] Requesting Gemini: ${url}`);

    const contents = (history || []).map(item => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.content }]
    }));
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contents }),
      signal: controller.signal,
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`[BACKEND] Gemini Error (${response.status}):`, data);
      if (response.status === 404) {
        throw new Error(
          `Gemini model "${String(model || GEMINI_DEFAULT_MODEL).trim()}" was not found. Set VITE_GEMINI_MODEL to a supported model such as "${GEMINI_DEFAULT_MODEL}".`
        );
      }
      throw new Error(`Gemini request failed (${response.status}): ${JSON.stringify(data.error || data)}`);
    }

    return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Gemini.';
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Request timed out after 30 seconds.');
    console.error('[BACKEND] Fetch error:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeActionName(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

async function runOsAction(actionRaw, options) {
  const action = normalizeActionName(actionRaw);
  console.log('[GestureOS/Main] runOsAction:', action, options ? JSON.stringify(options) : '');

  switch (action) {
    case 'scroll-up':
    case 'scrollup':
      await mouse.scrollUp(1200);
      break;
    case 'scroll-down':
    case 'scrolldown':
      await mouse.scrollDown(1200);
      break;
    case 'left-click':
    case 'leftclick':
      await mouse.leftClick();
      break;
    case 'right-click':
    case 'rightclick':
      await mouse.rightClick();
      break;
    case 'play-pause':
    case 'playpause':
    case 'media-toggle':
      await keyboard.type(Key.AudioPlay);
      break;
    case 'screenshot':
      await keyboard.type(Key.Print);
      break;
    case 'alt-tab':
    case 'alttab':
      await keyboard.pressKey(Key.LeftAlt, Key.Tab);
      await keyboard.releaseKey(Key.LeftAlt, Key.Tab);
      break;
    case 'volume-up':
    case 'volumeup':
      await keyboard.type(Key.AudioVolUp);
      break;
    case 'volume-down':
    case 'volumedown':
      await keyboard.type(Key.AudioVolDown);
      break;
    case 'move-mouse':
    case 'movemouse': {
      const nx = Number(options?.nx);
      const ny = Number(options?.ny);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
        console.warn('[GestureOS/Main] move-mouse skipped: expected options { nx, ny } in 0–1 range');
        break;
      }
      const w = await screen.width();
      const h = await screen.height();
      const x = Math.round(Math.min(1, Math.max(0, nx)) * Math.max(0, w - 1));
      const y = Math.round(Math.min(1, Math.max(0, ny)) * Math.max(0, h - 1));
      await mouse.setPosition({ x, y });
      break;
    }
    default:
      console.warn('[GestureOS/Main] Unknown action:', actionRaw);
  }

  console.log('[GestureOS/Main] runOsAction done:', action);
}

/**
 * Talk to the local Python bridge from the main process (no renderer CORS).
 * ops: health | bridge | gesture
 */
async function pythonBridgeIpc(payload) {
  const op = payload?.op;
  const withBase = (obj) => ({ ...obj, baseUrl: PYTHON_BRIDGE_BASE });
  if (!op) {
    return withBase({ ok: false, error: 'python-bridge: missing op' });
  }
  try {
    if (op === 'health') {
      const res = await fetch(`${PYTHON_BRIDGE_BASE}/health`);
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = { raw: text };
      }
      return withBase({ ok: res.ok, status: res.status, data });
    }
    if (op === 'bridge') {
      const res = await fetch(`${PYTHON_BRIDGE_BASE}/api/v1/bridge`);
      const data = await res.json().catch(() => null);
      return withBase({ ok: res.ok, status: res.status, data });
    }
    if (op === 'state') {
      const res = await fetch(`${PYTHON_BRIDGE_BASE}/api/v1/state`);
      const data = await res.json().catch(() => null);
      return withBase({ ok: res.ok, status: res.status, data });
    }
    if (op === 'gesture') {
      const action = payload?.action;
      const options = payload?.options ?? null;
      const res = await fetch(`${PYTHON_BRIDGE_BASE}/gesture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          options,
          source: 'electron-main',
        }),
      });
      return withBase({ ok: res.ok, status: res.status });
    }
    return withBase({ ok: false, error: `python-bridge: unknown op "${op}"` });
  } catch (err) {
    console.warn('[GestureOS/Main] python-bridge:', err?.message || err);
    return withBase({ ok: false, error: String(err?.message || err) });
  }
}

function setupMediaPermissions() {
  const allowMediaPermission = (permission) =>
    permission === 'media' ||
    permission === 'camera' ||
    permission === 'microphone' ||
    permission === 'speaker-selection';

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (allowMediaPermission(permission)) {
      if (!app.isPackaged) {
        console.log('[GestureOS] Allowing permission:', permission, details?.mediaTypes);
      }
      callback(true);
      return;
    }
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (allowMediaPermission(permission)) {
      return true;
    }
    return null;
  });
}

const FLOATING_WIDTH = 400;
const FLOATING_HEIGHT = 640;
const FLOATING_MARGIN = 16;

function placeFloatingWindow(win) {
  const { width: wa, height: wh, x: wx, y: wy } = electronScreen.getPrimaryDisplay().workArea;
  win.setBounds({
    x: wx + wa - FLOATING_WIDTH - FLOATING_MARGIN,
    y: wy + wh - FLOATING_HEIGHT - FLOATING_MARGIN,
    width: FLOATING_WIDTH,
    height: FLOATING_HEIGHT,
  });
}

function applyAlwaysOnTopPreference() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (pinWindowAbove) {
    mainWindow.setAlwaysOnTop(true, 'floating');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setVisibleOnAllWorkspaces(false);
  }
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Show GestureOS',
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      {
        label: 'Hide to background',
        click: () => mainWindow?.hide(),
      },
      { type: 'separator' },
      {
        label: 'Pin above other windows',
        type: 'checkbox',
        checked: pinWindowAbove,
        click: (item) => {
          pinWindowAbove = Boolean(item.checked);
          applyAlwaysOnTopPreference();
          rebuildTrayMenu();
        },
      },
      { type: 'separator' },
      {
        label: 'Quit completely',
        click: () => {
          appIsQuitting = true;
          app.quit();
        },
      },
    ])
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: FLOATING_WIDTH,
    height: FLOATING_HEIGHT,
    minWidth: 340,
    minHeight: 480,
    maxWidth: 720,
    maxHeight: 900,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    frame: true,
    backgroundColor: '#081121',
    title: 'GestureOS',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });

  placeFloatingWindow(mainWindow);
  applyAlwaysOnTopPreference();

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (appIsQuitting) {
      return;
    }
    event.preventDefault();
    mainWindow?.hide();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function createTray() {
  tray = new Tray(
    nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s2son8AAAAASUVORK5CYII='
    )
  );
  tray.setToolTip('GestureOS — runs in background; use Quit to exit');
  rebuildTrayMenu();
  tray.on('double-click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

app.whenReady().then(() => {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  setupMediaPermissions();

  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true });
  }

  ipcMain.handle('python-bridge', async (_event, payload) => pythonBridgeIpc(payload));

  ipcMain.handle('perform-action', async (_event, payload) => {
    const action = typeof payload === 'string' ? payload : payload?.action;
    const options = typeof payload === 'object' && payload ? payload.options : null;
    try {
      await runOsAction(action, options);
      return { ok: true };
    } catch (err) {
      console.error('[GestureOS/Main] perform-action failed:', err);
      throw err;
    }
  });
  ipcMain.handle('assistant-request', async (_event, payload) => proxyAssistantRequest(payload));
  ipcMain.handle('set-overlay-mode', async (_event, enabled) => {
    mainWindow?.setIgnoreMouseEvents(Boolean(enabled), { forward: true });
  });
  ipcMain.handle('hide-window', async () => mainWindow?.hide());
  ipcMain.handle('show-window', async () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
  ipcMain.handle('set-pin-above', async (_event, enabled) => {
    pinWindowAbove = Boolean(enabled);
    applyAlwaysOnTopPreference();
    rebuildTrayMenu();
    return { ok: true, pinWindowAbove };
  });
  ipcMain.handle('get-window-mode', async () => ({
    pinWindowAbove,
    floating: { width: FLOATING_WIDTH, height: FLOATING_HEIGHT },
  }));

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      return;
    }
    mainWindow?.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
