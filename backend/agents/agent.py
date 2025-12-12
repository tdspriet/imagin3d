import pathlib
import time
from abc import ABC, abstractmethod
from typing import Any, Generic, TypeVar

T = TypeVar('T')

import genai_prices
import jinja2
import pydantic_ai
import pydantic_ai.models
import structlog

from backend import common

logger = structlog.stdlib.get_logger(__name__)


class BaseAgent(ABC, Generic[T]):
    name: str

    def __init__(self, llm: pydantic_ai.models.Model | str, output_type: type[T]):
        self.model_ref = llm if isinstance(llm, str) else llm.model_name
        self.agent = pydantic_ai.Agent(llm, output_type=output_type)
        self.agent.instructions(self.load_instructions)
        self.total_cost = common.Cost(0, 0)

    async def _prompt(
        self,
        ctx: Any,
        extra: list[pydantic_ai.UserContent | None] = [],
        log_run: bool = True,
    ) -> tuple[pydantic_ai.AgentRunResult[T], common.Cost]:
        start_time = time.perf_counter()
        prompts_dir = pathlib.Path(__file__).parents[1] / "prompts"
        env = jinja2.Environment(loader=jinja2.FileSystemLoader(str(prompts_dir)))
        template = env.get_template(f"{self.name}.j2")
        prompt = template.render(ctx=ctx)
        if log_run:
            logger.info(f"Prompt to {self.name}({self.model_ref}):\n{prompt}")
        content = [prompt] + [e for e in extra if e is not None]
        result = await self.agent.run(content, deps=ctx)
        elapsed_time = time.perf_counter() - start_time
        usage = result.usage()
        cost = self._add_costs(usage, elapsed_time)
        if log_run:
            logger.info(
                f"Answer from {self.name}({self.model_ref}):\n"
                f"{result.output if not isinstance(result.output, pydantic_ai.BinaryContent) else '<binary content>'}"
            )
            logger.info(
                f"{self.name}({self.model_ref}) usage:\n"
                f"-> {usage.input_tokens} input tokens\n"
                f"-> {usage.output_tokens} output tokens\n"
                f"-> Cost: ${cost.price:.6f}\n"
                f"-> Time: {int(cost.time // 60)}m {cost.time % 60:.2f}s"
            )
        return result, cost

    def _add_costs(
        self, usage: pydantic_ai.RunUsage, elapsed_time: float
    ) -> common.Cost:
        self.total_cost = self.total_cost.add(
            common.Cost(elapsed_time, self._calc_cost(usage))
        )
        return self.total_cost

    def _calc_cost(self, usage: pydantic_ai.RunUsage) -> float:
        try:
            return float(
                genai_prices.calc_price(usage, model_ref=self.model_ref).total_price
            )
        except LookupError:
            # NOTE: since genai_prices doesn't have these models yet, we fallback here
            # when they become available, they will return properly above and this can be removed
            if "claude-haiku" in self.model_ref:
                return (
                    usage.input_tokens * 1 / 1000000 + usage.output_tokens * 5 / 1000000
                )
            if "claude-sonnet" in self.model_ref:
                return (
                    usage.input_tokens * 3 / 1000000
                    + usage.output_tokens * 15 / 1000000
                )
            if "claude-opus" in self.model_ref:
                return (
                    usage.input_tokens * 5 / 1000000
                    + usage.output_tokens * 25 / 1000000
                )
            if "gemini-2.5-flash-image" in self.model_ref:
                return (
                    usage.input_tokens * 0.3 / 1000000
                    + usage.output_tokens * 30 / 1000000
                )
            logger.warning(
                f"Cost lookup failed for model {self.model_ref}. Defaulting cost to $0.0"
            )
            return 0.0

    @classmethod
    async def load_instructions(cls) -> str:
        instructions_dir = pathlib.Path(__file__).parents[1] / "instructions"
        env = jinja2.Environment(loader=jinja2.FileSystemLoader(str(instructions_dir)))
        template = env.get_template(f"{cls.name}.j2")
        return template.render()

    @abstractmethod
    async def run(self) -> Any: ...
