"""TribuQuest - Gamification Service (XP, Badges, Streaks, Challenges)."""
import logging
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List, Dict, Any
from app.db.mongo import db
from app.services.push import push_service

log = logging.getLogger("tribuquest.gamification")

BADGES = [
    {"id": "first_quest", "title": "Première quête", "emoji": "🌱", "description": "Termine ta première tâche", "type": "tasks", "threshold": 1},
    {"id": "getting_started", "title": "Sur la bonne voie", "emoji": "⭐", "description": "Termine 5 tâches", "type": "tasks", "threshold": 5},
    {"id": "task_machine", "title": "Machine à tâches", "emoji": "🤖", "description": "Termine 20 tâches", "type": "tasks", "threshold": 20},
    {"id": "task_legend", "title": "Légende des corvées", "emoji": "👑", "description": "Termine 50 tâches", "type": "tasks", "threshold": 50},
    {"id": "streak_3", "title": "En feu", "emoji": "🔥", "description": "Série de 3 jours", "type": "streak", "threshold": 3},
    {"id": "streak_7", "title": "Inarrêtable", "emoji": "⚡", "description": "Série de 7 jours", "type": "streak", "threshold": 7},
    {"id": "streak_30", "title": "Champion du mois", "emoji": "🏆", "description": "Série de 30 jours", "type": "streak", "threshold": 30},
    {"id": "earn_100", "title": "Premiers sous", "emoji": "💰", "description": "Gagne 100 points au total", "type": "earned", "threshold": 100},
    {"id": "earn_500", "title": "Petite fortune", "emoji": "💎", "description": "Gagne 500 points au total", "type": "earned", "threshold": 500},
    {"id": "earn_1000", "title": "Trésor royal", "emoji": "🏰", "description": "Gagne 1000 points au total", "type": "earned", "threshold": 1000},
]


def badge_stats(u: dict) -> dict:
    return {
        "tasks": u.get("tasks_completed", 0),
        "streak": u.get("streak", 0),
        "earned": u.get("total_earned", 0),
    }


async def unlock_badges(u: dict) -> List[dict]:
    """Persist and return badge defs newly unlocked for user doc `u`."""
    stats = badge_stats(u)
    already = set(u.get("badges_unlocked", []))
    newly = [b for b in BADGES if b["id"] not in already and stats[b["type"]] >= b["threshold"]]
    if newly:
        await db.users.update_one(
            {"id": u["id"]},
            {"$addToSet": {"badges_unlocked": {"$each": [b["id"] for b in newly]}}}
        )
    return newly


async def award_task_completion(user_id: str, pts: int) -> List[dict]:
    """Awards points, streak increments, and triggers badge unlocks."""
    u = await db.users.find_one({"id": user_id})
    if not u:
        return []
    today_key = date.today().isoformat()
    last = u.get("last_streak_date")
    yesterday_key = (date.today() - timedelta(days=1)).isoformat()
    
    if last == today_key:
        streak = u.get("streak", 0)
    elif last == yesterday_key:
        streak = u.get("streak", 0) + 1
    else:
        streak = 1

    await db.users.update_one({"id": user_id}, {
        "$inc": {"points": pts, "total_earned": pts, "tasks_completed": 1},
        "$set": {"streak": streak, "last_streak_date": today_key},
    })
    
    fresh = await db.users.find_one({"id": user_id})
    newly = await unlock_badges(fresh)
    if newly and fresh.get("push_token"):
        await push_service.send_push(
            fresh["push_token"],
            "Nouveau badge débloqué ! 🏅",
            " ".join(f"{b['emoji']} {b['title']}" for b in newly)
        )
    return newly


def week_start_key(d: Optional[date] = None) -> str:
    d = d or date.today()
    monday = d - timedelta(days=d.weekday())
    return monday.isoformat()


async def check_challenge_completion(family_id: str):
    monday = week_start_key()
    ch = await db.challenges.find_one({"family_id": family_id, "week_start": monday, "status": "active"})
    if not ch:
        return
    start_dt = datetime.fromisoformat(ch["week_start"]).replace(tzinfo=timezone.utc)
    comps = await db.completions.find(
        {"family_id": family_id, "status": "approved", "created_at": {"$gte": start_dt}},
        {"_id": 0, "points_worth": 1}
    ).to_list(5000)
    if ch["metric"] == "points":
        prog = sum(c.get("points_worth", 0) for c in comps)
    else:
        prog = len(comps)
    if prog >= ch["target"]:
        await db.challenges.update_one({"id": ch["id"]}, {"$set": {"status": "completed"}})
        members = await db.users.find({"family_id": family_id}).to_list(50)
        for m in members:
            await db.users.update_one({"id": m["id"]}, {"$inc": {"points": ch["bonus_points"], "total_earned": ch["bonus_points"]}})
            if m.get("push_token"):
                await push_service.send_push(
                    m["push_token"],
                    "Défi hebdomadaire réussi ! 🏆",
                    f"+{ch['bonus_points']} points bonus attribués à toute la famille !"
                )
