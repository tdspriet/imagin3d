import pydantic
import pydantic_ai
import pydantic_ai.models
import structlog

import common as common
from agents import agent as agent

logger = structlog.stdlib.get_logger(__name__)


class Descriptor(agent.BaseAgent):
    name = "descriptor"

    class Output(pydantic.BaseModel):
        info: common.Info

    def __init__(self, llm: pydantic_ai.models.Model | str):
        super().__init__(llm, self.Output)

    async def run(
        self, content: str | list[pydantic_ai.BinaryImage]
    ) -> pydantic_ai.AgentRunResult[Output]:
        if isinstance(content, str):
            # Plain text -> pass as context for template rendering
            result, cost = await self._prompt({"content_type": "text", "text": content})
        else:
            # List of images -> pass context indicating images, images go in extra
            result, cost = await self._prompt(
                {"content_type": "images", "num_images": len(content)}, extra=content
            )

        return result
