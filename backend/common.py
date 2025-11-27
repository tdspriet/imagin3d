from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field
from typing import NamedTuple

# --- Frontend / Backend link ---


class MoodboardPayload(BaseModel):
    elements: List[Element] = Field(default_factory=list)
    clusters: List[Cluster] = Field(default_factory=list)
    prompt: str = Field(default="")


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
    purpose: str
    description: str


class IntentRouterInfo(BaseModel):
    weight: int # 0-100
    reasoning: str


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
    purpose: Optional[str] = None
    description: Optional[str] = None
    elements: List[DesignToken] = Field(default_factory=list)
    weight: int = 0  # 0-100
