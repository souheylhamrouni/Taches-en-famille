"""TâcheHéros - Family Chore Gamification API."""
import os
import uuid
import base64
import secrets
import logging
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List, Literal
from pathlib import Path

import jwt
import httpx
import requests
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import Response
from fastapi.security import OAuth2PasswordBearer
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from pwdlib import PasswordHash
from apscheduler.schedulers.asyncio import AsyncIOScheduler

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

# -------- Config --------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
ALGO = "HS256"
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
APP_NAME = "tachehero"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="TâcheHéros API")
api = APIRouter(prefix="/api")
passwords = PasswordHash.recommended()
DUMMY = passwords.hash("not-a-real-password-not-a-real-password")
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("tachehero")

# -------- Utils --------
def now(): return datetime.now(timezone.utc)
def iso(dt: datetime) -> str: return dt.replace(tzinfo=timezone.utc).isoformat() if dt.tzinfo is None else dt.isoformat()
def new_id() -> str: return str(uuid.uuid4())

def make_token(user, minutes=60*24*7, purpose="access"):
    return jwt.encode({
        "sub": user["id"], "role": user["role"], "family_id": user["family_id"],
        "purpose": purpose, "jti": secrets.token_urlsafe(8),
        "iat": now(), "exp": now() + timedelta(minutes=minutes)
    }, JWT_SECRET, algorithm=ALGO)

async def current_user(token: Optional[str] = Depends(oauth2)):
    if not token:
        raise HTTPException(401, "Non authentifié")
    try:
        p = jwt.decode(token, JWT_SECRET, algorithms=[ALGO])
        if p.get("purpose") != "access":
            raise HTTPException(401, "Jeton invalide")
        user = await db.users.find_one({"id": p["sub"]}, {"_id": 0, "password_hash": 0, "pin_hash": 0})
        if not user:
            raise HTTPException(401, "Utilisateur introuvable")
        return user
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Jeton invalide")

async def parent_pin(request: Request, user=Depends(current_user)):
    if user["role"] != "parent":
        raise HTTPException(403, "Rôle parent requis")
    tok = request.headers.get("X-Parent-Pin-Token")
    if not tok:
        raise HTTPException(403, "PIN parent requis")
    try:
        p = jwt.decode(tok, JWT_SECRET, algorithms=[ALGO])
        if p.get("purpose") != "parent_pin" or p.get("sub") != user["id"]:
            raise HTTPException(403, "PIN parent invalide")
    except jwt.InvalidTokenError:
        raise HTTPException(403, "PIN parent invalide")
    return user

# -------- Object Storage --------
_storage_key = None

def _init_storage_sync():
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY manquant")
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
    r.raise_for_status()
    _storage_key = r.json()["storage_key"]
    return _storage_key

def _put_object_sync(path: str, data: bytes, content_type: str):
    key = _init_storage_sync()
    r = requests.put(f"{STORAGE_URL}/objects/{path}",
                     headers={"X-Storage-Key": key, "Content-Type": content_type},
                     data=data, timeout=120)
    if r.status_code == 503:
        global _storage_key
        _storage_key = None
        key = _init_storage_sync()
        r = requests.put(f"{STORAGE_URL}/objects/{path}",
                         headers={"X-Storage-Key": key, "Content-Type": content_type},
                         data=data, timeout=120)
    r.raise_for_status()
    return r.json()

def _get_object_sync(path: str):
    key = _init_storage_sync()
    r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if r.status_code == 503:
        global _storage_key
        _storage_key = None
        key = _init_storage_sync()
        r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

# -------- Push --------
_push_client = httpx.AsyncClient(
    base_url="https://integrations.emergentagent.com",
    headers={"X-Push-Key": PUSH_KEY},
    timeout=10.0,
)

async def send_push(recipients: List[str], data: dict, idempotency: Optional[str] = None):
    if not recipients:
        return
    if "title" not in data or "message" not in data:
        return
    payload = {"recipients": recipients[:100], "data": data}
    if idempotency:
        payload["$idempotency_key"] = idempotency
    try:
        r = await _push_client.post("/api/v1/push/trigger", json=payload)
        if r.status_code >= 400:
            log.warning(f"push failed {r.status_code}: {r.text[:200]}")
    except Exception as e:
        log.warning(f"push error: {e}")

