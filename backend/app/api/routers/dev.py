"""Developer endpoints for manual triggers, seeding, and penalty logs."""
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from app.db.mongo import db
from app.core.config import settings
from app.core.security import current_user, parent_pin
from app.services.penalties import apply_daily_penalties
from app.db.seed import seed_demo

log = logging.getLogger("tribuquest.dev")
router = APIRouter(tags=["dev"])


@router.get("/penalties")
async def list_penalties(user=Depends(current_user)):
    logs = await db.penalties.find(
        {"family_id": user["family_id"]},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(100)
    return {"penalties": logs}


@router.post("/dev/run-penalties")
async def dev_run_penalties(user=Depends(parent_pin)):
    """Manual trigger — parent + PIN only, scoped to the caller's own family."""
    await apply_daily_penalties(only_family_id=user["family_id"])
    return {"ok": True}


@router.post("/dev/seed-demo")
async def seed_demo_route(request: Request):
    """Seed demo French family — requires X-Admin-Key == JWT_SECRET."""
    if request.headers.get("X-Admin-Key") != settings.JWT_SECRET:
        raise HTTPException(403, "Interdit")
    return await seed_demo()
