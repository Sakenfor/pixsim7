"""
Example: Google OAuth login with Playwright

Requires: pip install pixverse-py[playwright]
"""

from pixverse import PixverseClient
import json

print("=" * 50)
print("Google OAuth Login Example")
print("=" * 50)
print()
print("Note: This requires playwright to be installed:")
print("  pip install pixverse-py[playwright]")
print()
print("A browser window will open for Google login.")
print("=" * 50)
print()

# Login with Google OAuth
client = PixverseClient(
    email="your.google.account@gmail.com",
    password="your_google_password"
)

# Use Google OAuth authentication
print("Logging in with Google OAuth...")
print("(A browser window will open)")
session = client.auth.login(
    "your.google.account@gmail.com",
    "your_google_password",
    method="google"  # Use Google OAuth
)

print("✓ Login successful!")
print()

# Save session for later use
with open("google_session.json", "w") as f:
    json.dump(session, f, indent=2)

print("Session saved to google_session.json")
print(f"  Cookies: {len(session.get('cookies', {}))} cookies")
print(f"  JWT token: {session.get('headers', {}).get('token', 'N/A')[:20]}...")
print()

# Use the session
print("Generating video...")
video = client.create(
    prompt="a beautiful sunset over the ocean",
    model="v5",
    duration=5
)

print(f"✓ Video created: {video.id}")
print(f"  Status: {video.status}")
print()

print("=" * 50)
print("Google OAuth Features:")
print("=" * 50)
print("✓ Works with Google accounts")
print("✓ Browser-based authentication")
print("✓ Automatic session save")
print("✓ Can refresh without password")
print()
print("Next time, use session refresh:")
print("  client.auth.refresh(session)")
