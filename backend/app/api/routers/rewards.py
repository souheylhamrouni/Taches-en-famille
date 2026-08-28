"""Rewards and Claims router with Fulfillment / Delivery Workflow (Feature C)."""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from app.db.mongo import db
from app.core.security import new_id, now, current_user, parent_pin
from app.models.reward import RewardCreate, ClaimDeliverRequest
from app.services.push import push_service

log = logging.getLogger("tribuquest.rewards")
router = APIRouter(tags=["rewards"])


@router.get("/rewards")
async def list_rewards(user=Depends(current_user)):
    rewards = await db.rewards.find(
        {"family_id": user["family_id"]},
        {"_id": 0}
    ).to_list(200)
    return {"rewards": rewards}


@router.post("/rewards")
async def create_reward(body: RewardCreate, user=Depends(parent_pin)):
    cost = getattr(body, "cost", None) or getattr(body, "point_cost", 50)
    r = {
        "id": new_id(),
        "family_id": user["family_id"],
        "title": body.title,
        "description": body.description or "",
        "point_cost": cost,
        "cost": cost,
        "icon": body.icon or "🎁",
        "created_at": now()
    }
    await db.rewards.insert_one(r)
    r.pop("_id", None)
    return r


@router.delete("/rewards/{rid}")
async def del_reward(rid: str, user=Depends(parent_pin)):
    await db.rewards.delete_one({"id": rid, "family_id": user["family_id"]})
    return {"ok": True}


@router.post("/rewards/{rid}/claim")
async def claim_reward(rid: str, user=Depends(current_user)):
    r = await db.rewards.find_one({"id": rid, "family_id": user["family_id"]})
    if not r:
        raise HTTPException(404, "Récompense introuvable")
    
    cost = r.get("point_cost") or r.get("cost", 50)
    db_u = await db.users.find_one({"id": user["id"]})
    user_points = db_u.get("points", 0) if db_u else 0
    if user_points < cost:
        raise HTTPException(400, "Points insuffisants")
    
    await db.users.update_one({"id": user["id"]}, {"$inc": {"points": -cost}})
    claim = {
        "id": new_id(),
        "family_id": user["family_id"],
        "reward_id": rid,
        "reward_title": r["title"],
        "cost": cost,
        "point_cost": cost,
        "user_id": user["id"],
        "user_name": user["name"],
        "user_avatar": user.get("avatar", "🐻"),
        "status": "pending",
        "delivered_at": None,
        "delivered_by": None,
        "created_at": now(),
    }
    await db.claims.insert_one(claim)
    
    # Notify parents
    parents = await db.users.find({"family_id": user["family_id"], "role": "parent"}, {"_id": 0}).to_list(10)
    await push_service.notify_users(
        parents,
        "Récompense demandée 🎁",
        f"{user['name']} a réclamé « {r['title']} » (-{cost} pts)",
        {"action_url": "/(parent)/rewards-admin"}
    )
    
    claim.pop("_id", None)
    return claim


@router.get("/claims")
async def list_claims(status: Optional[str] = Query(None), user=Depends(current_user)):
    query = {"family_id": user["family_id"]}
    if status:
        query["status"] = status
    claims = await db.claims.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"claims": claims}


@router.post("/claims/{claim_id}/deliver")
async def deliver_claim(claim_id: str, body: Optional[ClaimDeliverRequest] = None, user=Depends(parent_pin)):
    """Parent marks a claimed reward as delivered (Feature C)."""
    claim = await db.claims.find_one({"id": claim_id, "family_id": user["family_id"]})
    if not claim:
        raise HTTPException(404, "Demande de récompense introuvable")
    
    if claim.get("status") == "delivered":
        raise HTTPException(400, "Cette récompense a déjà été marquée comme délivrée")
    
    delivery_time = now()
    update_data = {
        "status": "delivered",
        "delivered_at": delivery_time,
        "delivered_by": user["id"],
        "delivered_by_name": user["name"],
    }
    if body and body.note:
        update_data["delivery_note"] = body.note

    await db.claims.update_one({"id": claim_id}, {"$set": update_data})
    
    # Notify the child who claimed the reward
    target_user = await db.users.find_one({"id": claim["user_id"]})
    if target_user and target_user.get("push_token"):
        await push_service.send_push(
            target_user["push_token"],
            "Récompense remise ! 🎉",
            f"Ta récompense « {claim['reward_title']} » a été délivrée par {user['name']} !",
            {"action_url": "/shared/myrewards"}
        )

    updated_claim = await db.claims.find_one({"id": claim_id}, {"_id": 0})
    return {"ok": True, "claim": updated_claim}
