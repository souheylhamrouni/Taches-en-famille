"""TribuQuest - Database Seeding Utilities."""
import logging
from datetime import datetime, timezone, timedelta, date
from app.db.mongo import db
from app.core.security import passwords, new_id, now
from app.services.gamification import week_start_key

log = logging.getLogger("tribuquest.seed")


async def seed_demo():
    """Create a demo French family. Skips if already exists."""
    existing = await db.users.find_one({"email": "papa@demo.fr"})
    if existing:
        # Migration: ensure demo parent PIN is up-to-date (123456)
        new_hash = passwords.hash("123456")
        if existing.get("pin_hash") != new_hash:
            await db.users.update_one(
                {"email": "papa@demo.fr"},
                {"$set": {"pin_hash": new_hash}}
            )
            log.info("Migrated demo parent PIN to 123456")
        return {"ok": True, "message": "Déjà initialisé", "family_id": existing.get("family_id")}

    fam_id = new_id()
    await db.families.insert_one({"id": fam_id, "name": "Tribu Dupont", "created_at": now()})

    users_to_create = [
        {"email": "papa@demo.fr", "name": "Papa", "role": "parent", "pin": "123456", "avatar": "🦸"},
        {"email": "lea@demo.fr", "name": "Léa", "role": "child", "avatar": "🐻", "points": 320, "streak": 5, "total_earned": 560, "tasks_completed": 22},
        {"email": "hugo@demo.fr", "name": "Hugo", "role": "child", "avatar": "🦊", "points": 210, "streak": 3, "total_earned": 310, "tasks_completed": 12},
        {"email": "emma@demo.fr", "name": "Emma", "role": "child", "avatar": "🐼", "points": 150, "streak": 2, "total_earned": 180, "tasks_completed": 6},
    ]
    ids = {}
    for u in users_to_create:
        uid = new_id()
        ids[u["email"]] = uid
        doc = {
            "id": uid, "email": u["email"], "name": u["name"], "role": u["role"],
            "family_id": fam_id, "avatar": u["avatar"],
            "password_hash": passwords.hash("demo1234"),
            "points": u.get("points", 0), "streak": u.get("streak", 0),
            "total_earned": u.get("total_earned", 0), "tasks_completed": u.get("tasks_completed", 0),
            "badges_unlocked": [],
            "last_streak_date": date.today().isoformat() if u.get("streak") else None,
            "created_at": now(),
        }
        if u["role"] == "parent":
            doc["pin_hash"] = passwords.hash(u["pin"])
        await db.users.insert_one(doc)

    child_ids = [ids["lea@demo.fr"], ids["hugo@demo.fr"], ids["emma@demo.fr"]]
    tasks = [
        {"title": "Ranger sa chambre", "points_worth": 20, "penalty_points": 30, "frequency": "daily", "photo_required": True, "assigned_to": child_ids},
        {"title": "Faire ses devoirs", "points_worth": 30, "penalty_points": 50, "frequency": "daily", "photo_required": True, "assigned_to": child_ids},
        {"title": "Mettre la table", "points_worth": 10, "penalty_points": 10, "frequency": "daily", "photo_required": False, "assigned_to": child_ids},
        {"title": "Vider le lave-vaisselle", "points_worth": 15, "penalty_points": 20, "frequency": "daily", "photo_required": False, "assigned_to": [ids["lea@demo.fr"]]},
        {"title": "Sortir les poubelles", "points_worth": 25, "penalty_points": 30, "frequency": "weekly", "photo_required": True, "assigned_to": [ids["hugo@demo.fr"]]},
        {"title": "Nettoyer la salle de bain", "points_worth": 50, "penalty_points": 0, "frequency": "weekly", "photo_required": True, "assigned_to": child_ids},
    ]
    for t in tasks:
        await db.tasks.insert_one({
            "id": new_id(), "family_id": fam_id, "description": "", "due_time": "20:00",
            "created_by": ids["papa@demo.fr"], "created_at": now(), "active": True, **t
        })

    rewards = [
        {"title": "1h de console", "point_cost": 200, "icon": "🎮"},
        {"title": "Sortie ciné", "point_cost": 500, "icon": "🎬"},
        {"title": "Glace au parc", "point_cost": 100, "icon": "🍦"},
        {"title": "Choisir le repas du soir", "point_cost": 80, "icon": "🍕"},
        {"title": "Pyjama party", "point_cost": 400, "icon": "🛌"},
        {"title": "10€ argent de poche", "point_cost": 600, "icon": "💶"},
    ]
    for r in rewards:
        await db.rewards.insert_one({
            "id": new_id(), "family_id": fam_id, "description": "",
            "created_at": now(), **r
        })

    events = [
        {"title": "Rendez-vous dentiste", "start_time": (now() + timedelta(days=2)).isoformat(), "color": "#FF9600"},
        {"title": "Anniversaire de Mamie", "start_time": (now() + timedelta(days=5)).isoformat(), "color": "#FFC800"},
        {"title": "Sortie piscine", "start_time": (now() + timedelta(days=1)).isoformat(), "color": "#58CC02"},
    ]
    for e in events:
        await db.events.insert_one({
            "id": new_id(), "family_id": fam_id, "description": "",
            "assigned_users": [], "created_by": ids["papa@demo.fr"],
            "created_at": now(), "end_time": None, **e
        })

    shopping = ["Lait", "Pain", "Pommes", "Yaourts", "Pâtes"]
    for s in shopping:
        await db.shopping.insert_one({
            "id": new_id(), "family_id": fam_id, "item_name": s,
            "is_bought": False, "added_by": ids["papa@demo.fr"],
            "added_by_name": "Papa", "created_at": now()
        })

    await db.challenges.insert_one({
        "id": new_id(), "family_id": fam_id,
        "title": "Semaine au top", "description": "Terminez 15 tâches en tribu cette semaine !",
        "metric": "tasks", "target": 15, "bonus_points": 50,
        "week_start": week_start_key(), "status": "active", "rewarded": False,
        "created_by": ids["papa@demo.fr"], "created_at": now(), "completed_at": None,
    })

    log.info(f"Demo family successfully seeded with family_id {fam_id}")
    return {
        "ok": True, "family_id": fam_id, "credentials": [
            {"role": "parent", "email": "papa@demo.fr", "password": "demo1234", "pin": "123456"},
            {"role": "child", "email": "lea@demo.fr", "password": "demo1234"},
            {"role": "child", "email": "hugo@demo.fr", "password": "demo1234"},
            {"role": "child", "email": "emma@demo.fr", "password": "demo1234"},
        ]
    }
