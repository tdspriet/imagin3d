"""Baseline arm runner: text prompt → Gemini Nano Banana → Trellis v2.

The baseline is defined as:
  1. The shared moodboard prompt is fed to the Gemini 2.5 Flash Image (Nano Banana) model
     used by Imagin3D's Visualizer, but without any visual style references.
  3. The resulting image is passed to TrellisEngine v2 — the same 3D generator
     used by Imagin3D — producing a GLB mesh.

This isolates the sole experimental variable: whether Imagin3D's orchestration
pipeline (routing, clustering, master-prompt synthesis, style-image injection)
produces better 3D conditioning signals than a skilled human text prompt alone.
"""
from __future__ import annotations

import gc
import shutil
import sys
from pathlib import Path

import structlog
import torch

# Ensure backend is importable regardless of cwd.
_REPO_ROOT = Path(__file__).parent.parent.parent.resolve()
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend import orchestrator
from backend.utils.trellis import TrellisEngine
from pipeline.core.dataset import Moodboard

logger = structlog.stdlib.get_logger(__name__)

BACKEND_ROOT = _REPO_ROOT / "backend"
ARTIFACTS = BACKEND_ROOT / "artifacts"


async def run_baseline(moodboard: Moodboard, run_dir: Path) -> Path:
    """Run the baseline pipeline on the moodboard's shared prompt.

    Returns the path to the archived sample.glb inside run_dir.
    """
    orchestrator._initialize()

    arm_dir = run_dir / "baseline"
    arm_dir.mkdir(parents=True, exist_ok=True)

    # 1. Text-to-image via Gemini 2.5 Flash Image (Nano Banana) with no visual refs
    logger.info("Baseline: generating 2D image from text prompt")
    baseline_image_path = await _generate_baseline_image(
        moodboard.prompt, arm_dir
    )

    # 2. Save the prompt for the record
    (arm_dir / "prompt.txt").write_text(moodboard.prompt)

    # 3. 3D generation via TrellisEngine v2
    logger.info("Baseline: running Trellis v2")
    trellis_out_dir = ARTIFACTS / "trellis_baseline"
    trellis_out_dir.mkdir(parents=True, exist_ok=True)
    engine = orchestrator.trellis_engine
    glb_src = await engine.generate_3d_model(baseline_image_path, trellis_out_dir)

    # 4. Archive
    glb_dst = arm_dir / "sample.glb"
    shutil.copy2(glb_src, glb_dst)

    logger.info("Baseline arm complete", glb=str(glb_dst))
    return glb_dst


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _generate_baseline_image(prompt: str, arm_dir: Path) -> Path:
    """Call the Visualizer with the prompt and no style images."""
    visualizer = orchestrator.visualizer
    original_name = visualizer.name

    try:
        visualizer.name = "visualizer"
        ctx = {"prompt": prompt}

        import jinja2
        import pathlib
        import pydantic_ai

        # Call directly via _prompt with the baseline subdir
        result, _ = await visualizer._prompt(
            ctx, extra=[], template_subdir="baseline"
        )
    finally:
        visualizer.name = original_name

    # Save the generated image
    image_path = arm_dir / "nano_banana.jpg"
    with open(image_path, "wb") as f:
        f.write(result.output.data)

    return image_path
