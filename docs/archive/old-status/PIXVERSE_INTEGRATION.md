# Pixverse Provider Integration

✅ **Complete** - Pixverse provider integrated with clean architecture

---

## What's Been Built

### 1. **Provider Abstraction** - `services/provider/base.py`
Clean interface for all video providers:
```python
class Provider(ABC):
    @abstractmethod
    async def execute(operation_type, account, params) -> GenerationResult

    @abstractmethod
    async def check_status(account, provider_job_id) -> VideoStatusResult
```

### 2. **Pixverse Adapter** - `services/provider/adapters/pixverse.py`
Complete Pixverse implementation using `pixverse-py`:
- ✅ Text-to-Video generation
- ✅ Image-to-Video generation
- ✅ Video Extend
- ✅ Video Transition (multi-image)
- ✅ Fusion (character consistency)
- ✅ Status checking
- ✅ Error handling (auth, quota, content filter, etc.)

### 3. **Provider Registry** - `services/provider/registry.py`
Singleton registry for provider management:
```python
# Auto-registers Pixverse on startup
register_default_providers()

# Get provider
provider = registry.get("pixverse")
```

### 4. **Dependencies**
Updated `requirements.txt`:
```txt
# Install pixverse-py from local path
pip install -e G:/code/pixverse-py

# Or from GitHub
pip install git+https://github.com/user/pixverse-py.git
```

---

## How It Works

### Architecture Flow

```
User Request
    ↓
JobService (TODO)
    ↓
ProviderService (TODO)
    ↓
registry.get("pixverse")
    ↓
PixverseProvider.execute(operation_type, account, params)
    ↓
pixverse-py SDK
    ↓
Pixverse API
    ↓
GenerationResult (job_id, status, urls)
    ↓
ProviderSubmission (saved to DB)
    ↓
Asset (created when completed)
```

### Clean Separation

**PixSim6 (Mixed):**
```python
# God object mixing concerns
class VideoGeneratorService:
    def generate_video(...):  # 1200 lines
        # - Account selection
        # - Provider calls
        # - Asset creation
        # - Lineage tracking
        # - Error handling
```

**PixSim7 (Clean):**
```python
# Provider: ONLY handles API calls
class PixverseProvider(Provider):
    async def execute(...):
        # - Map parameters
        # - Call pixverse-py
        # - Return result
        # NO account selection, NO asset creation

# JobService: Orchestration (TODO)
# AssetService: Asset creation (TODO)
# AccountService: Account selection (TODO)
```

---

## Usage Examples

### Example 1: Text-to-Video

```python
from pixsim7_backend.services.provider import registry
from pixsim7_backend.domain import OperationType, ProviderAccount

# Get provider
provider = registry.get("pixverse")

# Map parameters
params = provider.map_parameters(
    operation_type=OperationType.TEXT_TO_VIDEO,
    params={
        "prompt": "A serene sunset over mountains",
        "model": "v5",
        "quality": "720p",
        "duration": 5,
        "aspect_ratio": "16:9",
    }
)

# Execute (async)
result = await provider.execute(
    operation_type=OperationType.TEXT_TO_VIDEO,
    account=account,  # ProviderAccount from DB
    params=params
)

print(f"Job ID: {result.provider_job_id}")
print(f"Status: {result.status}")
print(f"Video URL: {result.video_url}")
```

### Example 2: Image-to-Video

```python
params = provider.map_parameters(
    operation_type=OperationType.IMAGE_TO_VIDEO,
    params={
        "prompt": "The character walks towards the camera",
        "image_url": "https://cdn.pixverse.ai/image.jpg",
        "model": "v5",
        "quality": "720p",
        "duration": 5,
        "camera_movement": "zoom_in",
    }
)

result = await provider.execute(
    operation_type=OperationType.IMAGE_TO_VIDEO,
    account=account,
    params=params
)
```

### Example 3: Check Status

```python
# Poll for completion
status = await provider.check_status(
    account=account,
    provider_job_id="video_123456"
)

if status.status == VideoStatus.COMPLETED:
    print(f"Video ready: {status.video_url}")
    print(f"Thumbnail: {status.thumbnail_url}")
    print(f"Size: {status.width}x{status.height}")
```

---

## Integration with pixverse-py

### How Parameters Are Mapped

**Generic (PixSim7)** → **Pixverse-specific (pixverse-py)**

