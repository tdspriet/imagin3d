#!/usr/bin/env python3
"""A/B generation pipeline CLI.

Runs both the Imagin3D pipeline and the baseline pipeline on one or more
moodboard datasets sequentially (required on a single RTX 4090), archives all
outputs, computes CLIP metrics, and writes a manifest.json for the /AB viewer.

Usage:
  # From the repo root with the backend conda env active:
  python -m pipeline.run_ab --dataset example_chair
  python -m pipeline.run_ab --all
  python -m pipeline.run_ab --dataset example_chair --skip-imagin3d   # baseline only
  python -m pipeline.run_ab --dataset example_chair --skip-baseline    # Imagin3D only

Environment:
  Requires the same .env as the backend (BEDROCK_ACCESS_KEY_ID, GOOGLE_API_KEY, etc).
  Trellis version is selected by CONDA_DEFAULT_ENV (trellis → v1, trellis2 → v2).
"""
from __future__ import annotations

import argparse
import asyncio
import gc
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Ensure repo root is on sys.path so we can import both backend and pipeline.
_REPO_ROOT = Path(__file__).parent.parent.resolve()
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

# Load .env before importing backend
from dotenv import find_dotenv, load_dotenv

for _env_path in (
    find_dotenv(usecwd=True),
    _REPO_ROOT / "backend" / ".env",
):
    if _env_path and Path(_env_path).exists():
        load_dotenv(_env_path)
        break

# AWS / Google env vars expected by the backend
os.environ.setdefault("AWS_ACCESS_KEY_ID",     os.environ.get("BEDROCK_ACCESS_KEY_ID", ""))
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", os.environ.get("BEDROCK_SECRET_ACCESS_KEY", ""))
os.environ.setdefault("AWS_DEFAULT_REGION",    "eu-central-1")

import structlog

from pipeline.core.dataset import load as load_moodboard
from pipeline.core.imagin3d_runner import run_imagin3d
from pipeline.core.baseline_runner import run_baseline
from pipeline.core.moodboard_snapshot import render as render_snapshot
from pipeline.eval.clip_metrics import clip_preservation, clip_closeness
from pipeline.eval.render import render_glb

logger = structlog.stdlib.get_logger(__name__)

PIPELINE_DIR = Path(__file__).parent.resolve()
DATASETS_DIR = PIPELINE_DIR / "datasets"
RUNS_DIR = PIPELINE_DIR / "runs"


def _discover_datasets() -> list[Path]:
    return sorted(
        d for d in DATASETS_DIR.iterdir()
        if d.is_dir() and (d / "moodboard.json").exists()
    )


def _make_run_dir(moodboard_name: str) -> Path:
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    run_dir = RUNS_DIR / f"{ts}_{moodboard_name}"
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir


async def _run_dataset(
    dataset_dir: Path,
    skip_imagin3d: bool = False,
    skip_baseline: bool = False,
) -> None:
    moodboard = load_moodboard(dataset_dir)
    run_dir = _make_run_dir(moodboard.name)

    logger.info("Starting A/B run", dataset=moodboard.name, run_dir=str(run_dir))

    # Moodboard snapshot (PIL composite for the viewer)
    snapshot_path = run_dir / "moodboard_snapshot.png"
    try:
        render_snapshot(moodboard, snapshot_path)
    except Exception as e:
        logger.warning("Moodboard snapshot failed (non-fatal)", error=str(e))

    imagin3d_scores: dict = {}
    baseline_scores: dict = {}
    imagin3d_glb: Path | None = None
    baseline_glb: Path | None = None

    # ── Arm 1: Imagin3D ─────────────────────────────────────────────────────
    if not skip_imagin3d:
        logger.info("Running Imagin3D arm")
        try:
            imagin3d_glb = await run_imagin3d(moodboard, run_dir)
            imagin3d_scores = await _score_arm(
                arm="imagin3d",
                glb_path=imagin3d_glb,
                run_dir=run_dir,
                moodboard=moodboard,
            )
            _write_scores(run_dir / "imagin3d", imagin3d_scores)
        except Exception as e:
            logger.error("Imagin3D arm failed", error=str(e))
        _free_gpu()

    # ── Arm 2: Baseline ──────────────────────────────────────────────────────
    if not skip_baseline:
        logger.info("Running baseline arm")
        try:
            baseline_glb = await run_baseline(moodboard, run_dir)
            baseline_scores = await _score_arm(
                arm="baseline",
                glb_path=baseline_glb,
                run_dir=run_dir,
                moodboard=moodboard,
            )
            _write_scores(run_dir / "baseline", baseline_scores)
        except Exception as e:
            logger.error("Baseline arm failed", error=str(e))
        _free_gpu()

    # ── Manifest ────────────────────────────────────────────────────────────
    _write_manifest(run_dir, moodboard, imagin3d_scores, baseline_scores)

    logger.info("A/B run complete", run_dir=str(run_dir))


