"""
Import provider accounts from pixsim6 database to pixsim7

Usage:
    python scripts/import_accounts_from_pixsim6.py --username sakenfor

Prerequisites:
    - Both pixsim6 and pixsim7 databases must be running
    - User must exist in pixsim7 database
"""
import sys
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

import asyncio
import argparse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlmodel import select
from datetime import datetime

# Import pixsim7 models
from pixsim7_backend.domain import ProviderAccount as PixSim7Account, User
from pixsim7_backend.domain.provider_credit import ProviderCredit
from pixsim7_backend.domain.enums import AccountStatus

# Pixsim6 database URL (adjust if different)
PIXSIM6_DB_URL = "postgresql+asyncpg://pixsim:pixsim123@localhost:5432/pixsim"
# Pixsim7 database URL
PIXSIM7_DB_URL = "postgresql+asyncpg://pixsim7:pixsim7_secure_2024@localhost:5433/pixsim7"


async def get_user_id(session: AsyncSession, username: str) -> int:
    """Get user ID from username"""
    result = await session.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise ValueError(f"User '{username}' not found in pixsim7 database")
    return user.id


async def fetch_pixsim6_accounts(session: AsyncSession):
    """Fetch all accounts from pixsim6"""
    # Direct SQL query since we're reading from a different schema
    query = text("""
        SELECT 
            id, email, provider_id, nickname, provider_user_id,
            jwt_token, api_key, openapi_key, cookies,
            credits, openapi_credits, 
            total_videos_generated, total_videos_failed, failure_streak,
            status, last_error, last_used, cooldown_until,
            success_rate, priority, max_daily_videos, videos_today,
            max_concurrent_jobs, current_processing_jobs,
            created_at, updated_at
        FROM provider_accounts
        ORDER BY id
    """)
    result = await session.execute(query)
    return result.mappings().all()


async def import_account(
    pixsim7_session: AsyncSession,
    account_data: dict,
    user_id: int,
    dry_run: bool = False
) -> dict:
    """Import a single account to pixsim7"""
    
    # Check if account already exists
    existing = await pixsim7_session.execute(
        select(PixSim7Account).where(
            PixSim7Account.email == account_data['email'],
            PixSim7Account.provider_id == account_data['provider_id'],
            PixSim7Account.user_id == user_id
        )
    )
    if existing.scalar_one_or_none():
        return {
            'status': 'skipped',
            'email': account_data['email'],
            'provider': account_data['provider_id'],
            'reason': 'already exists'
        }
    
    # Map status
    status_map = {
        'active': AccountStatus.ACTIVE,
        'exhausted': AccountStatus.EXHAUSTED,
        'error': AccountStatus.ERROR,
        'disabled': AccountStatus.DISABLED,
        'rate_limited': AccountStatus.RATE_LIMITED
    }
    status = status_map.get(account_data['status'], AccountStatus.ACTIVE)
    
    # Create new account
    new_account = PixSim7Account(
        user_id=user_id,
        is_private=True,  # Import as private by default
        provider_id=account_data['provider_id'],
        email=account_data['email'],
        nickname=account_data.get('nickname'),
        provider_user_id=account_data.get('provider_user_id'),
        jwt_token=account_data.get('jwt_token'),
        api_key=account_data.get('api_key'),
        api_keys=(
            [{"id": "openapi_main", "kind": "openapi", "value": account_data.get("openapi_key"), "priority": 10}]
            if account_data.get("openapi_key")
            else None
        ),  # Map openapi_key to generic api_keys
        cookies=account_data.get('cookies'),
        total_videos_generated=account_data.get('total_videos_generated', 0),
        total_videos_failed=account_data.get('total_videos_failed', 0),
        failure_streak=account_data.get('failure_streak', 0),
        status=status,
        last_error=account_data.get('last_error'),
        last_used=account_data.get('last_used'),
        cooldown_until=account_data.get('cooldown_until'),
        success_rate=account_data.get('success_rate', 1.0),
        priority=account_data.get('priority', 0),
        max_daily_videos=account_data.get('max_daily_videos'),
        videos_today=account_data.get('videos_today', 0),
        max_concurrent_jobs=account_data.get('max_concurrent_jobs', 2),
        current_processing_jobs=account_data.get('current_processing_jobs', 0),
    )
    
    if not dry_run:
        pixsim7_session.add(new_account)
        await pixsim7_session.flush()  # Get the ID
        
        # Import credits to ProviderCredit table
        credits_to_import = []
        
        # WebAPI credits (regular credits)
        if account_data.get('credits', 0) > 0:
            credits_to_import.append({
                'type': 'total',  # or could be 'package' depending on source
                'amount': account_data['credits']
            })
        
        # OpenAPI credits (paid tier)
        if account_data.get('openapi_credits', 0) > 0:
            credits_to_import.append({
                'type': 'openapi',
                'amount': account_data['openapi_credits']
            })
        
        # Create ProviderCredit entries
        for credit_data in credits_to_import:
            credit = ProviderCredit(
                account_id=new_account.id,
                credit_type=credit_data['type'],
                amount=credit_data['amount']
            )
            pixsim7_session.add(credit)
        
        await pixsim7_session.commit()
    
    return {
        'status': 'imported' if not dry_run else 'would_import',
        'email': account_data['email'],
        'provider': account_data['provider_id'],
        'credits': account_data.get('credits', 0),
        'openapi_credits': account_data.get('openapi_credits', 0)
    }


