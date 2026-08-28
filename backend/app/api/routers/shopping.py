"""Shared Family Shopping List Router."""
import logging
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from app.db.mongo import db
from app.core.security import new_id, now, current_user

log = logging.getLogger("tribuquest.shopping")
router = APIRouter(prefix="/shopping", tags=["shopping"])


class ShoppingCreate(BaseModel):
    item_name: str


@router.get("")
async def list_shopping(user=Depends(current_user)):
    items = await db.shopping.find(
        {"family_id": user["family_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return {"items": items}


@router.post("")
async def add_shopping(body: ShoppingCreate, user=Depends(current_user)):
    it = {
        "id": new_id(),
        "family_id": user["family_id"],
        "item_name": body.item_name.strip(),
        "is_bought": False,
        "added_by": user["id"],
        "added_by_name": user["name"],
        "created_at": now()
    }
    await db.shopping.insert_one(it)
    it.pop("_id", None)
    return it


@router.patch("/{iid}")
async def toggle_shopping(iid: str, user=Depends(current_user)):
    it = await db.shopping.find_one({"id": iid, "family_id": user["family_id"]})
    if not it:
        raise HTTPException(404, "Article introuvable")
    await db.shopping.update_one({"id": iid}, {"$set": {"is_bought": not it.get("is_bought", False)}})
    return {"ok": True}


@router.delete("/{iid}")
async def del_shopping(iid: str, user=Depends(current_user)):
    await db.shopping.delete_one({"id": iid, "family_id": user["family_id"]})
    return {"ok": True}
