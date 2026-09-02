"""Authentication and User Account Router."""
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from app.db.mongo import db
from app.core.security import passwords, DUMMY, new_id, now, make_token, current_user
from app.core.rate_limiter import pin_limiter, auth_limiter
from app.models.user import (
    UserRegister, UserLogin, PinVerify, PinChange, ProfileUpdate,
    PasswordUpdate, ForgotPasswordRequest, ResetPasswordRequest
)

log = logging.getLogger("tribuquest.auth")
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register(body: UserRegister):
    email = body.email.lower().strip()
    auth_limiter.check(f"register_{email}", max_attempts=15, window_seconds=60)
    
    if body.role == "parent":
        if not body.pin or len(body.pin) != 6 or not body.pin.isdigit():
            raise HTTPException(400, "Le code PIN de 6 chiffres est obligatoire pour les parents")

    existing = await db.users.find_one({"email": email})
    if existing:
        auth_limiter.record_failure(f"register_{email}")
        raise HTTPException(409, "Cet email est déjà utilisé")

    fam_id = body.family_id
    if not fam_id:
        fam_id = new_id()
        await db.families.insert_one({
            "id": fam_id,
            "name": body.family_name or "Famille",
            "created_at": now()
        })
    else:
        fam = await db.families.find_one({"id": fam_id})
        if not fam:
            raise HTTPException(404, "Famille introuvable avec cet identifiant")

    user_id = new_id()
    doc = {
        "id": user_id,
        "email": email,
        "name": (body.name or "Utilisateur").strip(),
        "role": body.role,
        "family_id": fam_id,
        "avatar": body.avatar or ("🦸" if body.role == "parent" else "🐻"),
        "password_hash": passwords.hash(body.password),
        "points": 0,
        "streak": 0,
        "total_earned": 0,
        "tasks_completed": 0,
        "badges_unlocked": [],
        "created_at": now(),
    }
    if body.role == "parent" and body.pin:
        doc["pin_hash"] = passwords.hash(body.pin)

    await db.users.insert_one(doc)
    doc.pop("password_hash", None)
    doc.pop("pin_hash", None)
    doc.pop("_id", None)
    
    token = make_token(doc)
    return {"access_token": token, "user": doc, "family_id": fam_id}


@router.post("/login")
async def login(body: UserLogin):
    email = body.email.lower().strip()
    auth_limiter.check(f"login_{email}", max_attempts=8, window_seconds=60, lockout_seconds=180)
    
    user = await db.users.find_one({"email": email})
    if not user or not passwords.verify(body.password, user.get("password_hash") or DUMMY):
        auth_limiter.record_failure(f"login_{email}")
        raise HTTPException(401, "Email ou mot de passe incorrect")
    
    auth_limiter.reset(f"login_{email}")
    user.pop("password_hash", None)
    user.pop("pin_hash", None)
    user.pop("_id", None)
    token = make_token(user)
    return {"access_token": token, "user": user}


@router.get("/me")
async def me(user=Depends(current_user)):
    return user


@router.delete("/account")
async def delete_account(request: Request, user=Depends(current_user)):
    """Permanent account deletion with cascade if last family member."""
    try:
        data = await request.json()
    except Exception:
        data = {}
    
    pwd = data.get("password")
    if not pwd:
        raise HTTPException(400, "Mot de passe requis pour supprimer le compte")
    
    db_u = await db.users.find_one({"id": user["id"]})
    if not db_u or not passwords.verify(pwd, db_u.get("password_hash") or DUMMY):
        raise HTTPException(401, "Mot de passe incorrect")
    
    fam_id = user.get("family_id")
    await db.users.delete_one({"id": user["id"]})
    
    remaining = await db.users.count_documents({"family_id": fam_id})
    if remaining == 0:
        await db.families.delete_one({"id": fam_id})
        await db.tasks.delete_many({"family_id": fam_id})
        await db.completions.delete_many({"family_id": fam_id})
        await db.rewards.delete_many({"family_id": fam_id})
        await db.claims.delete_many({"family_id": fam_id})
        await db.events.delete_many({"family_id": fam_id})
        await db.shopping.delete_many({"family_id": fam_id})
        await db.penalties.delete_many({"family_id": fam_id})
        await db.pauses.delete_many({"family_id": fam_id})
        await db.challenges.delete_many({"family_id": fam_id})
    
    return {"ok": True, "deleted_user_id": user["id"], "family_deleted": remaining == 0}


