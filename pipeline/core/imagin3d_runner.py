"""Headless Imagin3D runner.

Drives the backend orchestrator in-process, bypassing the interactive HTTP
confirmation gates in app.py. The intent-router weights are accepted as-is
(no UI override), which is the correct behaviour for a fixed evaluation pipeline.

Usage:
    from pipeline.core.imagin3d_runner import run_imagin3d
    glb_path = await run_imagin3d(moodboard, run_dir)
"""
from __future__ import annotations

import asyncio
import gc
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import structlog

# Ensure backend is importable regardless of cwd.
_REPO_ROOT = Path(__file__).parent.parent.parent.resolve()
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from backend import common, orchestrator
from pipeline.core.dataset import Moodboard, to_payload

logger = structlog.stdlib.get_logger(__name__)

BACKEND_ROOT = _REPO_ROOT / "backend"
ARTIFACTS = BACKEND_ROOT / "artifacts"


async def run_imagin3d(moodboard: Moodboard, run_dir: Path) -> Path:
    """Run the full Imagin3D pipeline on a moodboard.

    Clears the artifacts dir before starting, then runs design-token
    extraction, intent routing, master-prompt + master-image synthesis,
    and 3D generation — all in-process.

    Returns the path to the archived sample.glb inside run_dir.
    """
    orchestrator._initialize()

    _clear_artifacts()
    _write_raw_payload(moodboard)

    payload = to_payload(moodboard)

    # 1. Build design tokens
    logger.info("Building design tokens", count=len(payload["elements"]))
    design_tokens = await _build_design_tokens(payload["elements"])

    # 2. Build cluster descriptors
    logger.info("Building cluster descriptors", count=len(payload["clusters"]))
    token_lookup: dict[int, common.DesignToken] = {t.id: t for t in design_tokens}
    cluster_descriptors = await _build_cluster_descriptors(
        payload["clusters"], token_lookup
    )

    # 3. Handle adaptation subject if present
    adapt_subject_text = payload.get("adapt_subject_text")
    adapt_subject_image_path = None
    if payload.get("adapt_subject_file"):
        adapt_subject_image_path, extra_text = await _handle_adapt_subject(
            payload["adapt_subject_file"]
        )
        adapt_subject_text = (adapt_subject_text or "") + extra_text

    # 4. Intent routing
    logger.info("Running intent router")
    token_cluster_context = _build_cluster_context(cluster_descriptors)
    subject_info = adapt_subject_text or (
        "file" if payload.get("adapt_subject_file") else None
    )
    await _route_tokens(
        design_tokens,
        payload["prompt"],
        token_cluster_context,
        subject_info,
    )

    # Sync cluster elements with routed tokens
    for cd in cluster_descriptors:
        cd.elements = [t for t in design_tokens if t.id in {e.id for e in cd.elements}]

    # Log weights for transparency
    weights_summary = {str(t.id): t.weight for t in design_tokens}
    logger.info("Intent-router weights (headless — no override)", weights=weights_summary)

    # 5. Master prompt
    logger.info("Synthesizing master prompt")
    master_prompt = await orchestrator.synthesize_master_prompt(
        payload["prompt"], cluster_descriptors, subject=adapt_subject_text
    )

    # 6. Master image(s)
    if moodboard.multiview:
        logger.info("Generating multiview master images")
        images: dict[str, Path] = {}
        async for update in orchestrator.generate_multiview_master_images(
            master_prompt,
            cluster_descriptors,
            base_image_path=adapt_subject_image_path,
            prompt=payload["prompt"] if adapt_subject_text else None,
        ):
            if update["event"] == "all_done":
                images = update["images"]
        image_input: Path | list[Path] = [images["front"], images["back"]]
    else:
        logger.info("Generating master image")
        master_image_path = await orchestrator.generate_master_image(
            master_prompt,
            cluster_descriptors,
            base_image_path=adapt_subject_image_path,
            prompt=payload["prompt"] if adapt_subject_text else None,
        )
        image_input = master_image_path

    # 7. 3D generation
    logger.info("Running Trellis 3D generation")
    await orchestrator.generate_3d_model(image_input)

    # 8. Archive outputs
    arm_dir = run_dir / "imagin3d"
    arm_dir.mkdir(parents=True, exist_ok=True)
    _snapshot(arm_dir, run_dir, weights=weights_summary)

    glb_dst = arm_dir / "sample.glb"
    logger.info("Imagin3D arm complete", glb=str(glb_dst))
    return glb_dst


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _clear_artifacts() -> None:
    if ARTIFACTS.exists():
        shutil.rmtree(ARTIFACTS)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)


def _write_raw_payload(moodboard: Moodboard) -> None:
    raw_dir = ARTIFACTS / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    (raw_dir / f"moodboard-{ts}.json").write_text(
        json.dumps({"name": moodboard.name, "prompt": moodboard.prompt}, indent=2)
    )