# -------- Models --------
class Register(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=40)
    role: Literal["parent", "child"]
    family_id: Optional[str] = None  # if empty, create new family
    family_name: Optional[str] = None
    avatar: Optional[str] = None
    pin: Optional[str] = Field(default=None, pattern=r"^\d{4}$")

class LoginBody(BaseModel):
    email: EmailStr
    password: str

class PinBody(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")

class DeleteAccountBody(BaseModel):
    password: str

class SetPushToken(BaseModel):
    user_id: str
    platform: str
    device_token: str

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    points_worth: int = 20
    penalty_points: int = 50
    frequency: Literal["daily", "weekly", "once"] = "daily"
    assigned_to: List[str] = []  # user ids
    photo_required: bool = True
    due_time: Optional[str] = "20:00"  # HH:MM

class RewardCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    point_cost: int
    icon: Optional[str] = "🎁"

class EventCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    start_time: str  # ISO
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

class ShoppingCreate(BaseModel):
    item_name: str

class ValidateBody(BaseModel):
    approved: bool

class ChallengeCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    metric: Literal["tasks", "points"] = "tasks"
    target: int = Field(default=20, ge=1, le=1000)
    bonus_points: int = Field(default=50, ge=0, le=1000)

# -------- Auth --------
@api.post("/auth/register")
async def register(body: Register):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Email déjà utilisé")

    if body.family_id:
        family = await db.families.find_one({"id": body.family_id}, {"_id": 0})
        if not family:
            raise HTTPException(404, "Famille introuvable")
        fam_id = body.family_id
    else:
        fam_id = new_id()
        await db.families.insert_one({
            "id": fam_id,
            "name": body.family_name or f"Famille de {body.name}",
            "created_at": now(),
        })

    if body.role == "parent" and not body.pin:
        raise HTTPException(400, "PIN parent requis à l'inscription")

    user = {
        "id": new_id(),
        "email": email,
        "password_hash": passwords.hash(body.password),
        "name": body.name,
        "role": body.role,
        "family_id": fam_id,
        "avatar": body.avatar or ("🦸" if body.role == "parent" else "🐻"),
        "points": 0,
        "streak": 0,
        "total_earned": 0,
        "tasks_completed": 0,
        "badges_unlocked": [],
        "last_streak_date": None,
        "push_token": None,
        "created_at": now(),
    }
    if body.role == "parent":
        user["pin_hash"] = passwords.hash(body.pin)
    await db.users.insert_one(user)

    token = make_token(user)
    safe = {k: v for k, v in user.items() if k not in ("password_hash", "pin_hash", "_id")}
    return {"access_token": token, "user": safe, "family_id": fam_id}


@api.post("/auth/login")
async def login(body: LoginBody):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    valid = passwords.verify(body.password, user["password_hash"]) if user else passwords.verify(body.password, DUMMY)
    if not user or not valid:
        raise HTTPException(401, "Email ou mot de passe incorrect")
    token = make_token(user)
    safe = {k: v for k, v in user.items() if k not in ("password_hash", "pin_hash", "_id")}
    return {"access_token": token, "user": safe}


@api.get("/auth/me")
async def me(user=Depends(current_user)):
    return user


@api.delete("/auth/account")
async def delete_account(body: DeleteAccountBody, user=Depends(current_user)):
    doc = await db.users.find_one({"id": user["id"]})
    if not doc or not passwords.verify(body.password, doc["password_hash"]):
        raise HTTPException(401, "Mot de passe incorrect")
    fam_id = user["family_id"]
    # Remove the member and their personal records.
    await db.users.delete_one({"id": user["id"]})
    await db.completions.delete_many({"user_id": user["id"]})
    await db.penalties.delete_many({"user_id": user["id"]})
    await db.claims.delete_many({"user_id": user["id"]})
    # If the family is now empty, wipe all its shared data too.
    remaining = await db.users.count_documents({"family_id": fam_id})
    if remaining == 0:
        await db.families.delete_one({"id": fam_id})
        for coll in (db.tasks, db.rewards, db.events, db.shopping,
                     db.completions, db.penalties, db.claims):
            await coll.delete_many({"family_id": fam_id})
    return {"ok": True, "family_deleted": remaining == 0}


@api.post("/auth/pin/verify")
async def verify_pin(body: PinBody, user=Depends(current_user)):
    if user["role"] != "parent":
        raise HTTPException(403, "Rôle parent requis")
    doc = await db.users.find_one({"id": user["id"]})
    if not doc or not doc.get("pin_hash"):
        raise HTTPException(400, "PIN non configuré")
    if not passwords.verify(body.pin, doc["pin_hash"]):
        raise HTTPException(401, "PIN incorrect")
    tok = jwt.encode({
        "sub": user["id"], "purpose": "parent_pin",
        "iat": now(), "exp": now() + timedelta(minutes=30),
    }, JWT_SECRET, algorithm=ALGO)
    return {"pin_token": tok}


# -------- Family --------
@api.get("/family")
async def get_family(user=Depends(current_user)):
    fam = await db.families.find_one({"id": user["family_id"]}, {"_id": 0})
    members = await db.users.find(
        {"family_id": user["family_id"]},
        {"_id": 0, "password_hash": 0, "pin_hash": 0}
    ).to_list(100)
    return {"family": fam, "members": members}


@api.get("/family/leaderboard")
async def leaderboard(user=Depends(current_user)):
    members = await db.users.find(
        {"family_id": user["family_id"], "role": "child"},
        {"_id": 0, "password_hash": 0, "pin_hash": 0}
    ).to_list(100)
    members.sort(key=lambda u: u.get("points", 0), reverse=True)
    return {"members": members}


# -------- Push registration --------
@api.post("/register-push", status_code=201)
async def register_push(body: SetPushToken, user=Depends(current_user)):
    # Derive the user from the auth token — never trust a caller-supplied user_id.
    await db.users.update_one({"id": user["id"]}, {"$set": {"push_token": body.device_token, "platform": body.platform}})
    payload = {"user_id": user["id"], "platform": body.platform, "device_token": body.device_token}
    try:
        r = await _push_client.post("/api/v1/push/users/register", json=payload)
        if r.status_code >= 400:
            log.warning(f"push register {r.status_code}")
    except Exception as e:
        log.warning(f"push register err: {e}")
    return {"status": "ok"}


# -------- Tasks --------
def _task_out(t: dict) -> dict:
    t.pop("_id", None)
    return t


@api.get("/tasks")
async def list_tasks(user=Depends(current_user)):
    tasks = await db.tasks.find({"family_id": user["family_id"], "active": {"$ne": False}}, {"_id": 0}).to_list(500)
    today_key = date.today().isoformat()
    # Batch-load today's completions for this user in one query (avoid N+1).
    comps = await db.completions.find(
        {"family_id": user["family_id"], "user_id": user["id"], "day": today_key}, {"_id": 0}
    ).to_list(500)
    by_task = {c["task_id"]: c for c in comps}
    for t in tasks:
        c = by_task.get(t["id"])
        t["today_status"] = c["status"] if c else "todo"
        t["today_completion_id"] = c["id"] if c else None
    return {"tasks": tasks}


@api.post("/tasks")
async def create_task(body: TaskCreate, user=Depends(parent_pin)):
    t = {
        "id": new_id(),
        "family_id": user["family_id"],
        "title": body.title,
        "description": body.description,
        "points_worth": body.points_worth,
        "penalty_points": body.penalty_points,
        "frequency": body.frequency,
        "assigned_to": body.assigned_to,
        "photo_required": body.photo_required,
        "due_time": body.due_time,
        "created_by": user["id"],
        "created_at": now(),
        "active": True,
    }
    await db.tasks.insert_one(t)
    return _task_out(t)


@api.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user=Depends(parent_pin)):
    await db.tasks.update_one({"id": task_id, "family_id": user["family_id"]}, {"$set": {"active": False}})
    return {"ok": True}


