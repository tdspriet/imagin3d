import pydantic
import pydantic_ai
import pydantic_ai.models
import structlog

from backend import common
from backend.agents import agent

logger = structlog.stdlib.get_logger(__name__)


class Descriptor(agent.BaseAgent):
    name = "descriptor"

    class Output(pydantic.BaseModel):
        info: common.DesignTokenInfo

    def __init__(self, llm: pydantic_ai.models.Model | str):
        super().__init__(llm, self.Output)

    async def run(
        self,
        content: str | list[pydantic_ai.BinaryImage],
        type: str,
    ) -> pydantic_ai.AgentRunResult[Output]:
        # Text
        if isinstance(content, str):
            result, _ = await self._prompt({"type": type, "text": content})
        # Images
        else:
            result, _ = await self._prompt({"type": type}, extra=content)

        return result
