import asyncio
from app.db.mongo import db


async def check():
    count = await db.users.count_documents({})
    print(f"Total users: {count}")
    users = await db.users.find({}, {"_id": 0, "email": 1, "name": 1, "role": 1, "pin_hash": 1}).to_list(20)
    for u in users:
        has_pin = "OUI" if u.get("pin_hash") else "non"
        print(f"  {u.get('email')} | {u.get('name')} | {u.get('role')} | pin_hash: {has_pin}")


if __name__ == "__main__":
    asyncio.run(check())
