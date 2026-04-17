# Quick Start: Testing Guide

**Ready to test pixverse-py with real Pixverse API!**

---

## Prerequisites

1. **Pixverse Account** - You need one of:
   - JWT token (from browser cookies)
   - OR Pixverse OpenAPI key

2. **Python Environment**
   ```bash
   cd G:\code\pixverse-py
   pip install -e .  # Install in development mode
   ```

---

## Getting Your JWT Token

### Option 1: Extract from Browser

1. Login to Pixverse in Chrome/Firefox
2. Open DevTools (F12)
3. Go to Application → Cookies → `https://app.pixverse.ai`
4. Find `_ai_token` cookie
5. Copy the value (this is your JWT token)

### Option 2: Use PixSim3

If you have PixSim3 running:
```python
# In PixSim3, print an account's JWT token
from pixsim3.core.database import session_scope
from pixsim3.core.models import Account

with session_scope() as session:
    account = session.query(Account).filter_by(provider_name="pixverse").first()
    print(f"JWT Token: {account.jwt_token}")
```

---

## Test 1: Simple Generation (JWT Token)

```python
from pixverse import PixverseClient
import time

# Initialize with JWT token
client = PixverseClient(session={
    "jwt_token": "your_jwt_token_here",
    "cookies": {"_ai_token": "your_jwt_token_here"}
})

# Generate video (text-to-video)
# Defaults: model="v5", quality="360p", duration=5
print("Generating video...")
video = client.create(
    prompt="A cute cat dancing in the rain",
    duration=4  # Optional: override default of 5 seconds
)

print(f"Video ID: {video.id}")
print(f"Status: {video.status}")

# Poll until complete (max 5 minutes)
for i in range(60):  # 60 * 5 = 300 seconds = 5 minutes
    if video.status != "processing":
        break

    print(f"Polling {i+1}/60...")
    time.sleep(5)
    video = client.get_video(video.id, client.pool.accounts[0])

    print(f"  Status: {video.status}")

# Check result
if video.status == "completed":
    print(f"\n✓ Success!")
    print(f"Video URL: {video.url}")
    print(f"Thumbnail: {video.thumbnail}")
elif video.status == "filtered":
    print(f"\n✗ Filtered by content policy")
elif video.status == "failed":
    print(f"\n✗ Generation failed")
else:
    print(f"\n? Unknown status: {video.status}")
```

---

## Test 2: Simple Generation (API Key)

```python
from pixverse import PixverseClient
import time

# Initialize with API key
client = PixverseClient(session={
    "api_key": "your_api_key_here"
})

# Same as Test 1, but uses OpenAPI endpoints
# Defaults: model="v5", quality="360p"
video = client.create(
    prompt="A beautiful sunset over mountains",
    duration=4
)

# Poll until complete...
# (same as Test 1)
```

---

## Test 3: Image-to-Video

```python
from pixverse import PixverseClient

client = PixverseClient(session={
    "jwt_token": "your_jwt_token_here",
    "cookies": {"_ai_token": "your_jwt_token_here"}
})

# Using existing Pixverse image URL
video = client.create(
    prompt="The landscape transforms into winter",
    image_url="https://media.pixverse.ai/upload/your_image.jpg",
    duration=4,
    # Optional: quality="720p" to override default 360p
)

print(f"Video ID: {video.id}")
# Poll as before...
```

---

## Test 4: Google OAuth Login

**Requires playwright**:
```bash
pip install pixverse-py[playwright]
playwright install chromium
```

```python
from pixverse import PixverseClient

client = PixverseClient()

# Login with Google
print("Starting Google OAuth login...")
session = client.auth.login(
    email="your@gmail.com",
    password="your_password",
    method="google"
)

print(f"Login successful!")
print(f"JWT Token: {session.get('jwt_token')}")

# Save session for later
import json
with open("session.json", "w") as f:
    json.dump(session, f)

# Use saved session
with open("session.json") as f:
    saved_session = json.load(f)

client = PixverseClient(session=saved_session)
video = client.create(prompt="A cat")
```

