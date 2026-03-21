from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path
from typing import Literal

import jinja2
import structlog

logger = structlog.stdlib.get_logger(__name__)

_VERSIONS = {
    1: {
        "trellis_path": Path("/workspaces/imagin3d/trellis"),
        "template": "trellis.j2",
        "ckpt_path": "microsoft/TRELLIS-image-large",
    },
    2: {
        "trellis_path": Path("/workspaces/imagin3d/trellis2"),
        "template": "trellis2.j2",
        "ckpt_path": "microsoft/TRELLIS.2-4B",
    },
}


class TrellisEngine:
    def __init__(self, version: Literal[1, 2] | None = None):
        if version is None:
            version = 2 if os.getenv("CONDA_DEFAULT_ENV") == "trellis2" else 1
        if version not in _VERSIONS:
            raise ValueError(f"Unsupported TRELLIS version: {version}. Use 1 or 2.")

        cfg = _VERSIONS[version]
        self.version = version
        self.trellis_path = cfg["trellis_path"]
        self.ckpt_path = cfg["ckpt_path"]
        self._template_name = cfg["template"]
        self._lock = asyncio.Lock()

        template_dir = Path(__file__).parent / "templates"
        self._jinja_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(template_dir))
        )

    async def generate_3d_model(
        self,
        image_path: Path,
        output_dir: Path,
        seed: int | None = None,
    ) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)

        async with self._lock:
            logger.info(
                "Starting TRELLIS generation",
                version=self.version,
                image_path=str(image_path),
                output_dir=str(output_dir),
            )

            output_glb = output_dir / "sample.glb"
            template = self._jinja_env.get_template(self._template_name)
            script_content = template.render(
                **self._template_vars(image_path, output_dir, output_glb, seed)
            )

            with tempfile.TemporaryDirectory(prefix="trellis-run-") as temp_dir:
                script_path = Path(temp_dir) / "run_trellis.py"
                script_path.write_text(script_content, encoding="utf-8")

                process = await asyncio.create_subprocess_exec(
                    sys.executable,
                    str(script_path),
                    cwd=str(self.trellis_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await process.communicate()

            if process.returncode != 0:
                raise RuntimeError(
                    f"TRELLIS v{self.version} generation failed:\n"
                    f"STDOUT:\n{stdout.decode(errors='replace')}\n"
                    f"STDERR:\n{stderr.decode(errors='replace')}"
                )

            if output_glb.exists():
                logger.info(
                    "TRELLIS generation finished",
                    version=self.version,
                    output_glb=str(output_glb),
                )
                return output_glb

            raise RuntimeError("GLB file not generated")

    def _template_vars(
        self,
        image_path: Path,
        output_dir: Path,
        output_glb: Path,
        seed: int | None,
    ) -> dict:
        if self.version == 1:
            return {
                "ckpt_path": self.ckpt_path,
                "image_path": image_path,
                "output_video_gs": output_dir / "sample_gs.mp4",
                "output_video_rf": output_dir / "sample_rf.mp4",
                "output_video_mesh": output_dir / "sample_mesh.mp4",
                "output_glb": output_glb,
                "output_ply": output_dir / "sample.ply",
                "seed": 1 if seed is None else seed,
            }

        return {
            "ckpt_path": self.ckpt_path,
            "image_path": image_path,
            "output_video": output_dir / "sample.mp4",
            "output_glb": output_glb,
            "seed": seed,
        }
