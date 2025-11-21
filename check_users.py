import asyncio
from pixsim7.backend.main.infrastructure.database.session import init_database, get_async_session
from pixsim7.backend.main.domain.user import User
from sqlmodel import select

async def check_users():
    await init_database()
    async with get_async_session() as session:
        result = await session.execute(select(User))
        users = result.scalars().all()
        print(f'Found {len(users)} users:')
        for u in users:
            print(f'  - {u.email} (role: {u.role})')

asyncio.run(check_users())