@router.post("/pin/verify")
async def verify_pin(body: PinVerify, user=Depends(current_user)):
    if user.get("role") != "parent":
        raise HTTPException(403, "Rôle parent requis")
    
    limiter_key = f"pin_{user['id']}"
    pin_limiter.check(limiter_key, max_attempts=5, window_seconds=60, lockout_seconds=300)
    
    db_u = await db.users.find_one({"id": user["id"]})
    stored_hash = db_u.get("pin_hash") if db_u else None
    if not stored_hash or not passwords.verify(body.pin, stored_hash):
        pin_limiter.record_failure(limiter_key)
        raise HTTPException(401, "Code PIN incorrect")
    
    pin_limiter.reset(limiter_key)
    pin_token = make_token(user, minutes=15, purpose="parent_pin")
    return {"pin_token": pin_token, "expires_in_minutes": 15}


@router.patch("/pin")
async def change_pin(body: PinChange, user=Depends(current_user)):
    if user.get("role") != "parent":
        raise HTTPException(403, "Rôle parent requis")
    
    limiter_key = f"pin_{user['id']}"
    pin_limiter.check(limiter_key, max_attempts=5, window_seconds=60, lockout_seconds=300)
    
    db_u = await db.users.find_one({"id": user["id"]})
    stored_hash = db_u.get("pin_hash") if db_u else None
    if not stored_hash or not passwords.verify(body.current_pin, stored_hash):
        pin_limiter.record_failure(limiter_key)
        raise HTTPException(401, "Code PIN actuel incorrect")
    
    pin_limiter.reset(limiter_key)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"pin_hash": passwords.hash(body.new_pin)}}
    )
    return {"ok": True}


@router.patch("/profile")
async def update_profile(body: ProfileUpdate, user=Depends(current_user)):
    updates = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.avatar is not None:
        updates["avatar"] = body.avatar
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    return await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0, "pin_hash": 0})


@router.patch("/password")
async def update_password(body: PasswordUpdate, user=Depends(current_user)):
    db_u = await db.users.find_one({"id": user["id"]})
    if not db_u or not passwords.verify(body.current_password, db_u.get("password_hash") or DUMMY):
        raise HTTPException(401, "Mot de passe actuel incorrect")
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": passwords.hash(body.new_password)}}
    )
    return {"ok": True}


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if user:
        code = f"{secrets.randbelow(1000000):06d}"
        await db.users.update_one({"id": user["id"]}, {"$set": {
            "reset_code_hash": passwords.hash(code),
            "reset_expires": (now() + timedelta(minutes=15)).isoformat(),
        }})
    return {"ok": True, "message": "Si l'adresse existe, un email a été envoyé."}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest):
    email = (body.email or "").lower().strip()
    user = None
    if email:
        user = await db.users.find_one({"email": email})
    elif body.token:
        user = await db.users.find_one({"reset_token": body.token})
        
    if not user:
        raise HTTPException(400, "Utilisateur introuvable ou jeton invalide")
        
    if body.code:
        if not user.get("reset_code_hash"):
            raise HTTPException(400, "Code invalide ou expiré")
        exp = user.get("reset_expires")
        if not exp or datetime.fromisoformat(exp) < now():
            raise HTTPException(400, "Code expiré")
        if not passwords.verify(body.code, user["reset_code_hash"]):
            raise HTTPException(400, "Code incorrect")
            
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {"password_hash": passwords.hash(body.new_password)},
            "$unset": {"reset_code_hash": "", "reset_expires": "", "reset_token": ""}
        }
    )
    return {"ok": True, "message": "Mot de passe mis à jour avec succès"}
