"""Migration: update demo parent PIN to 123456 (was 1234)."""
import asyncio
from app.db.mongo import db
from app.core.security import passwords


async def fix_demo_pin():
    user = await db.users.find_one({"email": "papa@demo.fr"})
    if not user:
        print("papa@demo.fr non trouve")
        return
    new_hash = passwords.hash("123456")
    await db.users.update_one(
        {"email": "papa@demo.fr"},
        {"$set": {"pin_hash": new_hash}}
    )
    print(f"PIN mis a jour pour papa@demo.fr (id: {user['id']})")


if __name__ == "__main__":
    asyncio.run(fix_demo_pin())
