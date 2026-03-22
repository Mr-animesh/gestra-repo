import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const MIN_CONFIDENCE = 0.72;
const REQUIRED_STABLE_FRAMES = 6;
const MAX_HISTORY = 12;

let handLandmarker;
let animationFrameId = 0;
let lastVideoTime = -1;
let lastTick = performance.now();
let fps = 0;
let history = [];

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isFingerExtended(landmarks, tipIndex, pipIndex) {
  return landmarks[tipIndex].y < landmarks[pipIndex].y;
}

function classifyGesture(landmarks) {
  const wrist = landmarks[0];
  const thumbTip = landmarks[4];
  const thumbMcp = landmarks[2];
  const indexTip = landmarks[8];
  const indexPip = landmarks[6];
  const middleTip = landmarks[12];
  const middlePip = landmarks[10];
  const ringTip = landmarks[16];
  const ringPip = landmarks[14];
  const pinkyTip = landmarks[20];
  const pinkyPip = landmarks[18];

  // Helper: check if finger is extended
  const indexUp = indexTip.y < indexPip.y;
  const middleUp = middleTip.y < middlePip.y;
  const ringUp = ringTip.y < ringPip.y;
  const pinkyUp = pinkyTip.y < pinkyPip.y;
  
  // Thumb is up if it's above the wrist and well above the MCP
  const thumbUp = thumbTip.y < thumbMcp.y && thumbTip.y < landmarks[5].y - 0.02;

  const upFingerCount = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;

  // 1. Palm - All fingers up
  if (upFingerCount >= 4 && thumbUp) {
    return { gesture: 'palm', confidence: 0.95 };
  }

  // 2. Fist - All fingers down and close to palm
  if (upFingerCount === 0 && !thumbUp) {
    const avgTipY = (indexTip.y + middleTip.y + ringTip.y + pinkyTip.y) / 4;
    if (avgTipY > landmarks[5].y) {
       return { gesture: 'fist', confidence: 0.94 };
    }
  }

  // 3. Peace - Index and Middle up, others down
  if (indexUp && middleUp && !ringUp && !pinkyUp) {
    const gap = distance(indexTip, middleTip);
    if (gap > 0.05) {
      return { gesture: 'peace', confidence: 0.9 };
    }
  }

  // 4. Thumb Up - Only thumb up
  if (thumbUp && upFingerCount === 0) {
    return { gesture: 'thumb', confidence: 0.88 };
  }

  // 5. Index Point - Only index up
  if (indexUp && !middleUp && !ringUp && !pinkyUp && !thumbUp) {
    return { gesture: 'index', confidence: 0.85 };
  }

  return { gesture: 'none', confidence: 0.4 };
}

function buildState(classification, handDetected, landmarks) {
  history.push(classification.gesture);
  history = history.slice(-MAX_HISTORY);

  const stableCount = history.filter((gesture) => gesture === classification.gesture).length;
  const stable =
    handDetected &&
    classification.gesture !== 'none' &&
    classification.confidence >= MIN_CONFIDENCE &&
    stableCount >= REQUIRED_STABLE_FRAMES;

  return {
    ...classification,
    landmarks,
    fps,
    handDetected,
    stable,
    stableCount,
    stability: stableCount / Math.max(history.length, 1),
  };
}

async function ensureLandmarker() {
  if (handLandmarker) {
    return handLandmarker;
  }

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });

  return handLandmarker;
}

export async function initGestureEngine() {
  await ensureLandmarker();
}

export function stopGestureEngine() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  animationFrameId = 0;
  lastVideoTime = -1;
  history = [];
}

export function startGestureEngine(videoElement, { onFrame, onGesture } = {}) {
  stopGestureEngine();

  const loop = () => {
    const now = performance.now();
    const delta = now - lastTick;
    lastTick = now;
    if (delta > 0) {
      fps = 1000 / delta;
    }

    if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const currentTime = videoElement.currentTime;
      if (currentTime !== lastVideoTime) {
        lastVideoTime = currentTime;
        const result = handLandmarker.detectForVideo(videoElement, now);
        const landmarks = result?.landmarks?.[0] || null;
        const handDetected = Boolean(landmarks);
        const classification = handDetected
          ? classifyGesture(landmarks)
          : { gesture: 'none', confidence: 0 };
        const state = buildState(classification, handDetected, landmarks);

        onFrame?.(state);
        if (state.stable) {
          onGesture?.(state);
        }
      }
    }

    animationFrameId = requestAnimationFrame(loop);
  };

  animationFrameId = requestAnimationFrame(loop);
}
