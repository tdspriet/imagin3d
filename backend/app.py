from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

import boto3
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import base64
import hydra
from hydra import compose, initialize_config_dir
from omegaconf import DictConfig
import pydantic_ai

from common import DesignToken, GenerateResponse, MoodboardPayload
from embeddings import BedrockEmbeddingFunction
from engines.blender import Blender
from agents.descriptor import Descriptor
from agents.visualizer import Visualizer
from utils.video import extract_key_frames

load_dotenv()

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

# Initialize Hydra configuration
config_dir = str(ROOT_DIR / "config")
with initialize_config_dir(config_dir=config_dir, version_base=None):
    cfg: DictConfig = compose(config_name="config")

# Initialize Blender engine via Hydra
blender_engine: Blender = hydra.utils.instantiate(cfg.engine)

# Initialize agents via Hydra
descriptor_agent: Descriptor = hydra.utils.instantiate(cfg.descriptor)
visualizer_agent: Visualizer = hydra.utils.instantiate(cfg.visualizer)

# Initialize embedding function
bedrock_client = boto3.client("bedrock-runtime")
embedding_function = BedrockEmbeddingFunction(bedrock_client)

# FastAPI application setup
app = FastAPI(title="Imagin3D Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def save_model_file(element: dict, root_dir: Path) -> Path:
    model_data = element["content"]["data"]["src"]
    model_filename = element["content"]["data"]["fileName"]
    base64_data = model_data.split(",", 1)[1]
    model_bytes = base64.b64decode(base64_data)

    models_dir = root_dir / "checkpoints" / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    model_path = models_dir / model_filename

    with model_path.open("wb") as f:
        f.write(model_bytes)

    return model_path


@app.post("/extract", response_model=GenerateResponse)
async def extract(payload: MoodboardPayload) -> GenerateResponse:
    if not payload.elements and not payload.clusters:
        raise HTTPException(
            status_code=400, detail="Payload must contain elements or clusters"
        )

    # Timestamp
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    # Dump raw elements and clusters to JSON file
    raw_path = ROOT_DIR / "checkpoints" / "raw" / f"moodboard-{timestamp}.json"
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    with raw_path.open("w", encoding="utf-8") as target_file:
        json.dump(payload.dict(), target_file, ensure_ascii=False, indent=2)

    # Turn elements into design tokens
    design_tokens: list[DesignToken] = []
    with raw_path.open("r", encoding="utf-8") as source_file:
        data = json.load(source_file)

        for element in data["elements"]:
            # 1) Basic token structure
            width = element.get("width")
            height = element.get("height")
            if width is None or height is None:
                size_obj = element.get("size", {})
                width = width if width is not None else size_obj.get("width", 0)
                height = height if height is not None else size_obj.get("height", 0)

            x = element.get("x")
            y = element.get("y")
            if x is None or y is None:
                pos_obj = element.get("position", {})
                x = x if x is not None else pos_obj.get("x", 0)
                y = y if y is not None else pos_obj.get("y", 0)

            token_data = {
                "id": element["id"],
                "type": element["content"]["type"],
                "size": {"width": width, "height": height},
                "position": {"x": x, "y": y},
            }

            # 2) Description and embedding generation
            if token_data["type"] == "model":
                # Save model file
                model_path = await save_model_file(element, ROOT_DIR)
                # Create renders directory
                renders_dir = ROOT_DIR / "checkpoints" / "renders"
                renders_dir.mkdir(parents=True, exist_ok=True)
                # Create 5 renders using Blender
                renders = await blender_engine.render_views(model_path, renders_dir)
                # Generate description from rendered images
                images = [render.image for render in renders]
                result = await descriptor_agent.run(images)
                token_data["description"] = result.output.description

            elif token_data["type"] == "video":
                video_base64 = element["content"]["data"]["src"]
                # Extract five most diverse frames
                frames = extract_key_frames(video_base64, frame_count=5)
                # Generate description from frames
                result = await descriptor_agent.run(frames)
                token_data["description"] = result.output.description

            elif token_data["type"] == "palette":
                colors = element["content"].get("data", {}).get("colors", [])
                token_data["description"] = ", ".join(colors)

            elif token_data["type"] == "image":
                image_base64 = element["content"]["data"]["src"]
                # Convert base64 data URL to BinaryImage
                base64_data = image_base64.split(",", 1)[1]
                image_bytes = base64.b64decode(base64_data)
                image = pydantic_ai.BinaryImage(
                    data=image_bytes, media_type="image/jpeg"
                )
                # Generate description from image
                result = await descriptor_agent.run([image])
                token_data["description"] = result.output.description

            elif token_data["type"] == "text":
                # Generate description from text content
                text_content = element["content"]["data"]["text"]
                result = await descriptor_agent.run(text_content)
                token_data["description"] = result.output.description

            # Generate embedding based on description
            # TODO: later, check if OmniBind produces better results
            embedding = embedding_function([token_data["description"]])[0]
            token_data["embedding"] = embedding.tolist()

            # Append the token to the list
            design_tokens.append(DesignToken(**token_data))

    # Dump design tokens to JSON file
    design_tokens_path = (
        ROOT_DIR / "checkpoints" / "design_tokens" / f"design-tokens-{timestamp}.json"
    )
    design_tokens_path.parent.mkdir(parents=True, exist_ok=True)
    with design_tokens_path.open("w", encoding="utf-8") as f:
        json.dump(
            [token.dict() for token in design_tokens], f, ensure_ascii=False, indent=2
        )

    # Return okay response
    return GenerateResponse(count=len(payload.elements), file=str(design_tokens_path))


if __name__ == "__main__":
    uvicorn.run(
        "backend.app:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
