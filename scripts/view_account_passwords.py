"""
View account passwords from database

Usage:
    python scripts/view_account_passwords.py --username sakenfor
    python scripts/view_account_passwords.py --username sakenfor --provider pixverse
    python scripts/view_account_passwords.py --email someuser@example.com
"""
import sys
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

import asyncio
import argparse
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlmodel import select

from pixsim7.backend.main.domain import ProviderAccount, User

# Database URL
DB_URL = "postgresql+asyncpg://pixsim7:pixsim7_secure_2024@localhost:5433/pixsim7"


async def main():
    parser = argparse.ArgumentParser(description='View account passwords')
    parser.add_argument('--username', help='Filter by username')
    parser.add_argument('--provider', help='Filter by provider (e.g., pixverse)')
    parser.add_argument('--email', help='Filter by email')
    args = parser.parse_args()
    
    engine = create_async_engine(DB_URL, echo=False)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    try:
        async with AsyncSessionLocal() as session:
            # Build query
            query = select(ProviderAccount)
            
            # Filter by username
            if args.username:
                user_result = await session.execute(
                    select(User).where(User.username == args.username)
                )
                user = user_result.scalar_one_or_none()
                if not user:
                    print(f"❌ User '{args.username}' not found")
                    return
                query = query.where(ProviderAccount.user_id == user.id)
            
            # Filter by provider
            if args.provider:
                query = query.where(ProviderAccount.provider_id == args.provider)
            
            # Filter by email
            if args.email:
                query = query.where(ProviderAccount.email == args.email)
            
            query = query.order_by(ProviderAccount.provider_id, ProviderAccount.email)
            
            result = await session.execute(query)
            accounts = result.scalars().all()
            
            if not accounts:
                print("No accounts found with the specified filters")
                return
            
            print(f"\n📋 Found {len(accounts)} account(s)")
            print("=" * 80)
            
            for i, acc in enumerate(accounts, 1):
                print(f"\n#{i} [{acc.provider_id}] {acc.email}")
                print(f"   Status: {acc.status}")
                print(f"   Nickname: {acc.nickname or 'N/A'}")
                print(f"   Password: {acc.password or 'N/A'}")
                print(f"   JWT Token: {'Yes' if acc.jwt_token else 'No'}")
                print(f"   API Key: {'Yes' if acc.api_key else 'No'}")
                has_openapi = any(
                    isinstance(entry, dict)
                    and entry.get("kind") == "openapi"
                    and entry.get("value")
                    for entry in (getattr(acc, "api_keys", None) or [])
                )
                print(f"   API Key (Paid/OpenAPI): {'Yes' if has_openapi else 'No'}")
                print(f"   Cookies: {'Yes' if acc.cookies else 'No'}")
                print(f"   Videos Generated: {acc.total_videos_generated}")
                print(f"   Success Rate: {acc.success_rate:.1%}")
            
            print("\n" + "=" * 80)
    
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
