"""Snapshot backend artifacts into a persistent run directory.

The backend wipes backend/artifacts/ at the start of every /extract call.
This module copies the outputs we care about into pipeline/runs/<run_id>/<arm>/
before the next call clobbers them.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

PIPELINE_DIR = Path(__file__).parent.parent.resolve()
BACKEND_ROOT = Path(__file__).parent.parent.parent / "backend"
ARTIFACTS = BACKEND_ROOT / "artifacts"


def snapshot(arm: str, run_dir: Path) -> Path:
    """Copy the current backend artifacts into run_dir/arm/.

    Returns the path to the archived sample.glb.
    """
    arm_dir = run_dir / arm
    arm_dir.mkdir(parents=True, exist_ok=True)

    _copy_if_exists(ARTIFACTS / "master_prompt.txt", arm_dir / "master_prompt.txt")
    _copy_if_exists(ARTIFACTS / "master_image.jpg",       arm_dir / "master_image.jpg")
    _copy_if_exists(ARTIFACTS / "master_image_front.jpg", arm_dir / "master_image_front.jpg")
    _copy_if_exists(ARTIFACTS / "master_image_back.jpg",  arm_dir / "master_image_back.jpg")

    glb_src = ARTIFACTS / "trellis" / "sample.glb"
    glb_dst = arm_dir / "sample.glb"
    _copy_if_exists(glb_src, glb_dst)

    return glb_dst


def write_scores(arm_dir: Path, scores: dict[str, Any]) -> None:
    (arm_dir / "scores.json").write_text(json.dumps(scores, indent=2))


def write_manifest(run_dir: Path, manifest: dict[str, Any]) -> None:
    (run_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))


def _copy_if_exists(src: Path, dst: Path) -> None:
    if src.exists():
        shutil.copy2(src, dst)
