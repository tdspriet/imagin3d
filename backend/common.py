from __future__ import annotations

import base64
import binascii
from pathlib import Path
from typing import Any, Dict, List, Optional

import pydantic_ai
from pydantic import BaseModel, Field
from typing import NamedTuple

# --- Frontend / Backend link ---


class MoodboardPayload(BaseModel):
    elements: List[Element] = Field(default_factory=list)
    clusters: List[Cluster] = Field(default_factory=list)
    prompt: str = Field(default="")


class WeightsRequest(BaseModel):
    weights: Dict[int, int] = Field(default_factory=dict)  # element_id -> weight info
    cluster_weights: Dict[int, int] = Field(
        default_factory=dict
    )  # cluster_id -> weight info


class WeightsResponse(BaseModel):
    confirmed: bool = True
    weights: Dict[int, int] = Field(default_factory=dict)  # element_id -> weight info
    cluster_weights: Dict[int, int] = Field(
        default_factory=dict
    )  # cluster_id -> weight info


class MasterImageRegenerateRequest(BaseModel):
    prompt: str


class MasterImageEditRequest(BaseModel):
    prompt: str
    image: str


class GenerateResponse(BaseModel):
    count: int
    file: str


# --- Internal Data Models ---


class Element(BaseModel):
    id: int
    content: Dict[str, Any]
    position: Dict[str, float]
    size: Dict[str, float]


class Cluster(BaseModel):
    id: int
    title: str
    elements: List[int]


class Cost(NamedTuple):
    time: float
    price: float

    def add(self, other: Cost) -> Cost:
        return Cost(self.time + other.time, self.price + other.price)


# --- LLM Data Models ---


class DesignTokenInfo(BaseModel):
    title: str
    description: str


class ClusterDescriptorInfo(BaseModel):
    title: str
    description: str


class IntentRouterInfo(BaseModel):
    weight: int  # 0-100
    reasoning: str


class MasterPromptInfo(BaseModel):
    prompt: str


# --- Token Data Models ---


class DesignToken(BaseModel):
    id: int
    type: str
    title: Optional[str] = None
    description: Optional[str] = None
    embedding: List[float] = Field(default_factory=list)
    size: Dict[str, float]
    position: Dict[str, float]
    weight: int = 0  # 0-100


class ClusterDescriptor(BaseModel):
    id: int
    title: Optional[str] = None
    description: Optional[str] = None
    elements: List[DesignToken] = Field(default_factory=list)
    weight: int = 0  # 0-100


# --- Utility Functions ---


def encode_image_to_data_url(image_path: Path) -> str:
    with open(image_path, "rb") as img_file:
        img_data = base64.b64encode(img_file.read()).decode("utf-8")
        ext = image_path.suffix.lower()
        mime_type = "image/png" if ext == ".png" else "image/jpeg"
        return f"data:{mime_type};base64,{img_data}"


def decode_data_url_to_binary_image(image_data_url: str) -> pydantic_ai.BinaryImage:
    if "," not in image_data_url:
        raise ValueError("Invalid image payload")

    header, base64_data = image_data_url.split(",", 1)
    media_type = "image/jpeg"
    if header.startswith("data:") and ";base64" in header:
        media_type = header[5 : header.index(";base64")]

    try:
        image_bytes = base64.b64decode(base64_data)
    except binascii.Error as exc:
        raise ValueError("Invalid base64 image payload") from exc

    return pydantic_ai.BinaryImage(data=image_bytes, media_type=media_type)
