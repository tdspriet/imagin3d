from typing import Any, NewType

import pydantic_ai
import pydantic_ai.models
import structlog

from backend import common as common
from backend.agents import agent as agent

logger = structlog.stdlib.get_logger(__name__)


class Visualizer(agent.BaseAgent):
    name = "visualizer"

    Output = NewType("Output", pydantic_ai.BinaryImage)

    def __init__(self, llm: pydantic_ai.models.Model | str):
        super().__init__(llm, pydantic_ai.BinaryImage)

    async def run(
        self, content: Any
    ) -> pydantic_ai.AgentRunResult[pydantic_ai.BinaryImage]:
        result, cost = await self._prompt(content)
        return result
