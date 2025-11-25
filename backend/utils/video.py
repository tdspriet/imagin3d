from __future__ import annotations

import base64
import os
import re
import tempfile
from pathlib import Path

import cv2
import numpy as np
import pydantic_ai


def _decode_data_url(data_url: str) -> tuple[bytes, str]:
    try:
        header, encoded = data_url.split(",", 1)
    except ValueError as exc:
        raise ValueError("Invalid video data URL") from exc

    match = re.match(r"data:(?P<mime>[\w/-]+);base64", header)
    if not match:
        raise ValueError("Unsupported video data URL format")

    mime_type = match.group("mime")
    return base64.b64decode(encoded), mime_type


def _feature_vector(frame: np.ndarray) -> np.ndarray:
    # Small color feature vector for diversity scoring.
    resized = cv2.resize(frame, (32, 32))
    lab = cv2.cvtColor(resized, cv2.COLOR_BGR2LAB)
    return lab.astype(np.float32).flatten()


def _select_diverse_indices(features: list[np.ndarray], count: int) -> list[int]:
    if not features:
        return []

    selected = [0]
    while len(selected) < min(count, len(features)):
        best_idx = None
        best_dist = -1.0
        for idx, feat in enumerate(features):
            if idx in selected:
                continue
            min_dist = min(
                float(np.linalg.norm(feat - features[s_idx])) for s_idx in selected
            )
            if min_dist > best_dist:
                best_dist = min_dist
                best_idx = idx
        if best_idx is None:
            break
        selected.append(best_idx)
    return selected


def _frame_to_image(frame: np.ndarray) -> pydantic_ai.BinaryImage:
    success, buffer = cv2.imencode(".jpg", frame)
    if not success:
        raise ValueError("Failed to encode frame to JPEG")
    return pydantic_ai.BinaryImage(data=buffer.tobytes(), media_type="image/jpeg")


def extract_key_frames(
    video_data_url: str, frame_count: int = 5
) -> list[pydantic_ai.BinaryImage]:
    # Return the most diverse frames as BinaryImage objects.
    video_bytes, mime_type = _decode_data_url(video_data_url)
    suffix = {
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "video/ogg": ".ogg",
    }.get(mime_type, ".mp4")

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp_file:
        tmp_file.write(video_bytes)
        temp_path = Path(tmp_file.name)

    try:
        capture = cv2.VideoCapture(str(temp_path))
        features: list[np.ndarray] = []

        while True:
            success, frame = capture.read()
            if not success or frame is None:
                break
            features.append(_feature_vector(frame))

        capture.release()

        if not features:
            return []

        indices = _select_diverse_indices(features, frame_count)

        # Re-open video to fetch only the selected frames to save memory
        capture = cv2.VideoCapture(str(temp_path))
        frame_map = {}
        sorted_indices = sorted(list(set(indices)))

        for idx in sorted_indices:
            capture.set(cv2.CAP_PROP_POS_FRAMES, idx)
            success, frame = capture.read()
            if success and frame is not None:
                frame_map[idx] = _frame_to_image(frame)

        capture.release()

        return [frame_map[idx] for idx in indices if idx in frame_map]
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass
