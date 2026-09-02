"""TribuQuest - FastAPI Application Entry Point."""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.mongo import db
from app.db.seed import seed_demo
from app.scheduler.cron import init_scheduler, shutdown_scheduler

# Import all modular routers
from app.api.routers.auth import router as auth_router
from app.api.routers.tasks import router as tasks_router
from app.api.routers.completions import router as completions_router
from app.api.routers.rewards import router as rewards_router
from app.api.routers.challenges import router as challenges_router
from app.api.routers.family import router as family_router
from app.api.routers.events import router as events_router
from app.api.routers.shopping import router as shopping_router
from app.api.routers.pauses import router as pauses_router
from app.api.routers.photos import router as photos_router
from app.api.routers.menu import router as menu_router
from app.api.routers.dev import router as dev_router

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("tribuquest.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create indexes & auto-seed
    log.info("Starting up TribuQuest backend...")
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("family_id")
        await db.tasks.create_index("family_id")
        await db.completions.create_index([("task_id", 1), ("user_id", 1), ("day", 1)])
        await db.shared_claims.create_index([("task_id", 1), ("day", 1)])
        await db.shared_claims.create_index("family_id")
        await db.menu.create_index("family_id")
        await db.scheduled_runs.create_index("id", unique=True)
        await db.pauses.create_index("family_id")
    except Exception as e:
        log.warning(f"Index creation warning: {e}")

    try:
        await seed_demo()
    except Exception as e:
        log.warning(f"Auto-seed warning: {e}")

    init_scheduler()
    yield

    # Shutdown
    log.info("Shutting down TribuQuest backend...")
    shutdown_scheduler()


app = FastAPI(
    title="TribuQuest API",
    description="API de gamification des corvées et de l'organisation familiale",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Router Prefix
api = APIRouter(prefix="/api")


@api.get("")
@api.get("/")
async def root():
    return {"app": "TribuQuest", "ok": True, "status": "running"}


# Include all sub-routers
api.include_router(auth_router)
api.include_router(tasks_router)
api.include_router(completions_router)
api.include_router(rewards_router)
api.include_router(challenges_router)
api.include_router(family_router)
api.include_router(events_router)
api.include_router(shopping_router)
api.include_router(pauses_router)
api.include_router(photos_router)
api.include_router(menu_router)
api.include_router(dev_router)

app.include_router(api)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
