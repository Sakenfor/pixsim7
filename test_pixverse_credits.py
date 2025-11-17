"""
Test script to verify credit fetching with pixverse-py for holyfruit12 account
"""
import sys
import os

# Add pixsim7 to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pixverse import Account
from pixverse.api.client import PixverseAPI
from pixsim7_backend.infrastructure.database.session import get_async_session
from pixsim7_backend.domain import ProviderAccount
from sqlalchemy import select
import asyncio


async def test_holyfruit12_credits():
    """Test fetching credits for holyfruit12 account"""

    print("=" * 60)
    print("Testing Pixverse Credit Refresh for holyfruit12")
    print("=" * 60)

    # Get account from database
    async with get_async_session() as db:
        result = await db.execute(
            select(ProviderAccount).where(
                ProviderAccount.email == "holyfruit12@hotmail.com",
                ProviderAccount.provider_id == "pixverse"
            )
        )
        account = result.scalar_one_or_none()

        if not account:
            print("[ERROR] Account 'holyfruit12@hotmail.com' not found in database!")
            print("\nSearching for similar accounts...")
            result = await db.execute(
                select(ProviderAccount).where(
                    ProviderAccount.email.like("%holyfruit%")
                )
            )
            accounts = result.scalars().all()
            if accounts:
                print(f"\nFound {len(accounts)} accounts matching 'holyfruit':")
                for acc in accounts:
                    print(f"  - {acc.email} (ID: {acc.id}, Provider: {acc.provider_id})")
            else:
                print("\nNo accounts found matching 'holyfruit'")
            return

        print(f"\n[OK] Found account in database:")
        print(f"  ID: {account.id}")
        print(f"  Email: {account.email}")
        print(f"  Provider: {account.provider_id}")
        print(f"  Has JWT: {'YES' if account.jwt_token else 'NO'}")
        print(f"  Has Cookies: {'YES' if account.cookies else 'NO'}")

        if not account.jwt_token:
            print("\n[ERROR] Account has no JWT token - cannot fetch credits!")
            return

        # Test with pixverse-py directly
        print("\n" + "-" * 60)
        print("Testing pixverse-py get_credits()...")
        print("-" * 60)

        try:
            # Create pixverse Account
            temp_account = Account(
                email=account.email,
                session={
                    "jwt_token": account.jwt_token,
                    "cookies": account.cookies or {}
                }
            )

            # Call get_credits
            api = PixverseAPI()
            credit_data = api.get_credits(temp_account)

            print("\n[OK] Credits fetched successfully!")
            print(f"  Total: {credit_data.get('total_credits', 0)}")
            print(f"  Daily: {credit_data.get('credit_daily', 0)}")
            print(f"  Monthly: {credit_data.get('credit_monthly', 0)}")
            print(f"  Package: {credit_data.get('credit_package', 0)}")

            # Show current database credits
            print("\n" + "-" * 60)
            print("Current database credits:")
            print("-" * 60)

            from pixsim7_backend.services.account import AccountService
            account_service = AccountService(db)
            db_credits = await account_service.get_credits(account.id)

            for credit_type, amount in db_credits.items():
                print(f"  {credit_type}: {amount}")

            # Check if they match
            mismatches = []
            for key in ['daily', 'monthly', 'package']:
                api_value = credit_data.get(f'credit_{key}', 0)
                db_value = db_credits.get(key, 0)
                if api_value != db_value:
                    mismatches.append((key, api_value, db_value))

            if mismatches:
                print("\n[WARNING] Credits don't match!")
                for credit_type, api_val, db_val in mismatches:
                    print(f"  {credit_type}: API={api_val}, DB={db_val}")
            else:
                print("\n[OK] Database credits match API!")

        except Exception as e:
            print(f"\n[ERROR] Error fetching credits: {e}")
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_holyfruit12_credits())
