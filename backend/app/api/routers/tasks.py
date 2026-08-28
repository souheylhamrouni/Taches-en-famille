"""Task management and completion router."""
import logging
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.db.mongo import db
from app.core.security import new_id, now, current_user, parent_pin
from app.models.task import TaskCreate, TaskPatch
from app.services.storage import storage_provider
from app.services.push import push_service
from app.services.gamification import award_task_completion, check_challenge_completion, week_start_key
from app.services.penalties import is_paused

log = logging.getLogger("tribuquest.tasks")
router = APIRouter(prefix="/tasks", tags=["tasks"])


def _task_out(t: dict) -> dict:
    t.pop("_id", None)
    return t


@router.get("")
async def list_tasks(user=Depends(current_user)):
    tasks = await db.tasks.find(
        {"family_id": user["family_id"], "active": {"$ne": False}},
        {"_id": 0}
    ).to_list(500)
    
    today_key = date.today().isoformat()
    week_key = week_start_key()
    
    # Today's completions
    comps = await db.completions.find(
        {"family_id": user["family_id"], "user_id": user["id"], "day": today_key},
        {"_id": 0}
    ).to_list(500)
    by_task = {c["task_id"]: c for c in comps}
    
    # Weekly completions
    week_comps = await db.completions.find(
        {
            "family_id": user["family_id"],
            "user_id": user["id"],
            "day": {"$gte": week_key},
            "status": {"$in": ["approved", "pending"]}
        },
        {"_id": 0}
    ).to_list(500)
    week_by_task = {}
    for c in week_comps:
        week_by_task.setdefault(c["task_id"], c)
    
    paused = await is_paused(user["family_id"], user["id"], today_key)
    if paused:
        return {"tasks": [], "paused": True}

    for t in tasks:
        if t.get("frequency") == "weekly":
            c = week_by_task.get(t["id"]) or by_task.get(t["id"])
        else:
            c = by_task.get(t["id"])
        t["today_status"] = c["status"] if c else "todo"
        t["today_completion_id"] = c["id"] if c else None
    
    return {"tasks": tasks, "paused": paused}


@router.post("")
async def create_task(body: TaskCreate, user=Depends(parent_pin)):
    t = {
        "id": new_id(),
        "family_id": user["family_id"],
        "title": body.title,
        "description": body.description or "",
        "points_worth": body.points_worth,
        "penalty_points": body.penalty_points,
        "frequency": body.frequency,
        "assigned_to": body.assigned_to,
        "photo_required": body.photo_required,
        "due_time": body.due_time or "20:00",
        "created_by": user["id"],
        "created_at": now(),
        "active": True,
    }
    await db.tasks.insert_one(t)
    return _task_out(t)


@router.delete("/{task_id}")
async def delete_task(task_id: str, user=Depends(parent_pin)):
    await db.tasks.update_one(
        {"id": task_id, "family_id": user["family_id"]},
        {"$set": {"active": False}}
    )
    return {"ok": True}


@router.patch("/{task_id}")
async def patch_task(task_id: str, body: TaskPatch, user=Depends(parent_pin)):
    updates = {}
    if body.title is not None:
        updates["title"] = body.title
    if body.description is not None:
        updates["description"] = body.description
    if body.points_worth is not None:
        updates["points_worth"] = body.points_worth
    if body.penalty_points is not None:
        updates["penalty_points"] = body.penalty_points
    if body.frequency is not None:
        updates["frequency"] = body.frequency
    if body.assigned_to is not None:
        updates["assigned_to"] = body.assigned_to
    if body.photo_required is not None:
        updates["photo_required"] = body.photo_required
    if body.due_time is not None:
        updates["due_time"] = body.due_time
    if body.active is not None:
        updates["active"] = body.active
    
    if updates:
        await db.tasks.update_one({"id": task_id, "family_id": user["family_id"]}, {"$set": updates})
    
    updated = await db.tasks.find_one({"id": task_id, "family_id": user["family_id"]}, {"_id": 0})
    if not updated:
        raise HTTPException(404, "Tâche introuvable")
    return updated


@router.post("/{task_id}/complete")
async def complete_task(task_id: str, photo: Optional[UploadFile] = File(None), user=Depends(current_user)):
    task = await db.tasks.find_one({"id": task_id, "family_id": user["family_id"]}, {"_id": 0})
    if not task:
        raise HTTPException(404, "Tâche introuvable")

    day_key = date.today().isoformat()
    existing = await db.completions.find_one({"task_id": task_id, "user_id": user["id"], "day": day_key})
    if existing:
        raise HTTPException(409, "Déjà soumis aujourd'hui")

    photo_path = None
    if task.get("photo_required"):
        if not photo:
            raise HTTPException(400, "Photo requise")
        data = await photo.read()
        
        # Max 10MB image limit
        if len(data) > 10 * 1024 * 1024:
            raise HTTPException(400, "La photo dépasse la taille maximale autorisée (10 Mo)")
            
        ext = (photo.filename or "img.jpg").rsplit(".", 1)[-1].lower()
        if ext not in ("jpg", "jpeg", "png", "webp", "heic"):
            ext = "jpg"
        path = f"tachehero/uploads/{user['id']}/{new_id()}.{ext}"
        try:
            storage_provider.put_object(path, data, photo.content_type or "image/jpeg")
            photo_path = path
        except Exception as e:
            log.exception("Photo upload failed")
            raise HTTPException(500, f"Échec du téléversement: {e}")

    comp = {
        "id": new_id(),
        "task_id": task_id,
        "task_title": task["title"],
        "user_id": user["id"],
        "user_name": user["name"],
        "user_avatar": user.get("avatar"),
        "family_id": user["family_id"],
        "day": day_key,
        "photo_path": photo_path,
        "points_worth": task["points_worth"],
        "status": "pending" if task.get("photo_required") else "approved",
        "votes": [],
        "created_at": now(),
    }
    await db.completions.insert_one(comp)

    new_badges = []
    if comp["status"] == "approved":
        new_badges = await award_task_completion(user["id"], task["points_worth"])
        await check_challenge_completion(user["family_id"])
    else:
        # Notify family members
        fam_users = await db.users.find({"family_id": user["family_id"]}, {"_id": 0}).to_list(50)
        others = [u for u in fam_users if u["id"] != user["id"]]
        await push_service.notify_users(
            others,
            "Nouvelle preuve à valider",
            f"{user['name']} a terminé « {task['title']} ». Votez !",
            {"action_url": "/shared/validate"}
        )

    comp.pop("_id", None)
    comp["new_badges"] = new_badges
    return comp
