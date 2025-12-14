from __future__ import annotations

import os
import sys
import subprocess
from pathlib import Path
import structlog
import imageio
from PIL import Image

logger = structlog.stdlib.get_logger(__name__)

class TrellisEngine:

    def __init__(self):
        # Check if TRELLIS environment is activated
        self._is_initialized = False
        self.trellis_path = Path("/workspaces/imagin3d/trellis")
    
    def _ensure_conda_initialized(self):
        # Conda setup for subprocess calls
        self.conda_path = os.path.expanduser("~/miniconda3/etc/profile.d/conda.sh")
        if not Path(self.conda_path).exists():
            # Alternative location for conda
            self.conda_path = os.path.expanduser("~/anaconda3/etc/profile.d/conda.sh")
            if not Path(self.conda_path).exists():
                raise RuntimeError("Conda installation not found. Please install Conda.")
    
    def initialize(self):
        if self._is_initialized:
            return
        
        self._ensure_conda_initialized()
        
        # Check if we're already in the trellis environment
        current_env = os.environ.get('CONDA_DEFAULT_ENV')
        if current_env == 'trellis':
            self._is_initialized = True
            return
            
        # Otherwise check if trellis conda environment exists
        result = subprocess.run(
            f"source {self.conda_path} && conda env list | grep trellis",
            shell=True,
            capture_output=True,
            text=True
        )
        
        if "trellis" not in result.stdout:
            raise RuntimeError("TRELLIS conda environment not found. Please create it by running `. ./trellis/setup.sh --new-env --basic --xformers --flash-attn --diffoctreerast --spconv --mipgaussian --kaolin --nvdiffrast`")
        
        self._is_initialized = True
    
    async def generate_3d_model(self, image_path: Path, output_dir: Path) -> Path:
        self.initialize()
        
        # Ensure the output directory exists
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Prepare the paths
        output_video_gs = output_dir / "sample_gs.mp4"
        output_video_rf = output_dir / "sample_rf.mp4"
        output_video_mesh = output_dir / "sample_mesh.mp4"
        output_glb = output_dir / "sample.glb"
        output_ply = output_dir / "sample.ply"
        
        # Create a simple Python script for TRELLIS
        script_path = output_dir / "run_trellis.py"
        script_content = f"""
import os
os.environ['SPCONV_ALGO'] = 'native'

import imageio
from PIL import Image
from trellis.pipelines import TrellisImageTo3DPipeline
from trellis.utils import render_utils, postprocessing_utils

# Load the pipeline
pipeline = TrellisImageTo3DPipeline.from_pretrained("microsoft/TRELLIS-image-large")
pipeline.cuda()

# Load an image
image = Image.open("{image_path}")

# Run the pipeline
outputs = pipeline.run(
    image,
    seed=1,
    sparse_structure_sampler_params={{
        "steps": 12,
        "cfg_strength": 7.5,
    }},
    slat_sampler_params={{
        "steps": 12,
        "cfg_strength": 3,
    }},
)

# Render the outputs
video = render_utils.render_video(outputs['gaussian'][0])['color']
imageio.mimsave("{output_video_gs}", video, fps=30)

video = render_utils.render_video(outputs['radiance_field'][0])['color']
imageio.mimsave("{output_video_rf}", video, fps=30)

video = render_utils.render_video(outputs['mesh'][0])['normal']
imageio.mimsave("{output_video_mesh}", video, fps=30)

# GLB files can be extracted from the outputs
glb = postprocessing_utils.to_glb(
    outputs['gaussian'][0],
    outputs['mesh'][0],
    simplify=0.95,
    texture_size=1024,
)
glb.export("{output_glb}")

# Save Gaussians as PLY files
outputs['gaussian'][0].save_ply("{output_ply}")

print("All files generated successfully")
"""
        
        with open(script_path, "w") as f:
            f.write(script_content)
        
        # Run the script either in the current environment or activate trellis
        current_env = os.environ.get('CONDA_DEFAULT_ENV')
        if current_env == 'trellis':
            # We're already in the trellis environment
            cmd = f"cd {self.trellis_path} && python {script_path}"
        else:
            # Need to activate the trellis environment first
            cmd = f"source {self.conda_path} && conda activate trellis && cd {self.trellis_path} && python {script_path}"
        
        process = subprocess.Popen(
            cmd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        stdout, stderr = process.communicate()
        
        if process.returncode != 0:
            logger.error("TRELLIS generation failed", stderr=stderr)
            raise RuntimeError(f"TRELLIS generation failed: {stderr}")
        
        # Return the GLB file path as the main output
        if output_glb.exists():
            return output_glb
        else:
            raise RuntimeError("GLB file not generated")