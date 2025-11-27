from __future__ import annotations

import json
import os
import shutil
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import structlog

from common import DesignToken, GenerateResponse, MoodboardPayload

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

# FastAPI application setup
app = FastAPI(title="Imagin3D Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/extract", response_model=GenerateResponse)
async def extract(payload: MoodboardPayload) -> GenerateResponse:
    if not payload.elements and not payload.clusters:
        raise HTTPException(
            status_code=400, detail="Payload must contain elements or clusters"
        )

    # Log start of moodboard extraction
    logger.info("Starting moodboard extraction", element_count=len(payload.elements))

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

    # Turn elements into design tokens
    design_tokens: list[DesignToken] = []
    with raw_path.open("r", encoding="utf-8") as source_file:
        data = json.load(source_file)

        for element in data["elements"]:
            # 1) Basic token structure
            token_data = {
                "id": element["id"],
                "type": element["content"]["type"],
                "size": {"x": element["size"]["x"], "y": element["size"]["y"]},
                "position": {
                    "x": element["position"]["x"],
                    "y": element["position"]["y"],
                },
            }

            # 2) Description generation using orchestrator
            match token_data["type"]:
                case "model":
                    # TODO: later, check if PointLLM produces better results
                    logger.info(f"Handling model element #{element['id']}")
                    title, description = await orchestrator.handle_model(element)
                case "video":
                    logger.info(f"Handling video element #{element['id']}")
                    title, description = await orchestrator.handle_video(element)
                case "palette":
                    logger.info(f"Handling palette element #{element['id']}")
                    title, description = orchestrator.handle_palette(element)
                case "image":
                    logger.info(f"Handling image element #{element['id']}")
                    title, description = await orchestrator.handle_image(element)
                case "text":
                    logger.info(f"Handling text element #{element['id']}")
                    title, description = await orchestrator.handle_text(element)
            token_data["title"] = title
            token_data["description"] = description

            # 3) Generate embedding based on title
            # TODO: later, check if OmniBind or Point-Bind produces better results
            token_data["embedding"] = orchestrator.generate_embedding(
                token_data["title"]
            )

            # 4) Append the token to the list
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

    # Log completion of moodboard extraction
    logger.info("Completed moodboard extraction")

    # Return okay response
    return GenerateResponse(count=len(payload.elements), file=str(design_tokens_path))


if __name__ == "__main__":
    uvicorn.run(
        "backend.app:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
