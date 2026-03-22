from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path
from typing import Literal

import jinja2
import structlog

logger = structlog.stdlib.get_logger(__name__)

_MINICONDA_ROOT = Path("/workspaces/miniconda3")
_VERSIONS = {
    1: {
        "trellis_path": Path("/workspaces/imagin3d/trellis"),
        "template": "trellis.j2",
        "ckpt_path": "microsoft/TRELLIS-image-large",
        "env_name": "trellis",
        "import_name": "trellis",
        "fallback_to_base": True,
    },
    2: {
        "trellis_path": Path("/workspaces/imagin3d/trellis2"),
        "template": "trellis2.j2",
        "ckpt_path": "microsoft/TRELLIS.2-4B",
        "env_name": "trellis2",
        "import_name": "trellis2",
        "fallback_to_base": False,
    },
}


class TrellisEngine:
    def __init__(self, version: Literal[1, 2] | None = None):
        if version is None:
            version = 2 if os.getenv("CONDA_DEFAULT_ENV") == "trellis2" else 1
        if version not in _VERSIONS:
            raise ValueError(f"Unsupported TRELLIS version: {version}. Use 1 or 2.")

        self.default_version = version
        self._lock = asyncio.Lock()
        self._validated_runtimes: dict[int, dict] = {}

        template_dir = Path(__file__).parent / "templates"
        self._jinja_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(template_dir))
        )

    async def generate_3d_model(
        self,
        image_path: Path,
        output_dir: Path,
        seed: int | None = None,
        version: Literal[1, 2] | None = None,
    ) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        resolved_version = self.default_version if version is None else version
        runtime = await self._resolve_runtime(resolved_version)

        async with self._lock:
            logger.info(
                "Starting TRELLIS generation",
                version=resolved_version,
                image_path=str(image_path),
                output_dir=str(output_dir),
                python=str(runtime["python_path"]),
            )

            output_glb = output_dir / "sample.glb"
            template = self._jinja_env.get_template(runtime["template"])
            script_content = template.render(
                **self._template_vars(
                    resolved_version,
                    image_path,
                    output_dir,
                    output_glb,
                    seed,
                )
            )

            with tempfile.TemporaryDirectory(prefix="trellis-run-") as temp_dir:
                script_path = Path(temp_dir) / "run_trellis.py"
                script_path.write_text(script_content, encoding="utf-8")
                process_env = self._build_subprocess_env(runtime["python_path"])

                process = await asyncio.create_subprocess_exec(
                    str(runtime["python_path"]),
                    str(script_path),
                    cwd=str(runtime["trellis_path"]),
                    env=process_env,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await process.communicate()

            if process.returncode != 0:
                raise RuntimeError(
                    f"TRELLIS v{resolved_version} generation failed:\n"
                    f"STDOUT:\n{stdout.decode(errors='replace')}\n"
                    f"STDERR:\n{stderr.decode(errors='replace')}"
                )

            if output_glb.exists():
                logger.info(
                    "TRELLIS generation finished",
                    version=resolved_version,
                    output_glb=str(output_glb),
                )
                return output_glb

            raise RuntimeError("GLB file not generated")

    async def _resolve_runtime(self, version: Literal[1, 2]) -> dict:
        cfg = _VERSIONS[version]
        cached_runtime = self._validated_runtimes.get(version)
        preferred_env_python = _MINICONDA_ROOT / "envs" / cfg["env_name"] / "bin" / "python"

        if cached_runtime:
            cached_python = Path(cached_runtime["python_path"])
            should_revalidate = (
                version == 1
                and cached_python == _MINICONDA_ROOT / "bin" / "python"
                and preferred_env_python.exists()
            )
            if cached_python.exists() and not should_revalidate:
                return cached_runtime

        candidates = [
            preferred_env_python,
        ]
        if cfg["fallback_to_base"]:
            candidates.append(_MINICONDA_ROOT / "bin" / "python")

        for python_path in candidates:
            if not python_path.exists():
                continue
            if await self._validate_runtime(python_path, cfg["trellis_path"], cfg["import_name"]):
                runtime = {
                    "python_path": python_path,
                    "trellis_path": cfg["trellis_path"],
                    "template": cfg["template"],
                    "ckpt_path": cfg["ckpt_path"],
                }
                self._validated_runtimes[version] = runtime
                return runtime

        env_name = cfg["env_name"]
        if version == 1:
            raise RuntimeError(
                "TRELLIS v1 runtime unavailable. Install the `trellis` conda environment "
                "or ensure the base environment contains the TRELLIS v1 dependencies."
            )

        raise RuntimeError(
            f"TRELLIS v{version} runtime unavailable. Install or repair the `{env_name}` conda environment."
        )

    async def _validate_runtime(
        self,
        python_path: Path,
        trellis_path: Path,
        import_name: str,
    ) -> bool:
        validation_script = (
            "import importlib.util; "
            f"spec = importlib.util.find_spec('{import_name}'); "
            "assert spec is not None, 'missing trellis package'; "
            "import torch"
        )

        process = await asyncio.create_subprocess_exec(
            str(python_path),
            "-c",
            validation_script,
            cwd=str(trellis_path),
            env=self._build_subprocess_env(python_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await process.communicate()

        if process.returncode == 0:
            return True

        logger.warning(
            "Skipping invalid TRELLIS runtime",
            python=str(python_path),
            trellis_path=str(trellis_path),
            import_name=import_name,
            stderr=stderr.decode(errors="replace"),
        )
        return False

    def _build_subprocess_env(self, python_path: Path) -> dict[str, str]:
        env = os.environ.copy()
        env_bin = str(python_path.parent)
        existing_path = env.get("PATH", "")
        env["PATH"] = (
            f"{env_bin}:{existing_path}"
            if existing_path
            else env_bin
        )

        conda_prefix = str(python_path.parent.parent)
        env["CONDA_PREFIX"] = conda_prefix
        env["CONDA_DEFAULT_ENV"] = Path(conda_prefix).name
        return env

    def _template_vars(
        self,
        version: Literal[1, 2],
        image_path: Path,
        output_dir: Path,
        output_glb: Path,
        seed: int | None,
    ) -> dict:
        ckpt_path = _VERSIONS[version]["ckpt_path"]

        if version == 1:
            return {
                "ckpt_path": ckpt_path,
                "image_path": image_path,
                "output_video_gs": output_dir / "sample_gs.mp4",
                "output_video_rf": output_dir / "sample_rf.mp4",
                "output_video_mesh": output_dir / "sample_mesh.mp4",
                "output_glb": output_glb,
                "output_ply": output_dir / "sample.ply",
                "seed": 1 if seed is None else seed,
            }

        return {
            "ckpt_path": ckpt_path,
            "image_path": image_path,
            "output_video": output_dir / "sample.mp4",
            "output_glb": output_glb,
            "seed": seed,
        }
