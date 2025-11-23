from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import base64
import hydra
from hydra import compose, initialize_config_dir
from omegaconf import DictConfig
import pydantic_ai

from backend.common import DesignToken, GenerateResponse, MoodboardPayload
from backend.engines.blender import Blender
from backend.agents.descriptor import Descriptor
from backend.agents.visualizer import Visualizer

load_dotenv()

# CORS configuration
ALLOWED_ORIGINS = os.getenv("BACKEND_ALLOWED_ORIGINS")
if ALLOWED_ORIGINS:
    CORS_ORIGINS = [
        origin.strip() for origin in ALLOWED_ORIGINS.split(",") if origin.strip()
    ]
else:
    CORS_ORIGINS = ["*"]

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
            token_data = {
                "id": element["id"],
                "type": element["content"]["type"],
                "size": {"width": element["width"], "height": element["height"]},
                "position": {"x": element["x"], "y": element["y"]},
            }

            # 2) Description and embedding generation
            if token_data["type"] == "model":
                # Save model file
                model_path = await save_model_file(element, ROOT_DIR)
                # Create renders directory
                renders_dir = ROOT_DIR / "checkpoints" / "renders"
                renders_dir.mkdir(parents=True, exist_ok=True)
                # Render views using Blender
                renders = await blender_engine.render_views(model_path, renders_dir)
                # Generate description from rendered images
                images = [render.image for render in renders]
                result = await descriptor_agent.run(images)
                token_data["description"] = result.output.description

            elif token_data["type"] == "video":
                # Video should be converted into 5 frames before description generation
                pass

            elif token_data["type"] == "palette":
                token_data["description"] = ", ".join(element["content"]["colors"])

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

            # Embedding should be added here based on generated description
            # TODO: later, check if OmniBind produces better results
            token_data["embedding"] = []

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
