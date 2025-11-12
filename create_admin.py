"""
Create first admin user for PixSim7

Run this script to create an admin account:
    python create_admin.py
"""
import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from pixsim7_backend.services.user.user_service import UserService
from pixsim7_backend.infrastructure.database.session import get_db
from pixsim7_backend.shared.auth import hash_password_sync


async def create_admin():
    """Create admin user"""
    print("\n" + "="*50)
    print("  PixSim7 - Create Admin User")
    print("="*50 + "\n")

    # Get input
    email = input("Admin email: ").strip()
    username = input("Admin username: ").strip()
    password = input("Admin password: ").strip()

    if not email or not username or not password:
        print("\n❌ All fields are required!")
        return

    # Confirm
    print(f"\nCreating admin user:")
    print(f"  Email: {email}")
    print(f"  Username: {username}")
    confirm = input("\nContinue? (y/n): ").strip().lower()

    if confirm != 'y':
        print("Cancelled.")
        return

    try:
        # Get database session
        async for db in get_db():
            user_service = UserService(db)

            # Create admin user
            user = await user_service.create_user(
                email=email,
                username=username,
                password=password,
                role="admin"  # Admin role
            )

            print(f"\n✅ Admin user created successfully!")
            print(f"   ID: {user.id}")
            print(f"   Email: {user.email}")
            print(f"   Username: {user.username}")
            print(f"   Role: {user.role}")
            print(f"\nYou can now login at: http://localhost:8002")
            break

    except Exception as e:
        print(f"\n❌ Error creating admin user: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(create_admin())
