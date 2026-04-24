
<img width="1024" height="256" alt="flat_logo" src="https://github.com/user-attachments/assets/f1b3b729-601b-463e-811a-aba7be392477" />

<img width="992" height="980" alt="Screenshot from 2025-11-27 21-33-43" src="https://github.com/user-attachments/assets/e9449160-9e60-428c-8ca5-1f5a89c5683c" />

# Imagin3D

Imagin3D is a moodboard platform that enables users to generate 3D models from visual inspiration. Users compose moodboards and the system uses generative AI to produce corresponding 3D assets.

## Installation

**Clone the repository**<br>
```sh
git clone https://github.com/tdspriet/imagin3d.git
cd imagin3d
git submodule update --init --recursive
```

### Frontend

The local frontend uses React and Vite.

1. **Navigate to the frontend**<br>
```bash
  cd frontend
```

2. **Set the environment variables** <br>
Create a `.env` file in the `frontend` directory with the following content:<br>
```sh
  VITE_BACKEND_URL=http://localhost:8001 # must match BACKEND_PORT in backend/.env
  VITE_PORT=3001
```

3. **Install dependencies**<br>
```bash
  npm install
```

4. **Run the Frontend**<br>
```bash
  npm run dev
```

### Backend 

The Coder backend uses FastAPI and Uvicorn.

1. **Navigate to the backend**<br>
```bash
  cd backend
```

2. **Set the environment variables** <br>
Create a `.env` file in the `backend` directory with the following content:<br>
```sh
  BACKEND_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
  BACKEND_PORT=8001 # must match VITE_BACKEND_URL in frontend/.env
  HF_HOME="/workspaces/imagin3d/hf_cache"
  HF_TOKEN="hf_..."
  GOOGLE_API_KEY="..."
  BEDROCK_ACCESS_KEY_ID="..."
  BEDROCK_SECRET_ACCESS_KEY="..."
```
Don't forgot the fill in ``...`` with the actual values.

3. **Run the setup script** <br>
```bash
  bash setup/setup2.sh # or "bash setup/setup1.sh" for TrellisV1
```
> **Note:** When running the TrellisV2 setup script, you will be asked to log into your Hugging Face account. You must have requested and received access to the required gated repositories on this account.

4. **Run the Backend** <br>
```sh
  source /workspaces/miniconda3/etc/profile.d/conda.sh
  conda activate trellis2 # or "conda activate trellis" for TrellisV1
  python run.py
```

## A/B Pipeline

The A/B pipeline runs both the Imagin3D system and a text-only baseline on the same moodboard, scores each generated 3D model with CLIP metrics, and writes results for the `/AB` viewer.

### Prerequisites

Install the CLIP evaluation dependency in the backend conda environment:
```sh
conda activate trellis2
pip install open-clip-torch
```

### 1 — Save a moodboard as a dataset

In the frontend, open a moodboard and click **Save** → fill in a dataset name and prompt, then click **Save to dataset**. This writes `pipeline/datasets/<name>/moodboard.json`.

### 2 — Run the pipeline

From the repo root with the `trellis2` conda environment active:

```sh
# Run a single dataset
python -m pipeline.run_ab --dataset <name>

# Run all datasets sequentially
python -m pipeline.run_ab --all

# Run one arm only
python -m pipeline.run_ab --dataset <name> --skip-baseline    # Imagin3D only
python -m pipeline.run_ab --dataset <name> --skip-imagin3d    # baseline only
```

Results are written to `pipeline/runs/<timestamp>_<name>/`:
- `imagin3d/sample.glb` and `baseline/sample.glb` — the generated 3D models
- `imagin3d/scores.json` and `baseline/scores.json` — CLIP preservation + closeness metrics
- `manifest.json` — consumed by the `/AB` viewer

### 3 — Review in the browser

Start the backend and open the frontend at the `/AB` route. Participants see a randomised A/B pair and vote for their preferred model.

---

## Architecture

<img width="1882" height="1602" alt="architecture_mixed" src="https://github.com/user-attachments/assets/d1543e60-91f4-46e5-857b-d74b78492cd6" />

## Project Structure

## Examples

## Output

## Testing

## Future work
