
<img width="1024" height="256" alt="flat_logo" src="https://github.com/user-attachments/assets/f1b3b729-601b-463e-811a-aba7be392477" />

<img width="992" height="980" alt="Screenshot from 2025-11-27 21-33-43" src="https://github.com/user-attachments/assets/e9449160-9e60-428c-8ca5-1f5a89c5683c" />

# Imagin3D

Imagin3D is a moodboard platform that enables users to generate 3D models from visual inspiration. Users compose moodboards and the system uses generative AI to produce corresponding 3D assets.

## Installation

**Clone the repository**<br>
``
git clone https://github.com/tdspriet/imagin3d.git
git submodule update --init --recursive
``

### Frontend

The frontend uses React and Vite.

1. **Prerequisites** <br>
Make sure you have [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/get-npm) installed.

2. **Install dependencies**<br>
``
npm install
``

3. **Run the Frontend**<br>
``
npm run dev
``

### Backend 

The backend uses FastAPI and Uvicorn.

**Local**

1. **Run the setup script** <br>
``
  bash setup/setup.sh
``

2. **Set the environment variables** <br>
Create a `.env` file in the `backend` directory with the following content:<br>
```bash
  BACKEND_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
  GOOGLE_API_KEY="..."
  BEDROCK_ACCESS_KEY_ID="..."
  BEDROCK_SECRET_ACCESS_KEY="..."
```

3. **Run the Backend** <br>
``
python run.py
``

## Architecture Vision

## Project Structure

## Examples

## Output

## Testing

## Future work
