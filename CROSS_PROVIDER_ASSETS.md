# Cross-Provider Asset Management

## The Problem

Providers don't accept URLs from other providers:

```python
# ❌ THIS FAILS
pixverse_video = "https://pixverse-cdn.com/video123.mp4"
sora.extend_video(video_url=pixverse_video)  # Sora can't access Pixverse URLs
```

**Why it fails:**
1. Signed URLs expire
2. Cross-origin restrictions (CORS)
3. Authentication required
4. Provider-specific formats

## The Solution: Asset Normalization Layer

We created an **Asset** model that acts as the source of truth for all media, with automatic cross-provider upload caching.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Asset Table                            │
├─────────────────────────────────────────────────────────────┤
│  id: 123                                                    │
│  provider_id: "pixverse"  ← Original provider              │
│  provider_asset_id: "video_abc123"                          │
│  remote_url: "https://pixverse-cdn.com/..."                │
│  local_path: "/cache/assets/123.mp4"  ← Downloaded locally │
│                                                              │
│  provider_uploads: {                                         │
│    "pixverse": "video_abc123",  ← Original ID               │
│    "sora": "media_xyz789"       ← Uploaded to Sora         │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

### How It Works

**Step 1: Job completes, asset created**
```python
# Pixverse generates video
job = Job(provider_id="pixverse", ...)
# ...job completes...

# Asset created automatically
asset = Asset(
    provider_id="pixverse",
    provider_asset_id="video_abc123",
    remote_url="https://pixverse-cdn.com/...",
    provider_uploads={"pixverse": "video_abc123"}  # Original provider cached
)
```

**Step 2: User wants to extend on Sora**
```python
# User creates extend job
extend_job = Job(
    provider_id="sora",
    operation_type=OperationType.VIDEO_EXTEND,
    params={
        "video_asset_id": 123,  # ← Reference to asset, not URL!
        "prompt": "continue dancing"
    }
)
```

**Step 3: Job processor handles cross-provider upload**
```python
# Job processor sees video_asset_id
asset_id = extend_job.params["video_asset_id"]

# AssetService handles the magic
sora_media_id = await asset_service.get_asset_for_provider(
    asset_id=123,
    target_provider_id="sora"
)

# If not cached:
#   1. Downloads from Pixverse URL
#   2. Uploads to Sora
#   3. Caches Sora media ID
#   4. Returns "media_xyz789"

# If already cached:
#   Returns "media_xyz789" instantly
```

**Step 4: Provider uses cached ID**
```python
# Sora provider gets provider-specific ID
await sora_provider.execute(
    operation_type=OperationType.VIDEO_EXTEND,
    account=sora_account,
    params={
        "video_media_id": sora_media_id,  # "media_xyz789"
        "prompt": "continue dancing"
    }
)
```

## Asset Model Structure

```python
class Asset:
    # Identity
    id: int
    user_id: int
    media_type: MediaType  # VIDEO, IMAGE

    # Original provider
    provider_id: str  # "pixverse", "sora", etc.
    provider_asset_id: str  # Original provider's ID
    remote_url: str  # Original URL

    # Cross-provider cache (THE KEY FEATURE!)
    provider_uploads: Dict[str, str]  # {"pixverse": "video_abc", "sora": "media_xyz"}

    # Local caching
    local_path: Optional[str]  # "/cache/assets/123.mp4"
    sync_status: SyncStatus  # REMOTE, DOWNLOADING, DOWNLOADED

    # Metadata
    width, height, duration_sec, fps
    file_size_bytes, mime_type

    # LRU cache management
    last_accessed_at: datetime  # For cache eviction
```

## AssetService API

### get_asset_for_provider()

**The main method for cross-provider operations:**

```python
async def get_asset_for_provider(
    self,
    asset_id: int,
    target_provider_id: str
) -> str:
    """
    Get asset ID for specific provider (upload if needed)

    Returns: Provider-specific asset ID
    """
```

**Example:**
```python
# Get Pixverse video for use on Sora
sora_media_id = await asset_service.get_asset_for_provider(
    asset_id=123,  # Pixverse video
    target_provider_id="sora"
)
# → "media_xyz789"

# Next time (cached):
sora_media_id = await asset_service.get_asset_for_provider(
    asset_id=123,
    target_provider_id="sora"
)
# → "media_xyz789" (instant, no download/upload)
```

### Internal Flow

```python
get_asset_for_provider(asset_id, target_provider)
    ↓
Check provider_uploads cache
    ├─ Cached? → Return cached ID
    └─ Not cached? → _upload_to_provider()
          ↓
      Download to local (if not cached)
          ↓
      Upload to target provider
          ↓
      Cache provider-specific ID
          ↓
      Return provider ID
```

## Provider Interface

### upload_asset()

All providers must implement (or raise NotImplementedError):

```python
async def upload_asset(
    self,
    account: ProviderAccount,
    file_path: str
) -> str:
    """
    Upload asset to provider

    Args:
        account: Provider account
        file_path: Local file path

    Returns:
        Provider-specific asset ID
    """
```

**Sora Implementation:**
```python
async def upload_asset(self, account, file_path):
    client = self._create_client(account)
    response = await client.api.upload_media(file_path)
    return response["id"]  # "media_xyz789"
```

**Pixverse Implementation:**
```python
async def upload_asset(self, account, file_path):
    client = self._create_client(account)
    response = await client.upload(file_path)
    return response["video_id"]  # "video_abc123"
```

## Job Processing Changes

### Before (URL-based)

```python
# ❌ OLD WAY - Won't work cross-provider
params = {
    "video_url": "https://pixverse-cdn.com/video123.mp4"
}
```

### After (Asset ID-based)

```python
# ✅ NEW WAY - Works cross-provider
params = {
    "video_asset_id": 123  # Our internal asset ID
}

# Job processor resolves to provider-specific ID
provider_id = await asset_service.get_asset_for_provider(
    asset_id=params["video_asset_id"],
    target_provider_id=job.provider_id
)
```

## Usage Examples

### Example 1: Pixverse → Sora Extension

```python
# 1. Generate video on Pixverse
pixverse_job = await create_job(
    user_id=1,
    provider_id="pixverse",
    operation_type=OperationType.TEXT_TO_VIDEO,
    params={"prompt": "cat dancing"}
)
# ... job completes ...
# Asset #123 created automatically

# 2. Extend on Sora
sora_job = await create_job(
    user_id=1,
    provider_id="sora",
    operation_type=OperationType.VIDEO_EXTEND,
    params={
        "video_asset_id": 123,  # Reference to Pixverse video
        "prompt": "cat continues dancing in rain"
    }
)
# AssetService automatically:
# - Downloads Pixverse video
# - Uploads to Sora
# - Caches Sora media ID
# - Uses for extension
```

### Example 2: Runway → Pixverse Transition

```python
# 1. Generate on Runway
runway_asset_id = 456

# 2. Create transition on Pixverse
pixverse_job = await create_job(
    provider_id="pixverse",
    operation_type=OperationType.VIDEO_TRANSITION,
    params={
        "image_asset_ids": [runway_asset_id, 789],
        "prompts": ["smooth transition", "blend together"]
    }
)
# AssetService uploads both assets to Pixverse automatically
```

### Example 3: Batch Operations

```python
# Generate 10 videos on Pixverse
pixverse_assets = [101, 102, 103, ..., 110]

# Extend all on Sora
for asset_id in pixverse_assets:
    await create_job(
        provider_id="sora",
        params={"video_asset_id": asset_id, ...}
    )

# First job: Downloads + uploads (slow)
# Jobs 2-10: Uses cache (fast!)
```

## Caching Strategy

### Cache Key
```
provider_uploads[provider_id] = provider_asset_id
```

### Cache Hit
```python
if "sora" in asset.provider_uploads:
    return asset.provider_uploads["sora"]  # Instant!
```

### Cache Miss
```python
# Download → Upload → Cache → Return
sora_id = await upload_to_sora(asset)
asset.provider_uploads["sora"] = sora_id
return sora_id
```

### LRU Eviction (Future)

```python
# Update access time on every use
asset.last_accessed_at = datetime.utcnow()

# Periodically evict least recently used
DELETE FROM assets
WHERE sync_status = 'DOWNLOADED'
ORDER BY last_accessed_at ASC
LIMIT 100;
```

## Storage Considerations

### Local Disk Cache

**Pros:**
- Fast access
- No bandwidth costs

**Cons:**
- Limited space
- Single server

**Strategy:**
- Cache frequently-used assets
- LRU eviction when disk full
- Configurable cache size limit

### S3/Cloud Storage (Future)

**Pros:**
- Unlimited space
- Multi-region

**Cons:**
- Bandwidth costs
- Slower than local

**Strategy:**
- Store all assets in S3 (permanent)
- Cache hot assets locally
- Use S3 as fallback

## Migration Path

### Phase 1: Basic (Current)
✅ Asset model with `provider_uploads`
✅ `AssetService.get_asset_for_provider()`
✅ Temporary file downloads
✅ Provider `upload_asset()` interface

### Phase 2: Caching
- Local disk cache
- LRU eviction
- Cache size monitoring
- Pre-download popular assets

### Phase 3: Cloud Storage
- S3 integration
- Multi-region support
- CDN integration
- Automatic tier management

### Phase 4: Optimization
- Parallel uploads (upload to multiple providers at once)
- Predictive pre-upload (ML predicts which providers user will use)
- Format conversion (optimize for each provider)
- Deduplication (same asset used multiple times)

## Benefits

✅ **Zero User Friction** - Works automatically
✅ **Performance** - Cache prevents re-uploads
✅ **Flexibility** - Use any asset on any provider
✅ **Cost Efficient** - Download/upload once, cache forever
✅ **Future-Proof** - Easy to add new providers
✅ **Transparent** - User just references asset ID

## Potential Issues & Solutions

### Issue: Temporary files fill disk
**Solution:** Cleanup after upload, configurable temp dir

### Issue: Large video uploads slow
**Solution:** Background upload queue, progress tracking

### Issue: Provider upload fails
**Solution:** Retry logic, exponential backoff

### Issue: Asset no longer available at source
**Solution:** Permanent S3 storage, download on creation

### Issue: Different format requirements
**Solution:** FFmpeg conversion layer, provider-specific optimization

---

**Bottom Line:** You can now use assets from any provider with any other provider, with automatic caching and zero user configuration. Just reference the asset ID!
