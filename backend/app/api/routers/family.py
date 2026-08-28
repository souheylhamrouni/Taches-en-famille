"""Family management, leaderboard, and push registration router."""
import logging
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from app.db.mongo import db
from app.core.security import current_user
from app.models.challenge import FamilyPatch

log = logging.getLogger("tribuquest.family")
router = APIRouter(tags=["family"])


class PushTokenRegister(BaseModel):
    user_id: str
    platform: str
    device_token: str


@router.get("/family")
async def get_family(user=Depends(current_user)):
    fam = await db.families.find_one({"id": user["family_id"]}, {"_id": 0})
    members = await db.users.find(
        {"family_id": user["family_id"]},
        {"_id": 0, "password_hash": 0, "pin_hash": 0}
    ).to_list(100)
    return {"family": fam, "members": members}


@router.get("/family/leaderboard")
async def leaderboard(user=Depends(current_user)):
    members = await db.users.find(
        {"family_id": user["family_id"]},
        {"_id": 0, "password_hash": 0, "pin_hash": 0}
    ).to_list(100)
    members.sort(key=lambda u: u.get("points", 0), reverse=True)
    return {"members": members}


@router.patch("/family")
async def update_family(body: FamilyPatch, user=Depends(current_user)):
    if user.get("role") != "parent":
        raise HTTPException(403, "Seul un parent peut renommer la famille")
    await db.families.update_one({"id": user["family_id"]}, {"$set": {"name": body.name.strip()}})
    return {"ok": True}


@router.post("/register-push", status_code=201)
async def register_push(body: PushTokenRegister, user=Depends(current_user)):
    # Derive the user from the auth token — never trust a caller-supplied user_id.
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"push_token": body.device_token, "platform": body.platform}}
    )
    return {"status": "ok"}
