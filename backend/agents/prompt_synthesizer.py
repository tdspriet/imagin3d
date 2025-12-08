import pydantic
import pydantic_ai
import pydantic_ai.models
import structlog

from backend import common
from backend.agents import agent

logger = structlog.stdlib.get_logger(__name__)


class PromptSynthesizer(agent.BaseAgent):
    name = "prompt_synthesizer"

    class Output(pydantic.BaseModel):
        info: common.MasterPromptInfo

    def __init__(self, llm: pydantic_ai.models.Model | str):
        super().__init__(llm, self.Output)

    async def run(
        self,
        user_prompt: str,
        clusters: list[dict],
    ) -> pydantic_ai.AgentRunResult[Output]:
        result, _ = await self._prompt({
            "user_prompt": user_prompt,
            "clusters": clusters,
        })
        return result
