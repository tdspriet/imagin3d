from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path
from typing import Literal

import structlog
import jinja2

logger = structlog.stdlib.get_logger(__name__)

_VERSIONS = {
    1: {
        "trellis_path": Path("/workspaces/imagin3d/trellis"),
        "template": "trellis.j2",
        "ckpt_path": "/workspaces/imagin3d/backend/trellisv1/ckpts",
    },
    2: {
        "trellis_path": Path("/workspaces/imagin3d/trellis2"),
        "template": "trellis2.j2",
        "ckpt_path": "/workspaces/imagin3d/backend/trellisv2",
    },
}


class TrellisEngine:
    def __init__(self, version: Literal[1, 2] | None = None):
        if version is None:
            version = 2 if os.getenv("CONDA_DEFAULT_ENV") == "trellis2" else 1
        if version not in _VERSIONS:
            raise ValueError(f"Unsupported TRELLIS version: {version}. Use 1 or 2.")
        self.version = version
        cfg = _VERSIONS[version]
        self.trellis_path = cfg["trellis_path"]
        self.ckpt_path = cfg["ckpt_path"]
        self._template_name = cfg["template"]

        template_dir = Path(__file__).parent / "templates"
        self._jinja_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(template_dir))
        )

    @property
    def display_name(self) -> str:
        return f"TrellisV{self.version}"

    async def generate_3d_model(self, image_path: Path, output_dir: Path) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)

        output_glb = output_dir / "sample.glb"

        if self.version == 1:
            template_vars = self._v1_vars(image_path, output_dir, output_glb)
        else:
            template_vars = self._v2_vars(image_path, output_dir, output_glb)

        template = self._jinja_env.get_template(self._template_name)
        script_content = template.render(**template_vars)

        temp_dir = Path(tempfile.mkdtemp())
        script_path = temp_dir / "run_trellis.py"
        with open(script_path, "w") as f:
            f.write(script_content)

        cmd = f"cd {self.trellis_path} && python {script_path}"
        process = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await process.communicate()

        if process.returncode != 0:
            raise RuntimeError(
                f"TRELLIS v{self.version} generation failed: {stderr.decode()}"
            )

        if output_glb.exists():
            return output_glb
        raise RuntimeError("GLB file not generated")

    # template variable helpers

    @staticmethod
    def _v1_vars(image_path: Path, output_dir: Path, output_glb: Path) -> dict:
        return {
            "offline_path": Path(_VERSIONS[1]["ckpt_path"]).parent,
            "image_path": image_path,
            "output_video_gs": output_dir / "sample_gs.mp4",
            "output_video_rf": output_dir / "sample_rf.mp4",
            "output_video_mesh": output_dir / "sample_mesh.mp4",
            "output_glb": output_glb,
            "output_ply": output_dir / "sample.ply",
        }

    def _v2_vars(self, image_path: Path, output_dir: Path, output_glb: Path) -> dict:
        return {
            "offline_path": self.ckpt_path,
            "image_path": image_path,
            "output_video": output_dir / "sample.mp4",
            "output_glb": output_glb,
        }
