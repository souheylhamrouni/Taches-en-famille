import asyncio
from app.db.mongo import db
from app.core.security import passwords


async def check():
    user = await db.users.find_one({"email": "papa@demo.fr"}, {"_id": 0, "email": 1, "name": 1, "pin_hash": 1})
    if not user:
        print("papa@demo.fr INTROUVABLE")
        return
    print(f"User: {user.get('email')} - {user.get('name')}")
    print(f"pin_hash present: {bool(user.get('pin_hash'))}")
    # Test the hash against 123456
    if user.get("pin_hash"):
        if passwords.verify("123456", user["pin_hash"]):
            print("VERIFY 123456: OK")
        else:
            print("VERIFY 123456: FAIL")
        if passwords.verify("1234", user["pin_hash"]):
            print("VERIFY 1234: OK")
        else:
            print("VERIFY 1234: FAIL")


if __name__ == "__main__":
    asyncio.run(check())
