# GestureOS (Gestra2)

Webcam **hand tracking** (MediaPipe) mapped to **OS control** via **Python** (**MediaPipe Tasks + OpenCV + PyAutoGUI**). This avoids native Node bindings (`robotjs`), **nut-js**, and fragile Electron-side automation.

The **Electron / Vite** UI is optional: it runs the same **gesture classifier** in the browser and can **forward actions** to Python over HTTP when **`python main.py --api`** is running. **The Electron-based OS control path is deprecated** for desktop automation; use **python-core** for reliable control.

## Python gesture engine (working MVP)

1. **Install**

   ```bash
   cd python-core
   pip install -r requirements.txt
   python main.py
   ```

   On first run, the **hand landmarker** `.task` model is downloaded into `python-core/models/`.

2. **Gestures → actions** (21 landmarks, finger up/down rules; **stable ≈ 6 frames** @ ~0.7 confidence)

   | Gesture | Action |
   |---------|--------|
   | Open palm (four fingers + thumb extended) | Scroll **up** continuously while held |
   | Closed fist | Scroll **down** continuously while held |
   | Peace (index + middle up, spread) | **PrintScreen** (once per stable pose, **1 s** cooldown) |
   | Thumbs up only | **Media play/pause** (**1 s** cooldown) |
   | Index point only | Move cursor with index tip; **left click** when pose becomes stable (**1 s** cooldown) |

   Press **ESC** in the OpenCV preview to exit (OpenCV is **off** when using `--api` alone; add **`--window`** if you want both the stream and a local preview).

3. **Collective mode (recommended with Electron)** — one camera, one MediaPipe pipeline

   **Python** grabs the webcam, runs MediaPipe + PyAutoGUI, and serves:

   - **`GET /camera.mjpg`** — MJPEG preview (mirrored, with HUD) for the UI.
   - **`GET /api/v1/state`** — JSON for the HUD (`gesture`, `stable`, `fps`, `landmarks`, …).

   **Electron** does **not** open the camera in this mode: it shows the MJPEG in **`#python-vision-feed`** and polls state (~20 Hz) so **`#app-container`** overlays stay in sync. **OS actions are not duplicated** from the renderer (Python already runs them).

   Terminal A:

   ```bash
   cd python-core
   python main.py --api
   ```

   Terminal B:

   ```bash
   npm run dev
   ```

   If the bridge responds with **`vision.collective`**, the app switches to collective vision automatically.

4. **Local camera mode** (no Python `--api`, or bridge down)

   The app uses **getUserMedia** + **browser MediaPipe** and may still **`POST /gesture`** to Python for OS actions when the bridge is up.

   - **Electron** → **`electronAPI.pythonBridge`** (includes **`GET /api/v1/state`** for IPC). **`GET /api/v1/bridge`** returns the full manifest.
   - Optional env: **`GESTRA_PYTHON_URL`** / **`VITE_PYTHON_BRIDGE_URL`** if the bridge is not on `127.0.0.1:8765`.

### Python layout

- `python-core/main.py` — camera loop, stability → actions; **`--api`** adds MJPEG + `/api/v1/state` (threaded HTTP).
- `python-core/gesture.py` — MediaPipe Hands landmarks + gesture labels + stability buffer.
- `python-core/actions.py` — PyAutoGUI: smoothing, discrete cooldowns, repeating scroll.

Logs include **Hand detected**, **Cursor moving** (throttled), **Click triggered**, **Screenshot**, **Play/pause**.

## Legacy Electron app (optional)

- **Node.js** 18+ recommended.
- **Internet** on first run for MediaPipe WASM CDN assets.
- **Window behavior:** the shell is a **compact floating panel** (default **bottom-right** of the work area). It is **not** forced to the foreground: you can put other apps on top. **Closing the window hides to the tray** (bridge and timers keep running); use **Quit completely** in the tray menu to exit. Tray **Pin above other windows** (or `electronAPI.setPinAbove(true)`) restores an always-on-top floating palette when you want it.

```bash
npm install
npm run dev
```

### Scripts

| Command | Purpose |
|--------|---------|
| `npm run dev` | Vite + Electron. |
| `npm run build` | Production Vite build. |
| `npm run preview` | Static preview only. |

### Project layout

- `python-core/` — **supported** desktop gesture → OS pipeline.
- `electron/main.cjs` — window / tray (automation optional).
- `src/main.js` — collective vision (Python MJPEG + state) or local webcam + MediaPipe.
- `src/gesture-mediapipe.js` — browser hand gestures (mirrors Python rules).
- `src/actions.js` — forwards actions to Python **`POST /gesture`**.

## License

See repository license if present; dependencies have their own licenses.
