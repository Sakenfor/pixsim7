import asyncio
import sys
sys.path.append('G:/code/pixsim7')

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from pixsim7_backend.domain import User
from pixsim7_backend.shared.auth import verify_password

async def test_db_login():
    # Connect to database
    DATABASE_URL = "postgresql+asyncpg://pixsim:pixsim123@localhost:5434/pixsim7"
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Query user
        result = await session.execute(
            select(User).where(User.email == "stst1616@gmail.com")
        )
        user = result.scalar_one_or_none()

        if not user:
            print("User not found!")
            return

        print(f"User found: {user.email}")
        print(f"Password hash from DB: {user.password_hash}")
        print(f"Password hash type: {type(user.password_hash)}")
        print(f"Password hash length: {len(user.password_hash)}")

        # Test verification
        plain_password = "amanitamuscaria"
        print(f"\nTesting with password: {plain_password}")

        try:
            result = await verify_password(plain_password, user.password_hash)
            print(f"Verification result: {result}")
        except Exception as e:
            print(f"Error during verification: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_db_login())
