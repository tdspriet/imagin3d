from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

load_dotenv()

# CORS configuration
ALLOWED_ORIGINS = os.getenv("BACKEND_ALLOWED_ORIGINS")
if ALLOWED_ORIGINS:
    CORS_ORIGINS = [
        origin.strip() for origin in ALLOWED_ORIGINS.split(",") if origin.strip()
    ]
else:
    CORS_ORIGINS = ["*"]

# Output directory configuration
OUTPUT_DIR = Path(os.getenv("BACKEND_OUTPUT_DIR")).expanduser().resolve()
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# FastAPI application setup
app = FastAPI(title="Imagin3D Backend", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Cluster(BaseModel):
    id: int
    title: str
    elements: List[int]


class MoodboardPayload(BaseModel):
    elements: List[Dict[str, Any]] = Field(default_factory=list)
    clusters: List[Cluster] = Field(default_factory=list)


class GenerateResponse(BaseModel):
    count: int
    file: str


@app.post("/extract", response_model=GenerateResponse)
def extract(payload: MoodboardPayload) -> GenerateResponse:
    if not payload.elements and not payload.clusters:
        raise HTTPException(
            status_code=400, detail="Payload must contain elements or clusters"
        )

    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    file_path = OUTPUT_DIR / f"moodboard-{timestamp}.json"

    with file_path.open("w", encoding="utf-8") as target_file:
        json.dump(payload.dict(), target_file, ensure_ascii=False, indent=2)

    return GenerateResponse(count=len(payload.elements), file=str(file_path))


if __name__ == "__main__":
    uvicorn.run(
        "backend.app:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=True,
    )
