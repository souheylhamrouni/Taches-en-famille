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

class ShoppingCreate(BaseModel):
    item_name: str

class ValidateBody(BaseModel):
    approved: bool

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
async def register_push(body: SetPushToken):
    await db.users.update_one({"id": body.user_id}, {"$set": {"push_token": body.device_token, "platform": body.platform}})
    try:
        r = await _push_client.post("/api/v1/push/users/register", json=body.model_dump())
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
    if comp["status"] == "approved":
        await _award(user["id"], task["points_worth"])
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
    return comp


async def _award(user_id: str, pts: int):
    u = await db.users.find_one({"id": user_id})
    if not u:
        return
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
        "$inc": {"points": pts},
        "$set": {"streak": streak, "last_streak_date": today_key},
    })


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
@api.get("/events")
async def list_events(user=Depends(current_user)):
    events = await db.events.find({"family_id": user["family_id"]}, {"_id": 0}).sort("start_time", 1).to_list(500)
    return {"events": events}


@api.post("/events")
async def create_event(body: EventCreate, user=Depends(current_user)):
    e = {"id": new_id(), "family_id": user["family_id"], **body.model_dump(),
         "created_by": user["id"], "created_at": now()}
    await db.events.insert_one(e)
    # notify family
    fam = await db.users.find({"family_id": user["family_id"]}, {"id": 1, "_id": 0}).to_list(50)
    others = [u["id"] for u in fam if u["id"] != user["id"]]
    await send_push(others, {"title": "Nouvel événement 📅", "message": body.title})
    e.pop("_id", None)
    return e


@api.delete("/events/{eid}")
async def del_event(eid: str, user=Depends(current_user)):
    await db.events.delete_one({"id": eid, "family_id": user["family_id"]})
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


async def apply_daily_penalties():
    """Runs at 20:00 daily: check incomplete daily tasks and apply penalty."""
    log.info("Running daily penalty check")
    today_key = date.today().isoformat()
    families = await db.families.find({}, {"_id": 0}).to_list(500)
    for fam in families:
        tasks = await db.tasks.find({"family_id": fam["id"], "frequency": "daily", "active": True}, {"_id": 0}).to_list(200)
        users = await db.users.find({"family_id": fam["id"], "role": "child"}, {"_id": 0, "password_hash": 0, "pin_hash": 0}).to_list(50)
        for u in users:
            for t in tasks:
                if t["assigned_to"] and u["id"] not in t["assigned_to"]:
                    continue
                comp = await db.completions.find_one({"task_id": t["id"], "user_id": u["id"], "day": today_key})
                if comp and comp["status"] in ("pending", "approved"):
                    continue
                # apply penalty
                pts = t.get("penalty_points", 50)
                await db.users.update_one({"id": u["id"]}, {"$inc": {"points": -pts}, "$set": {"streak": 0, "last_streak_date": None}})
                await db.penalties.insert_one({
                    "id": new_id(), "family_id": fam["id"], "user_id": u["id"], "user_name": u["name"],
                    "task_id": t["id"], "task_title": t["title"], "points_deducted": pts,
                    "timestamp": now(),
                })
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
        for u in users:
            missing = []
            for t in tasks:
                if t["assigned_to"] and u["id"] not in t["assigned_to"]:
                    continue
                comp = await db.completions.find_one({"task_id": t["id"], "user_id": u["id"], "day": today_key})
                if not comp:
                    missing.append(t["title"])
            if missing:
                await send_push([u["id"]], {
                    "title": "Il te reste 1h ! ⏰",
                    "message": f"{len(missing)} tâche(s) à finir avant 20h : {', '.join(missing[:3])}",
                })


@api.post("/dev/run-penalties")
async def dev_run_penalties(user=Depends(current_user)):
    """Manual trigger for testing."""
    await apply_daily_penalties()
    return {"ok": True}


# -------- Seed demo --------
@api.post("/dev/seed-demo")
async def seed_demo():
    """Create a demo French family. Idempotent-ish: skips if already exists."""
    existing = await db.users.find_one({"email": "papa@demo.fr"})
    if existing:
        return {"ok": True, "message": "Déjà initialisé", "family_id": existing["family_id"]}

    fam_id = new_id()
    await db.families.insert_one({"id": fam_id, "name": "Famille Dupont", "created_at": now()})

    users_to_create = [
        {"email": "papa@demo.fr", "name": "Papa", "role": "parent", "pin": "1234", "avatar": "🦸"},
        {"email": "lea@demo.fr", "name": "Léa", "role": "child", "avatar": "🐻", "points": 320, "streak": 5},
        {"email": "hugo@demo.fr", "name": "Hugo", "role": "child", "avatar": "🦊", "points": 210, "streak": 3},
        {"email": "emma@demo.fr", "name": "Emma", "role": "child", "avatar": "🐼", "points": 150, "streak": 2},
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
        await seed_demo()
    except Exception as e:
        log.warning(f"seed err: {e}")


@app.on_event("shutdown")
async def shutdown():
    scheduler.shutdown(wait=False)
    client.close()
    await _push_client.aclose()
