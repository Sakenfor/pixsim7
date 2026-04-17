"""
Example: Using Pixverse with existing session credentials

This example shows how to use pixverse-py with pre-existing credentials
(JWT tokens, API keys) rather than email/password authentication.

This is the recommended approach for production applications like PixSim7.
"""

from pixverse import PixverseClient

# Example 1: Using JWT token from browser session
client_jwt = PixverseClient(
    email="your@email.com",
    session={
        "jwt_token": "eyJ...",  # Extract from browser cookies (_ai_token)
        "cookies": {
            "_ai_token": "eyJ...",
            # ... other cookies
        }
    }
)

# Example 2: Using OpenAPI key (paid tier)
client_openapi = PixverseClient(
    email="your@email.com",
    session={
        "openapi_key": "px_...",  # From Pixverse dashboard
        "use_method": "open-api"   # Force OpenAPI usage
    }
)

# Example 3: Hybrid - use both (auto-select)
client_hybrid = PixverseClient(
    email="your@email.com",
    session={
        "jwt_token": "eyJ...",        # Free tier web API
        "openapi_key": "px_...",      # Paid tier OpenAPI
        "use_method": "auto"          # Try JWT first, fallback to OpenAPI
    }
)

# Example 4: Production usage (PixSim7 pattern)
# Store credentials securely in database/config
saved_session = {
    "jwt_token": "eyJ...",
    "openapi_key": "px_...",
    "cookies": {...},
    "use_method": "auto"
}

client = PixverseClient(
    email="user@example.com",
    session=saved_session
)

# Generate video
video = client.create(
    prompt="a cat dancing in the rain",
    quality="720p",
    duration=5
)

print(f"Video created: {video.url}")

# API Method Selection Details:
# - "web-api": Uses JWT token (free tier, slower)
# - "open-api": Uses API key (paid tier, faster, more reliable)
# - "auto": Intelligently selects based on available credentials
