"""Challenges and Badges Router."""
import logging
from datetime import datetime, timezone, timedelta, date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from app.db.mongo import db
from app.core.security import new_id, now, current_user, parent_pin
from app.models.challenge import ChallengeCreate, ChallengePatch
from app.services.gamification import (
    BADGES, badge_stats, unlock_badges, week_start_key,
    check_challenge_completion
)

log = logging.getLogger("tribuquest.challenges")
router = APIRouter(tags=["challenges", "badges"])


async def _challenge_progress(ch: dict) -> int:
    start_dt = datetime.fromisoformat(ch["week_start"]).replace(tzinfo=timezone.utc)
    comps = await db.completions.find(
        {"family_id": ch["family_id"], "status": "approved", "created_at": {"$gte": start_dt}},
        {"_id": 0, "points_worth": 1}
    ).to_list(5000)
    if ch.get("metric") == "points":
        return sum(c.get("points_worth", 0) for c in comps)
    return len(comps)


@router.get("/badges")
async def get_badges(user=Depends(current_user)):
    doc = await db.users.find_one({"id": user["id"]})
    await unlock_badges(doc)
    doc = await db.users.find_one({"id": user["id"]})
    unlocked = set(doc.get("badges_unlocked", []))
    stats = badge_stats(doc)
    out = []
    for b in BADGES:
        cur = stats[b["type"]]
        out.append({
            **b,
            "unlocked": b["id"] in unlocked,
            "current": cur,
            "progress": min(1.0, cur / b["threshold"]) if b["threshold"] else 1.0,
        })
    return {"badges": out, "unlocked_count": len(unlocked & {b["id"] for b in BADGES}), "total": len(BADGES)}


@router.get("/challenges")
async def get_challenges(user=Depends(current_user)):
    ws = week_start_key()
    ch = await db.challenges.find_one({"family_id": user["family_id"], "week_start": ws}, {"_id": 0})
    if ch:
        ch["progress"] = await _challenge_progress(ch)
        ch["percent"] = min(1.0, ch["progress"] / ch["target"]) if ch["target"] else 1.0
    history = await db.challenges.find(
        {"family_id": user["family_id"], "status": "completed"}, {"_id": 0}
    ).sort("completed_at", -1).to_list(20)
    return {"challenge": ch, "history": history, "week_start": ws}


@router.post("/challenges")
async def create_challenge(body: ChallengeCreate, user=Depends(parent_pin)):
    ws = week_start_key()
    existing = await db.challenges.find_one({"family_id": user["family_id"], "week_start": ws, "status": "active"})
    if existing:
        raise HTTPException(409, "Un défi est déjà actif cette semaine")
    ch = {
        "id": new_id(),
        "family_id": user["family_id"],
        "title": body.title,
        "description": body.description or "",
        "metric": body.metric,
        "target": body.target,
        "bonus_points": body.bonus_points,
        "week_start": ws,
        "status": "active",
        "rewarded": False,
        "created_by": user["id"],
        "created_at": now(),
        "completed_at": None,
    }
    await db.challenges.insert_one(ch)
    ch.pop("_id", None)
    ch["progress"] = await _challenge_progress(ch)
    ch["percent"] = min(1.0, ch["progress"] / ch["target"]) if ch["target"] else 1.0
    await check_challenge_completion(user["family_id"])
    return ch


@router.delete("/challenges/{cid}")
async def delete_challenge(cid: str, user=Depends(parent_pin)):
    await db.challenges.delete_one({"id": cid, "family_id": user["family_id"]})
    return {"ok": True}


@router.patch("/challenges/{cid}")
async def patch_challenge(cid: str, body: ChallengePatch, user=Depends(parent_pin)):
    updates = {}
    if body.title is not None:
        updates["title"] = body.title
    if body.description is not None:
        updates["description"] = body.description
    if body.target is not None:
        updates["target"] = body.target
    if body.metric is not None:
        updates["metric"] = body.metric
    if body.bonus_points is not None:
        updates["bonus_points"] = body.bonus_points
    if updates:
        await db.challenges.update_one({"id": cid, "family_id": user["family_id"]}, {"$set": updates})
    updated = await db.challenges.find_one({"id": cid, "family_id": user["family_id"]}, {"_id": 0})
    if not updated:
        raise HTTPException(404, "Défi introuvable")
    return updated
