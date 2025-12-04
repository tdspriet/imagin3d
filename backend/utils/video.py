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


def _is_near_solid_frame(frame: np.ndarray, threshold: float = 50.0) -> bool:
    # Convert to grayscale and check standard deviation
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    std_dev = np.std(gray)
    return std_dev < threshold


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
        valid_indices: list[int] = []
        frame_idx = 0

        while True:
            success, frame = capture.read()
            if not success or frame is None:
                break
            # Skip near-solid frames (pure black, white, or uniform color)
            if not _is_near_solid_frame(frame):
                features.append(_feature_vector(frame))
                valid_indices.append(frame_idx)
            frame_idx += 1

        capture.release()

        if not features:
            return []

        selected_local = _select_diverse_indices(features, frame_count)
        # Map back to original frame indices
        indices = [valid_indices[i] for i in selected_local]

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
