const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } = require('electron');
const path = require('path');
const { keyboard, Key, mouse } = require('@nut-tree-fork/nut-js');

mouse.config.mouseSpeed = 2000;

let mainWindow;
let tray;

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

async function executeGesture(action) {
  switch (action) {
    case 'scroll_up':
      await mouse.scrollUp(1200);
      break;
    case 'scroll_down':
      await mouse.scrollDown(1200);
      break;
    case 'screenshot':
      await keyboard.type(Key.Print);
      break;
    case 'media_toggle':
      await keyboard.type(Key.AudioPlay);
      break;
    case 'left_click':
      await mouse.leftClick();
      break;
    default:
      console.log('[BACKEND] Unknown action:', action);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 780,
    minWidth: 420,
    minHeight: 620,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    frame: true,
    backgroundColor: '#081121',
    title: 'GestureOS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

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
  tray.setToolTip('GestureOS');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show GestureOS', click: () => mainWindow?.show() },
      { label: 'Hide Overlay', click: () => mainWindow?.hide() },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          app.quit();
        },
      },
    ])
  );
  tray.on('double-click', () => mainWindow?.show());
}

app.whenReady().then(() => {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true });
  }

  ipcMain.handle('execute-action', async (_event, gesture) => executeGesture(gesture));
  ipcMain.handle('assistant-request', async (_event, payload) => proxyAssistantRequest(payload));
  ipcMain.handle('set-overlay-mode', async (_event, enabled) => {
    mainWindow?.setIgnoreMouseEvents(Boolean(enabled), { forward: true });
  });
  ipcMain.handle('hide-window', async () => mainWindow?.hide());
  ipcMain.handle('show-window', async () => mainWindow?.show());

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
