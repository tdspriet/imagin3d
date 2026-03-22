from __future__ import annotations

import asyncio
import json
import os
import uuid
from datetime import datetime
from pathlib import Path
from dotenv import find_dotenv, load_dotenv
from fastapi import Body, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
import structlog

from backend.common import (
    ComparativeMasterPromptConfirmRequest,
    ComparativeMoodboardPayload,
    ComparativeWeightsResponse,
    ClusterDescriptor,
    DesignToken,
    GenerateResponse,
    MoodboardPayload,
    WeightsResponse,
    WeightsRequest,
    MasterImageRegenerateRequest,
    MasterImageEditRequest,
    encode_image_to_data_url,
)
from backend import orchestrator

# Directory configuration
ROOT_DIR = Path(__file__).parent.resolve()

# Load environment
for env_path in (
    find_dotenv(usecwd=True),
    Path.cwd() / "backend" / ".env",
    ROOT_DIR / ".env",
):
    if env_path and Path(env_path).exists():
        load_dotenv(env_path)
        break

# Amazon Bedrock API
os.environ["AWS_ACCESS_KEY_ID"] = os.environ.get("BEDROCK_ACCESS_KEY_ID", "")
os.environ["AWS_SECRET_ACCESS_KEY"] = os.environ.get("BEDROCK_SECRET_ACCESS_KEY", "")
if os.environ["AWS_ACCESS_KEY_ID"] == "" or os.environ["AWS_SECRET_ACCESS_KEY"] == "":
    raise Exception("No AWS access keys provided.")
os.environ["AWS_DEFAULT_REGION"] = "eu-central-1"

# Google API
os.environ["GOOGLE_API_KEY"] = os.environ.get("GOOGLE_API_KEY", "")
if os.environ["GOOGLE_API_KEY"] == "":
    raise Exception("No GOOGLE API key provided.")

# Logging configuration
structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.dev.ConsoleRenderer(pad_level=False),
    ],
)
logger = structlog.stdlib.get_logger(__name__)

# CORS configuration
ALLOWED_ORIGINS = os.getenv("BACKEND_ALLOWED_ORIGINS")
if ALLOWED_ORIGINS:
    CORS_ORIGINS = [
        origin.strip() for origin in ALLOWED_ORIGINS.split(",") if origin.strip()
    ]
else:
    CORS_ORIGINS = ["*"]

# Session management
# Maps session_id -> {"event": asyncio.Event, "confirmed": bool}
pending_confirmations: dict[str, dict] = {}

