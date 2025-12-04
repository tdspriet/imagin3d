from __future__ import annotations

import asyncio
import json
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn
import structlog

from common import (
    ClusterDescriptor,
    DesignToken,
    GenerateResponse,
    MoodboardPayload,
    WeightInfo,
    WeightsResponse,
)

load_dotenv()

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

import orchestrator  # noqa: E402

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

# Directory configuration
ROOT_DIR = Path(__file__).parent.resolve()

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


@app.post("/confirm-weights/{session_id}")
async def confirm_weights(session_id: str, confirmed: bool = True):
    if session_id not in pending_confirmations:
        return {"error": "Session not found or already expired"}

    session = pending_confirmations[session_id]
    session["confirmed"] = confirmed
    session["event"].set()

    return {"status": "confirmed" if confirmed else "cancelled"}


@app.post("/extract")
async def extract(payload: MoodboardPayload) -> StreamingResponse:
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

        # Clear checkpoints directory
        checkpoints_dir = ROOT_DIR / "checkpoints"
        if checkpoints_dir.exists():
            shutil.rmtree(checkpoints_dir)
        checkpoints_dir.mkdir(parents=True, exist_ok=True)

        # Timestamp
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

        # Dump raw elements and clusters to JSON file
        raw_path = ROOT_DIR / "checkpoints" / "raw" / f"moodboard-{timestamp}.json"
        raw_path.parent.mkdir(parents=True, exist_ok=True)
        with raw_path.open("w", encoding="utf-8") as target_file:
            json.dump(payload.dict(), target_file, ensure_ascii=False, indent=2)

        # ----- Design Tokens -----

        # Turn elements into design tokens
        async def process_element(element: dict) -> DesignToken:
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
            ROOT_DIR
            / "checkpoints"
            / "design_tokens"
            / f"design-tokens-{timestamp}.json"
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
                / "checkpoints"
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

        # ----- Intent Router -----

        # Initialize weight tracking
        element_weights: dict[int, WeightInfo] = {}
        cluster_weights: dict[int, WeightInfo] = {}

        # 1) Route clusters and assign weights
        async def route_single_cluster(
            cluster_descriptor: ClusterDescriptor,
        ) -> tuple[int, float, str]:
            weight, reasoning = await orchestrator.route_cluster(
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
            return cluster_descriptor.id, weight, reasoning

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
        for cluster_id, weight, reasoning in cluster_routing_results:
            cluster_descriptor_lookup[cluster_id].weight = weight
            cluster_descriptor_lookup[cluster_id].reasoning = reasoning
            cluster_weights[cluster_id] = WeightInfo(weight=weight, reasoning=reasoning)

        # 2) Provide cluster context for design tokens
        token_cluster_context: dict[int, str] = {}
        for cluster_descriptor in cluster_descriptors:
            for element in cluster_descriptor.elements:
                token_cluster_context[element.id] = (
                    f"{cluster_descriptor.title},{cluster_descriptor.description}"
                )

        # 3) Route design tokens and assign weights
        async def route_single_token(token: DesignToken) -> tuple[int, float, str]:
            cluster_context = token_cluster_context.get(token.id)
            weight, reasoning = await orchestrator.route_token(
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
            return token.id, weight, reasoning

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
        for token_id, weight, reasoning in token_routing_results:
            token_lookup_for_routing[token_id].weight = weight
            token_lookup_for_routing[token_id].reasoning = reasoning
            element_weights[token_id] = WeightInfo(weight=weight, reasoning=reasoning)

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
        weights_response = WeightsResponse(
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
        await pending_confirmations[session_id]["event"].wait()
        # Check if user confirmed or cancelled
        confirmed = pending_confirmations[session_id]["confirmed"]
        del pending_confirmations[session_id]  # Clean up
        if not confirmed:
            logger.info("User cancelled the pipeline")
            cancelled_event = {
                "type": "cancelled",
                "data": "Pipeline cancelled by user",
            }
            yield f"data: {json.dumps(cancelled_event)}\n\n"
            return
        logger.info("User confirmed weights, continuing pipeline...")

        # ----- Master Prompt Generation -----

        master_prompt = await orchestrator.synthesize_master_prompt(
            payload.prompt,
            cluster_descriptors,
        )
        logger.info(f"Master prompt:\n{master_prompt}")

        # ----- Master Image Generation -----

        # ----- 3D Generative Model -----

        # Log completion of moodboard extraction
        logger.info("Completed moodboard extraction")

        # Send final response
        final_response = GenerateResponse(
            count=len(payload.elements),
            file=str(design_tokens_path),  # TODO: change to generated model file
        )
        final_event = {"type": "complete", "data": final_response.dict()}
        yield f"data: {json.dumps(final_event)}\n\n"

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