| Generic | Pixverse | Notes |
|---------|----------|-------|
| `prompt` | `prompt` | Required for all operations |
| `quality: "720p"` | `quality: "720p"` | Direct pass-through |
| `duration: 5` | `duration: 5` | Seconds |
| `model: "v5"` | `model: "v5"` | Default if not specified |
| `aspect_ratio: "16:9"` | `aspect_ratio: "16:9"` | Optional |
| `image_url` | `image_url` | For i2v operations |
| `video_url` | `video_url` | For extend operations |

### Client Creation

```python
# PixSim7 creates pixverse-py client from ProviderAccount
def _create_client(account: ProviderAccount) -> PixverseClient:
    session = {
        "jwt_token": account.jwt_token,
        "api_key": account.api_key,
        "cookies": account.cookies or {},
    }

    return PixverseClient(
        email=account.email,
        session=session
    )
```

### Async Wrapper

```python
# pixverse-py is synchronous, we run in thread
video = await asyncio.to_thread(
    client.create,
    prompt="sunset",
    quality="720p",
    duration=5
)
```

---

## Error Handling

Pixverse errors are mapped to our error hierarchy:

| Pixverse Error | PixSim7 Error | HTTP Status |
|----------------|---------------|-------------|
| "Authentication failed" | `AuthenticationError` | 401 |
| "Insufficient credits" | `QuotaExceededError` | 402 |
| "Content filtered" | `ContentFilteredError` | 451 |
| "Video not found" | `JobNotFoundError` | 404 |
| Generic error | `ProviderError` | 500 |

---

## Supported Operations

| Operation | Pixverse Method | Status |
|-----------|----------------|--------|
| TEXT_TO_VIDEO | `client.create(prompt)` | ✅ Complete |
| IMAGE_TO_VIDEO | `client.create(prompt, image_url)` | ✅ Complete |
| VIDEO_EXTEND | `client.extend(video_url)` | ✅ Complete |
| VIDEO_TRANSITION | `client.transition(image_urls, prompts)` | ✅ Complete |
| FUSION | `client.fusion(fusion_assets)` | ✅ Complete |

---

## What's NOT in Pixverse Adapter

Following clean architecture, these are handled elsewhere:

❌ **Not in Adapter:**
- Account selection (→ AccountService)
- Asset creation (→ AssetService)
- Job tracking (→ JobService)
- Lineage tracking (→ LineageService)
- Database operations (→ Services)
- Business logic (→ Services)

✅ **Only in Adapter:**
- Parameter mapping
- API calls (via pixverse-py)
- Error translation
- Status mapping

---

## Next Steps

### 1. Create JobService (TODO)
```python
class JobService:
    async def create_job(operation_type, provider_id, params) -> Job:
        # 1. Create Job record
        # 2. Create ProviderSubmission
        # 3. Call provider via registry
        # 4. Update job status
        # 5. Emit events
```

### 2. Create AssetService (TODO)
```python
class AssetService:
    async def create_from_submission(submission, job) -> Asset:
        # ONLY entry point for asset creation
        # - Extract metadata from submission
        # - Create Asset record
        # - Emit events
```

### 3. Create API Endpoints (TODO)
```python
@router.post("/jobs", response_model=JobResponse)
async def create_job(request: CreateJobRequest):
    job = await job_service.create_job(...)
    return JobResponse.from_orm(job)
```

### 4. Create Status Polling Worker (TODO)
```python
async def poll_job_status(job_id: int):
    # Get job from DB
    # Get provider from registry
    # Check status
    # Update job if completed
    # Create asset if ready
```

---

## Testing

### Manual Test (when services ready)
```python
# 1. Create provider account in DB
account = ProviderAccount(
    provider_id="pixverse",
    email="test@example.com",
    jwt_token="...",
)

# 2. Test provider directly
provider = registry.get("pixverse")
params = provider.map_parameters(
    OperationType.TEXT_TO_VIDEO,
    {"prompt": "test", "quality": "360p"}
)
result = await provider.execute(
    OperationType.TEXT_TO_VIDEO,
    account,
    params
)

assert result.provider_job_id
assert result.status == VideoStatus.PROCESSING
```

### Health Check
```bash
# Start server
python main.py

# Check health
curl http://localhost:8000/health

# Response:
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected",
  "providers": ["pixverse"]  # ✅ Pixverse registered!
}
```

---

## Summary

✅ **Complete:** Pixverse provider fully integrated with clean architecture

✅ **Uses pixverse-py:** Leverages existing SDK (no reimplementation)

✅ **Clean separation:** Provider ONLY handles API calls

✅ **Extensible:** Easy to add Runway, Pika, etc.

🚧 **Next:** Build services layer (JobService, AssetService, AccountService)

