from __future__ import annotations

import asyncio
import pathlib
import shutil
from typing import Any

import jinja2
import pydantic_ai
import structlog

from engines import engine

logger = structlog.stdlib.get_logger(__name__)


class Blender(engine.Engine):
    """Blender 3D engine implementation."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # check that the executable exists
        exe_path = shutil.which(self.exe)
        if exe_path is None:
            raise FileNotFoundError(
                f"Blender executable '{self.exe}' not found in PATH"
            )

        # set up environment
        template_dir = pathlib.Path(__file__).parent / "templates"
        self._jinja_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(template_dir))
        )

    async def render_views(
        self, model_path: pathlib.Path, output_dir: pathlib.Path
    ) -> list[engine.Render]:
        # create renders directory if it doesn't exist
        output_dir.mkdir(exist_ok=True, parents=True)

        # create the full script
        full_script = self._create_render_script(model_path, output_dir)

        # run blender and execute the rendering script
        try:
            stdout, stderr, returncode = await asyncio.wait_for(
                self._run_script(full_script), self.timeout_s
            )
        except TimeoutError:
            msg = f"Blender timed out (>{self.timeout_s} s) during rendering."
            logger.warning(msg)
            raise engine.EngineException(msg)

        # log errors if any
        if stderr and ("Traceback" in stderr or "Error:" in stderr) and returncode != 0:
            logger.warning("Blender error during rendering.", exc_info=stderr)
            raise engine.EngineException(stderr)

        # collect rendered images
        renders = []
        for i in range(self.num_views):
            render_filename = f"view_{i:01d}.jpg"
            render_path = output_dir / render_filename

            # check if the file exists before trying to read it
            if not render_path.exists():
                raise FileNotFoundError(f"Render file not created: {render_path}")

            with open(render_path, "rb") as f:
                image_bytes = f.read()
                renders.append(
                    engine.Render(
                        image=pydantic_ai.BinaryImage(
                            data=image_bytes, media_type="image/jpeg"
                        )
                    )
                )

        return renders

    def _create_render_script(
        self,
        model_path: pathlib.Path,
        renders_dir: pathlib.Path,
    ) -> str:
        template = self._jinja_env.get_template("render_glb.j2")
        return template.render(
            cfg=self,
            model_path=str(model_path.resolve()),
            renders_dir=str(renders_dir.resolve()),
        )

    async def _run_script(self, script_content: str) -> tuple[str, str, int | None]:
        exe_path = shutil.which(self.exe)
        if exe_path is None:
            raise FileNotFoundError(
                f"Blender executable '{self.exe}' not found in PATH"
            )
        cmd_args = [
            "--background",
            "--factory-startup",
            "--python-expr",
            script_content,
        ]
        process = await asyncio.create_subprocess_exec(
            exe_path,
            *cmd_args,
            stdin=None,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await process.communicate()
        finally:
            if process.returncode is None:
                process.terminate()
        return stdout.decode(), stderr.decode(), process.returncode
