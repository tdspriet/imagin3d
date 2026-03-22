#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONDA_ROOT="/workspaces/miniconda3"
ENV_NAME="imagin3d-backend"

if [ ! -f "${CONDA_ROOT}/etc/profile.d/conda.sh" ]; then
  mkdir -p "${CONDA_ROOT}"
  wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O "${CONDA_ROOT}/miniconda.sh"
  bash "${CONDA_ROOT}/miniconda.sh" -b -u -p "${CONDA_ROOT}"
  rm -f "${CONDA_ROOT}/miniconda.sh"
fi

source "${CONDA_ROOT}/etc/profile.d/conda.sh"

if conda env list | awk '{print $1}' | grep -qx "${ENV_NAME}"; then
  conda install -n "${ENV_NAME}" --override-channels -c conda-forge --solver libmamba -y \
    python=3.10 pip numpy pillow imageio
else
  conda create -n "${ENV_NAME}" --override-channels -c conda-forge --solver libmamba -y \
    python=3.10 pip numpy pillow imageio
fi

conda run -n "${ENV_NAME}" python -m pip install --upgrade \
  boto3 \
  fastapi \
  genai-prices \
  google-genai \
  hydra-core \
  jinja2 \
  opencv-python-headless \
  'pydantic-ai-slim[google,bedrock]' \
  python-dotenv \
  structlog \
  uvicorn

echo ""
echo "Backend environment is ready."
echo ""
echo "Start the backend with:"
echo "  source ${CONDA_ROOT}/etc/profile.d/conda.sh"
echo "  conda activate ${ENV_NAME}"
echo "  cd /workspaces/imagin3d/backend"
echo "  python run.py"
echo ""
