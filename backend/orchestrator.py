from __future__ import annotations

import base64
from pathlib import Path
from typing import Any, Union, List

import boto3
import numpy as np
import hydra
from hydra import compose, initialize_config_dir
from omegaconf import DictConfig
import pydantic_ai
import structlog

from backend import common
from backend.agents.descriptor import Descriptor
from backend.agents.clusterer import Clusterer
from backend.agents.intent_router import IntentRouter
from backend.agents.prompt_synthesizer import PromptSynthesizer
from backend.agents.visualizer import Visualizer
from backend.engines.blender import Blender
from backend.utils.trellis import TrellisEngine
from backend.utils.embeddings import BedrockEmbeddingFunction
from backend.utils.video import extract_key_frames

# Logging configuration
logger = structlog.stdlib.get_logger(__name__)

# Global state
ROOT_DIR = Path(__file__).parent.resolve()
blender_engine: Union[Blender, None] = None
trellis_engine: Union[TrellisEngine, None] = None
descriptor: Union[Descriptor, None] = None
clusterer: Union[Clusterer, None] = None
intent_router: Union[IntentRouter, None] = None
prompt_synthesizer: Union[PromptSynthesizer, None] = None
visualizer: Union[Visualizer, None] = None
bedrock_client: Any = None
embedding_function: Union[BedrockEmbeddingFunction, None] = None


def _initialize():
    global _initialized, blender_engine, trellis_engine, descriptor, clusterer, intent_router, prompt_synthesizer, visualizer, bedrock_client, embedding_function
    
    # Initialize via Hydra configuration
    config_dir = str(ROOT_DIR / "config")
    with initialize_config_dir(config_dir=config_dir, version_base=None):
        cfg: DictConfig = compose(config_name="config")
    
    blender_engine = hydra.utils.instantiate(cfg.engine)
    trellis_engine = TrellisEngine()  # Initialize the TrellisEngine
    descriptor = hydra.utils.instantiate(cfg.descriptor)
    clusterer = hydra.utils.instantiate(cfg.clusterer)
    intent_router = hydra.utils.instantiate(cfg.intent_router)
    prompt_synthesizer = hydra.utils.instantiate(cfg.prompt_synthesizer)
    visualizer = hydra.utils.instantiate(cfg.visualizer)
    bedrock_client = boto3.client("bedrock-runtime")
    embedding_function = BedrockEmbeddingFunction(bedrock_client)


async def handle_model(element: dict) -> tuple[str, str]:
    # Save model file
    model_path = await _save_model_file(element)

    # Create renders directory
    unique_name = str(element["id"])
    renders_dir = ROOT_DIR / "artifacts" / "model_renders" / unique_name
    renders_dir.mkdir(parents=True, exist_ok=True)

    # Create renders using Blender
    renders = await blender_engine.render_views(model_path, renders_dir)
    images = [render.image for render in renders]

    # Generate title and description
    result = await descriptor.run(images, type="model")
    return result.output.info.title, result.output.info.description


async def handle_video(element: dict) -> tuple[str, str]:
    video_base64 = element["content"]["data"]["src"]

    # Extract key frames from video
    frames = extract_key_frames(video_base64, frame_count=5)

    # Save the frames
    unique_name = str(element["id"])
    frames_dir = ROOT_DIR / "artifacts" / "video_frames" / unique_name
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

    # Save image to artifacts
    unique_name = str(element["id"])
    images_dir = ROOT_DIR / "artifacts" / "images" / unique_name
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
) -> int:
    result = await intent_router.run_for_cluster(prompt, cluster)
    return result.output.info.weight


