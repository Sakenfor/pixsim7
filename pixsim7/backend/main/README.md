# PixSim7 Backend - Clean Architecture

**Status:** 🚧 Foundation scaffolded (Phase 1 in progress)

Clean, domain-driven architecture for video generation and scene assembly.

---

## 📁 Directory Structure

```
pixsim7/backend/main/
├── domain/                      # ✅ COMPLETE - Core entities
│   ├── enums.py                # Shared enums
│   ├── asset.py                # Asset, AssetVariant
│   ├── job.py                  # Job (minimal, no duplication)
│   ├── provider_submission.py  # ProviderSubmission (source of truth)
│   ├── account.py              # ProviderAccount
│   └── scene.py                # Scene, SceneAsset, SceneConnection
│
├── services/                    # 🚧 TODO - Business logic
│   ├── job/                    # Job lifecycle
│   ├── asset/                  # Asset management
│   ├── provider/               # Provider orchestration
│   │   ├── base.py            # ✅ Provider interface
│   │   ├── adapters/          # TODO: Pixverse, Runway, Pika
│   │   └── registry.py        # TODO: Provider registry
│   ├── account/               # Account selection
│   └── scene/                 # Scene assembly (Phase 2)
│
├── api/                        # TODO - FastAPI routes
│   └── v1/                    # API v1
│       ├── jobs.py
│       ├── assets.py
│       ├── scenes.py
│       └── accounts.py
│
├── infrastructure/             # TODO - Technical implementation
│   ├── database/              # SQLModel + Alembic
│   ├── events/                # Event bus (Redis)
│   ├── cache/                 # Redis cache
│   ├── queue/                 # ARQ worker
│   └── storage/               # File storage
│
├── shared/                     # TODO - Shared code
│   ├── schemas/               # Pydantic request/response schemas
│   ├── errors.py              # Custom exceptions
│   ├── config.py              # Settings (Pydantic)
│   └── types.py               # Shared types
│
└── workers/                    # TODO - Background workers
    ├── job_processor.py       # Process job queue
    └── status_poller.py       # Poll provider status
```

---

## ✅ What's Done (Foundation)

### 1. Domain Models (Clean Architecture)

**Key improvements over PixSim6:**
- ✅ **No duplication**: ProviderSubmission is source of truth for generation params
- ✅ **Single responsibility**: Each model does ONE thing
- ✅ **No defaults**: provider_id, operation_type must be explicit
- ✅ **Simplified Asset**: Removed 15+ redundant fields

#### Asset Model
```python
# BEFORE (PixSim6): 198 lines, 30+ fields (including duplicates)
# AFTER (PixSim7): 80 lines, core fields only

class Asset(SQLModel, table=True):
    id: int
    user_id: int

    # Identity
    sha256: str | None  # For deduplication
    media_type: MediaType

    # Provider
    provider_id: str  # NO DEFAULT!
    provider_asset_id: str
    provider_account_id: int | None

    # Location
    remote_url: str
    thumbnail_url: str | None
    local_path: str | None

    # File metadata
    width, height, duration_sec, file_size_bytes

    # State
    sync_status: SyncStatus

    # Provenance
    source_job_id: int | None

    # Timestamps
    created_at, downloaded_at

    # NO: prompt, model, quality (in ProviderSubmission)
    # NO: lineage fields (separate Lineage table later)
    # NO: upload tracking (in ProviderSubmission)
```

#### Job Model
```python
# Minimal job - just tracking and status

class Job(SQLModel, table=True):
    id: int
    user_id: int

    # EXPLICIT operation type (no auto-detection!)
    operation_type: OperationType
    provider_id: str  # NO DEFAULT!

    # Status
    status: JobStatus
    error_message: str | None
    retry_count: int

    # Result
    asset_id: int | None  # Final asset

    # Timestamps
    created_at, started_at, completed_at

    # NO: generation params (in ProviderSubmission)
```

#### ProviderSubmission Model
```python
# THE source of truth for ALL generation parameters

class ProviderSubmission(SQLModel, table=True):
    id: int
    job_id: int
    provider_id: str  # NO DEFAULT!

    # Source of truth
    payload: dict  # ALL generation params here!
    # - prompt, negative_prompt
    # - model, quality, duration
    # - aspect_ratio, seed
    # - image_urls (for i2v)
    # - video_url (for extend)
    # etc.

    response: dict  # Provider response

    # Tracking
    retry_attempt: int
    previous_submission_id: int | None

    # Timing
    submitted_at, responded_at, duration_ms

    # Status
    status: str  # "pending", "success", "error"
```

#### Scene Models (Phase 2 ready)
```python
# Scene: container for connected assets

class Scene(SQLModel, table=True):
    id: int
    user_id: int
    name: str
    description: str | None
    tags: list[str]
    is_template: bool

class SceneAsset(SQLModel, table=True):
    """Asset in a scene with position"""
    id: int
    scene_id: int
    asset_id: int
    order: int  # Sequence order
    position_x, position_y  # Canvas position
    metadata: dict  # For game data later

class SceneConnection(SQLModel, table=True):
    """Connection between assets"""
    id: int
    scene_id: int
    from_scene_asset_id: int
    to_scene_asset_id: int
    connection_type: str  # "next", "choice", "branch"
    label: str | None  # Choice text
    metadata: dict
    order: int
```

