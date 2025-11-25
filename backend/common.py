from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field
import numpy as np
from typing import NamedTuple


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


class DesignToken(BaseModel):
    id: int
    type: str
    description: Optional[str] = None
    embedding: List[float] = Field(default_factory=list)
    size: Dict[str, float]  # e.g., {"width": 100, "height": 100}
    position: Dict[str, float]  # e.g., {"x": 0, "y": 0}


class Cost(NamedTuple):
    time: float
    price: float

    def add(self, other: Cost) -> Cost:
        return Cost(self.time + other.time, self.price + other.price)
