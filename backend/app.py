from __future__ import annotations

import asyncio
import json
import os
import shutil
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

LOCAL_DEV_ORIGIN_REGEX = r"https?://(localhost|127\.0\.0\.1)(:\d+)?$"

# Session management
# Maps session_id -> {"event": asyncio.Event, "confirmed": bool}
pending_confirmations: dict[str, dict] = {}

# FastAPI application setup
app = FastAPI(title="Imagin3D Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=LOCAL_DEV_ORIGIN_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create artifacts directory if it doesn't exist
artifacts_dir = ROOT_DIR / "artifacts"
artifacts_dir.mkdir(parents=True, exist_ok=True)

# Mount artifacts directory
app.mount("/artifacts", StaticFiles(directory=ROOT_DIR / "artifacts"), name="artifacts")


@app.on_event("startup")
async def initialize_orchestrator() -> None:
    await asyncio.to_thread(orchestrator._initialize)


@app.get("/status")
async def status():
    engine = orchestrator.trellis_engine
    version = engine.version if engine is not None else None
    response = {
        "initialized": orchestrator._initialized,
    }
    if version is not None:
        response["model"] = f"TrellisV{version}"
    return response


@app.post("/confirm-weights/{session_id}")
async def confirm_weights(
    session_id: str,
    payload: WeightsResponse = Body(...),
):
    if session_id not in pending_confirmations:
        return {"error": "Session not found or already expired"}

    session = pending_confirmations[session_id]
    session["confirmed"] = payload.confirmed
    if payload.weights:
        session["edited_weights"] = {
            "weights": payload.weights,
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

    if session.get("multiview"):
        images = await orchestrator.generate_multiview_master_images(prompt, clusters)
        session["front_image_path"] = str(images["front"])
        session["back_image_path"] = str(images["back"])

        master_prompt_path = ROOT_DIR / "artifacts" / "master_prompt.txt"
        with open(master_prompt_path, "w", encoding="utf-8") as f:
            f.write(prompt)

        return {
            "front_image": encode_image_to_data_url(images["front"]),
            "back_image": encode_image_to_data_url(images["back"]),
        }
    else:
        master_image_path = await orchestrator.generate_master_image(prompt, clusters)
        session["master_image_path"] = str(master_image_path)

        master_prompt_path = ROOT_DIR / "artifacts" / "master_prompt.txt"
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

    if session.get("multiview"):
        if not payload.front_image or not payload.back_image:
            return {
                "error": "Both front_image and back_image data URLs are required for multiview edits"
            }

        images = await orchestrator.edit_multiview_master_images(
            edit_prompt, payload.front_image, payload.back_image, payload.view
        )
        session["front_image_path"] = str(images["front"])
        session["back_image_path"] = str(images["back"])

        return {
            "front_image": encode_image_to_data_url(images["front"]),
            "back_image": encode_image_to_data_url(images["back"]),
        }
    else:
        if not payload.image:
            return {"error": "Image data URL is required for single view edits"}

        master_image_path = await orchestrator.edit_master_image(
            edit_prompt, payload.image
        )
        session["master_image_path"] = str(master_image_path)

        return {
            "image": encode_image_to_data_url(master_image_path),
        }


@app.post("/extract")
async def extract(payload: MoodboardPayload) -> StreamingResponse:
    orchestrator._initialize()

    async def generate():
        # ----- Ingestion -----

        if not payload.elements and not payload.clusters:
            error_event = {
                "type": "error",
                "data": "Payload must contain elements or clusters",
            }
            yield f"data: {json.dumps(error_event)}\n\n"
            return

        # Log start of moodboard extraction
        logger.info(
            "Starting moodboard extraction",
            prompt=payload.prompt,
            element_count=len(payload.elements),
        )

        # Calculate total steps for progress tracking
        total_elements = len(payload.elements)
        total_clusters = len(payload.clusters)
        total_steps = total_elements + total_clusters + total_elements
        if payload.adapt_subject_file:
            total_steps += 1

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

        # Clear artifacts directory
        artifacts_dir = ROOT_DIR / "artifacts"
        if artifacts_dir.exists():
            shutil.rmtree(artifacts_dir)
        artifacts_dir.mkdir(parents=True, exist_ok=True)

        # Timestamp
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

        # Dump raw elements and clusters to JSON file
        raw_path = ROOT_DIR / "artifacts" / "raw" / f"moodboard-{timestamp}.json"
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
            ROOT_DIR / "artifacts" / "design_tokens" / f"design-tokens-{timestamp}.json"
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
                ROOT_DIR
                / "artifacts"
                / "cluster_descriptors"
                / str(cluster_descriptor.id)
            )
            cluster_descriptors_dir.mkdir(parents=True, exist_ok=True)
            cluster_descriptor_path = (
                cluster_descriptors_dir
                / f"cluster-{cluster_descriptor.id}-{timestamp}.json"
            )
            with cluster_descriptor_path.open("w", encoding="utf-8") as f:
                json.dump(cluster_descriptor.dict(), f, ensure_ascii=False, indent=2)

        # ----- Process Adapt Subject -----

        adapt_subject_image_path = None
        if payload.adapt_subject_file:
            current = await increment_progress()
            progress_event = {
                "type": "progress",
                "data": {
                    "current": current,
                    "total": total_steps,
                    "stage": "Processing subject...",
                },
            }
            yield f"data: {json.dumps(progress_event)}\n\n"

            subject_element = {
                "id": "adapt_subject",
                "content": payload.adapt_subject_file,
            }
            # Add "src" to "data" for compatibility
            subject_element["content"]["data"] = {
                "src": subject_element["content"]["data"],
                "fileName": subject_element["content"].get(
                    "name", "adapt_subject_model.glb"
                ),
            }

            try:
                if subject_element["content"]["type"] == "model":
                    title, description = await orchestrator.handle_model(
                        subject_element
                    )
                    renders_dir = (
                        ROOT_DIR / "artifacts" / "model_renders" / "adapt_subject"
                    )
                    renders = sorted(renders_dir.glob("*.jpg"))
                    if renders:
                        adapt_subject_image_path = renders[0]
                elif subject_element["content"]["type"] == "image":
                    title, description = await orchestrator.handle_image(
                        subject_element
                    )
                    adapt_subject_image_path = (
                        ROOT_DIR
                        / "artifacts"
                        / "images"
                        / "adapt_subject"
                        / "image.jpg"
                    )

                # Append title and description to adapt_subject_text
                text_addition = f"{title}: {description}"
                if payload.adapt_subject_text:
                    payload.adapt_subject_text += (
                        f"\n\nReference file details:\n{text_addition}"
                    )
                else:
                    payload.adapt_subject_text = text_addition
            except Exception as e:
                logger.error("Failed to process adapt subject file", error=e)

        # ----- Intent Router -----

        # Initialize weight tracking
        element_weights: dict[int, int] = {}

        # 1) Provide cluster context for design tokens
        token_cluster_context: dict[int, str] = {}
        for cluster_descriptor in cluster_descriptors:
            for element in cluster_descriptor.elements:
                token_cluster_context[element.id] = (
                    f"{cluster_descriptor.title},{cluster_descriptor.description}"
                )

        # 2) Route design tokens and assign weights
        async def route_single_token(token: DesignToken) -> tuple[int, int]:
            cluster_context = token_cluster_context.get(token.id)
            subject_info = (
                payload.adapt_subject_text
                if payload.adapt_subject_text
                else ("file" if payload.adapt_subject_file else None)
            )
            weight = await orchestrator.route_token(
                payload.prompt, token, cluster_context, subject=subject_info
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
        }
        weights_response = WeightsRequest(
            weights=element_weights,
            cluster_weights={},
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
            return
        if edited_weights:
            edited_element_weights = edited_weights.get("weights", {})

            for token_id, user_weight in edited_element_weights.items():
                if token_id in token_lookup_for_routing:
                    clamped_weight = max(0, min(100, int(user_weight)))
                    token_lookup_for_routing[token_id].weight = clamped_weight
                    if token_id in element_weights:
                        element_weights[token_id] = clamped_weight

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
            subject=payload.adapt_subject_text,
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

        if payload.multiview:
            images = await orchestrator.generate_multiview_master_images(
                master_prompt,
                cluster_descriptors,
                base_image_path=adapt_subject_image_path,
                prompt=payload.prompt
                if (payload.adapt_subject_file or payload.adapt_subject_text)
                else None,
            )
            master_image_path = images["front"]  # Fallback
            front_image_path = images["front"]
            back_image_path = images["back"]
        else:
            master_image_path = await orchestrator.generate_master_image(
                master_prompt,
                cluster_descriptors,
                base_image_path=adapt_subject_image_path,
                prompt=payload.prompt
                if (payload.adapt_subject_file or payload.adapt_subject_text)
                else None,
            )

        reference_images = orchestrator.get_reference_images_preview(
            cluster_descriptors
        )

        # Send master prompt and image to frontend for confirmation
        master_image_base64 = ""
        front_image_base64 = ""
        back_image_base64 = ""

        if payload.multiview:
            if Path(front_image_path).exists():
                front_image_base64 = encode_image_to_data_url(Path(front_image_path))
            if Path(back_image_path).exists():
                back_image_base64 = encode_image_to_data_url(Path(back_image_path))
        else:
            if master_image_path and Path(master_image_path).exists():
                master_image_base64 = encode_image_to_data_url(Path(master_image_path))

        # Create new session for master prompt confirmation
        master_session_id = str(uuid.uuid4())

        session_data = {
            "event": asyncio.Event(),
            "confirmed": False,
            "clusters": cluster_descriptors,
            "multiview": payload.multiview,
        }

        if payload.multiview:
            session_data["front_image_path"] = str(front_image_path)
            session_data["back_image_path"] = str(back_image_path)
        else:
            session_data["master_image_path"] = str(master_image_path)

        pending_confirmations[master_session_id] = session_data

        master_prompt_event = {
            "type": "master_prompt",
            "data": {
                "prompt": master_prompt,
                "image": master_image_base64,
                "front_image": front_image_base64,
                "back_image": back_image_base64,
                "multiview": payload.multiview,
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

        if payload.multiview:
            front_image_path_conf = Path(master_session["front_image_path"])
            back_image_path_conf = Path(master_session["back_image_path"])
        else:
            master_image_path_conf = Path(master_session["master_image_path"])

        del pending_confirmations[master_session_id]  # Clean up
        if not master_confirmed:
            logger.info("User cancelled master prompt")
            cancelled_event = {
                "type": "cancelled",
                "data": "Master prompt cancelled by user",
            }
            yield f"data: {json.dumps(cancelled_event)}\n\n"
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
        if payload.multiview:
            model_path = await orchestrator.generate_3d_model(
                [front_image_path_conf, back_image_path_conf]
            )
        else:
            model_path = await orchestrator.generate_3d_model(master_image_path_conf)

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
        relative_path = model_path.relative_to(ROOT_DIR / "artifacts")
        model_url = f"/artifacts/{relative_path}"

        multiview_images = None
        if payload.multiview:
            multiview_images = {
                "front": f"/artifacts/{front_image_path_conf.relative_to(ROOT_DIR / 'artifacts')}",
                "back": f"/artifacts/{back_image_path_conf.relative_to(ROOT_DIR / 'artifacts')}",
            }

        final_response = GenerateResponse(
            count=len(payload.elements),
            file=model_url,
            multiview_images=multiview_images,
        )
        final_event = {"type": "complete", "data": final_response.dict()}
        yield f"data: {json.dumps(final_event)}\n\n"

        # ----- Evaluation -----

        # Calculate score
        score = await orchestrator.evaluate_model(model_path, cluster_descriptors)

        score_event = {"type": "score", "data": {"score": score}}
        yield f"data: {json.dumps(score_event)}\n\n"

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
