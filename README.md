
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

1. **Prerequisites** <br>
Make sure you have [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/get-npm) installed.

2. **Navigate to the frontend directory** <br>
```bash
cd frontend
```

3. **Install dependencies**<br>
``
npm install
``

4. **Run the Frontend**<br>
``
npm run dev
``

### Backend 

The Coder backend uses FastAPI and Uvicorn.

1. **Navigate to the backend directory** <br>
```bash
cd backend
```

2. **Create the dedicated backend environment** <br>
```bash
  bash setup/setup_backend.sh
```
This creates the `imagin3d-backend` conda environment with the dependencies needed to run the FastAPI backend only.

3. **Install the TRELLIS runtime(s) you want to generate with** <br>
```bash
  bash setup/setup2.sh
```
This creates the `trellis2` environment used for Trellis V2 generation.

If you also want Trellis V1 available in the UI, install that runtime too:
```bash
  bash setup/setup1.sh
```
This creates the `trellis` environment used for Trellis V1 generation.

> **Note:** When running the Trellis V2 setup script, you will be asked to log into your Hugging Face account. You must have requested and received access to the required gated repositories on this account.

4. **Set the environment variables** <br>
Create a `.env` file in the `backend` directory with the following content:<br>
```sh
  BACKEND_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
  GOOGLE_API_KEY="..."
  BEDROCK_ACCESS_KEY_ID="..."
  BEDROCK_SECRET_ACCESS_KEY="..."
```

5. **Run the Backend** <br>
```sh
  source /workspaces/miniconda3/etc/profile.d/conda.sh
  conda activate imagin3d-backend
  python run.py
```

The backend now runs from its own environment and launches generation jobs in the appropriate TRELLIS runtime automatically:

- `Trellis V2` requests use the `trellis2` environment.
- `Trellis V1` requests prefer the `trellis` environment.
- Comparative mode can mix versions, for example `left = Trellis V1` and `right = Trellis V2`, without restarting the backend.

## Architecture

<img width="1882" height="1602" alt="architecture_mixed" src="https://github.com/user-attachments/assets/d1543e60-91f4-46e5-857b-d74b78492cd6" />

## Project Structure

## Examples

## Output

## Testing

## Future work
