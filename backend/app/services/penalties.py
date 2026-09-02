"""TribuQuest - Daily Penalties & Reminder Service."""
import logging
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List
from app.db.mongo import db
from app.core.security import new_id, now
from app.services.push import push_service
from app.services.shared_claims import get_approved_shared_claim_for_task

log = logging.getLogger("tribuquest.penalties")


async def is_paused(family_id: str, user_id: str, day_str: Optional[str] = None) -> bool:
    """Returns True if the given user is currently on pause for day_str (YYYY-MM-DD)."""
    target = day_str or date.today().isoformat()
    pause = await db.pauses.find_one({
        "family_id": family_id,
        "user_ids": user_id,
        "start_date": {"$lte": target},
        "end_date": {"$gte": target},
    })
    return pause is not None


async def apply_daily_penalties(only_family_id: Optional[str] = None):
    """Runs at 20:00 daily: check incomplete daily tasks and apply penalty.
    Idempotent per (user, task, day).
    For shared tasks with an approved claim, assignees are not penalized."""
    log.info("Running daily penalty check")
    today_key = date.today().isoformat()
    fam_query = {"id": only_family_id} if only_family_id else {}
    families = await db.families.find(fam_query, {"_id": 0}).to_list(500)
    for fam in families:
        tasks = await db.tasks.find({"family_id": fam["id"], "frequency": "daily", "active": {"$ne": False}}, {"_id": 0}).to_list(200)
        users = await db.users.find(
            {"family_id": fam["id"], "role": "child", "active": {"$ne": False}},
            {"_id": 0, "password_hash": 0, "pin_hash": 0}
        ).to_list(50)
        comps = await db.completions.find({"family_id": fam["id"], "day": today_key}, {"_id": 0, "task_id": 1, "user_id": 1, "status": 1}).to_list(5000)
        done = {(c["task_id"], c["user_id"]): c["status"] for c in comps}
        existing_pen = await db.penalties.find({"family_id": fam["id"], "day": today_key}, {"_id": 0, "task_id": 1, "user_id": 1}).to_list(5000)
        penalized = {(pn["task_id"], pn["user_id"]) for pn in existing_pen}

        # Get all approved shared claims for today
        approved_claims = await db.shared_claims.find(
            {"family_id": fam["id"], "day": today_key, "status": "approved"},
            {"_id": 0, "task_id": 1}
        ).to_list(500)
        approved_shared_task_ids = {c["task_id"] for c in approved_claims}

        for u in users:
            if await is_paused(fam["id"], u["id"], today_key):
                continue
            for t in tasks:
                if t.get("assigned_to") and u["id"] not in t["assigned_to"]:
                    continue

                # Skip if this is a shared task with an approved claim
                if t["id"] in approved_shared_task_ids:
                    continue

                status = done.get((t["id"], u["id"]))
                if status in ("pending", "approved"):
                    continue
                if (t["id"], u["id"]) in penalized:
                    continue  # already penalized today

                pts = t.get("penalty_points", 50)
                await db.users.update_one(
                    {"id": u["id"]},
                    {"$inc": {"points": -pts}, "$set": {"streak": 0, "last_streak_date": None}}
                )
                await db.penalties.insert_one({
                    "id": new_id(), "family_id": fam["id"], "user_id": u["id"], "user_name": u["name"],
                    "task_id": t["id"], "task_title": t["title"], "points_deducted": pts,
                    "day": today_key, "timestamp": now(),
                })
                penalized.add((t["id"], u["id"]))
                if u.get("push_token"):
                    await push_service.send_push(
                        u["push_token"],
                        "Pénalité appliquée ⚠️",
                        f"-{pts} pts pour « {t['title']} » non fait"
                    )


async def send_evening_reminders(only_family_id: Optional[str] = None):
    """Runs at the configured reminder time: warn users with unfinished daily tasks.
    Users are not reminded about shared tasks that have been claimed by someone else."""
    log.info("Sending evening reminders")
    today_key = date.today().isoformat()
    fam_query = {"id": only_family_id} if only_family_id else {}
    families = await db.families.find(fam_query, {"_id": 0, "id": 1, "name": 1}).to_list(500)
    for fam in families:
        tasks = await db.tasks.find({"family_id": fam["id"], "frequency": "daily", "active": {"$ne": False}}, {"_id": 0}).to_list(200)
        users = await db.users.find(
            {"family_id": fam["id"], "role": "child", "active": {"$ne": False}},
            {"_id": 0}
        ).to_list(50)
        comps = await db.completions.find({"family_id": fam["id"], "day": today_key}, {"_id": 0, "task_id": 1, "user_id": 1}).to_list(5000)
        submitted = {(c["task_id"], c["user_id"]) for c in comps}

        # Get all shared claims for today (any status - if claimed, others don't need reminder)
        shared_claims = await db.shared_claims.find(
            {"family_id": fam["id"], "day": today_key},
            {"_id": 0, "task_id": 1, "claimed_by": 1}
        ).to_list(500)
        claimed_task_ids = {sc["task_id"] for sc in shared_claims}

        for u in users:
            if await is_paused(fam["id"], u["id"], today_key):
                continue
            missing = []
            for t in tasks:
                if t.get("assigned_to") and u["id"] not in t["assigned_to"]:
                    continue
                # Skip shared tasks claimed by someone else
                if t["id"] in claimed_task_ids:
                    continue
                if (t["id"], u["id"]) not in submitted:
                    missing.append(t["title"])
            if missing and u.get("push_token"):
                await push_service.send_push(
                    u["push_token"],
                    "Il te reste 1h ! ⏰",
                    f"{len(missing)} tâche(s) à finir avant la fin de la journée : {', '.join(missing[:3])}"
                )
