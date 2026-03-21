#!/bin/bash
set -e

# 1. Fix system dependencies
sudo apt-get update
sudo apt-get install -y libjpeg-dev

# 2. Install Miniconda
mkdir -p /workspaces/miniconda3
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O /workspaces/miniconda3/miniconda.sh
bash /workspaces/miniconda3/miniconda.sh -b -u -p /workspaces/miniconda3
rm /workspaces/miniconda3/miniconda.sh

# 3. Setup Conda for the script and initialize it
source /workspaces/miniconda3/etc/profile.d/conda.sh
conda init bash

# 4. Run the TRELLIS.2 setup script
cd /workspaces/imagin3d/trellis2 
bash ./setup.sh --new-env --basic --nvdiffrast --nvdiffrec --cumesh --o-voxel --flexgemm

# 5. Activate new environment
source /workspaces/miniconda3/bin/activate trellis2

# 6. Install Flash Attention
pip install https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.0.8/flash_attn-2.7.4.post1%2Bcu124torch2.6-cp310-cp310-linux_x86_64.whl

# 7. Install extra dependencies and force correct Pillow version
pip install python-dotenv structlog pydantic-ai hydra-core huggingface_hub
pip install --upgrade transformers
pip uninstall -y pillow
pip install --no-cache-dir "pillow>=10.0.0" 

# 8. Login using Hugging Face
python -c "from huggingface_hub import login; login()"

# 9. Pre-download and dynamically patch models
python patch.py

echo ""
echo "Environment setup complete!"
echo "Please restart your terminal."
echo ""
