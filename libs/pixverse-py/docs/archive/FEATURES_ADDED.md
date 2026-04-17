# New Features Added (Based on PixSim7 Integration)

## Video Utilities

```python
from pixverse import infer_video_dimensions, get_quality_from_dimensions, get_aspect_ratio

# Get dimensions from quality presets
width, height = infer_video_dimensions('720p', '16:9')  # (1280, 720)
width, height = infer_video_dimensions('1080p', '9:16')  # (1080, 1920) portrait

# Reverse lookups
quality = get_quality_from_dimensions(1920, 1080)  # '1080p'
aspect = get_aspect_ratio(1280, 720)  # '16:9'
```

## Media Upload (OpenAPI - Paid Tier)

```python
from pixverse import PixverseClient

client = PixverseClient(
    email="your@email.com",
    session={"openapi_key": "px_..."}
)

# Upload image
result = client.upload_media("/path/to/image.jpg")
# Returns: {'id': '12345', 'url': 'https://...'}

# Use in generation
video = client.create(
    prompt="animate this image",
    image_url=f"img_id:{result['id']}",
    quality="720p"
)
```

## Session-Based Authentication (Production Pattern)

```python
from pixverse import PixverseClient

# Use existing credentials instead of email/password
client = PixverseClient(
    email="user@email.com",
    session={
        "jwt_token": "eyJ...",        # From browser (_ai_token cookie)
        "openapi_key": "px_...",      # From Pixverse dashboard
        "use_method": "auto"          # 'web-api' | 'open-api' | 'auto'
    }
)
```

**API Method Selection:**
- `"web-api"`: Use JWT token (free tier, web API)
- `"open-api"`: Use API key (paid tier, faster)
- `"auto"`: Try JWT first, fallback to API key (default)

## Account Information & Credits

```python
# Get user information
user_info = client.get_user_info()
print(f"Real Email: {user_info['Mail']}")
print(f"Username: {user_info['Username']}")

# Get credit balance
credits = client.get_credits()
print(f"Total: {credits['total_credits']}")
print(f"Daily: {credits['credit_daily']}")

# Get plan details
plan = client.get_plan_details()
print(f"Plan: {plan['plan_name']}")
print(f"Qualities: {plan['qualities']}")
```

## Examples

All features have complete examples in `examples/`:
- `examples/session_usage.py` - Session-based auth patterns
- `examples/upload_media.py` - Upload and use media files
- `examples/account_info.py` - Account management

## Integration Guide

See `PIXSIM7_INTEGRATION_PLAN.md` for:
- How pixverse-py is used in production (PixSim7)
- Real-world usage patterns
- Implementation roadmap
- Migration guide from custom implementations

## Breaking Changes

None - all additions are backward compatible.
