# Pixverse-Py Integration with PixSim7 - Improvement Plan

## Summary
Analysis of how pixverse-py is used in pixsim7 to identify improvements needed in the SDK.

## Key Findings from PixSim7 Usage

### 1. Session Object Format (Currently Undocumented)
PixSim7 uses a session object with this structure:
```python
session = {
    "jwt_token": str,        # Web API JWT token
    "api_key": str,          # Free API key
    "openapi_key": str,      # Paid OpenAPI key
    "cookies": dict,         # Browser cookies
    "use_method": str        # 'web-api' | 'open-api' | 'auto'
}
```

**Action**: Document this format in README and add examples.

### 2. Missing Functionality

#### A. Video Dimension Utilities
**Location in PixSim7**: `pixsim7_backend/services/provider/adapters/pixverse.py:44-87`

**Current Status**: ✅ Added to `pixverse/video_utils.py`

Functions added:
- `infer_video_dimensions(quality, aspect_ratio)` - Get (width, height) from presets
- `get_quality_from_dimensions(width, height)` - Reverse mapping
- `get_aspect_ratio(width, height)` - Detect aspect ratio

#### B. Media Upload (Missing!)
**Location in PixSim7**: `pixsim7_backend/services/provider/adapters/pixverse.py:611-764`

**Status**: ❌ Not implemented in pixverse-py

PixSim7 implementation shows:
- OpenAPI upload endpoint: `POST /openapi/v2/image/upload`
- Returns `{img_id, img_url}`
- Requires `API-KEY` header and `Ai-trace-id`

**Action Required**:
```python
# Add to PixverseAPI class
def upload_media(
    self,
    file_path: str,
    account: Account,
    use_method: str = 'auto'
) -> dict:
    """
    Upload image/video to Pixverse

    Returns:
        {'id': str, 'url': str}  # Media ID and URL
    """
```

#### C. User Info / Credits API
**Location in PixSim7**: `pixsim7_backend/services/provider/adapters/pixverse.py:797-876`

**Current Status**: Partially exposed in `PixverseAPI.get_user_info()` and `get_credits()`

**Action**: Better document these methods and expose them in PixverseClient.

### 3. Real Usage Patterns

#### Pattern 1: Session-Based Initialization (Most Common)
```python
# From PixSim7
client = PixverseClient(
    email="user@gmail.com",
    session={
        "jwt_token": "eyJ...",
        "openapi_key": "px_...",
        "cookies": {...}
    }
)
```

#### Pattern 2: Multiple API Methods
```python
# From PixSim7 adapter
session = {
    ...existing session...,
    "use_method": "open-api"  # Force OpenAPI for this request
}
client = PixverseClient(email=email, session=session)
video = client.create(prompt="...")
```

#### Pattern 3: Generation Options (Well Supported)
```python
# From PixSim7
from pixverse.models import GenerationOptions

options = GenerationOptions(
    model="v5",
    quality="720p",
    duration=5,
    aspect_ratio="16:9",
    seed=0
)
video = client.create(prompt="...", **options.__dict__)
```

### 4. Documentation Gaps

#### A. Session Object (Critical)
**Issue**: Not documented how to pass pre-existing credentials

**Fix**: Add section to README:
```markdown
## Using Existing Sessions

If you already have Pixverse credentials (JWT token, API keys):

\`\`\`python
from pixverse import PixverseClient

client = PixverseClient(
    email="your@email.com",
    session={
        "jwt_token": "eyJ...",          # From browser cookies/_ai_token
        "openapi_key": "px_...",        # From Pixverse dashboard
        "cookies": {...},               # Optional browser cookies
        "use_method": "auto"            # 'web-api' | 'open-api' | 'auto'
    }
)
\`\`\`
```

#### B. API Method Selection
**Issue**: `use_method` parameter not documented

**Fix**: Document the three modes:
- `web-api`: Use JWT token (free tier, slower)
- `open-api`: Use API key (paid tier, faster)
- `auto`: Try JWT first, fallback to API key

#### C. Real-World Examples
**Issue**: Examples show only email/password, but PixSim7 uses session objects

**Fix**: Add `examples/pixsim7_integration.py` showing session-based usage

### 5. Code to Move from PixSim7

#### High Priority (Move to SDK):
1. ✅ `infer_video_dimensions()` - Moved to `video_utils.py`
2. ❌ `upload_media()` - Need to add to API client
3. ❌ JWT email extraction - Should be in auth module

#### Medium Priority (Could be in SDK):
1. OpenAPI upload implementation - Currently duplicated
2. Better error handling/mapping - Provider-specific

#### Low Priority (Keep in PixSim7):
1. ProviderAccount mapping - PixSim7-specific
2. Database integration - PixSim7-specific
3. Async wrappers - PixSim7-specific

## Implementation Checklist

### Phase 1: Critical (Do Now)
- [x] Add `video_utils.py` with dimension helpers
- [ ] Add `upload_media()` method to PixverseAPI
- [ ] Document session object format in README
- [ ] Add session-based examples
- [ ] Export video_utils from `__init__.py`

### Phase 2: Important (Next)
- [ ] Document `use_method` parameter
- [ ] Add `get_user_info()` to PixverseClient
- [ ] Add `get_credits()` to PixverseClient
- [ ] Improve error messages for missing credentials
- [ ] Add tests for session-based auth

### Phase 3: Nice to Have
- [ ] Add JWT parsing utility
- [ ] Better type hints for session dict
- [ ] Async client variant
- [ ] Upload progress callbacks

## Breaking Changes
None - All additions are backward compatible.

## Testing Plan
1. Test with PixSim7's actual session objects
2. Test upload_media() with both web-api and open-api
3. Test use_method parameter switching
4. Verify dimension utilities match PixSim7 behavior

## Documentation Updates Needed
1. README.md - Add "Using Existing Sessions" section
2. README.md - Add "API Method Selection" section
3. Add `examples/pixsim7_integration.py`
4. Add `examples/upload_media.py`
5. Update QUICK_START_TESTING.md with session examples