async def _build_design_tokens(elements: list[dict]) -> list[common.DesignToken]:
    async def _process(element: dict) -> common.DesignToken:
        etype = element["content"]["type"]
        match etype:
            case "model":
                title, desc = await orchestrator.handle_model(element)
            case "video":
                title, desc = await orchestrator.handle_video(element)
            case "palette":
                title, desc = await orchestrator.handle_palette(element)
            case "image":
                title, desc = await orchestrator.handle_image(element)
            case "text":
                title, desc = await orchestrator.handle_text(element)
            case _:
                title, desc = etype, ""
        embedding = orchestrator.generate_embedding(title)
        return common.DesignToken(
            id=element["id"],
            type=etype,
            title=title,
            description=desc,
            embedding=embedding,
            size=element["size"],
            position=element["position"],
        )

    tasks = [asyncio.create_task(_process(e)) for e in elements]
    return list(await asyncio.gather(*tasks))


async def _build_cluster_descriptors(
    clusters: list[dict],
    token_lookup: dict[int, common.DesignToken],
) -> list[common.ClusterDescriptor]:
    # Elements not in any explicit cluster get an implicit default cluster.
    clustered_ids: set[int] = {
        eid for c in clusters for eid in c.get("elements", [])
    }
    all_ids = set(token_lookup.keys())
    orphan_ids = all_ids - clustered_ids

    effective_clusters = list(clusters)
    if orphan_ids:
        effective_clusters.append({
            "id": 0,
            "title": "General",
            "elements": sorted(orphan_ids),
        })

    async def _process(cluster: dict) -> common.ClusterDescriptor:
        elems = [token_lookup[eid] for eid in cluster["elements"] if eid in token_lookup]
        if not elems:
            return common.ClusterDescriptor(
                id=cluster["id"], title=cluster["title"], elements=[]
            )
        title, desc = await orchestrator.handle_cluster(cluster["title"], elems)
        return common.ClusterDescriptor(
            id=cluster["id"], title=title, description=desc, elements=elems
        )

    tasks = [asyncio.create_task(_process(c)) for c in effective_clusters]
    return list(await asyncio.gather(*tasks))


def _build_cluster_context(
    cluster_descriptors: list[common.ClusterDescriptor],
) -> dict[int, str]:
    ctx: dict[int, str] = {}
    for cd in cluster_descriptors:
        for elem in cd.elements:
            ctx[elem.id] = f"{cd.title},{cd.description}"
    return ctx


async def _route_tokens(
    tokens: list[common.DesignToken],
    prompt: str,
    cluster_context: dict[int, str],
    subject: str | None,
) -> None:
    async def _route(token: common.DesignToken) -> None:
        ctx = cluster_context.get(token.id)
        token.weight = await orchestrator.route_token(prompt, token, ctx, subject)

    await asyncio.gather(*[_route(t) for t in tokens])


async def _handle_adapt_subject(
    subject_file: dict,
) -> tuple[Path | None, str]:
    subject_element = {
        "id": "adapt_subject",
        "content": {
            "type": subject_file["type"],
            "data": {
                "src": subject_file["data"],
                "fileName": subject_file.get("name", "adapt_subject_model.glb"),
            },
        },
    }
    if subject_file["type"] == "model":
        title, desc = await orchestrator.handle_model(subject_element)
        renders_dir = ARTIFACTS / "model_renders" / "adapt_subject"
        renders = sorted(renders_dir.glob("*.jpg")) if renders_dir.exists() else []
        img_path = renders[0] if renders else None
    else:
        title, desc = await orchestrator.handle_image(subject_element)
        img_path = ARTIFACTS / "images" / "adapt_subject" / "image.jpg"
        if not img_path.exists():
            img_path = None
    return img_path, f"\n\nReference file details:\n{title}: {desc}"


def _snapshot(arm_dir: Path, run_dir: Path, weights: dict[str, Any] | None = None) -> None:
    _cp(ARTIFACTS / "master_prompt.txt",       arm_dir / "master_prompt.txt")
    _cp(ARTIFACTS / "master_image.jpg",        arm_dir / "master_image.jpg")
    _cp(ARTIFACTS / "master_image_front.jpg",  arm_dir / "master_image_front.jpg")
    _cp(ARTIFACTS / "master_image_back.jpg",   arm_dir / "master_image_back.jpg")
    _cp(ARTIFACTS / "trellis" / "sample.glb",  arm_dir / "sample.glb")
    if weights:
        (arm_dir / "weights.json").write_text(json.dumps(weights, indent=2))
    # Archive moodboard assets used by the CLIP closeness metric for both arms.
    assets_dir = run_dir / "moodboard_assets"
    for sub in ("video_frames", "model_renders"):
        src = ARTIFACTS / sub
        if src.exists():
            dst = assets_dir / sub
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(src, dst)


def _cp(src: Path, dst: Path) -> None:
    if src.exists():
        shutil.copy2(src, dst)
