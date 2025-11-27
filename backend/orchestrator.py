from __future__ import annotations

import base64
from pathlib import Path

import boto3
import hydra
from hydra import compose, initialize_config_dir
from omegaconf import DictConfig
import pydantic_ai
import structlog

from agents.descriptor import Descriptor
from engines.blender import Blender
from utils.embeddings import BedrockEmbeddingFunction
from utils.video import extract_key_frames

# Logging configuration
logger = structlog.stdlib.get_logger(__name__)

# Directory configuration
ROOT_DIR = Path(__file__).parent.resolve()

# Initialize via Hydra configuration
config_dir = str(ROOT_DIR / "config")
with initialize_config_dir(config_dir=config_dir, version_base=None):
    cfg: DictConfig = compose(config_name="config")
blender_engine: Blender = hydra.utils.instantiate(cfg.engine)
descriptor: Descriptor = hydra.utils.instantiate(cfg.descriptor)
bedrock_client = boto3.client("bedrock-runtime")
embedding_function = BedrockEmbeddingFunction(bedrock_client)


async def handle_model(element: dict) -> tuple[str, str]:
    # Save model file
    model_path = await _save_model_file(element)

    # Create renders directory
    unique_name = str(element["id"])
    renders_dir = ROOT_DIR / "checkpoints" / "model_renders" / unique_name
    renders_dir.mkdir(parents=True, exist_ok=True)

    # Create renders using Blender
    logger.info("Making renders from model", element_id=element["id"])
    renders = await blender_engine.render_views(model_path, renders_dir)
    images = [render.image for render in renders]

    # Generate title and description
    result = await descriptor.run(images)
    return result.output.info.title, result.output.info.description


async def handle_video(element: dict) -> tuple[str, str]:
    video_base64 = element["content"]["data"]["src"]

    # Extract key frames from video
    logger.info("Extracting key frames from video", element_id=element["id"])
    frames = extract_key_frames(video_base64, frame_count=5)

    # Save the frames
    unique_name = str(element["id"])
    frames_dir = ROOT_DIR / "checkpoints" / "video_frames" / unique_name
    frames_dir.mkdir(parents=True, exist_ok=True)
    for i, frame in enumerate(frames):
        frame_path = frames_dir / f"frame_{i}.jpg"
        with open(frame_path, "wb") as f:
            f.write(frame.data)

    # Generate title and description
    result = await descriptor.run(frames)
    return result.output.info.title, result.output.info.description


async def handle_image(element: dict) -> tuple[str, str]:
    image_base64 = element["content"]["data"]["src"]

    # Process image into BinaryImage
    base64_data = image_base64.split(",", 1)[1]
    image_bytes = base64.b64decode(base64_data)
    image = pydantic_ai.BinaryImage(data=image_bytes, media_type="image/jpeg")

    # Generate title and description
    result = await descriptor.run([image])
    return result.output.info.title, result.output.info.description


async def handle_text(element: dict) -> tuple[str, str]:
    text = element["content"]["data"]["text"]

    # Generate title and description
    result = await descriptor.run(text)
    return result.output.info.title, result.output.info.description


def handle_palette(element: dict) -> tuple[str, str]:
    # TODO: check if a better method is needed
    # Make title and description
    colors = element["content"].get("data", {}).get("colors", [])
    return "Colors", ", ".join(colors)


def generate_embedding(title: str) -> list[float]:
    # Generate embedding for the given title
    # TODO: later, check if OmniBind produces better results
    return embedding_function([title])[0].tolist()


# --- Helper functions ---


async def _save_model_file(element: dict) -> Path:
    # Save a model file from base64 data and return its path
    model_data = element["content"]["data"]["src"]
    model_filename = element["content"]["data"]["fileName"]
    base64_data = model_data.split(",", 1)[1]
    model_bytes = base64.b64decode(base64_data)

    models_dir = ROOT_DIR / "checkpoints" / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    model_path = models_dir / model_filename

    with model_path.open("wb") as f:
        f.write(model_bytes)

    return model_path
