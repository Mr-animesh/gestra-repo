"""
MediaPipe Tasks Hand Landmarker + rule-based gesture classification (21 landmarks).
Finger up/down heuristics aligned with src/gesture-mediapipe.js.
"""

from __future__ import annotations

import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np
from mediapipe.tasks.python.core.base_options import BaseOptions
from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions
from mediapipe.tasks.python.vision.core import image as mp_image
from mediapipe.tasks.python.vision.core.vision_task_running_mode import VisionTaskRunningMode

_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/"
    "hand_landmarker.task"
)

REQUIRED_STABLE_FRAMES = 6
MAX_HISTORY = 12


def _default_model_path() -> Path:
    return Path(__file__).resolve().parent / "models" / "hand_landmarker.task"


def ensure_hand_model(path: Optional[Path] = None) -> Path:
    p = path or _default_model_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    if not p.is_file():
        print(f"[gesture] Downloading hand landmarker model to {p} ...")
        urllib.request.urlretrieve(_MODEL_URL, p)
    return p


def _dist_norm(ax: float, ay: float, bx: float, by: float) -> float:
    dx = ax - bx
    dy = ay - by
    return (dx * dx + dy * dy) ** 0.5


def classify_gesture_from_landmarks(lm: Sequence[object]) -> Tuple[str, float]:
    """
    lm: list of 21 landmarks with .x, .y, .z (normalized).
    Returns (gesture_id, confidence).
    """
    thumb_tip = lm[4]
    thumb_mcp = lm[2]
    index_tip = lm[8]
    index_pip = lm[6]
    middle_tip = lm[12]
    middle_pip = lm[10]
    ring_tip = lm[16]
    ring_pip = lm[14]
    pinky_tip = lm[20]
    pinky_pip = lm[18]

    index_up = index_tip.y < index_pip.y
    middle_up = middle_tip.y < middle_pip.y
    ring_up = ring_tip.y < ring_pip.y
    pinky_up = pinky_tip.y < pinky_pip.y

    thumb_up = thumb_tip.y < thumb_mcp.y and thumb_tip.y < lm[5].y - 0.02

    up_finger_count = sum(1 for u in (index_up, middle_up, ring_up, pinky_up) if u)

    if up_finger_count >= 4 and thumb_up:
        return "palm", 0.95

    if up_finger_count == 0 and not thumb_up:
        avg_tip_y = (index_tip.y + middle_tip.y + ring_tip.y + pinky_tip.y) / 4.0
        if avg_tip_y > lm[5].y:
            return "fist", 0.94

    if index_up and middle_up and not ring_up and not pinky_up:
        gap = _dist_norm(index_tip.x, index_tip.y, middle_tip.x, middle_tip.y)
        if gap > 0.05:
            return "peace", 0.90

    if thumb_up and up_finger_count == 0:
        return "thumb", 0.88

    if index_up and not middle_up and not ring_up and not pinky_up and not thumb_up:
        return "index", 0.85

    return "none", 0.4


@dataclass
class GestureFrame:
    hand_detected: bool
    gesture: str
    confidence: float
    stable: bool
    cursor_x: int
    cursor_y: int
    stable_count: int = 0
    history_len: int = 0
    stability: float = 0.0
    landmarks_norm: Optional[List[Dict[str, float]]] = None


class GestureDetector:
    def __init__(
        self,
        screen_width: int,
        screen_height: int,
        *,
        model_path: Optional[Path] = None,
        min_confidence: float = 0.7,
        min_hand_detection_confidence: float = 0.7,
        min_hand_presence_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
    ) -> None:
        self._sw = max(1, int(screen_width))
        self._sh = max(1, int(screen_height))
        self._min_confidence = min(0.98, max(0.5, min_confidence))
        self._ts_ms = 0
        self._history: List[str] = []

        mp = ensure_hand_model(model_path)
        options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(mp)),
            running_mode=VisionTaskRunningMode.VIDEO,
            num_hands=1,
            min_hand_detection_confidence=min_hand_detection_confidence,
            min_hand_presence_confidence=min_hand_presence_confidence,
            min_tracking_confidence=min_tracking_confidence,
        )
        self._landmarker = HandLandmarker.create_from_options(options)

    def close(self) -> None:
        self._landmarker.close()

    def _stability_tuple(
        self, gesture: str, hand_detected: bool, confidence: float
    ) -> Tuple[bool, int, int, float]:
        self._history.append(gesture)
        self._history = self._history[-MAX_HISTORY:]
        stable_count = sum(1 for g in self._history if g == gesture)
        history_len = len(self._history)
        stability = stable_count / max(history_len, 1)
        stable = (
            hand_detected
            and gesture != "none"
            and confidence >= self._min_confidence
            and stable_count >= REQUIRED_STABLE_FRAMES
        )
        return stable, stable_count, history_len, stability

    def process_bgr(self, frame_bgr) -> GestureFrame:
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        rgb = np.ascontiguousarray(rgb)
        mp_img = mp_image.Image(mp_image.ImageFormat.SRGB, rgb)

        self._ts_ms += 33
        result = self._landmarker.detect_for_video(mp_img, self._ts_ms)

        if not result.hand_landmarks:
            self._history.clear()
            return GestureFrame(
                hand_detected=False,
                gesture="none",
                confidence=0.0,
                stable=False,
                cursor_x=self._sw // 2,
                cursor_y=self._sh // 2,
                stable_count=0,
                history_len=0,
                stability=0.0,
                landmarks_norm=None,
            )

        lm = result.hand_landmarks[0]
        gesture, confidence = classify_gesture_from_landmarks(lm)
        stable, stable_count, history_len, stability = self._stability_tuple(gesture, True, confidence)

        landmarks_norm: List[Dict[str, float]] = [
            {"x": float(p.x), "y": float(p.y), "z": float(p.z)} for p in lm
        ]

        index_tip = lm[8]
        nx = 1.0 - float(index_tip.x)
        ny = float(index_tip.y)
        cx = int(max(0, min(self._sw - 1, nx * self._sw)))
        cy = int(max(0, min(self._sh - 1, ny * self._sh)))

        return GestureFrame(
            hand_detected=True,
            gesture=gesture,
            confidence=confidence,
            stable=stable,
            cursor_x=cx,
            cursor_y=cy,
            stable_count=stable_count,
            history_len=history_len,
            stability=stability,
            landmarks_norm=landmarks_norm,
        )
