from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from backend.common import DesignToken, GenerateResponse, MoodboardPayload

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

# FastAPI application setup
app = FastAPI(title="Imagin3D Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/extract", response_model=GenerateResponse)
def extract(payload: MoodboardPayload) -> GenerateResponse:
    if not payload.elements and not payload.clusters:
        raise HTTPException(
            status_code=400, detail="Payload must contain elements or clusters"
        )

    # Timestamp
    timestamp = datetime.now(datetime.timezone.utc).strftime("%Y%m%d-%H%M%S")

    # Dump raw elements and clusters to JSON file
    raw_path = ROOT_DIR / "raw" / f"moodboard-{timestamp}.json"
    with raw_path.open("w", encoding="utf-8") as target_file:
        json.dump(payload.dict(), target_file, ensure_ascii=False, indent=2)

    # Turn elements into design tokens
    design_tokens: list[DesignToken] = []
    with raw_path.open("r", encoding="utf-8") as source_file:
        data = json.load(source_file)

        for element in data["elements"]:
            # 1) Basic token structure
            token = {
                "id": element["id"],
                "type": element["content"]["type"],
                "size": {"width": element["width"], "height": element["height"]},
                "position": {"x": element["x"], "y": element["y"]},
            }

            # 2) Description and embedding generation
            if token["type"] == "model":
                # Model should be rendered from 5 views before description generation
                # TODO: later, check if Cap3D produces better results
                pass

            elif token["type"] == "video":
                # Video should be converted into 5 frames before description generation
                pass

            elif token["type"] == "palette":
                token["description"] = ", ".join(element["content"]["colors"])
                token["embedding"] = []

            else:  # images and text
                pass

            # Embedding should be added here based on generated description
            # TODO: later, check if OmniBind produces better results
            token["embedding"] = []

            # Append the token to the list
            design_tokens.append(token)

    # Dump design tokens to JSON file
    design_tokens_path = ROOT_DIR / "design_tokens" / f"design-tokens-{timestamp}.json"
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
