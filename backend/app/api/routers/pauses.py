"""Pauses and Holidays Management Router."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from app.db.mongo import db
from app.core.security import new_id, now, current_user, parent_pin
from app.models.challenge import PauseCreate

log = logging.getLogger("tribuquest.pauses")
router = APIRouter(prefix="/pauses", tags=["pauses"])


@router.get("")
async def list_pauses(user=Depends(current_user)):
    """List family pauses (vacation/holiday periods)."""
    pauses = await db.pauses.find(
        {"family_id": user["family_id"]},
        {"_id": 0}
    ).sort("start_date", 1).to_list(200)
    return {"pauses": pauses}


@router.post("")
async def create_pause(body: PauseCreate, user=Depends(parent_pin)):
    if not body.user_ids:
        raise HTTPException(400, "Sélectionne au moins un membre")
    if body.end_date < body.start_date:
        raise HTTPException(400, "La date de fin doit être après la date de début")
    
    # Filter only family members
    members = await db.users.find(
        {"family_id": user["family_id"], "id": {"$in": body.user_ids}},
        {"_id": 0, "id": 1, "name": 1}
    ).to_list(100)
    valid_ids = [m["id"] for m in members]
    if not valid_ids:
        raise HTTPException(400, "Membres invalides")

    p = {
        "id": new_id(),
        "family_id": user["family_id"],
        "user_ids": valid_ids,
        "member_names": [m["name"] for m in members],
        "start_date": body.start_date,
        "end_date": body.end_date,
        "reason": body.reason or "",
        "created_by": user["id"],
        "created_at": now(),
    }
    await db.pauses.insert_one(p)
    p.pop("_id", None)
    return p


@router.delete("/{pid}")
async def delete_pause(pid: str, user=Depends(parent_pin)):
    await db.pauses.delete_one({"id": pid, "family_id": user["family_id"]})
    return {"ok": True}