async def route_token(
    prompt: str,
    token: common.DesignToken,
    cluster_context: str | None = None,
) -> int:
    result = await intent_router.run_for_token(prompt, token, cluster_context)
    return result.output.info.weight


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
    master_prompt = result.output.info.prompt

    # Save master prompt to artifacts
    master_prompt_path = ROOT_DIR / "artifacts" / "master_prompt.txt"
    with open(master_prompt_path, "w") as f:
        f.write(master_prompt)

    return master_prompt


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
                image_path = ROOT_DIR / "artifacts" / "images" / str(elem.id) / "image.jpg"
                if image_path.exists():
                    with open(image_path, "rb") as f:
                        style_images.append(
                            pydantic_ai.BinaryImage(data=f.read(), media_type="image/jpeg")
                        )
            
            elif elem.type == "video":
                frames_dir = ROOT_DIR / "artifacts" / "video_frames" / str(elem.id)
                if frames_dir.exists():
                    for frame_path in sorted(frames_dir.glob("*.jpg")):
                        with open(frame_path, "rb") as f:
                            style_images.append(
                                pydantic_ai.BinaryImage(data=f.read(), media_type="image/jpeg")
                            )
            
            elif elem.type == "model":
                renders_dir = ROOT_DIR / "artifacts" / "model_renders" / str(elem.id)
                if renders_dir.exists():
                    for render_path in sorted(renders_dir.glob("*.jpg")):
                        with open(render_path, "rb") as f:
                            style_images.append(
                                pydantic_ai.BinaryImage(data=f.read(), media_type="image/jpeg")
                            )
    
    logger.info(f"Collected {len(style_images)} style images for master image generation")
    
    # Generate master image
    result = await visualizer.run(master_prompt, style_images)
    
    # Save master image to artifacts
    master_image_path = ROOT_DIR / "artifacts" / "master_image.jpg"
    
    with open(master_image_path, "wb") as f:
        f.write(result.output.data)
    
    return master_image_path


async def generate_3d_model(master_image_path: Path) -> Path:
    logger.info("Generating 3D model from master image", image_path=str(master_image_path))
    
    # Create output directory for TRELLIS
    output_dir = ROOT_DIR / "artifacts" / "trellis"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Use TRELLIS engine to generate 3D model
    model_path = await trellis_engine.generate_3d_model(master_image_path, output_dir)
    
    logger.info("3D model generation completed", model_path=str(model_path))
    return model_path


async def evaluate_model(
    model_path: Path,
    clusters: list[common.ClusterDescriptor],
) -> int:
    # TODO: check this WIP objective evaluation score
    
    # 1. Calculate moodboard centroid

    embeddings = []
    weights = []

    for cluster in clusters:
        if cluster.weight <= 50:
            continue
            
        for token in cluster.elements:
            if token.weight <= 50:
                continue
            
            if token.embedding and len(token.embedding) > 0:
                embeddings.append(token.embedding)
                weights.append(token.weight)
        
    embeddings_np = np.array(embeddings)
    weights_np = np.array(weights)
    
    if np.sum(weights_np) == 0:
        weights_np = np.ones_like(weights_np) / len(weights_np)
    else:
        weights_np = weights_np / np.sum(weights_np)

    centroid = np.average(embeddings_np, axis=0, weights=weights_np)
    
    # 2. Generate embedding for the generated model
    
    unique_name = f"generated"
    renders_dir = ROOT_DIR / "artifacts" / "model_renders" / unique_name
    renders_dir.mkdir(parents=True, exist_ok=True)
    
    renders = await blender_engine.render_views(model_path, renders_dir)
    images = [render.image for render in renders]
    
    result = await descriptor.run(images, type="model")
    title = result.output.info.title
    
    model_embedding = np.array(generate_embedding(title))
    
    # 3. Calculate distance/score

    dot_product = np.dot(centroid, model_embedding)
    norm_centroid = np.linalg.norm(centroid)
    norm_model = np.linalg.norm(model_embedding)
    
    if norm_centroid == 0 or norm_model == 0:
        return 0
        
    cosine_sim = dot_product / (norm_centroid * norm_model)
    
    score = int(max(0, cosine_sim) * 100)
    return score


# --- Helper functions ---


async def _save_model_file(element: dict) -> Path:
    # Save a model file from base64 data and return its path
    model_data = element["content"]["data"]["src"]
    model_filename = element["content"]["data"]["fileName"]
    base64_data = model_data.split(",", 1)[1]
    model_bytes = base64.b64decode(base64_data)

    models_dir = ROOT_DIR / "artifacts" / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    model_path = models_dir / model_filename

    with model_path.open("wb") as f:
        f.write(model_bytes)

    return model_path
