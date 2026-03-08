#!/bin/bash

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

# 5. Activate new environment and install pre-built flash-attn
conda activate trellis2
pip install https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.0.8/flash_attn-2.7.4.post1%2Bcu124torch2.6-cp310-cp310-linux_x86_64.whl

# 6. Install extra dependencies
pip install python-dotenv structlog pydantic-ai hydra-core huggingface_hub

# 7. Login using Hugging Face
python -c "from huggingface_hub import login; login()"

echo ""
echo "Environment setup complete!"
echo "Please restart your terminal or run: source ~/.bashrc"
echo ""