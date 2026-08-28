"""TribuQuest - Server entrypoint (backward-compatible bridge to modular app)."""
import uvicorn
from app.main import app, api
from app.db.mongo import db
from app.core.config import settings

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)