from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
import structlog
import jinja2

logger = structlog.stdlib.get_logger(__name__)

class TrellisEngine:

    def __init__(self, trellis_path: Path | None = None):
        # Setup TRELLIS path
        self.trellis_path = Path("/workspaces/imagin3d/trellis")

        # Setup Jinja2 environment
        template_dir = Path(__file__).parent / "templates"
        self._jinja_env = jinja2.Environment(
            loader=jinja2.FileSystemLoader(str(template_dir))
        )
    
    async def generate_3d_model(self, image_path: Path, output_dir: Path) -> Path:
        # Ensure the output directory exists
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Prepare the paths
        output_video_gs = output_dir / "sample_gs.mp4"
        output_video_rf = output_dir / "sample_rf.mp4"
        output_video_mesh = output_dir / "sample_mesh.mp4"
        output_glb = output_dir / "sample.glb"
        output_ply = output_dir / "sample.ply"
        
        # Generate the script content using the template
        template = self._jinja_env.get_template("trellis.j2")
        script_content = template.render(
            image_path=image_path,
            output_video_gs=output_video_gs,
            output_video_rf=output_video_rf,
            output_video_mesh=output_video_mesh,
            output_glb=output_glb,
            output_ply=output_ply
        )
        
        # Create a temporary Python script for TRELLIS
        temp_dir = Path(tempfile.mkdtemp())
        script_path = temp_dir / "run_trellis.py"
        with open(script_path, "w") as f:
            f.write(script_content)
        
        # Make the command
        cmd = f"cd {self.trellis_path} && python {script_path}"
        
        process = subprocess.Popen(
            cmd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        _, stderr = process.communicate()
        
        if process.returncode != 0:
            raise RuntimeError(f"TRELLIS generation failed: {stderr}")
        
        # Return the GLB file path as the main output
        if output_glb.exists():
            return output_glb
        else:
            raise RuntimeError("GLB file not generated")