async def main():
    parser = argparse.ArgumentParser(description='Import accounts from pixsim6 to pixsim7')
    parser.add_argument('--username', required=True, help='Target username in pixsim7')
    parser.add_argument('--dry-run', action='store_true', help='Preview without importing')
    parser.add_argument('--provider', help='Import only specific provider (e.g., pixverse)')
    args = parser.parse_args()
    
    print(f"🔄 Importing accounts from pixsim6 to pixsim7")
    print(f"   Target user: {args.username}")
    print(f"   Mode: {'DRY RUN' if args.dry_run else 'LIVE IMPORT'}")
    if args.provider:
        print(f"   Filter: {args.provider} only")
    print()
    
    # Create engines
    pixsim6_engine = create_async_engine(PIXSIM6_DB_URL, echo=False)
    pixsim7_engine = create_async_engine(PIXSIM7_DB_URL, echo=False)
    
    # Create sessions
    AsyncSessionPixsim6 = sessionmaker(
        pixsim6_engine, class_=AsyncSession, expire_on_commit=False
    )
    AsyncSessionPixsim7 = sessionmaker(
        pixsim7_engine, class_=AsyncSession, expire_on_commit=False
    )
    
    try:
        async with AsyncSessionPixsim6() as pixsim6_session:
            async with AsyncSessionPixsim7() as pixsim7_session:
                # Get target user ID
                user_id = await get_user_id(pixsim7_session, args.username)
                print(f"✓ Found user '{args.username}' (ID: {user_id})")
                print()
                
                # Fetch accounts from pixsim6
                accounts = await fetch_pixsim6_accounts(pixsim6_session)
                print(f"📊 Found {len(accounts)} accounts in pixsim6")
                print()
                
                # Filter by provider if specified
                if args.provider:
                    accounts = [a for a in accounts if a['provider_id'] == args.provider]
                    print(f"   Filtered to {len(accounts)} {args.provider} accounts")
                    print()
                
                # Import each account
                results = {
                    'imported': [],
                    'skipped': [],
                    'errors': []
                }
                
                for account in accounts:
                    try:
                        result = await import_account(
                            pixsim7_session,
                            account,
                            user_id,
                            dry_run=args.dry_run
                        )
                        
                        if result['status'] in ['imported', 'would_import']:
                            results['imported'].append(result)
                            status_icon = '🔵' if args.dry_run else '✓'
                            print(f"{status_icon} {result['email']} ({result['provider']}) - Credits: {result['credits']}, OpenAPI: {result['openapi_credits']}")
                        elif result['status'] == 'skipped':
                            results['skipped'].append(result)
                            print(f"⊘ {result['email']} ({result['provider']}) - {result['reason']}")
                    except Exception as e:
                        results['errors'].append({
                            'email': account['email'],
                            'error': str(e)
                        })
                        print(f"✗ {account['email']} - ERROR: {e}")
                
                # Summary
                print()
                print("=" * 60)
                print("SUMMARY")
                print("=" * 60)
                print(f"{'Would be imported' if args.dry_run else 'Imported'}: {len(results['imported'])}")
                print(f"Skipped (already exist): {len(results['skipped'])}")
                print(f"Errors: {len(results['errors'])}")
                
                if args.dry_run:
                    print()
                    print("ℹ️  This was a dry run. Run without --dry-run to actually import.")
                
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        raise
    finally:
        await pixsim6_engine.dispose()
        await pixsim7_engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
