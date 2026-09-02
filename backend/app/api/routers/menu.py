"""Weekly menu management router."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from app.db.mongo import db
from app.core.security import current_user, parent_pin, new_id, now
from app.models.menu import MenuEntryCreate, MenuEntryPatch

log = logging.getLogger("tribuquest.menu")
router = APIRouter(tags=["menu"])


@router.get("/menu")
async def get_menu(user=Depends(current_user)):
    entries = await db.menu.find(
        {"family_id": user["family_id"]},
        {"_id": 0}
    ).to_list(500)
    return {"menu": entries}


@router.post("/menu")
async def add_menu_entry(body: MenuEntryCreate, user=Depends(parent_pin)):
    existing = await db.menu.find_one({
        "family_id": user["family_id"],
        "day_of_week": body.day_of_week,
        "meal_type": body.meal_type,
    })
    if existing:
        await db.menu.update_one(
            {"family_id": user["family_id"], "day_of_week": body.day_of_week, "meal_type": body.meal_type},
            {"$set": {"title": body.title, "notes": body.notes or ""}}
        )
        return {"ok": True, "action": "updated"}
    entry = {
        "id": new_id(),
        "family_id": user["family_id"],
        "day_of_week": body.day_of_week,
        "meal_type": body.meal_type,
        "title": body.title,
        "notes": body.notes or "",
        "created_at": now(),
    }
    await db.menu.insert_one(entry)
    return {"ok": True, "action": "created"}


@router.put("/menu/{entry_id}")
async def update_menu_entry(entry_id: str, body: MenuEntryPatch, user=Depends(parent_pin)):
    updates = {}
    if body.title is not None:
        updates["title"] = body.title
    if body.notes is not None:
        updates["notes"] = body.notes
    if not updates:
        return {"ok": True}
    result = await db.menu.update_one(
        {"id": entry_id, "family_id": user["family_id"]},
        {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Entrée de menu introuvable")
    return {"ok": True}


@router.delete("/menu/{entry_id}")
async def delete_menu_entry(entry_id: str, user=Depends(parent_pin)):
    result = await db.menu.delete_one({"id": entry_id, "family_id": user["family_id"]})
    if result.deleted_count == 0:
        raise HTTPException(404, "Entrée de menu introuvable")
    return {"ok": True}



