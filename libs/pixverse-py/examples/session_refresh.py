"""
Example: Session refresh with JWT token
"""

import json
from pixverse import PixverseClient

# Step 1: Initial login (save session)
print("Step 1: Initial login...")
client = PixverseClient(
    email="your.email@gmail.com",
    password="your_password"
)

# Get session data
session = client.auth.login("your.email@gmail.com", "your_password")

# Save session to file
with open("session.json", "w") as f:
    json.dump(session, f, indent=2)

print("✓ Session saved to session.json")
print(f"  Cookies: {len(session.get('cookies', {}))} cookies")
print(f"  JWT token: {'Yes' if session.get('headers', {}).get('token') else 'No'}")
print()

# Step 2: Later - restore session (no password needed!)
print("Step 2: Restore session from file...")

with open("session.json") as f:
    saved_session = json.load(f)

# Refresh session (fast-path: validates via API, no browser!)
print("Refreshing session...")
refreshed_session = client.auth.refresh(saved_session)

print("✓ Session refreshed!")
print(f"  Valid: Yes")
print()

# Step 3: Use refreshed session
print("Step 3: Generate video with refreshed session...")

# Create new client with refreshed session
client = PixverseClient(session=refreshed_session)

video = client.create(
    prompt="a cat dancing in the rain",
    model="v5",
    duration=5
)

print(f"✓ Video created: {video.id}")
print(f"  URL: {video.url}")
print()

print("=" * 50)
print("Session Refresh Benefits:")
print("=" * 50)
print("✓ No password needed")
print("✓ Fast (API validation, no browser)")
print("✓ Works for Google accounts")
print("✓ Automatic JWT token handling")
