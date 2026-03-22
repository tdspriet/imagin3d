#!/bin/bash
set -e

# 0. Define script and repository paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}/backend"

# 1. Install Miniconda
mkdir -p /workspaces/miniconda3
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O /workspaces/miniconda3/miniconda.sh
bash /workspaces/miniconda3/miniconda.sh -b -u -p /workspaces/miniconda3
rm /workspaces/miniconda3/miniconda.sh
source /workspaces/miniconda3/bin/activate
conda init --all

# 2. Create the environment
conda env create -f setup/environment.yml
source /workspaces/miniconda3/etc/profile.d/conda.sh
conda activate trellis

# 3. Install torch
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124

# 4. Install flash-attn
pip install https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.0.8/flash_attn-2.7.4.post1%2Bcu124torch2.6-cp310-cp310-linux_x86_64.whl

# 5. Install kaolin
pip install kaolin==0.18.0 -f https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.6.0_cu124.html

# 6. Install utils3d
pip install git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8

# 7. Install nvdiffrast
pip install git+https://github.com/NVlabs/nvdiffrast.git@729261dc64c4241ea36efda84fbf532cc8b425b8

# 8. Install gaussian rasterizion
pip install "git+https://github.com/autonomousvision/mip-splatting.git#subdirectory=submodules/diff-gaussian-rasterization"  --no-build-isolation

# 9. Install Simple KNN
pip install git+https://github.com/camenduru/simple-knn.git --no-build-isolation

# 10. Download models
git clone https://huggingface.co/microsoft/TRELLIS-image-large
mv TRELLIS-image-large/ckpts .
rm -rf TRELLIS-image-large

echo ""
echo "Environment setup complete!"
echo ""