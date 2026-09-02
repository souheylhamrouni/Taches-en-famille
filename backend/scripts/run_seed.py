import asyncio
from app.db.seed import seed_demo
from app.db.mongo import db


async def main():
    result = await seed_demo()
    print("Seed result:")
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
