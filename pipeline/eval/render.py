"""Render GLB views for evaluation using the backend's Blender engine."""
from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).parent.parent.parent.resolve()
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend import orchestrator


async def render_glb(glb_path: Path, out_dir: Path) -> list[Path]:
    """Render 3 orbital views of a GLB with Blender.

    Returns paths to the rendered JPEG images.
    """
    orchestrator._initialize()
    out_dir.mkdir(parents=True, exist_ok=True)
    renders = await orchestrator.blender_engine.render_views(glb_path, out_dir)
    return [out_dir / f"view_{i}.jpg" for i, _ in enumerate(renders)]
