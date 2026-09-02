"""TribuQuest - Security, Password Hashing & Authentication Dependencies."""
import uuid
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from pwdlib import PasswordHash
from app.core.config import settings
from app.db.mongo import db

log = logging.getLogger("tribuquest.security")
passwords = PasswordHash.recommended()
DUMMY = passwords.hash("not-a-real-password-security-dummy")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.replace(tzinfo=timezone.utc).isoformat() if dt.tzinfo is None else dt.isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def make_token(user: dict, minutes: int = None, purpose: str = "access") -> str:
    if minutes is None:
        minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES if purpose == "access" else settings.PARENT_PIN_EXPIRE_MINUTES
    return jwt.encode({
        "sub": user["id"],
        "role": user.get("role", "child"),
        "family_id": user.get("family_id"),
        "purpose": purpose,
        "jti": secrets.token_urlsafe(8),
        "iat": now(),
        "exp": now() + timedelta(minutes=minutes)
    }, settings.JWT_SECRET, algorithm=settings.ALGO)


async def current_user(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    if not token:
        raise HTTPException(401, "Non authentifié")
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.ALGO])
        if payload.get("purpose") != "access":
            raise HTTPException(401, "Jeton invalide")
        user = await db.users.find_one(
            {"id": payload["sub"]},
            {"_id": 0, "password_hash": 0, "pin_hash": 0}
        )
        if not user:
            raise HTTPException(401, "Utilisateur introuvable")
        if user.get("active") is False:
            raise HTTPException(403, "Compte désactivé")
        return user
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Jeton invalide")


async def parent_pin(request: Request, user: dict = Depends(current_user)) -> dict:
    if user.get("role") != "parent":
        raise HTTPException(403, "Rôle parent requis")
    tok = request.headers.get("X-Parent-Pin-Token")
    if not tok:
        raise HTTPException(403, "PIN parent requis")
    try:
        payload = jwt.decode(tok, settings.JWT_SECRET, algorithms=[settings.ALGO])
        if payload.get("purpose") != "parent_pin" or payload.get("sub") != user["id"]:
            raise HTTPException(403, "PIN parent invalide")
    except jwt.InvalidTokenError:
        raise HTTPException(403, "PIN parent invalide")
    return user
