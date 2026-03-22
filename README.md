
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
  HF_HOME="/workspace/imagin3d/hf_cache"
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

## Architecture

<img width="1882" height="1602" alt="architecture_mixed" src="https://github.com/user-attachments/assets/d1543e60-91f4-46e5-857b-d74b78492cd6" />

## Project Structure

## Examples

## Output

## Testing

## Future work
