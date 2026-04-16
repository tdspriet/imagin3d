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
        prompt: str,
        clusters: list[dict],
        subject: str | None = None,
    ) -> pydantic_ai.AgentRunResult[Output]:
        mode = "adapt" if subject else "generation"
        ctx = {"clusters": clusters}
        if subject:
            ctx["subject"] = subject
            ctx["adaptation"] = prompt
        else:
            ctx["prompt"] = prompt

        result, _ = await self._prompt(
            ctx,
            template_subdir=mode,
        )
        return result
