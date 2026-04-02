from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Literal

import jinja2
import structlog

logger = structlog.stdlib.get_logger(__name__)

_VERSIONS = {
    1: {
        "trellis_path": Path("/workspaces/imagin3d/trellis"),
        "template": "trellis.j2",
        "ckpt_path": Path("/workspaces/imagin3d/backend/trellisv1/ckpts"),
    },
    2: {
        "trellis_path": Path("/workspaces/imagin3d/trellis2"),
        "ckpt_path": Path("/workspaces/imagin3d/backend/trellisv2"),
    },
}


class TrellisEngine:
    def __init__(self, version: Literal[1, 2] | None = None):
        self.version = self._resolve_version(version)
        cfg = _VERSIONS[self.version]

        self.trellis_path: Path = cfg["trellis_path"]
        self.ckpt_path: Path = cfg["ckpt_path"]
        self._template_name: str | None = cfg.get("template")

        self._generate_lock = asyncio.Lock()
        self._pipeline = None
        self._o_voxel = None

        template_dir = Path(__file__).parent / "templates"
        self._jinja_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(template_dir))
        )

        if self.version == 2:
            self._load_v2_pipeline()

    @staticmethod
    def _resolve_version(version: Literal[1, 2] | None) -> Literal[1, 2]:
        if version is None:
            conda_env = os.getenv("CONDA_DEFAULT_ENV", "").strip().lower()
            if conda_env == "trellis":
                version = 1
            elif conda_env == "trellis2":
                version = 2
            else:
                raise ValueError(
                    "Unable to resolve TRELLIS version from CONDA_DEFAULT_ENV. "
                    "Expected 'trellis' for TrellisV1 or 'trellis2' for TrellisV2, "
                    f"got {conda_env!r}."
                )
        if version not in _VERSIONS:
            raise ValueError(f"Unsupported TRELLIS version: {version}. Use 1 or 2.")
        return version  # type: ignore

    @property
    def display_name(self) -> str:
        return f"TrellisV{self.version}"

    async def generate_3d_model(self, image_path: Path, output_dir: Path) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)

        output_glb = output_dir / "sample.glb"
        output_glb.unlink(missing_ok=True)

        if self.version == 2:
            await self._generate_v2_async(image_path, output_glb)
        else:
            await self._generate_v1_async(image_path, output_dir, output_glb)

        if output_glb.exists():
            return output_glb

        raise RuntimeError("GLB file not generated")

    async def _generate_v1_async(
        self, image_path: Path, output_dir: Path, output_glb: Path
    ) -> None:
        if self._template_name is None:
            raise RuntimeError(f"No template configured for TRELLIS v{self.version}")

        template_vars = self._v1_vars(image_path, output_dir, output_glb)
        template = self._jinja_env.get_template(self._template_name)
        script_content = template.render(**template_vars)

        with tempfile.TemporaryDirectory() as temp_dir:
            script_path = Path(temp_dir) / "run_trellis.py"
            script_path.write_text(script_content)

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

    async def _generate_v2_async(self, image_path: Path, output_glb: Path) -> None:
        async with self._generate_lock:
            await asyncio.to_thread(self._run_v2, image_path, output_glb)

    def _load_v2_pipeline(self) -> None:
        if self._pipeline is not None:
            return

        trellis_path = str(self.trellis_path)
        if trellis_path not in sys.path:
            sys.path.insert(0, trellis_path)

        os.environ.update(
            {
                "OPENCV_IO_ENABLE_OPENEXR": "1",
                "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
                "HF_HUB_OFFLINE": "1",
                "TRANSFORMERS_OFFLINE": "1",
            }
        )

        from PIL import Image
        from trellis2.pipelines import Trellis2ImageTo3DPipeline
        import o_voxel

        logger.info("Loading TRELLIS v2 pipeline", ckpt_path=self.ckpt_path)
        self._pipeline = Trellis2ImageTo3DPipeline.from_pretrained(str(self.ckpt_path))
        self._pipeline.cuda()
        self._o_voxel = o_voxel

        self._prewarm_v2(Image)

    def _prewarm_v2(self, Image_module) -> None:
        logger.info("Prewarming TRELLIS v2 pipeline")
        warmup_image_path = self.trellis_path / "assets" / "example_image" / "T.png"

        if warmup_image_path.exists():
            warmup_image = Image_module.open(warmup_image_path)
        else:
            warmup_image = Image_module.new("RGBA", (64, 64), (0, 0, 0, 0))
            warmup_image.paste((255, 255, 255, 255), (16, 16, 48, 48))

        self._pipeline.run(warmup_image, seed=0, pipeline_type="1024_cascade")
        logger.info("TRELLIS v2 prewarm complete")

    def _run_v2(self, image_path: Path, output_glb: Path) -> None:
        from PIL import Image

        if self._pipeline is None or self._o_voxel is None:
            self._load_v2_pipeline()

        image = Image.open(image_path)
        mesh = self._pipeline.run(
            image,
            seed=0,
            pipeline_type="1024_cascade",
        )[0]

        glb = self._o_voxel.postprocess.to_glb(
            vertices=mesh.vertices,
            faces=mesh.faces,
            attr_volume=mesh.attrs,
            coords=mesh.coords,
            attr_layout=mesh.layout,
            voxel_size=mesh.voxel_size,
            aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
            decimation_target=300000,
            texture_size=2048,
            remesh=True,
            remesh_band=1,
            remesh_project=0,
            verbose=True,
        )
        glb.export(str(output_glb), extension_webp=True)

    def _v1_vars(
        self, image_path: Path, output_dir: Path, output_glb: Path
    ) -> dict[str, Any]:
        return {
            "offline_path": self.ckpt_path.parent,
            "image_path": image_path,
            "output_video_gs": output_dir / "sample_gs.mp4",
            "output_video_rf": output_dir / "sample_rf.mp4",
            "output_video_mesh": output_dir / "sample_mesh.mp4",
            "output_glb": output_glb,
            "output_ply": output_dir / "sample.ply",
        }