---

## Test 5: Session Refresh

```python
from pixverse import PixverseClient
import json

# Load existing session
with open("session.json") as f:
    session = json.load(f)

# Refresh session (fast-path API check)
client = PixverseClient(session=session)
refreshed = client.auth.refresh(session)

print("Session refreshed!")

# Use refreshed session
video = client.create(prompt="A dancing robot")
```

---

## Test 6: Account Pool with Rotation

```python
from pixverse import PixverseClient, AccountPool

# Create pool with multiple accounts
pool = AccountPool([
    {
        "email": "account1@gmail.com",
        "session": {"jwt_token": "token1", "cookies": {...}}
    },
    {
        "email": "account2@gmail.com",
        "session": {"jwt_token": "token2", "cookies": {...}}
    },
], strategy="round_robin")

# Client will automatically rotate accounts
client = PixverseClient(account_pool=pool)

# Generate 5 videos with rotation
for i in range(5):
    video = client.create(prompt=f"Video {i+1}")
    print(f"Generated {video.id} with account {pool.current_account.email}")

# Check pool stats
stats = pool.get_stats()
print(f"Total requests: {stats['total_requests']}")
print(f"Failures: {stats['total_failures']}")
```

---

## Expected Behavior

### Successful Generation

```
Generating video...
Video ID: 123456789
Status: processing
Polling 1/60...
  Status: processing
Polling 2/60...
  Status: processing
...
Polling 8/60...
  Status: completed

✓ Success!
Video URL: https://cdn.pixverse.ai/video/123456789.mp4
Thumbnail: https://cdn.pixverse.ai/thumbnail/123456789.jpg
```

### Filtered Content

```
Generating video...
Video ID: 987654321
Status: processing
Polling 1/60...
  Status: processing
...
Polling 5/60...
  Status: filtered

✗ Filtered by content policy
```

### Failed Generation

```
Generating video...
Video ID: 555555555
Status: processing
Polling 1/60...
  Status: failed

✗ Generation failed
```

---

## Troubleshooting

### Error: "No authentication credentials"

**Problem**: No JWT token or API key provided

**Solution**:
```python
# Make sure session dict has either:
session = {"jwt_token": "..."}
# OR
session = {"api_key": "..."}
```

### Error: "Session expired (logged in elsewhere)"

**Problem**: JWT token is no longer valid (error code 10005)

**Solution**: Re-authenticate or refresh session
```python
# Refresh via browser
refreshed = client.auth.refresh(session)

# OR re-login with Google OAuth
session = client.auth.login(email="...", password="...", method="google")
```

### Error: "playwright not installed"

**Problem**: Trying to use Google OAuth without playwright

**Solution**:
```bash
pip install pixverse-py[playwright]
playwright install chromium
```

### Status stuck on "processing"

**Problem**: Video generation taking longer than expected

**Solution**: Increase polling timeout (can take 2-5 minutes)
```python
# Poll for up to 10 minutes
for i in range(120):  # 120 * 5 = 600 seconds = 10 minutes
    if video.status != "processing":
        break
    time.sleep(5)
    video = client.get_video(video.id, account)
```

---

## Next Steps After Testing

Once basic testing works:

1. **Test Edge Cases**
   - Inappropriate prompts (should be filtered)
   - Long prompts
   - Invalid parameters
   - Rate limiting

2. **Implement Missing Features**
   - Image upload (OSS flow)
   - Video extend
   - Transition videos
   - Batch operations

3. **Add Tests**
   - Unit tests with mocked API
   - Integration tests
   - CI/CD pipeline

4. **Publish to PyPI**
   ```bash
   python -m build
   twine upload --repository testpypi dist/*
   ```

---

## Support

- **API Reference**: See `PIXVERSE_API_REFERENCE.md`
- **Full Integration Details**: See `API_INTEGRATION_COMPLETE.md`
- **Implementation Status**: See `IMPLEMENTATION_STATUS.md`

---

**Happy Testing!** 🚀
