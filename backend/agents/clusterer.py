import pydantic
import pydantic_ai
import pydantic_ai.models
import structlog

import common as common
from agents import agent as agent

logger = structlog.stdlib.get_logger(__name__)


class Clusterer(agent.BaseAgent):
    name = "clusterer"

    class Output(pydantic.BaseModel):
        info: common.ClusterDescriptorInfo

    def __init__(self, llm: pydantic_ai.models.Model | str):
        super().__init__(llm, self.Output)

    async def run(
        self,
        title: str,
        elements: list[common.DesignToken],
    ) -> pydantic_ai.AgentRunResult[Output]:
        # Extract only the needed fields for the prompt
        cleaned_elements = [
            {
                "id": token.id,
                "type": token.type,
                "title": token.title,
                "description": token.description,
            }
            for token in elements
        ]
        result, _ = await self._prompt({"title": title, "elements": cleaned_elements})
        return result
