"""Completions validation and peer-voting router."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from app.db.mongo import db
from app.core.security import current_user
from app.models.task import VoteRequest
from app.services.push import push_service
from app.services.gamification import award_task_completion, check_challenge_completion

log = logging.getLogger("tribuquest.completions")
router = APIRouter(prefix="/completions", tags=["completions"])


@router.get("/pending")
async def pending_completions(user=Depends(current_user)):
    comps = await db.completions.find(
        {"family_id": user["family_id"], "status": "pending"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    for c in comps:
        my = next((v for v in c.get("votes", []) if v["user_id"] == user["id"]), None)
        c["my_vote"] = my["approved"] if my else None
    return {"completions": comps}


@router.post("/{comp_id}/vote")
async def vote_completion(comp_id: str, body: VoteRequest, user=Depends(current_user)):
    comp = await db.completions.find_one({"id": comp_id, "family_id": user["family_id"]})
    if not comp:
        raise HTTPException(404, "Preuve introuvable")
    if comp["status"] != "pending":
        raise HTTPException(400, "Déjà traitée")
    if comp["user_id"] == user["id"]:
        raise HTTPException(400, "Vous ne pouvez pas voter pour vous-même")

    votes = [v for v in comp.get("votes", []) if v["user_id"] != user["id"]]
    votes.append({"user_id": user["id"], "user_name": user["name"], "approved": body.approved})
    await db.completions.update_one({"id": comp_id}, {"$set": {"votes": votes}})

    approves = sum(1 for v in votes if v["approved"])
    rejects = sum(1 for v in votes if not v["approved"])
    is_parent = user.get("role") == "parent"

    resolved = False
    target_user = await db.users.find_one({"id": comp["user_id"]})
    push_token = target_user.get("push_token") if target_user else None

    if is_parent or approves >= 1:
        if approves > rejects or (is_parent and body.approved):
            await db.completions.update_one({"id": comp_id}, {"$set": {"status": "approved"}})
            await award_task_completion(comp["user_id"], comp["points_worth"])
            await check_challenge_completion(user["family_id"])
            if push_token:
                await push_service.send_push(
                    push_token,
                    "Preuve approuvée ✅",
                    f"+{comp['points_worth']} points pour « {comp['task_title']} »"
                )
            resolved = True
        elif rejects > approves or (is_parent and not body.approved):
            await db.completions.update_one({"id": comp_id}, {"$set": {"status": "rejected"}})
            if push_token:
                await push_service.send_push(
                    push_token,
                    "Preuve rejetée ❌",
                    f"« {comp['task_title']} » : aucun point attribué."
                )
            resolved = True
            
    return {"ok": True, "resolved": resolved}
