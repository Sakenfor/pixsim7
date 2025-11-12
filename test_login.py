import asyncio
import sys
sys.path.append('G:/code/pixsim7')

from pixsim7_backend.shared.auth import verify_password

async def test_login():
    # Test data from database
    plain_password = "amanitamuscaria"
    stored_hash = "$2b$12$/8hRn6gFctRUZp4X.f3.Eeclo9HMUNeKA9oFGvsWPRTPeJU0rokli"

    print(f"Plain password: {plain_password}")
    print(f"Stored hash: {stored_hash}")
    print(f"Plain password length: {len(plain_password)} bytes")
    print(f"Hash length: {len(stored_hash)} bytes")

    try:
        result = await verify_password(plain_password, stored_hash)
        print(f"\nPassword verification result: {result}")
    except Exception as e:
        print(f"\nError during verification: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_login())
