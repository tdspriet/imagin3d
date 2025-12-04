from __future__ import annotations

import base64
from pathlib import Path

import boto3
import hydra
from hydra import compose, initialize_config_dir
from omegaconf import DictConfig
import pydantic_ai
import structlog

import common
from agents.descriptor import Descriptor
from agents.clusterer import Clusterer
from agents.intent_router import IntentRouter
from agents.prompt_synthesizer import PromptSynthesizer
from agents.visualizer import Visualizer
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
clusterer: Clusterer = hydra.utils.instantiate(cfg.clusterer)
intent_router: IntentRouter = hydra.utils.instantiate(cfg.intent_router)
prompt_synthesizer: PromptSynthesizer = hydra.utils.instantiate(cfg.prompt_synthesizer)
visualizer: Visualizer = hydra.utils.instantiate(cfg.visualizer)
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
    logger.info(f"Making renders from model #{element['id']}")
    renders = await blender_engine.render_views(model_path, renders_dir)
    images = [render.image for render in renders]

    # Generate title and description
    result = await descriptor.run(images, type="model")
    return result.output.info.title, result.output.info.description


async def handle_video(element: dict) -> tuple[str, str]:
    video_base64 = element["content"]["data"]["src"]

    # Extract key frames from video
    logger.info(f"Extracting key frames from video #{element['id']}")
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
    result = await descriptor.run(frames, type="video")
    return result.output.info.title, result.output.info.description


async def handle_image(element: dict) -> tuple[str, str]:
    image_base64 = element["content"]["data"]["src"]

    # Process image into BinaryImage
    base64_data = image_base64.split(",", 1)[1]
    image_bytes = base64.b64decode(base64_data)
    image = pydantic_ai.BinaryImage(data=image_bytes, media_type="image/jpeg")

    # Save image to checkpoints
    unique_name = str(element["id"])
    images_dir = ROOT_DIR / "checkpoints" / "images" / unique_name
    images_dir.mkdir(parents=True, exist_ok=True)
    image_path = images_dir / "image.jpg"
    with open(image_path, "wb") as f:
        f.write(image_bytes)

    # Generate title and description
    result = await descriptor.run([image], type="image")
    return result.output.info.title, result.output.info.description


async def handle_text(element: dict) -> tuple[str, str]:
    text = element["content"]["data"]["text"]

    # Generate title and description
    result = await descriptor.run(text, type="text")
    return result.output.info.title, result.output.info.description


async def handle_palette(element: dict) -> tuple[str, str]:
    colors = element["content"].get("data", {}).get("colors", [])
    colors_description = ", ".join(colors)

    # Generate only title
    result = await descriptor.run(colors_description, type="palette")
    return result.output.info.title, colors_description


async def handle_cluster(
    title: str,
    elements: list[common.DesignToken],
) -> tuple[str, str, str]:
    result = await clusterer.run(title, elements)
    return (
        result.output.info.title,
        result.output.info.description,
    )


async def route_cluster(
    prompt: str,
    cluster: common.ClusterDescriptor,
) -> tuple[int, str]:
    result = await intent_router.run_for_cluster(prompt, cluster)
    return result.output.info.weight, result.output.info.reasoning


async def route_token(
    prompt: str,
    token: common.DesignToken,
    cluster_context: str | None = None,
) -> tuple[int, str]:
    result = await intent_router.run_for_token(prompt, token, cluster_context)
    return result.output.info.weight, result.output.info.reasoning


def generate_embedding(title: str) -> list[float]:
    # Generate embedding for the given title
    return embedding_function([title])[0].tolist()


async def synthesize_master_prompt(
    user_prompt: str,
    clusters: list[common.ClusterDescriptor],
) -> str:
    # Filter clusters with weight > 50 and their elements with weight > 50
    filtered_clusters = []
    for cluster in clusters:
        if cluster.weight > 50:
            filtered_elements = [
                {
                    "type": elem.type,
                    "title": elem.title,
                    "description": elem.description,
                    "weight": elem.weight,
                }
                for elem in cluster.elements
                if elem.weight > 50
            ]
            filtered_clusters.append({
                "title": cluster.title,
                "description": cluster.description,
                "weight": cluster.weight,
                "elements": filtered_elements,
            })

    result = await prompt_synthesizer.run(user_prompt, filtered_clusters)
    return result.output.info.prompt


async def generate_master_image(
    master_prompt: str,
    clusters: list[common.ClusterDescriptor],
) -> Path:
    # Collect style images from visual elements in clusters with weight > 50
    style_images: list[pydantic_ai.BinaryImage] = []
    
    for cluster in clusters:
        if cluster.weight <= 50:
            continue
        
        for elem in cluster.elements:
            if elem.weight <= 50:
                continue
            
            # Collect images based on element type
            if elem.type == "image":
                image_path = ROOT_DIR / "checkpoints" / "images" / str(elem.id) / "image.jpg"
                if image_path.exists():
                    with open(image_path, "rb") as f:
                        style_images.append(
                            pydantic_ai.BinaryImage(data=f.read(), media_type="image/jpeg")
                        )
            
            elif elem.type == "video":
                frames_dir = ROOT_DIR / "checkpoints" / "video_frames" / str(elem.id)
                if frames_dir.exists():
                    for frame_path in sorted(frames_dir.glob("*.jpg")):
                        with open(frame_path, "rb") as f:
                            style_images.append(
                                pydantic_ai.BinaryImage(data=f.read(), media_type="image/jpeg")
                            )
            
            elif elem.type == "model":
                renders_dir = ROOT_DIR / "checkpoints" / "model_renders" / str(elem.id)
                if renders_dir.exists():
                    for render_path in sorted(renders_dir.glob("*.jpg")):
                        with open(render_path, "rb") as f:
                            style_images.append(
                                pydantic_ai.BinaryImage(data=f.read(), media_type="image/jpeg")
                            )
    
    logger.info(f"Collected {len(style_images)} style images for master image generation")
    
    # Generate master image
    result = await visualizer.run(master_prompt, style_images)
    
    # Save master image to checkpoints
    master_image_path = ROOT_DIR / "checkpoints" / "master_image.jpg"
    
    with open(master_image_path, "wb") as f:
        f.write(result.output.data)
    
    logger.info(f"Master image saved to {master_image_path}")
    return master_image_path


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
