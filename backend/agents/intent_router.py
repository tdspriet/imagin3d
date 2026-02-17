import pydantic
import pydantic_ai
import pydantic_ai.models
import structlog

from backend import common
from backend.agents import agent

logger = structlog.stdlib.get_logger(__name__)


class IntentRouter(agent.BaseAgent):
    name = "intent_router"

    class Output(pydantic.BaseModel):
        info: common.IntentRouterInfo

    def __init__(self, llm: pydantic_ai.models.Model | str):
        super().__init__(llm, self.Output)

    @staticmethod
    def _extract_scale(token: common.DesignToken) -> float:
        size_x = float(token.size.get("x", 1.0))
        size_y = float(token.size.get("y", 1.0))
        # Prefer the dominant resize ratio so enlarged elements are clearly prioritized.
        return max(size_x, size_y)

    async def run_for_cluster(
        self,
        prompt: str,
        cluster: common.ClusterDescriptor,
    ) -> pydantic_ai.AgentRunResult[Output]:
        result, _ = await self._prompt(
            {
                "mode": "cluster",
                "prompt": prompt,
                "item": {
                    "id": cluster.id,
                    "title": cluster.title,
                    "description": cluster.description,
                    "element_count": len(cluster.elements),
                },
            }
        )
        return result

    async def run_for_token(
        self,
        prompt: str,
        token: common.DesignToken,
        cluster_context: str | None = None,
    ) -> pydantic_ai.AgentRunResult[Output]:
        result, _ = await self._prompt(
            {
                "mode": "token",
                "prompt": prompt,
                "cluster_context": cluster_context,
                "item": {
                    "id": token.id,
                    "type": token.type,
                    "title": token.title,
                    "description": token.description,
                    "scale": self._extract_scale(token),
                },
            }
        )
        return result

    async def run(self) -> None:
        raise NotImplementedError("Use run_for_cluster or run_for_token instead")
