"""Shared Family Calendar Events Router."""
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from app.db.mongo import db
from app.core.security import new_id, now, current_user
from app.services.push import push_service

log = logging.getLogger("tribuquest.events")
router = APIRouter(prefix="/events", tags=["events"])


class EventCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    start_time: str
    end_time: Optional[str] = None
    assigned_users: List[str] = []
    color: Optional[str] = "#58CC02"
    recurrence: Literal["none", "weekly"] = "none"


class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    color: Optional[str] = None
    recurrence: Optional[Literal["none", "weekly"]] = None


def _expand_events(events: list) -> list:
    """Expand weekly-recurring events into individual occurrences within a window."""
    win_start = now() - timedelta(weeks=8)
    win_end = now() + timedelta(weeks=26)
    out = []
    for e in events:
        rec = e.get("recurrence", "none")
        try:
            base = datetime.fromisoformat(e["start_time"])
        except Exception:
            out.append({**e, "occ_id": f"{e['id']}:{e.get('start_time','')}"})
            continue
        if base.tzinfo is None:
            base = base.replace(tzinfo=timezone.utc)
        if rec != "weekly":
            out.append({**e, "occ_id": f"{e['id']}:{e['start_time']}"})
            continue
        occ = base
        step = timedelta(weeks=1)
        guard = 0
        while occ <= win_end and guard < 400:
            if occ >= win_start:
                out.append({
                    **e,
                    "start_time": occ.isoformat(),
                    "occ_id": f"{e['id']}:{occ.isoformat()}",
                    "is_occurrence": True
                })
            occ += step
            guard += 1
    return out


@router.get("")
async def list_events(user=Depends(current_user)):
    events = await db.events.find(
        {"family_id": user["family_id"]},
        {"_id": 0}
    ).sort("start_time", 1).to_list(500)
    return {"events": _expand_events(events)}


@router.post("")
async def create_event(body: EventCreate, user=Depends(current_user)):
    e = {
        "id": new_id(),
        "family_id": user["family_id"],
        **body.model_dump(),
        "created_by": user["id"],
        "created_at": now()
    }
    await db.events.insert_one(e)
    
    # Notify family
    fam_users = await db.users.find({"family_id": user["family_id"]}, {"_id": 0}).to_list(50)
    others = [u for u in fam_users if u["id"] != user["id"]]
    label = body.title + (" (chaque semaine)" if body.recurrence == "weekly" else "")
    await push_service.notify_users(others, "Nouvel événement 📅", label)
    
    e.pop("_id", None)
    return e


@router.delete("/{eid}")
async def del_event(eid: str, user=Depends(current_user)):
    await db.events.delete_one({"id": eid, "family_id": user["family_id"]})
    return {"ok": True}


@router.patch("/{eid}")
async def update_event(eid: str, body: EventUpdate, user=Depends(current_user)):
    if user.get("role") != "parent":
        raise HTTPException(403, "Seul un parent peut modifier un événement")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"ok": True}
    res = await db.events.update_one({"id": eid, "family_id": user["family_id"]}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Événement introuvable")
    return {"ok": True}