# -------- Completions & photo proof --------
@api.post("/tasks/{task_id}/complete")
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
        ext = (photo.filename or "img.jpg").rsplit(".", 1)[-1].lower()
        if ext not in ("jpg", "jpeg", "png", "webp", "heic"):
            ext = "jpg"
        path = f"{APP_NAME}/uploads/{user['id']}/{new_id()}.{ext}"
        try:
            await run_in_threadpool(_put_object_sync, path, data, photo.content_type or "image/jpeg")
            photo_path = path
        except Exception as e:
            log.exception("upload failed")
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
        "votes": [],  # [{user_id, approved}]
        "created_at": now(),
    }
    await db.completions.insert_one(comp)

    # if auto approve (no photo required), award immediately
    new_badges = []
    if comp["status"] == "approved":
        new_badges = await _award(user["id"], task["points_worth"])
        await _check_challenge_completion(user["family_id"])
    else:
        # notify family for vote
        fam = await db.users.find({"family_id": user["family_id"]}, {"id": 1, "_id": 0}).to_list(50)
        others = [u["id"] for u in fam if u["id"] != user["id"]]
        await send_push(others, {
            "title": "Nouvelle preuve à valider",
            "message": f"{user['name']} a terminé « {task['title']} ». Votez !",
            "action_url": "/validate",
        })

    comp.pop("_id", None)
    comp["new_badges"] = new_badges
    return comp


