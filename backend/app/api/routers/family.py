"""Family management, leaderboard, and push registration router."""
import logging
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from app.db.mongo import db
from app.core.security import current_user, parent_pin
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
        {"family_id": user["family_id"], "active": {"$ne": False}},
        {"_id": 0, "password_hash": 0, "pin_hash": 0}
    ).to_list(100)
    return {"family": fam, "members": members}


@router.get("/family/leaderboard")
async def leaderboard(user=Depends(current_user)):
    members = await db.users.find(
        {"family_id": user["family_id"], "active": {"$ne": False}},
        {"_id": 0, "password_hash": 0, "pin_hash": 0}
    ).to_list(100)
    members.sort(key=lambda u: u.get("points", 0), reverse=True)
    return {"members": members}


@router.patch("/family")
async def update_family(body: FamilyPatch, user=Depends(current_user)):
    if user.get("role") != "parent":
        raise HTTPException(403, "Seul un parent peut modifier la famille")
    updates = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.reminder_hour is not None:
        updates["reminder_hour"] = body.reminder_hour
    if body.reminder_minute is not None:
        updates["reminder_minute"] = body.reminder_minute
    if body.penalty_hour is not None:
        updates["penalty_hour"] = body.penalty_hour
    if body.penalty_minute is not None:
        updates["penalty_minute"] = body.penalty_minute
    if updates:
        await db.families.update_one({"id": user["family_id"]}, {"$set": updates})
    return {"ok": True}


@router.delete("/family/members/{member_id}")
async def remove_member(member_id: str, user=Depends(parent_pin)):
    """Soft-delete a member from the family (parent + PIN required)."""
    if user.get("role") != "parent":
        raise HTTPException(403, "Seul un parent peut retirer un membre")

    if member_id == user["id"]:
        raise HTTPException(400, "Vous ne pouvez pas vous retirer vous-même")

    target = await db.users.find_one({"id": member_id, "family_id": user["family_id"]})
    if not target:
        raise HTTPException(404, "Membre introuvable")
    if target.get("active") is False:
        raise HTTPException(400, "Ce membre est déjà désactivé")

    # If removing the last active parent, refuse
    if target.get("role") == "parent":
        active_parents = await db.users.count_documents({
            "family_id": user["family_id"],
            "role": "parent",
            "active": {"$ne": False},
        })
        if active_parents <= 1:
            raise HTTPException(400, "Impossible de retirer le dernier parent actif")

    await db.users.update_one(
        {"id": member_id},
        {"$set": {"active": False, "disabled_at": now_iso()}}
    )
    return {"ok": True, "removed_id": member_id}


@router.post("/register-push", status_code=201)
async def register_push(body: PushTokenRegister, user=Depends(current_user)):
    # Derive the user from the auth token — never trust a caller-supplied user_id.
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"push_token": body.device_token, "platform": body.platform}}
    )
    return {"status": "ok"}


def now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
