"""TribuQuest - Async MongoDB Client Management."""
import os
import logging
from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

log = logging.getLogger("tribuquest.db")

class Database:
    client = None
    db = None

db_wrapper = Database()

def get_db():
    if db_wrapper.db is None:
        init_db()
    return db_wrapper.db

def init_db():
    if settings.USE_MOCK_DB or os.environ.get("USE_MOCK_DB", "false").lower() == "true":
        try:
            from mongomock_motor import AsyncMongoMockClient
            db_wrapper.client = AsyncMongoMockClient()
            db_wrapper.db = db_wrapper.client[settings.DB_NAME]
            log.info(f"Connected to in-memory Mock MongoDB database: {settings.DB_NAME}")
        except ImportError:
            log.warning("mongomock_motor not found, attempting standard AsyncIOMotorClient fallback.")
            db_wrapper.client = AsyncIOMotorClient(settings.MONGO_URL)
            db_wrapper.db = db_wrapper.client[settings.DB_NAME]
    else:
        db_wrapper.client = AsyncIOMotorClient(settings.MONGO_URL)
        db_wrapper.db = db_wrapper.client[settings.DB_NAME]
        log.info(f"Connected to MongoDB database: {settings.DB_NAME}")
    return db_wrapper.db

# Auto-initialize on module load
db = init_db()