---

**Status:** Ready for service layer implementation!

---

## 🔄 Media Uploads (Images & Future Videos)

### Upload Pipeline Overview

```
MediaCard Badge Click
        ↓
POST /api/v1/assets/upload (file + provider_id)
        ↓
UploadService.upload()
        • Select Pixverse account (prefer OpenAPI api_key/api_key_paid)  
        • Acceptance prep (images only for now)  
        • Delegate to provider adapter upload_asset()  
        • Persist Asset (tag: user_upload)  
        ↓
Response { external_url | provider_asset_id, note }
        ↓
Badge State (blue=success, red=error)
```

### Pixverse Image Acceptance Rules (Implemented)

| Rule | Limit | Behavior |
|------|-------|----------|
| Max dimension | 4096px (largest side) | Auto downscale (Lanczos) |
| Max size | 20MB | Recompress JPEG/WEBP quality=85 if needed; else reject |
| Format | Any readable by Pillow | Recommend JPEG/WEBP for large images |

Notes: When downscaled or recompressed, `note` field includes details (e.g., `Downscaled to <=4096; Recompressed`).

### OpenAPI vs Web API Preference

UploadService will automatically prefer an account with `api_key` or `api_key_paid` (Pixverse OpenAPI) when uploading images. The badge's successful upload may include a note like `Uploaded via OpenAPI`.

Fallback path: If no OpenAPI-capable account exists, a regular Web API account is selected via `AccountService.select_account()`.

### Badge UX (Frontend)

| State | Color | Description |
|-------|-------|-------------|
| Idle | Gray outline | Not uploaded yet |
| Uploading | Spinner/“UP…” | Request in-flight |
| Success | Blue | Provider accepted; persisted as Asset |
| Error | Red | Rejected (e.g., size > 20MB after recompress) |

### Future Video Acceptance (Placeholder)

Currently videos pass through unchanged; provider handles rejection. Planned rules:
1. Probe container & codec (H.264 / H.265 / VP9) using ffprobe.
2. Enforce max duration & resolution (e.g., 30s / 1920x1080).
3. Transcode oversized or unsupported codec (ffmpeg) before upload.
4. Surface preflight errors early with actionable suggestions.

Implementation TODO placed in `UploadService._prepare_file_for_provider()`.

### Error Surfaces

| Scenario | Error Type | HTTP Status | Frontend Badge |
|----------|------------|-------------|----------------|
| Over 20MB after recompress | InvalidOperationError | 400 | Red |
| Unsupported content type | HTTPException | 400 | Red (detail) |
| Provider internal failure | HTTPException | 502 | Red (detail) |

### Extensibility Pattern

Add new provider acceptance by extending `_prepare_file_for_provider` with a branch: validate dimensions, size, format; mutate file if possible; raise `InvalidOperationError` with user-friendly guidance if still invalid.

---

## Configuration Checklist for Uploads

1. Create at least one Pixverse account row with valid `jwt_token` (Web API) OR `api_key` / `api_key_paid` (OpenAPI).
2. Ensure Pillow installed (`pillow==10.x`).
3. Frontend sets `provider_id="pixverse"` in form data when calling upload endpoint.
4. Optional: Multiple accounts allowed; highest priority OpenAPI account auto-selected.
5. Logs: Backend logs downscale/recompress actions under `UploadService`.

---

## Quick Curl Example

```bash
curl -X POST \
    -F "file=@./sample.jpg" \
    -F "provider_id=pixverse" \
    http://localhost:8000/api/v1/assets/upload
```

Response example:

```json
{
    "provider_id": "pixverse",
    "media_type": "IMAGE",
    "external_url": "https://cdn.pixverse.ai/media/abc123.jpg",
    "provider_asset_id": null,
    "note": "Downscaled to <=4096; Recompressed"
}
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| 400 Pixverse upload rejected | Image >20MB after recompress | Convert to JPEG/WebP or reduce dimensions manually |
| Badge stays gray | No request fired | Check that `onUploadClick` is wired and form data includes provider_id |
| Always Web API path | No account with api_key/api_key_paid | Add OpenAPI key to an active Pixverse account |
| Provider returns ID only | SDK missing URL field | Use provider_asset_id to later resolve URL or update SDK |

---

## Roadmap (Uploads)

1. ffprobe integration for video metadata
2. Smart format conversion (PNG→WEBP for large opaque images)
3. Multi-provider acceptance matrix & fallback logic
4. Preflight UI warnings before user clicks upload
5. Background workers to enrich metadata post-upload

---
