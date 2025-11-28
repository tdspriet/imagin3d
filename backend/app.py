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
        current_step = 0

        # Send initial progress
        progress_event = {
            "type": "progress",
            "data": {
                "current": current_step,
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
        design_tokens: list[DesignToken] = []
        with raw_path.open("r", encoding="utf-8") as source_file:
            data = json.load(source_file)

            for element in data["elements"]:
                # 1) Title and description generation
                # TODO: this should be parallelized later
                match element["content"]["type"]:
                    case "model":
                        # TODO: later, check if PointLLM produces better results
                        logger.info(f"Handling model element #{element['id']}")
                        title, description = await orchestrator.handle_model(element)
                    case "video":
                        logger.info(f"Handling video element #{element['id']}")
                        title, description = await orchestrator.handle_video(element)
                    case "palette":
                        logger.info(f"Handling palette element #{element['id']}")
                        title, description = await orchestrator.handle_palette(element)
                    case "image":
                        logger.info(f"Handling image element #{element['id']}")
                        title, description = await orchestrator.handle_image(element)
                    case "text":
                        logger.info(f"Handling text element #{element['id']}")
                        title, description = await orchestrator.handle_text(element)

                # 2) Generate embedding based on title
                # TODO: later, check if OmniBind or Point-Bind produces better results
                embedding = orchestrator.generate_embedding(title)

                # 3) Create the design token and append to list
                design_token = DesignToken(
                    id=element["id"],
                    type=element["content"]["type"],
                    title=title,
                    description=description,
                    embedding=embedding,
                    size={"x": element["size"]["x"], "y": element["size"]["y"]},
                    position={
                        "x": element["position"]["x"],
                        "y": element["position"]["y"],
                    },
                )
                design_tokens.append(design_token)

                # Send progress update
                current_step += 1
                progress_event = {
                    "type": "progress",
                    "data": {
                        "current": current_step,
                        "total": total_steps,
                        "stage": "Processing elements...",
                    },
                }
                yield f"data: {json.dumps(progress_event)}\n\n"

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
        cluster_descriptors: list[ClusterDescriptor] = []
        with raw_path.open("r", encoding="utf-8") as source_file:
            data = json.load(source_file)

            for cluster in data["clusters"]:
                logger.info(f"Handling cluster #{cluster['id']}")

                # 1) Gather elements for this cluster
                elements: list[DesignToken] = [
                    token_lookup[element_id]
                    for element_id in cluster["elements"]
                    if element_id in token_lookup
                ]

                # 2) Generate title, purpose and description via clusterer
                # TODO: this should be parallelized later
                # NOTE: check if purpose is needed
                title, purpose, description = await orchestrator.handle_cluster(
                    cluster["title"], elements
                )

                # 3) Create the cluster descriptor and append to list
                # NOTE: check if cluster descriptors need embeddings
                cluster_descriptor = ClusterDescriptor(
                    id=cluster["id"],
                    title=title,
                    purpose=purpose,
                    description=description,
                    elements=elements,
                )
                cluster_descriptors.append(cluster_descriptor)

                # 4) Dump each cluster descriptor to its own JSON file
                cluster_descriptors_dir = (
                    ROOT_DIR
                    / "checkpoints"
                    / "cluster_descriptors"
                    / str(cluster["id"])
                )
                cluster_descriptors_dir.mkdir(parents=True, exist_ok=True)
                cluster_descriptor_path = (
                    cluster_descriptors_dir
                    / f"cluster-{cluster['id']}-{timestamp}.json"
                )
                with cluster_descriptor_path.open("w", encoding="utf-8") as f:
                    json.dump(
                        cluster_descriptor.dict(), f, ensure_ascii=False, indent=2
                    )

                # Send progress update
                current_step += 1
                progress_event = {
                    "type": "progress",
                    "data": {
                        "current": current_step,
                        "total": total_steps,
                        "stage": "Processing clusters...",
                    },
                }
                yield f"data: {json.dumps(progress_event)}\n\n"

        # ----- Intent Router -----

        # Initialize weight tracking
        element_weights: dict[int, WeightInfo] = {}
        cluster_weights: dict[int, WeightInfo] = {}

        # 1) Route clusters and assign weights
        for cluster_descriptor in cluster_descriptors:
            logger.info(f"Routing cluster #{cluster_descriptor.id}")
            weight, reasoning = await orchestrator.route_cluster(
                payload.prompt, cluster_descriptor
            )
            cluster_descriptor.weight = weight
            cluster_descriptor.reasoning = reasoning
            cluster_weights[cluster_descriptor.id] = WeightInfo(
                weight=weight, reasoning=reasoning
            )

            # Send progress update
            current_step += 1
            progress_event = {
                "type": "progress",
                "data": {
                    "current": current_step,
                    "total": total_steps,
                    "stage": "Weighing clusters...",
                },
            }
            yield f"data: {json.dumps(progress_event)}\n\n"

        # 2) Provide cluster context for design tokens
        token_cluster_context: dict[int, str] = {}
        for cluster_descriptor in cluster_descriptors:
            for element in cluster_descriptor.elements:
                token_cluster_context[element.id] = (
                    f"{cluster_descriptor.title} ({cluster_descriptor.purpose})"
                )

        # 3) Route design tokens and assign weights
        for token in design_tokens:
            logger.info(f"Routing design token #{token.id}")
            cluster_context = token_cluster_context.get(token.id)
            weight, reasoning = await orchestrator.route_token(
                payload.prompt, token, cluster_context
            )
            token.weight = weight
            token.reasoning = reasoning
            element_weights[token.id] = WeightInfo(weight=weight, reasoning=reasoning)

            # Send progress update
            current_step += 1
            progress_event = {
                "type": "progress",
                "data": {
                    "current": current_step,
                    "total": total_steps,
                    "stage": "Weighing elements...",
                },
            }
            yield f"data: {json.dumps(progress_event)}\n\n"

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

        # ----- Prompt Synthesis -----

        # ----- Master Prompt and Image Generation -----

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
