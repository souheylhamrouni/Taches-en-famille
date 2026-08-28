"""Photo serving and access control router."""
import logging
from typing import Optional
import jwt
from fastapi import APIRouter, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool
from app.db.mongo import db
from app.core.config import settings
from app.services.storage import storage_provider

log = logging.getLogger("tribuquest.photos")
router = APIRouter(prefix="/photos", tags=["photos"])


@router.get("/{path:path}")
async def get_photo(path: str, request: Request, token: Optional[str] = None):
    # Reject path traversal or leading slashes outright
    if ".." in path or path.startswith("/") or "\\" in path:
        raise HTTPException(404, "Photo introuvable")

    # Accept auth via Authorization header (native) OR ?token= query (web <img>)
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
        payload = jwt.decode(raw, settings.JWT_SECRET, algorithms=[settings.ALGO])
        if payload.get("purpose") != "access":
            raise HTTPException(401, "Jeton invalide")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Jeton invalide")

    # Authorize: photo must belong to a completion in caller's family
    fam_id = payload.get("family_id")
    owner = await db.completions.find_one({"photo_path": path, "family_id": fam_id}, {"_id": 0, "id": 1})
    if not owner:
        raise HTTPException(404, "Photo introuvable")

    try:
        content, ct = await run_in_threadpool(storage_provider.get_object, path)
        return Response(content=content, media_type=ct)
    except Exception:
        raise HTTPException(404, "Photo introuvable")