async def _score_arm(
    arm: str,
    glb_path: Path,
    run_dir: Path,
    moodboard,
) -> dict:
    arm_dir = run_dir / arm

    # Render GLB views for evaluation
    renders_dir = arm_dir / "renders"
    try:
        render_paths = await render_glb(glb_path, renders_dir)
    except Exception as e:
        logger.warning(f"{arm}: Blender render failed, skipping metrics", error=str(e))
        return {}

    # Master image(s) for preservation metric
    master_paths: list[Path] = []
    for fname in ("master_image.jpg", "master_image_front.jpg", "master_image_back.jpg"):
        p = arm_dir / fname
        if p.exists():
            master_paths.append(p)

    # For baseline, the master is the Nano Banana output
    if arm == "baseline":
        nb = arm_dir / "nano_banana.jpg"
        if nb.exists():
            master_paths = [nb]

    preservation = 0.0
    if master_paths:
        try:
            preservation = clip_preservation(master_paths, render_paths)
        except Exception as e:
            logger.warning(f"{arm}: preservation metric failed", error=str(e))

    # Closeness metric: build element dicts from the moodboard + weights
    closeness = 0.0
    per_element: dict = {}
    weights_path = arm_dir / "weights.json"
    try:
        if weights_path.exists() and moodboard.elements:
            weights_map = json.loads(weights_path.read_text())
            elements_for_clip = _build_elements_for_clip(moodboard, weights_map, arm_dir)
            closeness, per_element = clip_closeness(
                elements_for_clip, render_paths, moodboard.base_dir
            )
    except Exception as e:
        logger.warning(f"{arm}: closeness metric failed", error=str(e))

    return {
        "preservation": round(preservation, 4),
        "closeness": round(closeness, 4),
        "per_element_contributions": {k: round(v, 4) for k, v in per_element.items()},
        "embedding_model": "open_clip ViT-L/14 openai",
        "render_count": len(render_paths),
    }


def _build_elements_for_clip(moodboard, weights_map: dict, arm_dir: Path) -> list[dict]:
    elements = []
    for elem in moodboard.elements:
        weight = int(weights_map.get(str(elem.id), 0))
        e: dict = {
            "id": elem.id,
            "type": elem.type,
            "weight": weight,
        }
        if elem.type in ("image", "video") and elem.path:
            e["path"] = elem.path
        elif elem.type == "text":
            e["text"] = elem.text or ""
        elif elem.type == "palette":
            e["colors"] = elem.colors or []
        elif elem.type == "model":
            # Use Blender renders produced during Imagin3D ingestion
            render_dir = arm_dir.parent / "imagin3d" / ".." / "backend" / "artifacts" / "model_renders" / str(elem.id)
            e["render_dir"] = str(render_dir) if render_dir.exists() else None
        elements.append(e)
    return elements


def _write_scores(arm_dir: Path, scores: dict) -> None:
    (arm_dir / "scores.json").write_text(json.dumps(scores, indent=2))


def _write_manifest(
    run_dir: Path,
    moodboard,
    imagin3d_scores: dict,
    baseline_scores: dict,
) -> None:
    def _render_list(arm: str) -> list[str]:
        renders_dir = run_dir / arm / "renders"
        if renders_dir.exists():
            return [
                str(p.relative_to(run_dir))
                for p in sorted(renders_dir.glob("*.jpg"))
            ]
        return []

    manifest = {
        "case_id": f"{moodboard.name}-{run_dir.name.split('_')[0]}",
        "run_dir": run_dir.name,
        "moodboard_name": moodboard.name,
        "prompt": moodboard.prompt,
        "moodboard_snapshot": "moodboard_snapshot.png",
        "arms": {
            "imagin3d": {
                "glb": "imagin3d/sample.glb",
                "renders": _render_list("imagin3d"),
            },
            "baseline": {
                "glb": "baseline/sample.glb",
                "renders": _render_list("baseline"),
            },
        },
        "scores": {
            "imagin3d": imagin3d_scores,
            "baseline": baseline_scores,
        },
    }
    (run_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    logger.info("Manifest written", path=str(run_dir / "manifest.json"))


def _free_gpu() -> None:
    """Release GPU memory between arms to stay within the 4090's 24 GB."""
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except ImportError:
        pass


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run A/B generation pipeline (Imagin3D vs baseline)."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dataset", metavar="NAME", help="Dataset name under pipeline/datasets/")
    group.add_argument("--all", action="store_true", help="Run all datasets sequentially")

    parser.add_argument("--skip-imagin3d", action="store_true", help="Skip the Imagin3D arm")
    parser.add_argument("--skip-baseline", action="store_true", help="Skip the baseline arm")
    return parser.parse_args()


async def main() -> None:
    args = _parse_args()

    if args.all:
        datasets = _discover_datasets()
    else:
        dataset_dir = DATASETS_DIR / args.dataset
        if not dataset_dir.exists():
            print(f"Dataset not found: {dataset_dir}", file=sys.stderr)
            sys.exit(1)
        datasets = [dataset_dir]

    for dataset_dir in datasets:
        await _run_dataset(
            dataset_dir,
            skip_imagin3d=args.skip_imagin3d,
            skip_baseline=args.skip_baseline,
        )


if __name__ == "__main__":
    asyncio.run(main())
