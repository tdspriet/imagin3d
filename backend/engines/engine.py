from __future__ import annotations

import dataclasses
import pathlib
from abc import ABC, abstractmethod

import pydantic
import pydantic_ai


class Render(pydantic.BaseModel):
    image: pydantic_ai.BinaryImage = pydantic.Field(
        description="Binary content of the rendered image"
    )


class EngineException(Exception):
    pass


@dataclasses.dataclass
class Engine(ABC):
    name: str
    version: str
    exe: str
    resolution_x: int
    resolution_y: int
    num_views: int
    timeout_s: int

    @abstractmethod
    async def render_views(
        self, model_path: pathlib.Path, output_dir: pathlib.Path
    ) -> list[Render]:
        """Render a number of camera views and return image renders per view."""
        pass
