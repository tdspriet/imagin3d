#!/bin/bash

# 1. Create the base environment (Standard libraries)
echo "Creating Conda environment..."
conda env create -f environment.yml
source ~/miniconda3/etc/profile.d/conda.sh # Adjust path if needed
conda activate trellis

# 2. Install PyTorch 2.6 (Bleeding Edge)
echo "Installing PyTorch 2.6..."
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124

# 3. Install Flash Attention (Custom Wheel for Torch 2.6)
echo "Installing Flash Attention..."
pip install https://github.com/mjun0812/flash-attention-prebuild-wheels/releases/download/v0.0.8/flash_attn-2.7.4.post1%2Bcu124torch2.6-cp310-cp310-linux_x86_64.whl

# 4. Install Gaussian Rasterizer (Patched for GCC 13+/CUDA 12)
echo "Installing Gaussian Rasterization..."
git clone --recursive https://github.com/graphdeco-inria/diff-gaussian-rasterization.git
cd diff-gaussian-rasterization
# Apply the <cstdint> fix
sed -i '1i#include <cstdint>' cuda_rasterizer/rasterizer_impl.h
pip install . --no-build-isolation
cd ..
rm -rf diff-gaussian-rasterization

# 5. Install Simple KNN
echo "Installing Simple KNN..."
pip install git+https://github.com/camenduru/simple-knn.git --no-build-isolation

echo "Environment setup complete! Don't forget to 'conda activate trellis'"