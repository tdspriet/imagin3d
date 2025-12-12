#!/bin/bash

# Check if conda is installed
if [ ! -f "$HOME/miniconda3/etc/profile.d/conda.sh" ] && [ ! -f "$HOME/anaconda3/etc/profile.d/conda.sh" ]; then
    echo "Conda not found. Please install Conda."
    exit 1
fi

# Source conda
if [ -f "$HOME/miniconda3/etc/profile.d/conda.sh" ]; then
    . "$HOME/miniconda3/etc/profile.d/conda.sh"
else
    . "$HOME/anaconda3/etc/profile.d/conda.sh"
fi

# Check if trellis environment exists
if ! conda env list | grep -q "trellis"; then
    echo "TRELLIS environment not found. Please create it by running the setup script."
    echo "cd trellis && . ./setup.sh --new-env --basic --xformers --flash-attn --diffoctreerast --spconv --mipgaussian --kaolin --nvdiffrast"
    exit 1
fi

# Activate trellis environment
conda activate trellis

# Install Python dependencies 
echo "Installing backend dependencies..."
cd /workspaces/imagin3d
pip install -r backend/requirements.txt

# Make the current directory available in Python path
export PYTHONPATH=/workspaces/imagin3d:$PYTHONPATH

# Run the backend
cd /workspaces/imagin3d/backend
python -m uvicorn app:app --reload --host 0.0.0.0 --port 8000