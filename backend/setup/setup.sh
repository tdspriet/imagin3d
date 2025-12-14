#!/bin/bash

# 1. Install Miniconda
mkdir -p ~/miniconda3
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O ~/miniconda3/miniconda.sh
bash ~/miniconda3/miniconda.sh -b -u -p ~/miniconda3
rm ~/miniconda3/miniconda.sh
source ~/miniconda3/bin/activate
conda init --all

# 2. Create the environment
conda env create -f setup/environment.yml
source ~/miniconda3/etc/profile.d/conda.sh
conda activate trellis

# 2. Install torch
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124

# 3. Install flash-attn
pip install https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.0.8/flash_attn-2.7.4.post1%2Bcu124torch2.6-cp310-cp310-linux_x86_64.whl

# 4. Install kaolin
pip install kaolin==0.18.0 -f https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.6.0_cu124.html

# 5. Install utils3d
pip install git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8

# 6. Install nvdiffrast
pip install git+https://github.com/NVlabs/nvdiffrast.git@729261dc64c4241ea36efda84fbf532cc8b425b8

# 7. Install gaussian rasterizion
pip install "git+https://github.com/autonomousvision/mip-splatting.git#subdirectory=submodules/diff-gaussian-rasterization"  --no-build-isolation

# 8. Install Simple KNN
pip install git+https://github.com/camenduru/simple-knn.git --no-build-isolation

# 9. Download models
git clone https://huggingface.co/microsoft/TRELLIS-image-large
mv TRELLIS-image-large/ckpts .
rm -rf TRELLIS-image-large

# 10. Perist pythonpath
if ! grep -q "PYTHONPATH=/workspaces/imagin3d" ~/.zshrc; then
    echo 'export PYTHONPATH=/workspaces/imagin3d:$PYTHONPATH' >> ~/.zshrc
fi

echo ""
echo "Environment setup complete"
echo "(make sure your GitHub Token is set in Coder!)"
echo ""
echo "Next steps:"
echo "  1. Restart your terminal"
echo "  2. Run the backend"