### 2. Provider Interface (Clean)
```python
class Provider(ABC):
    @property
    @abstractmethod
    def provider_id(self) -> str: ...

    @abstractmethod
    def map_parameters(
        self, operation_type: OperationType, params: dict
    ) -> dict: ...

    @abstractmethod
    async def execute(
        self, operation_type: OperationType, account: ProviderAccount, params: dict
    ) -> GenerationResult: ...

    @abstractmethod
    async def check_status(
        self, account: ProviderAccount, provider_job_id: str
    ) -> ProviderStatusResult: ...
```

---

## 🚧 Next Steps

### Immediate (Week 1)

1. **Infrastructure Setup**
   - [ ] `shared/config.py` - Pydantic Settings
   - [ ] `infrastructure/database/session.py` - SQLModel session
   - [ ] `infrastructure/database/migrations/` - Alembic setup
   - [ ] `shared/errors.py` - Custom exceptions

2. **Provider Implementation**
   - [ ] `services/provider/adapters/pixverse.py` - Port from PixSim6
   - [ ] `services/provider/registry.py` - Provider registry
   - [ ] Test: Basic Pixverse video generation

3. **Core Services**
   - [ ] `services/job/job_service.py` - Create, update jobs
   - [ ] `services/asset/asset_service.py` - Create, manage assets
   - [ ] `services/provider/provider_service.py` - Execute operations
   - [ ] `services/account/account_service.py` - Select accounts

4. **API Layer**
   - [ ] `api/v1/jobs.py` - Job endpoints
   - [ ] `api/v1/assets.py` - Asset endpoints
   - [ ] `main.py` - FastAPI app

### Phase 2 (Week 2)

- [ ] Event system (`infrastructure/events/`)
- [ ] Background workers (`workers/`)
- [ ] Scene services (`services/scene/`)
- [ ] Scene API (`api/v1/scenes.py`)

### Phase 3 (Week 3+)

- [ ] StoryNode models (wraps Scene with narrative metadata)
- [ ] Player progression
- [ ] Story editor UI (SvelteKit)

---

## 🎯 Design Principles

### 1. Single Source of Truth
**Problem (PixSim6):** Same data in 3 places
- Asset: `prompt`, `model`, `quality`
- VideoGenerationJob: `prompt`, `model`, `quality`
- ProviderSubmission: `payload["prompt"]`, `payload["model"]`

**Solution (PixSim7):** ONE place
- ProviderSubmission.payload = ALL generation params
- Asset = identity + location only
- Job = status tracking only

### 2. No Defaults
**Problem (PixSim6):**
```python
provider_id: str = Field(default="pixverse")  # Hardcoded!
```

**Solution (PixSim7):**
```python
provider_id: str = Field(...)  # Must be explicit!
```

### 3. Explicit Operations
**Problem (PixSim6):** Type detection 3 times
```python
if fusion_assets: ...
elif image_urls and prompts: ...  # transition
elif source_video_id: ...  # extend
else: ...  # text-to-video
```

**Solution (PixSim7):** Explicit
```python
operation_type: OperationType  # Set once, use everywhere
```

### 4. Service Layer
**Problem (PixSim6):** Business logic scattered
- 12+ asset creation sites
- 3 type detection sites
- No single entry point

**Solution (PixSim7):** Single entry points
- `AssetService.create()` - ONLY way to create assets
- `JobService.create()` - ONLY way to create jobs
- `ProviderService.execute()` - ONLY way to call providers

---

## 📊 Size Comparison

| PixSim6 | Lines | PixSim7 | Lines | Reduction |
|---------|-------|---------|-------|-----------|
| Asset model | 198 | 80 | -60% |
| Job models | 400+ | 100 | -75% |
| Provider base | 200 | 180 | -10% |
| **Domain total** | **~1000** | **~400** | **-60%** |

---

## 🔧 Borrowed from PixSim6

✅ **Direct copy (cleaned):**
- ProviderSubmission model (removed defaults)
- ProviderAccount model (simplified credits)
- Provider base patterns

⚠️ **Adapt & simplify:**
- Asset model (removed 15+ fields)
- Job model (merged VideoGenerationJob)

❌ **Leave behind:**
- Prompt DSL (3000+ lines, unused)
- Plugin system (800 lines, no plugins)
- video_generator.py (1200 lines god object) → Replaced with services

---

## 📝 Migration from PixSim6

See: [docs/PIXSIM7_MIGRATION_PLAN.md](../../../docs/PIXSIM7_MIGRATION_PLAN.md)

**Strategy:** Staged approach
1. Build PixSim7 core (Week 1-2)
2. Run both systems in parallel
3. Migrate data with scripts
4. Gradual cutover

---

## 🚀 Getting Started (TODO)

```bash
# Install dependencies
cd pixsim7/backend/main
pip install -r requirements.txt

# Set up database
alembic upgrade head

# Run dev server
uvicorn main:app --reload

# Run worker
python -m workers.job_processor
```

---

## 📚 Documentation

- [Migration Plan](../../../docs/PIXSIM7_MIGRATION_PLAN.md) - What to keep/borrow from PixSim6
- [Architecture Analysis](../../../docs/COMPREHENSIVE_ARCHITECTURE_ANALYSIS.md) - PixSim6 issues
- [Clean Proposal](../../../docs/PIXSIM7_PROPOSAL.md) - Original clean architecture proposal

---

**Next:** Create infrastructure setup (database, config) and port Pixverse provider adapter.
