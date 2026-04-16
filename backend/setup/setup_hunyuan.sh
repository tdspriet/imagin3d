#!/bin/bash

# Setup Hunyuan3D-2 Conda environment running in fp16/bf16 precision for RTX 4090 (24GB VRAM)
# DO NOT EXECUTE DIRECTLY YET - ONLY RUN WHEN READY TO USE HUNYUAN ENVIRONMENT ON THE RIGHT HARDWARE

ENVIRONMENT_NAME="hunyuan"

if ! command -v conda &> /dev/null
then
    echo "conda could not be found. Please install miniconda or anaconda."
    exit 1
fi

echo "Creating conda environment: $ENVIRONMENT_NAME"
conda create -n $ENVIRONMENT_NAME python=3.10 -y
source $(conda info --base)/etc/profile.d/conda.sh
conda activate $ENVIRONMENT_NAME

# Install dependencies based on Hunyuan3D-2's requirements
cd ../../hunyuan3d
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
pip install git+https://github.com/Tencent/Hunyuan3D-2.git

# Apply any patches
cd ../backend/setup
python patch_hunyuan.py

echo "Hunyuan3D-2 environment setup complete!"
echo "To use, run: conda activate $ENVIRONMENT_NAME"
