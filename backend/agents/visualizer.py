from typing import NewType

import pydantic_ai
import pydantic_ai.models
import structlog

from backend.agents import agent

logger = structlog.stdlib.get_logger(__name__)


class Visualizer(agent.BaseAgent):
    name = "visualizer"

    Output = NewType("Output", pydantic_ai.BinaryImage)

    def __init__(self, llm: pydantic_ai.models.Model | str):
        super().__init__(llm, pydantic_ai.BinaryImage)

    async def run(
        self,
        master_prompt: str,
        style_images: list[pydantic_ai.BinaryImage],
        base_image: pydantic_ai.BinaryImage | None = None,
    ) -> pydantic_ai.AgentRunResult[pydantic_ai.BinaryImage]:
        extra = []
        if base_image:
            extra.append(base_image)
        extra.extend(style_images)

        result, _ = await self._prompt(
            {"master_prompt": master_prompt, "has_base_image": bool(base_image)},
            extra=extra,
        )
        return result
