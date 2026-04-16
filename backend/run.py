import os
import sys
from pathlib import Path

from dotenv import find_dotenv, load_dotenv
import uvicorn

sys.path.insert(0, str(Path(__file__).parent.parent))

ROOT_DIR = Path(__file__).parent.resolve()

for env_path in (
    find_dotenv(usecwd=True),
    Path.cwd() / "backend" / ".env",
    ROOT_DIR / ".env",
):
    if env_path and Path(env_path).exists():
        load_dotenv(env_path)
        break

if __name__ == "__main__":
    port = int(os.getenv("BACKEND_PORT") or os.getenv("PORT") or "8000")
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
