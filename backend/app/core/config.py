"""TribuQuest - Core Application Settings & Configuration."""
import os
from pathlib import Path
from pydantic import BaseModel
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(ROOT / ".env")


class Settings(BaseModel):
    APP_NAME: str = "TribuQuest"
    ENV: str = os.getenv("ENV", "development")
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"
    
    # MongoDB
    MONGO_URL: str = os.getenv("MONGO_URL", "mongodb://localhost:27017")
    DB_NAME: str = os.getenv("DB_NAME", "tribuquest_db")
    USE_MOCK_DB: bool = os.getenv("USE_MOCK_DB", "false").lower() == "true"
    
    # Security
    JWT_SECRET: str = os.getenv(
        "JWT_SECRET", 
        "a1c9d3b7f2e8a4c6b1d5e9f2a3c7b4d8e6f1a2c3b4d5e6f7a8b9c0d1e2f3a4b5"
    )
    ALGO: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 jours
    PARENT_PIN_EXPIRE_MINUTES: int = 15  # 15 minutes
    
    # Storage (local dev fallback vs Firebase Storage)
    STORAGE_BACKEND: str = os.getenv("STORAGE_BACKEND", "local")  # 'local' | 'firebase' | 'emergent'
    LOCAL_STORAGE_DIR: str = str(ROOT / "uploads")
    FIREBASE_PROJECT_ID: str = os.getenv("FIREBASE_PROJECT_ID", "taches-en-famille")
    FIREBASE_STORAGE_BUCKET: str = os.getenv("FIREBASE_STORAGE_BUCKET", "taches-en-famille.appspot.com")
    
    # Push Notifications
    EXPO_PUSH_URL: str = "https://exp.host/--/api/v2/push/send"
    
    # Legacy Emergent Keys (optional fallback)
    EMERGENT_LLM_KEY: str = os.getenv("EMERGENT_LLM_KEY", "")
    INTEGRATION_PROXY_URL: str = os.getenv("INTEGRATION_PROXY_URL", "https://integrations.emergentagent.com")


settings = Settings()
