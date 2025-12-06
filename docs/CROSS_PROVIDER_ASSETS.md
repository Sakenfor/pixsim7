# Cross-Provider Asset System

**Status:** ✅ Complete - All schema changes implemented and migrated

---

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

---

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

---

## Implementation Details

### Database Schema

#### Asset Model (domain/asset.py)
```python
class Asset:
    # Identity
    id: int
    user_id: int
    media_type: MediaType  # VIDEO, IMAGE, AUDIO, MODEL_3D

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
    description, tags, style_tags

    # Content classification
    content_domain: ContentDomain  # GENERAL, ADULT, SPORTS, FASHION, etc.
    content_category: str  # Indexed subcategory (e.g., "football", "artistic_nude")
    content_rating: str  # "general", "mature", "adult", "explicit"
    age_restricted: bool
    searchable: bool

    # Vector search
    embedding: Vector(768)  # CLIP embeddings for similarity

    # LRU cache management
    last_accessed_at: datetime  # For cache eviction

    # Provenance
    original_source_url: str
    upload_method: str  # "extension", "api", "web", "mobile"
```

#### Metadata Tables (domain/asset_metadata.py)

**Asset3DMetadata** - 3D model properties:
- polygon_count, vertex_count, file_format
- has_textures, has_animations, has_rigging, has_materials

**AssetAudioMetadata** - Audio file properties:
- sample_rate, channels, bitrate, codec
- bpm, key, has_lyrics, is_speech, language

**AssetTemporalSegment** - Video keyframes/scenes:
- segment_type, timestamp_sec, frame_number
- thumbnail_url, description, objects, actions
- embedding for frame similarity

**AssetAdultMetadata** - Adult content metadata:
- intensity_level, tempo, scene_type
- Precise similarity matching for adult content

#### Lineage & Branching (domain/asset_lineage.py)

**AssetLineage** - Parent→child relationships:
- Tracks how assets derive from each other
- Supports multiple parents (transitions, storyboards)
- Temporal metadata (start_time, end_time, frame)

**AssetBranch** - Branch points in videos:
- Used for game narratives with multiple paths
- branch_time, branch_frame, branch_type

**AssetBranchVariant** - Variant options at branches:
- Multiple endings: "Hero wins", "Hero escapes", etc.

**AssetClip** - Game bookmarks/references:
- "Boss intro is at 10-15s in cutscene_video"

### Database Infrastructure

**PostgreSQL Setup:**
- Image: `pgvector/pgvector:pg15` (docker-compose.yml)
- Port: 5434
- Extension: pgvector v0.8.1
- Database: pixsim7

**Migrations Applied:**
- ✅ `25b67935f5e1` - Audio/3D support and metadata tables
- ✅ `14b1bebe4be1` - Content category and taxonomy fields
- ✅ `7425b92ac62e` - Asset lineage and branching tables

---

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

**Implementation flow:**
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

**Location:** `services/asset/asset_service.py` (lines 338-503)

---

## Provider Interface

All providers must implement:

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

**Sora Implementation** (services/provider/adapters/sora.py:464-505):
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

---

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

### Example 2: Content Categories & Search

```python
# Create adult content with subcategory
asset = Asset(
    media_type=MediaType.VIDEO,
    content_domain=ContentDomain.ADULT,
    content_category="artistic_nude",  # Indexed for fast queries
    content_rating="adult",
    age_restricted=True
)

# Add structured metadata
metadata = AssetAdultMetadata(
    asset_id=asset.id,
    intensity_level="moderate",
    scene_type="solo",
    mood="artistic",
    lighting="dramatic"
)

# Query: Find artistic nude content with moderate intensity
results = await db.execute(
    select(Asset)
    .join(AssetAdultMetadata)
    .where(
        Asset.content_category == "artistic_nude",
        AssetAdultMetadata.intensity_level == "moderate",
        AssetAdultMetadata.mood == "artistic"
    )
)
# ⚡⚡⚡ Fast - all indexed fields
```

### Example 3: Branching for Game Narratives

```python
# Create branch point at 10.5 seconds
branch = AssetBranch(
    source_asset_id=123,
    branch_time=10.5,
    branch_frame=315,
    branch_name="Fork in the Road",
    branch_tag="path_choice_01"
)

# Add 3 variant paths
paths = [
    ("Forest Path", "path_forest"),
    ("Mountain Path", "path_mountain"),
    ("Cave Path", "path_cave")
]

for name, tag in paths:
    # Create extended video for each path
    job = create_extend_job(base_video=123, start_time=10.5, prompt=name)
    # ... job creates variant asset

    variant = AssetBranchVariant(
        branch_id=branch.id,
        variant_asset_id=job.result_asset_id,
        variant_name=name,
        variant_tag=tag
    )

# Game runtime: Load branches once at start (zero DB queries during gameplay!)
branches = await db.execute(
    select(AssetBranch, AssetBranchVariant, Asset)
    .join(AssetBranchVariant)
    .join(Asset, AssetBranchVariant.variant_asset_id == Asset.id)
    .where(AssetBranch.source_asset_id == 123)
)
```

### Example 4: Sora Storyboard Tracking

```python
# Sora storyboard with keyframes
job = Job(
    operation_type=OperationType.TEXT_TO_VIDEO,
    params={
        "keyframes": [
            {"frame": 48, "image_media_id": "img_001", "action": "zoom_in"},
            {"frame": 132, "image_media_id": "img_002", "action": "pan_left"}
        ]
    }
)
# ... creates video asset #789

# Track lineage for each keyframe
for i, kf in enumerate(job.params["keyframes"]):
    lineage = AssetLineage(
        child_asset_id=789,
        parent_asset_id=get_image_asset(kf["image_media_id"]),
        parent_role="keyframe",
        parent_frame=kf["frame"],
        sequence_order=i,
        transformation={"action": kf["action"], "frame_position": kf["frame"]}
    )
```

---

## Caching Strategy

### Cache Key
```python
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

---

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

---

## Migration Commands

```bash
# Generate migration
cd pixsim7_backend/infrastructure/database
PYTHONPATH=G:/code/pixsim7 alembic revision --autogenerate -m "Description"

# Run migration
PYTHONPATH=G:/code/pixsim7 alembic upgrade head

# Rollback
PYTHONPATH=G:/code/pixsim7 alembic downgrade -1
```

---

## Future Work

### Not Yet Implemented

1. **User Upload System** - POST /api/v1/assets/upload endpoint
2. **Vision Model Integration** - Auto-tagging, CLIP embeddings
3. **LRU Cache Eviction** - Background job for storage management
4. **Loop Detection** - Analyze assets for self-looping segments
5. **Dynamic Composition** - Build videos of arbitrary duration from segments
6. **S3 Integration** - Permanent cloud storage

---

## Benefits

✅ **Zero User Friction** - Works automatically
✅ **Performance** - Cache prevents re-uploads
✅ **Flexibility** - Use any asset on any provider
✅ **Cost Efficient** - Download/upload once, cache forever
✅ **Future-Proof** - Easy to add new providers
✅ **Transparent** - User just references asset ID
✅ **Game-Ready** - Branching narratives, temporal segments
✅ **Content Management** - Structured metadata, vector search

---

**Bottom Line:** You can now use assets from any provider with any other provider, with automatic caching, zero user configuration, and support for complex game narratives with branching paths. Just reference the asset ID!