# FastAPI application setup
app = FastAPI(title="Imagin3D Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create artifacts directory if it doesn't exist
artifacts_dir = ROOT_DIR / "artifacts"
artifacts_dir.mkdir(parents=True, exist_ok=True)
sessions_dir = artifacts_dir / "sessions"
sessions_dir.mkdir(parents=True, exist_ok=True)

# Mount artifacts directory
app.mount("/artifacts", StaticFiles(directory=ROOT_DIR / "artifacts"), name="artifacts")


def _session_dir(session_id: str) -> Path:
    path = sessions_dir / session_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def _pane_dir(session_id: str, pane: str) -> Path:
    path = _session_dir(session_id) / pane
    path.mkdir(parents=True, exist_ok=True)
    return path


def _artifact_url(path: Path) -> str:
    relative_path = path.relative_to(ROOT_DIR / "artifacts")
    return f"/artifacts/{relative_path}"


async def _run_with_artifacts_dir(artifacts_path: Path, operation):
    token = orchestrator.set_artifacts_dir(artifacts_path)
    try:
        return await operation()
    finally:
        orchestrator.reset_artifacts_dir(token)


def _clamp_weight(value: int) -> int:
    return max(0, min(100, int(value)))


def _count_or_one(items: list) -> int:
    return max(len(items), 1)


def _prepare_progress_total(payload_data: dict) -> int:
    return (
        _count_or_one(payload_data["elements"])
        + _count_or_one(payload_data["clusters"])
        + _count_or_one(payload_data["clusters"])
        + _count_or_one(payload_data["elements"])
    )


async def _prepare_generation_payload(
    payload: MoodboardPayload,
    artifacts_path: Path,
    progress_callback=None,
) -> dict:
    artifacts_token = orchestrator.set_artifacts_dir(artifacts_path)
    try:
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        payload_data = payload.dict()
        progress_current = 0

        async def advance_progress(stage: str) -> None:
            nonlocal progress_current
            if progress_callback is None:
                return
            progress_current += 1
            await progress_callback(progress_current, stage)

        async def emit_placeholder_progress(stage: str, items: list) -> None:
            if items:
                return
            await advance_progress(stage)

        raw_path = artifacts_path / "raw" / f"moodboard-{timestamp}.json"
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        with raw_path.open("w", encoding="utf-8") as target_file:
            json.dump(payload_data, target_file, ensure_ascii=False, indent=2)

        async def process_element(element: dict) -> DesignToken:
            element_type = element["content"]["type"]

            match element_type:
                case "model":
                    title, description = await orchestrator.handle_model(element)
                case "video":
                    title, description = await orchestrator.handle_video(element)
                case "palette":
                    title, description = await orchestrator.handle_palette(element)
                case "image":
                    title, description = await orchestrator.handle_image(element)
                case "text":
                    title, description = await orchestrator.handle_text(element)
                case _:
                    raise ValueError(f"Unsupported element type: {element_type}")

            embedding = orchestrator.generate_embedding(title)
            await advance_progress("Analyzing workspace...")
            return DesignToken(
                id=element["id"],
                type=element_type,
                title=title,
                description=description,
                embedding=embedding,
                size={"x": element["size"]["x"], "y": element["size"]["y"]},
                position={
                    "x": element["position"]["x"],
                    "y": element["position"]["y"],
                },
            )

        design_tokens = list(
            await asyncio.gather(
                *[
                    asyncio.create_task(process_element(element))
                    for element in payload_data["elements"]
                ]
            )
        )
        await emit_placeholder_progress("Analyzing workspace...", payload_data["elements"])

        design_tokens_path = (
            artifacts_path / "design_tokens" / f"design-tokens-{timestamp}.json"
        )
        design_tokens_path.parent.mkdir(parents=True, exist_ok=True)
        with design_tokens_path.open("w", encoding="utf-8") as f:
            json.dump(
                [token.dict() for token in design_tokens],
                f,
                ensure_ascii=False,
                indent=2,
            )

        token_lookup: dict[int, DesignToken] = {
            token.id: token for token in design_tokens
        }

        async def process_cluster(cluster: dict) -> ClusterDescriptor:
            elements: list[DesignToken] = [
                token_lookup[element_id]
                for element_id in cluster["elements"]
                if element_id in token_lookup
            ]
            title, description = await orchestrator.handle_cluster(
                cluster["title"], elements
            )
            await advance_progress("Preparing weights...")
            return ClusterDescriptor(
                id=cluster["id"],
                title=title,
                description=description,
                elements=elements,
            )

        cluster_descriptors = list(
            await asyncio.gather(
                *[
                    asyncio.create_task(process_cluster(cluster))
                    for cluster in payload_data["clusters"]
                ]
            )
        )
        await emit_placeholder_progress("Preparing weights...", payload_data["clusters"])

        for cluster_descriptor in cluster_descriptors:
            cluster_descriptors_dir = (
                artifacts_path / "cluster_descriptors" / str(cluster_descriptor.id)
            )
            cluster_descriptors_dir.mkdir(parents=True, exist_ok=True)
            cluster_descriptor_path = (
                cluster_descriptors_dir
                / f"cluster-{cluster_descriptor.id}-{timestamp}.json"
            )
            with cluster_descriptor_path.open("w", encoding="utf-8") as f:
                json.dump(cluster_descriptor.dict(), f, ensure_ascii=False, indent=2)

        async def route_cluster_weight(cluster_descriptor: ClusterDescriptor) -> int:
            weight = await orchestrator.route_cluster(payload.prompt, cluster_descriptor)
            await advance_progress("Preparing weights...")
            return weight

        cluster_routing_results = list(
            await asyncio.gather(
                *[
                    asyncio.create_task(route_cluster_weight(cluster_descriptor))
                    for cluster_descriptor in cluster_descriptors
                ]
            )
        )
        await emit_placeholder_progress("Preparing weights...", cluster_descriptors)

        cluster_descriptor_lookup = {cd.id: cd for cd in cluster_descriptors}
        cluster_weights: dict[int, int] = {}
        for cluster_descriptor, weight in zip(cluster_descriptors, cluster_routing_results):
            cluster_descriptor_lookup[cluster_descriptor.id].weight = weight
            cluster_weights[cluster_descriptor.id] = weight

        token_cluster_context: dict[int, str] = {}
        for cluster_descriptor in cluster_descriptors:
            for element in cluster_descriptor.elements:
                token_cluster_context[element.id] = (
                    f"{cluster_descriptor.title},{cluster_descriptor.description}"
                )

        async def route_token_weight(token: DesignToken) -> int:
            weight = await orchestrator.route_token(
                payload.prompt,
                token,
                token_cluster_context.get(token.id),
            )
            await advance_progress("Preparing weights...")
            return weight

        token_routing_results = list(
            await asyncio.gather(
                *[
                    asyncio.create_task(route_token_weight(token))
                    for token in design_tokens
                ]
            )
        )
        await emit_placeholder_progress("Preparing weights...", design_tokens)

        token_lookup_for_routing = {token.id: token for token in design_tokens}
        element_weights: dict[int, int] = {}
        for token, weight in zip(design_tokens, token_routing_results):
            token_lookup_for_routing[token.id].weight = weight
            element_weights[token.id] = weight

        for cluster_descriptor in cluster_descriptors:
            cluster_descriptor.elements = [
                token
                for token in design_tokens
                if token.id in [e.id for e in cluster_descriptor.elements]
            ]

        return {
            "design_tokens": design_tokens,
            "cluster_descriptors": cluster_descriptors,
            "element_weights": element_weights,
            "cluster_weights": cluster_weights,
            "token_lookup_for_routing": token_lookup_for_routing,
            "cluster_descriptor_lookup": cluster_descriptor_lookup,
        }
    finally:
        orchestrator.reset_artifacts_dir(artifacts_token)


def _apply_edited_weights(prepared: dict, edited_weights: dict) -> None:
    if not edited_weights:
        return

    edited_element_weights = edited_weights.get("weights", {})
    edited_cluster_weights = edited_weights.get("cluster_weights", {})

    for token_id, user_weight in edited_element_weights.items():
        normalized_id = int(token_id)
        if normalized_id in prepared["token_lookup_for_routing"]:
            clamped_weight = _clamp_weight(user_weight)
            prepared["token_lookup_for_routing"][normalized_id].weight = clamped_weight
            if normalized_id in prepared["element_weights"]:
                prepared["element_weights"][normalized_id] = clamped_weight

    for cluster_id, user_weight in edited_cluster_weights.items():
        normalized_id = int(cluster_id)
        if normalized_id in prepared["cluster_descriptor_lookup"]:
            clamped_weight = _clamp_weight(user_weight)
            prepared["cluster_descriptor_lookup"][normalized_id].weight = clamped_weight
            if normalized_id in prepared["cluster_weights"]:
                prepared["cluster_weights"][normalized_id] = clamped_weight


async def _generate_master_prompt_bundle(
    user_prompt: str,
    cluster_descriptors: list[ClusterDescriptor],
    artifacts_path: Path,
    progress_callback=None,
) -> dict:
    token = orchestrator.set_artifacts_dir(artifacts_path)
    try:
        master_prompt = await orchestrator.synthesize_master_prompt(
            user_prompt,
            cluster_descriptors,
        )
        if progress_callback is not None:
            await progress_callback("Generating master image...")
        master_image_path = await orchestrator.generate_master_image(
            master_prompt,
            cluster_descriptors,
        )
        reference_images = orchestrator.get_reference_images_preview(cluster_descriptors)
    finally:
        orchestrator.reset_artifacts_dir(token)

    return {
        "prompt": master_prompt,
        "image_path": master_image_path,
        "image": encode_image_to_data_url(master_image_path)
        if master_image_path and Path(master_image_path).exists()
        else "",
        "reference_images": reference_images,
    }


@app.post("/confirm-weights/{session_id}")
async def confirm_weights(
    session_id: str,
    payload: WeightsResponse = Body(...),
):
    if session_id not in pending_confirmations:
        return {"error": "Session not found or already expired"}

    session = pending_confirmations[session_id]
    session["confirmed"] = payload.confirmed
    if payload.weights or payload.cluster_weights:
        session["edited_weights"] = {
            "weights": payload.weights,
            "cluster_weights": payload.cluster_weights,
        }
    session["event"].set()

    return {
        "status": "confirmed" if session["confirmed"] else "cancelled",
    }


@app.post("/master-prompt/{session_id}/regenerate")
async def regenerate_master_prompt_image(
    session_id: str,
    payload: MasterImageRegenerateRequest = Body(...),
):
    if session_id not in pending_confirmations:
        return {"error": "Session not found or already expired"}

    prompt = payload.prompt.strip()
    if not prompt:
        return {"error": "Prompt is required"}

    session = pending_confirmations[session_id]
    clusters = session.get("clusters")
    if not clusters:
        return {"error": "Session has no cluster context"}

    artifacts_path = Path(session["artifacts_dir"])
    master_image_path = await _run_with_artifacts_dir(
        artifacts_path,
        lambda: orchestrator.generate_master_image(prompt, clusters),
    )
    session["master_image_path"] = str(master_image_path)

    master_prompt_path = artifacts_path / "master_prompt.txt"
    with open(master_prompt_path, "w", encoding="utf-8") as f:
        f.write(prompt)

    return {
        "image": encode_image_to_data_url(master_image_path),
    }


@app.post("/master-prompt/{session_id}/edit-image")
async def edit_master_prompt_image(
    session_id: str,
    payload: MasterImageEditRequest = Body(...),
):
    if session_id not in pending_confirmations:
        return {"error": "Session not found or already expired"}

    edit_prompt = payload.prompt.strip()
    if not edit_prompt:
        return {"error": "Edit prompt is required"}

    session = pending_confirmations[session_id]

    master_image_path = await _run_with_artifacts_dir(
        Path(session["artifacts_dir"]),
        lambda: orchestrator.edit_master_image(edit_prompt, payload.image),
    )
    session["master_image_path"] = str(master_image_path)

    return {
        "image": encode_image_to_data_url(master_image_path),
    }


@app.post("/comparisons/{session_id}/confirm-weights")
async def confirm_comparison_weights(
    session_id: str,
    payload: ComparativeWeightsResponse = Body(...),
):
    if session_id not in pending_confirmations:
        return {"error": "Session not found or already expired"}

    session = pending_confirmations[session_id]
    session["confirmed"] = payload.confirmed
    if payload.panes:
        session["edited_weights"] = {
            pane: {
                "weights": pane_payload.weights,
                "cluster_weights": pane_payload.cluster_weights,
            }
            for pane, pane_payload in payload.panes.items()
        }
    session["event"].set()
    return {"status": "confirmed" if payload.confirmed else "cancelled"}


@app.post("/comparisons/{session_id}/confirm-master-prompts")
async def confirm_comparison_master_prompts(
    session_id: str,
    payload: ComparativeMasterPromptConfirmRequest = Body(...),
):
    if session_id not in pending_confirmations:
        return {"error": "Session not found or already expired"}

    session = pending_confirmations[session_id]
    session["confirmed"] = payload.confirmed
    session["event"].set()
    return {"status": "confirmed" if payload.confirmed else "cancelled"}


@app.post("/comparisons/{session_id}/panes/{pane}/master-prompt/regenerate")
async def regenerate_comparison_master_prompt_image(
    session_id: str,
    pane: str,
    payload: MasterImageRegenerateRequest = Body(...),
):
    if session_id not in pending_confirmations:
        return {"error": "Session not found or already expired"}

    session = pending_confirmations[session_id]
    panes = session.get("panes", {})
    if pane not in panes:
        return {"error": "Pane not found"}

    prompt = payload.prompt.strip()
    if not prompt:
        return {"error": "Prompt is required"}

    pane_session = panes[pane]
    artifacts_path = Path(pane_session["artifacts_dir"])
    clusters = pane_session["clusters"]

    master_image_path = await _run_with_artifacts_dir(
        artifacts_path,
        lambda: orchestrator.generate_master_image(prompt, clusters),
    )
    pane_session["master_image_path"] = str(master_image_path)

    master_prompt_path = artifacts_path / "master_prompt.txt"
    with open(master_prompt_path, "w", encoding="utf-8") as f:
        f.write(prompt)

    return {"image": encode_image_to_data_url(master_image_path)}


@app.post("/comparisons/{session_id}/panes/{pane}/master-prompt/edit-image")
async def edit_comparison_master_prompt_image(
    session_id: str,
    pane: str,
    payload: MasterImageEditRequest = Body(...),
):
    if session_id not in pending_confirmations:
        return {"error": "Session not found or already expired"}

    session = pending_confirmations[session_id]
    panes = session.get("panes", {})
    if pane not in panes:
        return {"error": "Pane not found"}

    edit_prompt = payload.prompt.strip()
    if not edit_prompt:
        return {"error": "Edit prompt is required"}

    pane_session = panes[pane]
    master_image_path = await _run_with_artifacts_dir(
        Path(pane_session["artifacts_dir"]),
        lambda: orchestrator.edit_master_image(edit_prompt, payload.image),
    )
    pane_session["master_image_path"] = str(master_image_path)
    return {"image": encode_image_to_data_url(master_image_path)}


@app.post("/extract/comparative")
async def extract_comparative(
    payload: ComparativeMoodboardPayload,
) -> StreamingResponse:
    orchestrator._initialize()
    comparison_id = str(uuid.uuid4())
    shared_prompt = payload.prompt.strip()
    left_payload = payload.left.copy(deep=True)
    right_payload = payload.right.copy(deep=True)
    if shared_prompt:
        left_payload.prompt = shared_prompt
        right_payload.prompt = shared_prompt

    async def generate():
        if (
            (not left_payload.elements and not left_payload.clusters)
            or (not right_payload.elements and not right_payload.clusters)
        ):
            error_event = {
                "type": "error",
                "data": "Both comparative panes must contain elements or clusters",
            }
            yield f"data: {json.dumps(error_event)}\n\n"
            return

        pane_artifacts = {
            "left": _pane_dir(comparison_id, "left"),
            "right": _pane_dir(comparison_id, "right"),
        }
        pane_payloads = {
            "left": left_payload,
            "right": right_payload,
        }
        prepared: dict[str, dict] = {}
        comparison_results: dict[str, dict] = {}
        pane_progress_totals = {
            pane: _prepare_progress_total(pane_payload.dict()) + 3
            for pane, pane_payload in pane_payloads.items()
        }
        pane_progress_current = {pane: 0 for pane in pane_payloads}
        progress_queue: asyncio.Queue[str] = asyncio.Queue()

        logger.info(
            "Starting comparative extraction",
            comparison_id=comparison_id,
            shared_seed=payload.shared_seed,
        )

        yield f"data: {json.dumps({'type': 'progress', 'data': {'current': 0, 'total': 6, 'stage': 'Starting comparative generation...'}})}\n\n"

        def pane_progress_event(pane: str, current: int, stage: str) -> str:
            return (
                f"data: {json.dumps({'type': 'pane_progress', 'data': {'pane': pane, 'current': current, 'total': pane_progress_totals[pane], 'stage': stage}})}\n\n"
            )

        async def update_pane_progress(pane: str, current: int, stage: str) -> None:
            pane_progress_current[pane] = current
            await progress_queue.put(pane_progress_event(pane, current, stage))

        async def advance_pane_progress(
            pane: str,
            stage: str,
            increment: int = 1,
        ) -> None:
            await update_pane_progress(
                pane,
                min(
                    pane_progress_totals[pane],
                    pane_progress_current[pane] + increment,
                ),
                stage,
            )

        async def yield_task_progress(tasks: set[asyncio.Task]):
            pending = set(tasks)
            while pending:
                queue_task = asyncio.create_task(progress_queue.get())
                done, still_pending = await asyncio.wait(
                    pending | {queue_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if queue_task in done:
                    yield queue_task.result()
                else:
                    queue_task.cancel()
                pending = still_pending.intersection(pending)

            while not progress_queue.empty():
                yield await progress_queue.get()

        async def prepare_pane(pane: str) -> tuple[str, dict]:
            return pane, await _prepare_generation_payload(
                pane_payloads[pane],
                pane_artifacts[pane],
                progress_callback=lambda current, stage, pane=pane: update_pane_progress(
                    pane,
                    current,
                    stage,
                ),
            )

        for pane in ("left", "right"):
            yield f"data: {json.dumps({'type': 'pane_status', 'data': {'pane': pane, 'status': 'preparing', 'message': 'Analyzing workspace...'}})}\n\n"
            yield pane_progress_event(pane, 0, "Analyzing workspace...")

        prepare_tasks = {
            asyncio.create_task(prepare_pane(pane)) for pane in ("left", "right")
        }
        async for queue_event in yield_task_progress(prepare_tasks):
            yield queue_event
        for pane, prepared_payload in [task.result() for task in prepare_tasks]:
            prepared[pane] = prepared_payload

        weights_session_id = str(uuid.uuid4())
        pending_confirmations[weights_session_id] = {
            "event": asyncio.Event(),
            "confirmed": False,
            "artifacts_dir": str(_session_dir(comparison_id)),
        }
        weights_event = {
            "type": "weights",
            "data": {
                "mode": "comparative",
                "panes": {
                    pane: WeightsRequest(
                        weights=prepared[pane]["element_weights"],
                        cluster_weights=prepared[pane]["cluster_weights"],
                    ).dict()
                    for pane in ("left", "right")
                },
            },
            "session_id": weights_session_id,
        }
        yield f"data: {json.dumps(weights_event)}\n\n"
        for pane in ("left", "right"):
            yield pane_progress_event(
                pane,
                pane_progress_current[pane],
                "Review weights...",
            )

        await pending_confirmations[weights_session_id]["event"].wait()
        weights_session = pending_confirmations.pop(weights_session_id)
        if not weights_session["confirmed"]:
            cancelled_event = {
                "type": "cancelled",
                "data": "Comparative generation cancelled during weight review",
            }
            yield f"data: {json.dumps(cancelled_event)}\n\n"
            return

        edited_weights = weights_session.get("edited_weights", {})
        for pane in ("left", "right"):
            _apply_edited_weights(prepared[pane], edited_weights.get(pane, {}))

        master_prompt_bundles: dict[str, dict] = {}

        async def generate_master_prompt_for_pane(pane: str) -> tuple[str, dict]:
            await update_pane_progress(
                pane,
                pane_progress_current[pane],
                "Generating master prompt...",
            )
            return pane, await _generate_master_prompt_bundle(
                pane_payloads[pane].prompt,
                prepared[pane]["cluster_descriptors"],
                pane_artifacts[pane],
                progress_callback=lambda stage, pane=pane: advance_pane_progress(
                    pane,
                    stage,
                ),
            )

        for pane in ("left", "right"):
            yield f"data: {json.dumps({'type': 'pane_status', 'data': {'pane': pane, 'status': 'preparing', 'message': 'Generating master prompt...'}})}\n\n"

        master_prompt_tasks = {
            asyncio.create_task(generate_master_prompt_for_pane(pane))
            for pane in ("left", "right")
        }
        async for queue_event in yield_task_progress(master_prompt_tasks):
            yield queue_event
        for pane, master_prompt_bundle in [task.result() for task in master_prompt_tasks]:
            master_prompt_bundles[pane] = master_prompt_bundle
            pane_progress_current[pane] = min(
                pane_progress_totals[pane],
                pane_progress_current[pane] + 1,
            )
            yield pane_progress_event(
                pane,
                pane_progress_current[pane],
                "Review master prompt...",
            )

        master_session_id = str(uuid.uuid4())
        pending_confirmations[master_session_id] = {
            "event": asyncio.Event(),
            "confirmed": False,
            "panes": {
                pane: {
                    "clusters": prepared[pane]["cluster_descriptors"],
                    "master_image_path": str(
                        master_prompt_bundles[pane]["image_path"]
                    ),
                    "artifacts_dir": str(pane_artifacts[pane]),
                }
                for pane in ("left", "right")
            },
        }
        master_prompt_event = {
            "type": "master_prompt",
            "data": {
                "mode": "comparative",
                "panes": {
                    pane: {
                        "prompt": master_prompt_bundles[pane]["prompt"],
                        "image": master_prompt_bundles[pane]["image"],
                        "reference_images": master_prompt_bundles[pane][
                            "reference_images"
                        ],
                    }
                    for pane in ("left", "right")
                },
            },
            "session_id": master_session_id,
        }
        yield f"data: {json.dumps(master_prompt_event)}\n\n"

        await pending_confirmations[master_session_id]["event"].wait()
        master_session = pending_confirmations.pop(master_session_id)
        if not master_session["confirmed"]:
            cancelled_event = {
                "type": "cancelled",
                "data": "Comparative generation cancelled during master prompt review",
            }
            yield f"data: {json.dumps(cancelled_event)}\n\n"
            return

        yield f"data: {json.dumps({'type': 'trellis_status', 'data': {'pane': 'left', 'status': 'queued', 'message': 'Queued for TRELLIS generation'}})}\n\n"
        yield f"data: {json.dumps({'type': 'trellis_status', 'data': {'pane': 'right', 'status': 'queued', 'message': 'Waiting for GPU worker'}})}\n\n"

        for pane in ("left", "right"):
            master_image_path = Path(
                master_session["panes"][pane]["master_image_path"]
            )
            yield pane_progress_event(
                pane,
                pane_progress_current[pane],
                "Generating 3D model...",
            )
            yield f"data: {json.dumps({'type': 'trellis_status', 'data': {'pane': pane, 'status': 'running', 'message': 'Generating 3D model...'}})}\n\n"
            try:
                model_path = await _run_with_artifacts_dir(
                    pane_artifacts[pane],
                    lambda pane=pane, master_image_path=master_image_path: orchestrator.generate_3d_model(
                        master_image_path,
                        seed=payload.shared_seed,
                        trellis_version=pane_payloads[pane].trellis_version,
                    ),
                )
                score = await _run_with_artifacts_dir(
                    pane_artifacts[pane],
                    lambda pane=pane, model_path=model_path: orchestrator.evaluate_model(
                        model_path,
                        prepared[pane]["cluster_descriptors"],
                    ),
                )
            except Exception as exc:
                logger.exception(
                    "Comparative TRELLIS generation failed",
                    comparison_id=comparison_id,
                    pane=pane,
                )
                yield f"data: {json.dumps({'type': 'trellis_status', 'data': {'pane': pane, 'status': 'failed', 'message': str(exc)}})}\n\n"
                yield f"data: {json.dumps({'type': 'error', 'data': f'{pane.capitalize()} pane generation failed: {exc}'})}\n\n"
                return

            comparison_results[pane] = {
                "file": _artifact_url(model_path),
                "score": score,
            }
            pane_progress_current[pane] = pane_progress_totals[pane]
            yield pane_progress_event(
                pane,
                pane_progress_current[pane],
                "Generating 3D model...",
            )
            yield f"data: {json.dumps({'type': 'pane_complete', 'data': {'pane': pane, 'file': comparison_results[pane]['file'], 'score': score}})}\n\n"
            if pane == "left":
                yield f"data: {json.dumps({'type': 'trellis_status', 'data': {'pane': 'right', 'status': 'queued', 'message': 'GPU worker available next'}})}\n\n"

        yield f"data: {json.dumps({'type': 'comparison_complete', 'data': {'results': comparison_results}})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@app.post("/extract")
async def extract(payload: MoodboardPayload) -> StreamingResponse:
    orchestrator._initialize()
    request_id = str(uuid.uuid4())
    request_artifacts_dir = _session_dir(request_id)

    async def generate():
        artifacts_token = orchestrator.set_artifacts_dir(request_artifacts_dir)
        # ----- Ingestion -----
        if not payload.elements and not payload.clusters:
            error_event = {
                "type": "error",
                "data": "Payload must contain elements or clusters",
            }
            yield f"data: {json.dumps(error_event)}\n\n"
            orchestrator.reset_artifacts_dir(artifacts_token)
            return

        # Log start of moodboard extraction
        logger.info(
            "Starting moodboard extraction",
            request_id=request_id,
            prompt=payload.prompt,
            element_count=len(payload.elements),
        )

        # Calculate total steps for progress tracking
        total_elements = len(payload.elements)
        total_clusters = len(payload.clusters)
        total_steps = total_elements + total_clusters + total_elements + total_clusters

        # Shared progress state
        progress_state = {"current": 0, "lock": asyncio.Lock()}

        async def increment_progress():
            async with progress_state["lock"]:
                progress_state["current"] += 1
                return progress_state["current"]

        # Queue for progress updates
        progress_queue: asyncio.Queue = asyncio.Queue()

        # Send initial progress
        progress_event = {
            "type": "progress",
            "data": {
                "current": 0,
                "total": total_steps,
                "stage": "Starting...",
            },
        }
        yield f"data: {json.dumps(progress_event)}\n\n"

        # Timestamp
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

        # Dump raw elements and clusters to JSON file
        raw_path = request_artifacts_dir / "raw" / f"moodboard-{timestamp}.json"
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        with raw_path.open("w", encoding="utf-8") as target_file:
            json.dump(payload.dict(), target_file, ensure_ascii=False, indent=2)

        # ----- Design Tokens -----

        # Turn elements into design tokens
        async def process_element(element: dict) -> DesignToken:
            try:
                element_type = element["content"]["type"]

                # 1) Title and description generation
                match element_type:
                    case "model":
                        title, description = await orchestrator.handle_model(element)
                    case "video":
                        title, description = await orchestrator.handle_video(element)
                    case "palette":
                        title, description = await orchestrator.handle_palette(element)
                    case "image":
                        title, description = await orchestrator.handle_image(element)
                    case "text":
                        title, description = await orchestrator.handle_text(element)

                # 2) Generate embedding based on title
                embedding = orchestrator.generate_embedding(title)

                # 3) Signal progress
                current = await increment_progress()
                await progress_queue.put(
                    {
                        "current": current,
                        "total": total_steps,
                        "stage": "Processing elements...",
                    }
                )

                # 4) Create and return the design token
                return DesignToken(
                    id=element["id"],
                    type=element_type,
                    title=title,
                    description=description,
                    embedding=embedding,
                    size={"x": element["size"]["x"], "y": element["size"]["y"]},
                    position={
                        "x": element["position"]["x"],
                        "y": element["position"]["y"],
                    },
                )
            except Exception:
                # Signal progress even on failure so the queue consumer doesn't hang
                current = await increment_progress()
                await progress_queue.put(
                    {
                        "current": current,
                        "total": total_steps,
                        "stage": "Processing elements...",
                    }
                )
                raise

        with raw_path.open("r", encoding="utf-8") as source_file:
            data = json.load(source_file)

            # Start processing all elements in parallel
            tasks = [
                asyncio.create_task(process_element(element))
                for element in data["elements"]
            ]

            # Yield progress updates as they come in
            completed = 0
            while completed < len(tasks):
                progress_data = await progress_queue.get()
                completed += 1
                progress_event = {"type": "progress", "data": progress_data}
                yield f"data: {json.dumps(progress_event)}\n\n"

            # Collect all results
            design_tokens = list(await asyncio.gather(*tasks))

        # Dump design tokens to JSON file
        design_tokens_path = (
            request_artifacts_dir / "design_tokens" / f"design-tokens-{timestamp}.json"
        )
        design_tokens_path.parent.mkdir(parents=True, exist_ok=True)
        with design_tokens_path.open("w", encoding="utf-8") as f:
            json.dump(
                [token.dict() for token in design_tokens],
                f,
                ensure_ascii=False,
                indent=2,
            )

        # ----- Cluster Descriptors -----

        # Create a lookup map from element id to design token
        token_lookup: dict[int, DesignToken] = {
            token.id: token for token in design_tokens
        }

        # Turn clusters into cluster descriptors
        async def process_cluster(cluster: dict) -> ClusterDescriptor:

            # 1) Gather elements for this cluster
            elements: list[DesignToken] = [
                token_lookup[element_id]
                for element_id in cluster["elements"]
                if element_id in token_lookup
            ]

            # 2) Generate title and description via clusterer
            title, description = await orchestrator.handle_cluster(
                cluster["title"], elements
            )

            # 3) Signal progress
            current = await increment_progress()
            await progress_queue.put(
                {
                    "current": current,
                    "total": total_steps,
                    "stage": "Processing clusters...",
                }
            )

            # 4) Create and return the cluster descriptor
            return ClusterDescriptor(
                id=cluster["id"],
                title=title,
                description=description,
                elements=elements,
            )

        with raw_path.open("r", encoding="utf-8") as source_file:
            data = json.load(source_file)

            # Start processing all clusters in parallel
            cluster_tasks = [
                asyncio.create_task(process_cluster(cluster))
                for cluster in data["clusters"]
            ]

            # Yield progress updates as they come in
            completed = 0
            while completed < len(cluster_tasks):
                progress_data = await progress_queue.get()
                completed += 1
                progress_event = {"type": "progress", "data": progress_data}
                yield f"data: {json.dumps(progress_event)}\n\n"

            # Collect all results
            cluster_descriptors = list(await asyncio.gather(*cluster_tasks))

        # Dump each cluster descriptor to its own JSON file
        for cluster_descriptor in cluster_descriptors:
            cluster_descriptors_dir = (
                request_artifacts_dir / "cluster_descriptors" / str(cluster_descriptor.id)
            )
            cluster_descriptors_dir.mkdir(parents=True, exist_ok=True)
            cluster_descriptor_path = (
                cluster_descriptors_dir
                / f"cluster-{cluster_descriptor.id}-{timestamp}.json"
            )
            with cluster_descriptor_path.open("w", encoding="utf-8") as f:
                json.dump(cluster_descriptor.dict(), f, ensure_ascii=False, indent=2)

        # ----- Intent Router -----

        # Initialize weight tracking
        element_weights: dict[int, int] = {}
        cluster_weights: dict[int, int] = {}

        # 1) Route clusters and assign weights
        async def route_single_cluster(
            cluster_descriptor: ClusterDescriptor,
        ) -> tuple[int, int]:
            weight = await orchestrator.route_cluster(
                payload.prompt, cluster_descriptor
            )
            # Signal progress
            current = await increment_progress()
            await progress_queue.put(
                {
                    "current": current,
                    "total": total_steps,
                    "stage": "Weighing clusters...",
                }
            )
            return cluster_descriptor.id, weight

        # Start routing all clusters in parallel
        cluster_routing_tasks = [
            asyncio.create_task(route_single_cluster(cd)) for cd in cluster_descriptors
        ]

        # Yield progress updates as they come in
        completed = 0
        while completed < len(cluster_routing_tasks):
            progress_data = await progress_queue.get()
            completed += 1
            progress_event = {"type": "progress", "data": progress_data}
            yield f"data: {json.dumps(progress_event)}\n\n"

        # Collect all results
        cluster_routing_results = list(await asyncio.gather(*cluster_routing_tasks))

        # Apply the routing results to cluster descriptors
        cluster_descriptor_lookup = {cd.id: cd for cd in cluster_descriptors}
        for cluster_id, weight in cluster_routing_results:
            cluster_descriptor_lookup[cluster_id].weight = weight
            cluster_weights[cluster_id] = weight

        # 2) Provide cluster context for design tokens
        token_cluster_context: dict[int, str] = {}
        for cluster_descriptor in cluster_descriptors:
            for element in cluster_descriptor.elements:
                token_cluster_context[element.id] = (
                    f"{cluster_descriptor.title},{cluster_descriptor.description}"
                )

        # 3) Route design tokens and assign weights
        async def route_single_token(token: DesignToken) -> tuple[int, int]:
            cluster_context = token_cluster_context.get(token.id)
            weight = await orchestrator.route_token(
                payload.prompt, token, cluster_context
            )
            # Signal progress
            current = await increment_progress()
            await progress_queue.put(
                {
                    "current": current,
                    "total": total_steps,
                    "stage": "Weighing elements...",
                }
            )
            return token.id, weight

        # Start routing all tokens in parallel
        token_routing_tasks = [
            asyncio.create_task(route_single_token(token)) for token in design_tokens
        ]

        # Yield progress updates as they come in
        completed = 0
        while completed < len(token_routing_tasks):
            progress_data = await progress_queue.get()
            completed += 1
            progress_event = {"type": "progress", "data": progress_data}
            yield f"data: {json.dumps(progress_event)}\n\n"

        # Collect all results
        token_routing_results = list(await asyncio.gather(*token_routing_tasks))

        # Apply the routing results to design tokens
        token_lookup_for_routing = {token.id: token for token in design_tokens}
        for token_id, weight in token_routing_results:
            token_lookup_for_routing[token_id].weight = weight
            element_weights[token_id] = weight

        # 4) Update cluster elements with weighted tokens
        for cluster_descriptor in cluster_descriptors:
            cluster_descriptor.elements = [
                token
                for token in design_tokens
                if token.id in [e.id for e in cluster_descriptor.elements]
            ]

        # 5) Display weights in frontend and wait for confirmation
        session_id = str(uuid.uuid4())
        pending_confirmations[session_id] = {
            "event": asyncio.Event(),
            "confirmed": False,
            "artifacts_dir": str(request_artifacts_dir),
        }
        weights_response = WeightsRequest(
            weights=element_weights,
            cluster_weights=cluster_weights,
        )
        weights_event = {
            "type": "weights",
            "data": weights_response.dict(),
            "session_id": session_id,
        }
        yield f"data: {json.dumps(weights_event)}\n\n"

        # Wait for user confirmation
        logger.info("Waiting for user confirmation of weights...")
        confirmation_session = pending_confirmations[session_id]
        await confirmation_session["event"].wait()
        # Check if user confirmed or cancelled
        confirmed = confirmation_session["confirmed"]
        edited_weights = confirmation_session.get("edited_weights", {})
        del pending_confirmations[session_id]  # Clean up
        if not confirmed:
            logger.info("User cancelled the pipeline")
            cancelled_event = {
                "type": "cancelled",
                "data": "Pipeline cancelled by user",
            }
            yield f"data: {json.dumps(cancelled_event)}\n\n"
            orchestrator.reset_artifacts_dir(artifacts_token)
            return
        if edited_weights:
            edited_element_weights = edited_weights.get("weights", {})
            edited_cluster_weights = edited_weights.get("cluster_weights", {})

            for token_id, user_weight in edited_element_weights.items():
                if token_id in token_lookup_for_routing:
                    clamped_weight = max(0, min(100, int(user_weight)))
                    token_lookup_for_routing[token_id].weight = clamped_weight
                    if token_id in element_weights:
                        element_weights[token_id] = clamped_weight

            for cluster_id, user_weight in edited_cluster_weights.items():
                if cluster_id in cluster_descriptor_lookup:
                    clamped_weight = max(0, min(100, int(user_weight)))
                    cluster_descriptor_lookup[cluster_id].weight = clamped_weight
                    if cluster_id in cluster_weights:
                        cluster_weights[cluster_id] = clamped_weight

        logger.info("User confirmed weights, continuing pipeline...")

        # ----- Master Prompt Generation -----

        # Send progress update for master prompt generation
        progress_event = {
            "type": "progress",
            "data": {
                "current": 0,
                "total": 2,
                "stage": "Generating master prompt...",
            },
        }
        yield f"data: {json.dumps(progress_event)}\n\n"

        master_prompt = await orchestrator.synthesize_master_prompt(
            payload.prompt,
            cluster_descriptors,
        )

        # ----- Master Image Generation -----

        # Send progress update for master image generation
        progress_event = {
            "type": "progress",
            "data": {
                "current": 1,
                "total": 2,
                "stage": "Generating master image...",
            },
        }
        yield f"data: {json.dumps(progress_event)}\n\n"

        master_image_path = await orchestrator.generate_master_image(
            master_prompt,
            cluster_descriptors,
        )
        reference_images = orchestrator.get_reference_images_preview(
            cluster_descriptors
        )

        # Send master prompt and image to frontend for confirmation
        master_image_base64 = ""
        if master_image_path and Path(master_image_path).exists():
            master_image_base64 = encode_image_to_data_url(Path(master_image_path))

        # Create new session for master prompt confirmation
        master_session_id = str(uuid.uuid4())
        pending_confirmations[master_session_id] = {
            "event": asyncio.Event(),
            "confirmed": False,
            "clusters": cluster_descriptors,  # Keep cluster context for potential regeneration
            "master_image_path": str(master_image_path),
            "artifacts_dir": str(request_artifacts_dir),
        }

        master_prompt_event = {
            "type": "master_prompt",
            "data": {
                "prompt": master_prompt,
                "image": master_image_base64,
                "reference_images": reference_images,
            },
            "session_id": master_session_id,
        }
        yield f"data: {json.dumps(master_prompt_event)}\n\n"

        # Wait for user confirmation of master prompt
        logger.info("Waiting for user confirmation of master prompt...")
        await pending_confirmations[master_session_id]["event"].wait()
        # Check if user confirmed or cancelled
        master_session = pending_confirmations[master_session_id]
        master_confirmed = master_session["confirmed"]
        master_image_path = Path(master_session["master_image_path"])
        del pending_confirmations[master_session_id]  # Clean up
        if not master_confirmed:
            logger.info("User cancelled master prompt")
            cancelled_event = {
                "type": "cancelled",
                "data": "Master prompt cancelled by user",
            }
            yield f"data: {json.dumps(cancelled_event)}\n\n"
            orchestrator.reset_artifacts_dir(artifacts_token)
            return
        logger.info("User confirmed master prompt, continuing pipeline...")

        # ----- 3D Generative Model -----

        # Send progress update for 3D model generation
        progress_event = {
            "type": "progress",
            "data": {
                "current": 0,
                "total": 1,
                "stage": "Generating 3D model...",
            },
        }
        yield f"data: {json.dumps(progress_event)}\n\n"

        # Generate 3D model from master image using TRELLIS
        try:
            model_path = await orchestrator.generate_3d_model(
                master_image_path,
                trellis_version=payload.trellis_version,
            )
        except Exception as exc:
            logger.exception(
                "TRELLIS generation failed",
                request_id=request_id,
            )
            error_event = {
                "type": "error",
                "data": f"3D model generation failed: {exc}",
            }
            yield f"data: {json.dumps(error_event)}\n\n"
            orchestrator.reset_artifacts_dir(artifacts_token)
            return

        progress_event = {
            "type": "progress",
            "data": {
                "current": 1,
                "total": 1,
                "stage": "Generating 3D model...",
            },
        }
        yield f"data: {json.dumps(progress_event)}\n\n"

        # ----- Final Response -----

        # Log completion of moodboard extraction
        logger.info("Completed moodboard extraction and 3D model generation")

        # Send final response
        model_url = _artifact_url(model_path)
        final_response = GenerateResponse(
            count=len(payload.elements),
            file=model_url,
        )
        final_event = {"type": "complete", "data": final_response.dict()}
        yield f"data: {json.dumps(final_event)}\n\n"

        # ----- Evaluation -----

        # Calculate score
        score = await orchestrator.evaluate_model(model_path, cluster_descriptors)

        score_event = {"type": "score", "data": {"score": score}}
        yield f"data: {json.dumps(score_event)}\n\n"
        orchestrator.reset_artifacts_dir(artifacts_token)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


if __name__ == "__main__":
    uvicorn.run(
        "backend.app:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