async def _award(user_id: str, pts: int):
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
    # Unlock badges based on the fresh stats.
    fresh = await db.users.find_one({"id": user_id})
    newly = await _unlock_badges(fresh)
    if newly:
        await send_push([user_id], {
            "title": "Nouveau badge débloqué ! 🏅",
            "message": " ".join(f"{b['emoji']} {b['title']}" for b in newly),
        })
    return newly


# -------- Badges --------
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


def _badge_stats(u: dict) -> dict:
    return {
        "tasks": u.get("tasks_completed", 0),
        "streak": u.get("streak", 0),
        "earned": u.get("total_earned", 0),
    }


async def _unlock_badges(u: dict):
    """Persist and return badge defs newly unlocked for user doc `u`."""
    stats = _badge_stats(u)
    already = set(u.get("badges_unlocked", []))
    newly = [b for b in BADGES if b["id"] not in already and stats[b["type"]] >= b["threshold"]]
    if newly:
        await db.users.update_one({"id": u["id"]},
                                  {"$addToSet": {"badges_unlocked": {"$each": [b["id"] for b in newly]}}})
    return newly


@api.get("/badges")
async def get_badges(user=Depends(current_user)):
    doc = await db.users.find_one({"id": user["id"]})
    await _unlock_badges(doc)  # retroactively unlock based on current stats
    doc = await db.users.find_one({"id": user["id"]})
    unlocked = set(doc.get("badges_unlocked", []))
    stats = _badge_stats(doc)
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


# -------- Weekly family challenges --------
def week_start_key(d: Optional[date] = None) -> str:
    d = d or date.today()
    monday = d - timedelta(days=d.weekday())
    return monday.isoformat()


async def _challenge_progress(ch: dict) -> int:
    start_dt = datetime.fromisoformat(ch["week_start"]).replace(tzinfo=timezone.utc)
    comps = await db.completions.find(
        {"family_id": ch["family_id"], "status": "approved", "created_at": {"$gte": start_dt}},
        {"_id": 0, "points_worth": 1}
    ).to_list(5000)
    if ch.get("metric") == "points":
        return sum(c.get("points_worth", 0) for c in comps)
    return len(comps)


async def _check_challenge_completion(family_id: str):
    ws = week_start_key()
    ch = await db.challenges.find_one({"family_id": family_id, "week_start": ws, "status": "active"})
    if not ch:
        return None
    prog = await _challenge_progress(ch)
    if prog >= ch["target"] and not ch.get("rewarded"):
        await db.challenges.update_one({"id": ch["id"]}, {"$set": {"status": "completed", "rewarded": True, "completed_at": now()}})
        members = await db.users.find({"family_id": family_id, "role": "child"}, {"id": 1, "_id": 0}).to_list(50)
        bonus = ch["bonus_points"]
        for m in members:
            await db.users.update_one({"id": m["id"]}, {"$inc": {"points": bonus, "total_earned": bonus}})
        await send_push([m["id"] for m in members], {
            "title": "Défi familial réussi ! 🎉",
            "message": f"« {ch['title']} » atteint ! +{bonus} points pour chacun !",
        })
        ch["status"] = "completed"
        ch["rewarded"] = True
        ch.pop("_id", None)
        return ch
    return None


