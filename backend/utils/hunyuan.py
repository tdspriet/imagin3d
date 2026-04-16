from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path

import structlog
import jinja2

logger = structlog.stdlib.get_logger(__name__)

class HunyuanEngine:
    def __init__(self):
        self.hunyuan_path = Path(os.getcwd()) / "hunyuan3d"
        self.ckpt_path = "Tencent/Hunyuan3D-2"
        
        template_dir = Path(__file__).parent / "templates"
        self._jinja_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(template_dir))
        )

    async def generate_multiview(self, master_image_path: Path, output_dir: Path, prompt: str) -> list[Path]:
        """
        Generate a 6-view grid from a single master image and prompt,
        then slice it and return the separate multi-view image paths.
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        grid_image_path = output_dir / "grid.png"

        template_vars = {
            "ckpt_path": self.ckpt_path,
            "image_path": str(master_image_path),
            "output_grid": str(grid_image_path),
            "prompt": prompt,
        }

        template = self._jinja_env.get_template("hunyuan_mv.j2")
        script_content = template.render(**template_vars)

        temp_dir = Path(tempfile.mkdtemp())
        script_path = temp_dir / "run_hunyuan_mv.py"
        with open(script_path, "w") as f:
            f.write(script_content)

        cmd = f"cd {self.hunyuan_path} && python {script_path}"
        process = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await process.communicate()

        if process.returncode != 0:
            raise RuntimeError(
                f"Hunyuan MVD generation failed: {stderr.decode()}"
            )

        if not grid_image_path.exists():
            raise RuntimeError("Hunyuan multi-view grid not generated.")

        # Slice the 2x3 grid into 6 separate images and save them
        return self._slice_grid(grid_image_path, output_dir)

    def _slice_grid(self, grid_path: Path, output_dir: Path) -> list[Path]:
        from PIL import Image
        grid_img = Image.open(grid_path)
        w, h = grid_img.size
        # Assuming typical 2x3 grid for 6 canonical views
        col_w = w // 3
        row_h = h // 2
        
        view_paths = []
        for row in range(2):
            for col in range(3):
                idx = row * 3 + col
                left = col * col_w
                upper = row * row_h
                right = left + col_w
                lower = upper + row_h
                
                cropped = grid_img.crop((left, upper, right, lower))
                view_path = output_dir / f"view_{idx}.png"
                cropped.save(view_path)
                view_paths.append(view_path)
                
        return view_paths

    async def generate_3d_model(self, multiview_paths: list[Path], output_dir: Path) -> Path:
        """
        Takes 6 synchronized views and feeds them to the LRM for 3D reconstruction.
        Reconstructs the grid or points to individual files depending on the j2 script structure.
        """
        output_dir.mkdir(parents=True, exist_ok=True)
        output_glb = output_dir / "sample.glb"

        template_vars = {
            "ckpt_path": self.ckpt_path,
            "image_paths": [str(p) for p in multiview_paths],
            "output_glb": str(output_glb),
        }

        template = self._jinja_env.get_template("hunyuan_3d.j2")
        script_content = template.render(**template_vars)

        temp_dir = Path(tempfile.mkdtemp())
        script_path = temp_dir / "run_hunyuan_3d.py"
        with open(script_path, "w") as f:
            f.write(script_content)

        cmd = f"cd {self.hunyuan_path} && python {script_path}"
        process = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await process.communicate()

        if process.returncode != 0:
            raise RuntimeError(
                f"Hunyuan 3D LRM generation failed: {stderr.decode()}"
            )

        if output_glb.exists():
            return output_glb
        raise RuntimeError("GLB file not generated")
