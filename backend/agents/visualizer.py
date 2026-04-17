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
        prompt: str | None = None,
        view: str | None = None,
        is_edit: bool = False,
    ) -> pydantic_ai.AgentRunResult[pydantic_ai.BinaryImage]:
        extra = []
        if base_image:
            extra.append(base_image)
        extra.extend(style_images)

        original_name = self.name

        if is_edit:
            ctx = {"edit_prompt": master_prompt, "is_multiview": view is not None}
            self.name = f"visualizer_{view}" if view else "edit"
            mode = "multiview/edit" if view else None
        else:
            mode = "adapt" if base_image or prompt else "generation"
            if view:
                self.name = f"visualizer_{view}"
                mode = f"multiview/{mode}"

            ctx = {"master_prompt": master_prompt, "has_base_image": bool(base_image)}
            if prompt:
                ctx["adaptation"] = prompt

        try:
            result, _ = await self._prompt(
                ctx,
                extra=extra,
                template_subdir=mode,
            )
            return result
        finally:
            self.name = original_name