@api.get("/challenges")
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


@api.post("/challenges")
async def create_challenge(body: ChallengeCreate, user=Depends(parent_pin)):
    ws = week_start_key()
    existing = await db.challenges.find_one({"family_id": user["family_id"], "week_start": ws, "status": "active"})
    if existing:
        raise HTTPException(409, "Un défi est déjà actif cette semaine")
    ch = {
        "id": new_id(),
        "family_id": user["family_id"],
        "title": body.title,
        "description": body.description,
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
    # In case it's already met by existing completions this week.
    await _check_challenge_completion(user["family_id"])
    return ch


@api.delete("/challenges/{cid}")
async def delete_challenge(cid: str, user=Depends(parent_pin)):
    await db.challenges.delete_one({"id": cid, "family_id": user["family_id"]})
    return {"ok": True}


@api.get("/completions/pending")
async def pending_completions(user=Depends(current_user)):
    comps = await db.completions.find(
        {"family_id": user["family_id"], "status": "pending"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    # add my_vote flag
    for c in comps:
        my = next((v for v in c.get("votes", []) if v["user_id"] == user["id"]), None)
        c["my_vote"] = my["approved"] if my else None
    return {"completions": comps}


@api.post("/completions/{comp_id}/vote")
async def vote_completion(comp_id: str, body: ValidateBody, user=Depends(current_user)):
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

    # Auto-approve if >=1 approve OR resolve if parent votes
    approves = sum(1 for v in votes if v["approved"])
    rejects = sum(1 for v in votes if not v["approved"])
    is_parent = user["role"] == "parent"

    resolved = False
    if is_parent or approves >= 1:
        if approves > rejects or (is_parent and body.approved):
            await db.completions.update_one({"id": comp_id}, {"$set": {"status": "approved"}})
            await _award(comp["user_id"], comp["points_worth"])
            await _check_challenge_completion(user["family_id"])
            await send_push([comp["user_id"]], {
                "title": "Preuve approuvée ✅",
                "message": f"+{comp['points_worth']} points pour « {comp['task_title']} »",
            })
            resolved = True
        elif rejects > approves or (is_parent and not body.approved):
            await db.completions.update_one({"id": comp_id}, {"$set": {"status": "rejected"}})
            await send_push([comp["user_id"]], {
                "title": "Preuve rejetée ❌",
                "message": f"« {comp['task_title']} » : aucun point attribué.",
            })
            resolved = True
    return {"ok": True, "resolved": resolved}


@api.get("/photos/{path:path}")
async def get_photo(path: str, request: Request, token: Optional[str] = None):
    # Reject path traversal / absolute paths outright.
    if ".." in path or path.startswith("/") or "\\" in path:
        raise HTTPException(404, "Photo introuvable")
    # Accept auth via Authorization header (native) OR ?token= query (web <img>).
    raw = None
    if token:
        raw = token
    else:
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            raw = auth[7:]
    if not raw:
        raise HTTPException(401, "Non authentifié")
    try:
        p = jwt.decode(raw, JWT_SECRET, algorithms=[ALGO])
        if p.get("purpose") != "access":
            raise HTTPException(401, "Jeton invalide")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Jeton invalide")
    # Authorize: the photo must belong to a completion in the caller's family.
    fam_id = p.get("family_id")
    owner = await db.completions.find_one({"photo_path": path, "family_id": fam_id}, {"_id": 0, "id": 1})
    if not owner:
        raise HTTPException(404, "Photo introuvable")
    try:
        content, ct = await run_in_threadpool(_get_object_sync, path)
        return Response(content=content, media_type=ct)
    except Exception:
        raise HTTPException(404, "Photo introuvable")


# -------- Rewards --------
@api.get("/rewards")
async def list_rewards(user=Depends(current_user)):
    rewards = await db.rewards.find({"family_id": user["family_id"]}, {"_id": 0}).to_list(200)
    return {"rewards": rewards}


@api.post("/rewards")
async def create_reward(body: RewardCreate, user=Depends(parent_pin)):
    r = {"id": new_id(), "family_id": user["family_id"], **body.model_dump(), "created_at": now()}
    await db.rewards.insert_one(r)
    r.pop("_id", None)
    return r


@api.delete("/rewards/{rid}")
async def del_reward(rid: str, user=Depends(parent_pin)):
    await db.rewards.delete_one({"id": rid, "family_id": user["family_id"]})
    return {"ok": True}


@api.post("/rewards/{rid}/claim")
async def claim_reward(rid: str, user=Depends(current_user)):
    r = await db.rewards.find_one({"id": rid, "family_id": user["family_id"]})
    if not r:
        raise HTTPException(404, "Récompense introuvable")
    if user.get("points", 0) < r["point_cost"]:
        raise HTTPException(400, "Points insuffisants")
    await db.users.update_one({"id": user["id"]}, {"$inc": {"points": -r["point_cost"]}})
    claim = {
        "id": new_id(), "family_id": user["family_id"], "reward_id": rid,
        "reward_title": r["title"], "cost": r["point_cost"],
        "user_id": user["id"], "user_name": user["name"],
        "status": "pending", "created_at": now(),
    }
    await db.claims.insert_one(claim)
    # notify parents
    parents = await db.users.find({"family_id": user["family_id"], "role": "parent"}, {"id": 1, "_id": 0}).to_list(10)
    await send_push([p["id"] for p in parents], {
        "title": "Récompense demandée 🎁",
        "message": f"{user['name']} veut « {r['title']} » (-{r['point_cost']} pts)",
    })
    claim.pop("_id", None)
    return claim


@api.get("/claims")
async def list_claims(user=Depends(current_user)):
    claims = await db.claims.find({"family_id": user["family_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"claims": claims}


# -------- Calendar --------
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
                out.append({**e, "start_time": occ.isoformat(),
                            "occ_id": f"{e['id']}:{occ.isoformat()}", "is_occurrence": True})
            occ = occ + step
            guard += 1
    out.sort(key=lambda x: x["start_time"])
    return out


@api.get("/events")
async def list_events(user=Depends(current_user)):
    events = await db.events.find({"family_id": user["family_id"]}, {"_id": 0}).sort("start_time", 1).to_list(500)
    return {"events": _expand_events(events)}


@api.post("/events")
async def create_event(body: EventCreate, user=Depends(current_user)):
    e = {"id": new_id(), "family_id": user["family_id"], **body.model_dump(),
         "created_by": user["id"], "created_at": now()}
    await db.events.insert_one(e)
    # notify family
    fam = await db.users.find({"family_id": user["family_id"]}, {"id": 1, "_id": 0}).to_list(50)
    others = [u["id"] for u in fam if u["id"] != user["id"]]
    label = body.title + (" (chaque semaine)" if body.recurrence == "weekly" else "")
    await send_push(others, {"title": "Nouvel événement 📅", "message": label})
    e.pop("_id", None)
    return e


@api.delete("/events/{eid}")
async def del_event(eid: str, user=Depends(current_user)):
    await db.events.delete_one({"id": eid, "family_id": user["family_id"]})
    return {"ok": True}


@api.patch("/events/{eid}")
async def update_event(eid: str, body: EventUpdate, user=Depends(current_user)):
    if user["role"] != "parent":
        raise HTTPException(403, "Seul un parent peut modifier un événement")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return {"ok": True}
    res = await db.events.update_one({"id": eid, "family_id": user["family_id"]}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Événement introuvable")
    return {"ok": True}


# -------- Shopping list --------
@api.get("/shopping")
async def list_shopping(user=Depends(current_user)):
    items = await db.shopping.find({"family_id": user["family_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"items": items}


@api.post("/shopping")
async def add_shopping(body: ShoppingCreate, user=Depends(current_user)):
    it = {"id": new_id(), "family_id": user["family_id"], "item_name": body.item_name,
          "is_bought": False, "added_by": user["id"], "added_by_name": user["name"], "created_at": now()}
    await db.shopping.insert_one(it)
    it.pop("_id", None)
    return it


@api.patch("/shopping/{iid}")
async def toggle_shopping(iid: str, user=Depends(current_user)):
    it = await db.shopping.find_one({"id": iid, "family_id": user["family_id"]})
    if not it:
        raise HTTPException(404, "Introuvable")
    await db.shopping.update_one({"id": iid}, {"$set": {"is_bought": not it.get("is_bought", False)}})
    return {"ok": True}


@api.delete("/shopping/{iid}")
async def del_shopping(iid: str, user=Depends(current_user)):
    await db.shopping.delete_one({"id": iid, "family_id": user["family_id"]})
    return {"ok": True}


# -------- Penalties --------
@api.get("/penalties")
async def penalties(user=Depends(current_user)):
    logs = await db.penalties.find({"family_id": user["family_id"]}, {"_id": 0}).sort("timestamp", -1).to_list(100)
    return {"penalties": logs}


async def apply_daily_penalties(only_family_id: Optional[str] = None):
    """Runs at 20:00 daily: check incomplete daily tasks and apply penalty.
    Idempotent per (user, task, day). Optionally scoped to a single family."""
    log.info("Running daily penalty check")
    today_key = date.today().isoformat()
    fam_query = {"id": only_family_id} if only_family_id else {}
    families = await db.families.find(fam_query, {"_id": 0}).to_list(500)
    for fam in families:
        tasks = await db.tasks.find({"family_id": fam["id"], "frequency": "daily", "active": True}, {"_id": 0}).to_list(200)
        users = await db.users.find({"family_id": fam["id"], "role": "child"}, {"_id": 0, "password_hash": 0, "pin_hash": 0}).to_list(50)
        # Batch-load today's completions for the whole family once (avoid N+1).
        comps = await db.completions.find({"family_id": fam["id"], "day": today_key}, {"_id": 0, "task_id": 1, "user_id": 1, "status": 1}).to_list(5000)
        done = {(c["task_id"], c["user_id"]): c["status"] for c in comps}
        # Batch-load penalties already applied today to stay idempotent.
        existing_pen = await db.penalties.find({"family_id": fam["id"], "day": today_key}, {"_id": 0, "task_id": 1, "user_id": 1}).to_list(5000)
        penalized = {(pn["task_id"], pn["user_id"]) for pn in existing_pen}
        for u in users:
            for t in tasks:
                if t["assigned_to"] and u["id"] not in t["assigned_to"]:
                    continue
                status = done.get((t["id"], u["id"]))
                if status in ("pending", "approved"):
                    continue
                if (t["id"], u["id"]) in penalized:
                    continue  # already penalized today
                # apply penalty
                pts = t.get("penalty_points", 50)
                await db.users.update_one({"id": u["id"]}, {"$inc": {"points": -pts}, "$set": {"streak": 0, "last_streak_date": None}})
                await db.penalties.insert_one({
                    "id": new_id(), "family_id": fam["id"], "user_id": u["id"], "user_name": u["name"],
                    "task_id": t["id"], "task_title": t["title"], "points_deducted": pts,
                    "day": today_key, "timestamp": now(),
                })
                penalized.add((t["id"], u["id"]))
                await send_push([u["id"]], {
                    "title": "Pénalité appliquée ⚠️",
                    "message": f"-{pts} pts pour « {t['title'] }» non fait",
                })


async def send_evening_reminders():
    """Runs at 19:00: warn users with unfinished tasks."""
    log.info("Sending 19:00 reminders")
    today_key = date.today().isoformat()
    families = await db.families.find({}, {"_id": 0}).to_list(500)
    for fam in families:
        tasks = await db.tasks.find({"family_id": fam["id"], "frequency": "daily", "active": True}, {"_id": 0}).to_list(200)
        users = await db.users.find({"family_id": fam["id"], "role": "child"}, {"_id": 0}).to_list(50)
        comps = await db.completions.find({"family_id": fam["id"], "day": today_key}, {"_id": 0, "task_id": 1, "user_id": 1}).to_list(5000)
        submitted = {(c["task_id"], c["user_id"]) for c in comps}
        for u in users:
            missing = []
            for t in tasks:
                if t["assigned_to"] and u["id"] not in t["assigned_to"]:
                    continue
                if (t["id"], u["id"]) not in submitted:
                    missing.append(t["title"])
            if missing:
                await send_push([u["id"]], {
                    "title": "Il te reste 1h ! ⏰",
                    "message": f"{len(missing)} tâche(s) à finir avant 20h : {', '.join(missing[:3])}",
                })


@api.post("/dev/run-penalties")
async def dev_run_penalties(user=Depends(parent_pin)):
    """Manual trigger — parent + PIN only, scoped to the caller's own family."""
    await apply_daily_penalties(only_family_id=user["family_id"])
    return {"ok": True}


# -------- Seed demo --------
@api.post("/dev/seed-demo")
async def seed_demo_route(request: Request):
    if request.headers.get("X-Admin-Key") != JWT_SECRET:
        raise HTTPException(403, "Interdit")
    return await _seed_demo()


async def _seed_demo():
    """Create a demo French family. Idempotent-ish: skips if already exists."""
    existing = await db.users.find_one({"email": "papa@demo.fr"})
    if existing:
        return {"ok": True, "message": "Déjà initialisé", "family_id": existing["family_id"]}

    fam_id = new_id()
    await db.families.insert_one({"id": fam_id, "name": "Famille Dupont", "created_at": now()})

    users_to_create = [
        {"email": "papa@demo.fr", "name": "Papa", "role": "parent", "pin": "1234", "avatar": "🦸"},
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
        await db.rewards.insert_one({"id": new_id(), "family_id": fam_id, "description": "",
                                     "created_at": now(), **r})

    events = [
        {"title": "Rendez-vous dentiste", "start_time": (now() + timedelta(days=2)).isoformat(), "color": "#FF9600"},
        {"title": "Anniversaire de Mamie", "start_time": (now() + timedelta(days=5)).isoformat(), "color": "#FFC800"},
        {"title": "Sortie piscine", "start_time": (now() + timedelta(days=1)).isoformat(), "color": "#58CC02"},
    ]
    for e in events:
        await db.events.insert_one({"id": new_id(), "family_id": fam_id, "description": "",
                                    "assigned_users": [], "created_by": ids["papa@demo.fr"],
                                    "created_at": now(), "end_time": None, **e})

    shopping = ["Lait", "Pain", "Pommes", "Yaourts", "Pâtes"]
    for s in shopping:
        await db.shopping.insert_one({"id": new_id(), "family_id": fam_id, "item_name": s,
                                      "is_bought": False, "added_by": ids["papa@demo.fr"],
                                      "added_by_name": "Papa", "created_at": now()})

    await db.challenges.insert_one({
        "id": new_id(), "family_id": fam_id,
        "title": "Semaine au top", "description": "Terminez 15 tâches en famille cette semaine !",
        "metric": "tasks", "target": 15, "bonus_points": 50,
        "week_start": week_start_key(), "status": "active", "rewarded": False,
        "created_by": ids["papa@demo.fr"], "created_at": now(), "completed_at": None,
    })

    return {"ok": True, "family_id": fam_id, "credentials": [
        {"role": "parent", "email": "papa@demo.fr", "password": "demo1234", "pin": "1234"},
        {"role": "child", "email": "lea@demo.fr", "password": "demo1234"},
        {"role": "child", "email": "hugo@demo.fr", "password": "demo1234"},
        {"role": "child", "email": "emma@demo.fr", "password": "demo1234"},
    ]}


@api.get("/")
async def root():
    return {"app": "TâcheHéros", "ok": True}


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

# Scheduler
scheduler = AsyncIOScheduler(timezone="Europe/Paris")


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("family_id")
    await db.tasks.create_index("family_id")
    await db.completions.create_index([("task_id", 1), ("user_id", 1), ("day", 1)])
    scheduler.add_job(send_evening_reminders, "cron", hour=19, minute=0)
    scheduler.add_job(apply_daily_penalties, "cron", hour=20, minute=0)
    scheduler.start()
    # auto-seed demo
    try:
        await _seed_demo()
    except Exception as e:
        log.warning(f"seed err: {e}")


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown(wait=False)
    client.close()
    await _push_client.aclose()
