from __future__ import annotations

import asyncio
import importlib
import os
import sys
from pathlib import Path
from typing import Any, Literal

import structlog

logger = structlog.stdlib.get_logger(__name__)

_VERSIONS = {
    1: {
        "trellis_path": Path("/workspaces/imagin3d/trellis"),
        "ckpt_path": "microsoft/TRELLIS-image-large",
    },
    2: {
        "trellis_path": Path("/workspaces/imagin3d/trellis2"),
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
        self._lock = asyncio.Lock()
        self._pipeline: Any = None
        self._envmap: Any = None
        self._torch: Any = None
        self._render_utils: Any = None
        self._postprocessing_utils: Any = None
        self._imageio: Any = None
        self._o_voxel: Any = None

    def _ensure_import_paths(self, *paths: Path) -> None:
        inserted = False
        for path in reversed(paths):
            path_str = str(path)
            if path.exists() and path_str not in sys.path:
                sys.path.insert(0, path_str)
                inserted = True
        if inserted:
            importlib.invalidate_caches()

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
            return await asyncio.to_thread(
                self._generate_3d_model_sync,
                image_path,
                output_dir,
                seed,
            )

    def _generate_3d_model_sync(
        self,
        image_path: Path,
        output_dir: Path,
        seed: int | None,
    ) -> Path:
        self._ensure_loaded()

        output_glb = output_dir / "sample.glb"
        if self.version == 1:
            self._generate_v1(image_path, output_dir, output_glb, seed)
        else:
            self._generate_v2(image_path, output_dir, output_glb, seed)

        if output_glb.exists():
            logger.info(
                "TRELLIS generation finished",
                version=self.version,
                output_glb=str(output_glb),
            )
            return output_glb
        raise RuntimeError("GLB file not generated")

    def _ensure_loaded(self) -> None:
        if self._pipeline is not None:
            return

        logger.info("Loading TRELLIS pipeline", version=self.version)
        if self.version == 1:
            self._load_v1()
        else:
            self._load_v2()
        logger.info("TRELLIS pipeline loaded", version=self.version)

    def _load_v1(self) -> None:
        os.environ.setdefault("SPCONV_ALGO", "native")
        self._ensure_import_paths(self.trellis_path)

        import imageio
        import torch
        from trellis.pipelines import TrellisImageTo3DPipeline
        from trellis.utils import postprocessing_utils, render_utils

        self._torch = torch
        self._imageio = imageio
        self._render_utils = render_utils
        self._postprocessing_utils = postprocessing_utils
        self._pipeline = TrellisImageTo3DPipeline.from_pretrained(self.ckpt_path)
        self._pipeline.cuda()

    def _load_v2(self) -> None:
        os.environ.setdefault("OPENCV_IO_ENABLE_OPENEXR", "1")
        os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
        self._ensure_import_paths(self.trellis_path)

        import cv2
        import imageio
        import o_voxel
        import torch
        from trellis2.pipelines import Trellis2ImageTo3DPipeline
        from trellis2.renderers import EnvMap
        from trellis2.utils import render_utils

        self._torch = torch
        self._imageio = imageio
        self._render_utils = render_utils
        self._o_voxel = o_voxel

        hdri_path = self.trellis_path / "assets" / "hdri" / "forest.exr"
        hdri = cv2.imread(str(hdri_path), cv2.IMREAD_UNCHANGED)
        if hdri is None:
            raise RuntimeError(f"Unable to load TRELLIS envmap: {hdri_path}")

        self._envmap = EnvMap(
            torch.tensor(
                cv2.cvtColor(hdri, cv2.COLOR_BGR2RGB),
                dtype=torch.float32,
                device="cuda",
            )
        )
        self._pipeline = Trellis2ImageTo3DPipeline.from_pretrained(self.ckpt_path)
        self._pipeline.cuda()

    def _generate_v1(
        self,
        image_path: Path,
        output_dir: Path,
        output_glb: Path,
        seed: int | None,
    ) -> None:
        from PIL import Image

        image = Image.open(image_path)
        run_seed = seed if seed is not None else 1

        with self._torch.inference_mode():
            outputs = self._pipeline.run(
                image,
                seed=run_seed,
                sparse_structure_sampler_params={
                    "steps": 12,
                    "cfg_strength": 7.5,
                },
                slat_sampler_params={
                    "steps": 12,
                    "cfg_strength": 3,
                },
            )

        video = self._render_utils.render_video(outputs["gaussian"][0])["color"]
        self._imageio.mimsave(output_dir / "sample_gs.mp4", video, fps=30)

        video = self._render_utils.render_video(outputs["radiance_field"][0])["color"]
        self._imageio.mimsave(output_dir / "sample_rf.mp4", video, fps=30)

        video = self._render_utils.render_video(outputs["mesh"][0])["normal"]
        self._imageio.mimsave(output_dir / "sample_mesh.mp4", video, fps=30)

        glb = self._postprocessing_utils.to_glb(
            outputs["gaussian"][0],
            outputs["mesh"][0],
            simplify=0.95,
            texture_size=1024,
        )
        glb.export(output_glb)
        outputs["gaussian"][0].save_ply(output_dir / "sample.ply")

        if self._torch.cuda.is_available():
            self._torch.cuda.empty_cache()

    def _generate_v2(
        self,
        image_path: Path,
        output_dir: Path,
        output_glb: Path,
        seed: int | None,
    ) -> None:
        from PIL import Image

        if seed is not None:
            self._torch.manual_seed(seed)

        image = Image.open(image_path)
        with self._torch.inference_mode():
            mesh = self._pipeline.run(image)[0]
        mesh.simplify(16777216)

        video = self._render_utils.make_pbr_vis_frames(
            self._render_utils.render_video(mesh, envmap=self._envmap)
        )
        self._imageio.mimsave(output_dir / "sample.mp4", video, fps=15)

        glb = self._o_voxel.postprocess.to_glb(
            vertices=mesh.vertices,
            faces=mesh.faces,
            attr_volume=mesh.attrs,
            coords=mesh.coords,
            attr_layout=mesh.layout,
            voxel_size=mesh.voxel_size,
            aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
            decimation_target=1000000,
            texture_size=4096,
            remesh=True,
            remesh_band=1,
            remesh_project=0,
            verbose=True,
        )
        glb.export(output_glb, extension_webp=True)

        if self._torch.cuda.is_available():
            self._torch.cuda.empty_cache()
