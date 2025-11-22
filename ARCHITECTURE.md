# PixSim7 Architecture

**Last Updated:** 2025-11-16
**Status:** ✅ **Production Ready** - All core systems complete

---

## 📊 System Overview

PixSim7 is a video generation platform with cross-provider support, asset management, and branching narrative capabilities for games. Built with clean architecture principles and strict separation of concerns.

### **Current Implementation Status**

| Component | Status | Details |
|-----------|--------|---------|
| **Backend API** | ✅ 100% | 25+ REST endpoints, FastAPI, async/await |
| **Service Layer** | ✅ 100% | 10 services, dependency injection |
| **Workers** | ✅ 100% | ARQ job processor, status poller, automation |
| **Database** | ✅ 100% | PostgreSQL + pgvector, 22 tables, Alembic migrations |
| **Provider System** | ✅ 100% | Pixverse complete, Sora partial |
| **Admin Panel** | ✅ 100% | SvelteKit, 9 routes, real-time monitoring |
| **Frontend** | ✅ 95% | React 19, 179 files, modular architecture |
| **Game Frontend** | ✅ 95% | Scene player, mini-games, progression system |
| **Chrome Extension** | ✅ 100% | Cookie management, asset capture |
| **Logging System** | ✅ 100% | Structured JSON logging, database ingestion |

---

## 🏗️ Architecture Layers

### 1. **Backend Architecture** (Clean Architecture)

```
┌─────────────────────────────────────────────────────────┐
│                     API Layer (FastAPI)                  │
│  ┌────────┬────────┬────────┬────────┬────────┐        │
│  │ Auth   │ Jobs   │ Assets │Accounts│ Admin  │        │
│  └────────┴────────┴────────┴────────┴────────┘        │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                   Service Layer (Business Logic)         │
│  ┌─────────────┬──────────────┬──────────────┐         │
│  │ UserService │ JobService   │ AssetService │         │
│  │ AuthService │ AccountSvc   │ ProviderSvc  │         │
│  │             │ SubmissionSvc│ UploadSvc    │         │
│  │             │ AutomationSvc│ LineageSvc   │         │
│  └─────────────┴──────────────┴──────────────┘         │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                  Domain Layer (Models)                   │
│  User, Job, Asset, ProviderAccount, ProviderSubmission  │
│  AssetLineage, AssetBranch, Scene, GenerationArtifact   │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│              Infrastructure Layer                        │
│  Database | Redis | Events | Queue | Storage | Logging  │
└─────────────────────────────────────────────────────────┘
```

### 2. **Frontend Architecture** (Modular)

```
┌─────────────────────────────────────────────────────────┐
│                    Routes (Pages)                        │
│  Home | Login | Assets | Workspace | Graph | Automation │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                 Component Layer                          │
│  ┌──────────┬──────────┬──────────┬──────────┐         │
│  │ Layout   │ Control  │ Media    │ Nodes    │         │
│  │ DockView │ Center   │ Cards    │ Inspector│         │
│  └──────────┴──────────┴──────────┴──────────┘         │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│              State Management (Zustand)                  │
│  authStore | layoutStore | controlCenterStore           │
│  graphStore | toastStore | cubeStore                    │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│                  Modules (Features)                      │
│  gallery | scene-builder | (extensible module system)   │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 Technology Stack

### **Backend**
- **Language:** Python 3.11+
- **Framework:** FastAPI (async)
- **ORM:** SQLModel (SQLAlchemy + Pydantic)
- **Database:** PostgreSQL 15 + pgvector
- **Cache/Queue:** Redis + ARQ workers
- **Migrations:** Alembic
- **Logging:** Structured JSON (pixsim_logging)
- **Providers:** pixverse-py SDK, sora-py SDK

### **Frontend (Main App)**
- **Language:** TypeScript
- **Framework:** React 19
- **Build Tool:** Vite
- **State:** Zustand
- **Styling:** TailwindCSS
- **Layout:** Dockview (dock management)
- **Icons:** Lucide React (centralized icon system)
- **API Client:** Custom async client with JWT auth

### **Admin Panel**
- **Framework:** SvelteKit 5
- **Language:** TypeScript
- **Styling:** TailwindCSS
- **Charts:** Chart.js

### **Game Frontend**
- **Framework:** React
- **Language:** TypeScript
- **Build Tool:** Vite
- **Features:** Scene player, mini-games, progression

### **Infrastructure**
- **Containerization:** Docker + Docker Compose
- **Database:** PostgreSQL in Docker
- **Cache:** Redis in Docker
- **Reverse Proxy:** (optional) Nginx
- **Process Manager:** PM2 or systemd (production)

---

## 📦 Component Details

### **Backend Services** (10 Core Services)

1. **AuthService** (`services/user/auth_service.py`)
   - JWT token generation/validation
   - Session management
   - Token revocation

2. **UserService** (`services/user/user_service.py`)
   - User CRUD operations
   - Quota tracking
   - Profile management

3. **JobService** (`services/job/job_service.py`)
   - Job creation and management
   - Status tracking
   - Priority queue management

4. **AccountService** (`services/account/account_service.py`)
   - Provider account pooling
   - Smart account selection
   - Credit tracking
   - Concurrency management

5. **ProviderService** (`services/provider/provider_service.py`)
   - Provider orchestration
   - Parameter mapping
   - Provider registry management

6. **AssetService** (`services/asset/asset_service.py`)
   - Asset CRUD operations
   - Cross-provider upload management
   - Lineage tracking
   - Metadata management

7. **LineageService** (`services/asset/lineage_service.py`)
   - Asset lineage graph management
   - Parent-child relationships
   - Multi-parent support

8. **SubmissionPipeline** (`services/submission/pipeline.py`)
   - Job submission orchestration
   - Structured logging stages
   - Error handling

9. **UploadService** (`services/upload/upload_service.py`)
   - User file uploads
   - Provider compatibility checks
   - Image validation

10. **AutomationService** (`services/automation/`)
    - Device agent management
    - ADB automation
    - Execution loop service
    - Action executor

### **Provider Adapters**

**Pixverse Adapter** (`services/provider/adapters/pixverse.py` - 38KB)
- ✅ Text-to-Video
- ✅ Image-to-Video
- ✅ Video Extend
- ✅ Video Transition
- ✅ Fusion (character consistency)
- ✅ Status polling
- ✅ Upload asset (cross-provider)

**Sora Adapter** (`services/provider/adapters/sora.py` - 19KB)
- 🟡 Partial implementation
- ✅ Upload asset
- 🔄 Generation endpoints (in progress)

### **Background Workers**

1. **Job Processor** (`workers/job_processor.py`)
   - Processes pending jobs from queue
   - Account selection
   - Provider submission
   - Error handling with retries

2. **Status Poller** (`workers/status_poller.py`)
   - Polls provider job status (10s intervals)
   - Creates assets on completion
   - Updates job status
   - Provider error handling

3. **Automation Worker** (`workers/automation.py`)
   - Device automation tasks
   - ADB command execution
   - Loop management

### **Database Schema** (22 Tables)

**Core Tables:**
- `user`, `user_session`, `user_quota_usage`, `user_profile`
- `workspace`
- `job`
- `asset`, `asset_variant`
- `provider_account`, `provider_submission`, `provider_credit`
- `generation_artifact`

**Asset Metadata:**
- `asset_3d_metadata`
- `asset_audio_metadata`
- `asset_temporal_segment`
- `asset_adult_metadata`

**Lineage & Branching:**
- `asset_lineage`
- `asset_branch`
- `asset_branch_variant`
- `asset_clip`

**Scene System:**
- `scene`, `scene_asset`, `scene_connection`

**Automation:**
- `device_agent`

**Logging:**
- `log_entry`

---

## 🔄 Data Flow Examples

### **Job Submission Flow**

```
1. User Request → API POST /api/v1/jobs
                    ↓
2. JobService.create_job()
   - Validate parameters
   - Check user quota
   - Create Job record (status: PENDING)
                    ↓
3. Queue job → ARQ (Redis queue)
                    ↓
4. Job Processor Worker picks up job
   - AccountService.select_account()
   - ProviderService.submit_job()
   - Create ProviderSubmission record
   - Update Job status → PROCESSING
                    ↓
5. Status Poller Worker (every 10s)
   - Provider.check_status()
   - If complete:
     - AssetService.create_asset()
     - Download video
     - Update Job status → COMPLETED
```

### **Cross-Provider Asset Upload Flow**

```
1. Job needs asset from Provider A as input for Provider B
                    ↓
2. AssetService.get_asset_for_provider(asset_id, "provider_b")
                    ↓
3. Check if asset already uploaded to Provider B
   - If yes: return cached provider_asset_id
   - If no: continue
                    ↓
4. Download asset to local storage (if not local)
                    ↓
5. ProviderB.upload_asset(local_path)
                    ↓
6. Cache provider_asset_id in Asset.provider_uploads
   - Update Asset.last_accessed_at (LRU tracking)
                    ↓
7. Return provider_asset_id for use in job
```

---

## 🔐 Authentication & Authorization

### **JWT Token Flow**

```
1. POST /api/v1/auth/login
   - Validate credentials
   - Create UserSession record
                    ↓
2. Generate JWT token
   - Payload: user_id, session_id, exp
   - Sign with SECRET_KEY
                    ↓
3. Return token to client
                    ↓
4. Client includes in Authorization header
   - "Bearer {token}"
                    ↓
5. API middleware validates token
   - Decode JWT
   - Check session not revoked
   - Inject current_user into request
```

### **Role-Based Access**

- `admin`: Full system access
- `user`: Standard user access
- Future: `viewer`, `operator`, etc.

---

## 📊 Monitoring & Logging

### **Structured Logging**

All services use `pixsim_logging` package:

```python
from pixsim_logging import get_logger

logger = get_logger()
logger.info(
    "Job submitted",
    job_id=job.id,
    provider_id="pixverse",
    stage="pipeline:start"
)
```

**Log Stages:**
- `pipeline:start`, `pipeline:artifact`, `pipeline:complete`
- `provider:submit`, `provider:status`, `provider:complete`
- `worker:start`, `worker:complete`

**Log Fields:**
- Standard: timestamp, level, service, env, msg
- Context: job_id, user_id, provider_id, account_id
- Technical: request_id, exception, stack_trace
- Performance: duration_ms

### **Admin Panel Monitoring**

- **Dashboard:** Service health, metrics
- **Jobs:** Real-time queue monitoring
- **Logs:** Advanced filtering, search, auto-refresh
- **Accounts:** Credit balances, health status
- **Assets:** Gallery view, storage stats

---

## 🚀 Deployment Architecture

### **Development Mode**

```
┌─────────────────┐
│  Docker Compose │
│  - PostgreSQL   │
│  - Redis        │
└─────────────────┘
        ↓
┌─────────────────┐
│  Local Processes│
│  - Backend      │
│  - Worker       │
│  - Admin Panel  │
│  - Frontend     │
└─────────────────┘
```

### **Production Mode**

```
┌──────────────────────────────────────┐
│         Docker Compose (All)         │
│  ┌────────┬────────┬────────┬─────┐ │
│  │Backend │Worker  │Admin   │DBs  │ │
│  └────────┴────────┴────────┴─────┘ │
└──────────────────────────────────────┘
                ↓
         ┌──────────────┐
         │  Nginx       │
         │  (optional)  │
         └──────────────┘
```

---

## 📈 Performance Characteristics

### **Backend**
- Async/await throughout
- Connection pooling (PostgreSQL, Redis)
- Background job processing (ARQ)
- LRU cache for cross-provider assets

### **Frontend**
- Code splitting (Vite)
- Lazy loading (React.lazy)
- Memoization (React.memo, useMemo, useCallback)
- Virtual scrolling (for large lists)

### **Database**
- Indexed foreign keys
- pgvector for CLIP embeddings
- Optimized queries (select only needed fields)

---

## 🔮 Extension Points

### **Adding a New Provider**

1. Create adapter: `services/provider/adapters/your_provider.py`
2. Extend `BaseProvider` interface
3. Implement: `execute()`, `check_status()`, `upload_asset()`
4. Register in `registry.py`
5. Add to `ProviderType` enum

### **Adding a Frontend Module**

1. Create: `apps/main/src/modules/your-module/`
2. Implement `Module` interface
3. Register in `modules/index.ts`
4. Module appears in registry automatically

### **Adding a Background Task**

1. Create function in `workers/`
2. Register in `arq_worker.py`
3. Configure cron schedule if needed

---

## 🏛️ Backend Conventions

### **Domain Package Boundaries**

The `pixsim7.backend.main.domain` package follows a strict export convention to maintain clarity and prevent circular dependencies:

**Core Models (exported from `domain/__init__.py`):**
- User, authentication, and workspace models
- Asset models (Asset, AssetVariant, metadata, lineage, branches, clips)
- Generation models (Generation, ProviderSubmission, ProviderAccount, ProviderCredit)
- Scene models (Scene, SceneAsset, SceneConnection)
- Logging models (LogEntry)
- Prompt versioning models (PromptFamily, PromptVersion, PromptVariantFeedback)

These are considered "cross-cutting" models used throughout the application and can be imported directly from the domain package:

```python
from pixsim7.backend.main.domain import User, Asset, Generation
```

**Extended Subsystems (import from submodules):**
- **Game models:** `from pixsim7.backend.main.domain.game.models import GameWorld, GameSession`
- **Metrics:** `from pixsim7.backend.main.domain.metrics import ...`
- **Behavior:** `from pixsim7.backend.main.domain.behavior import ...`
- **Scenarios:** `from pixsim7.backend.main.domain.scenarios import ...`
- **Automation:** `from pixsim7.backend.main.domain.automation import ...`
- **Narrative:** `from pixsim7.backend.main.domain.narrative import ...`

These subsystems are more specialized and must be imported from their specific submodules.

**Rationale:**
- Prevents `domain/__init__.py` from becoming bloated with every model
- Makes it clear which models are core vs. feature-specific
- Reduces risk of circular import issues
- Easier to understand which imports are "safe" everywhere vs. feature-scoped

See `pixsim7/backend/main/domain/__init__.py` for the definitive list and detailed documentation.

### **Pydantic v2 and Type Annotations**

The backend uses Pydantic v2 throughout. For type hint handling, we **allow** (but don't require) `from __future__ import annotations` in backend modules.

**Convention:**
- `from __future__ import annotations` is **optional** in backend modules
- If used, **all type names** must be properly imported (e.g., `Optional`, `Dict`, `List`, `Any`)
- Never rely on builtin types being magically available in string annotations

**Example (correct usage):**
```python
from __future__ import annotations

from typing import Optional, Dict, Any, List
from pydantic import BaseModel

class MyModel(BaseModel):
    data: Dict[str, Any]  # ✅ Dict imported
    items: Optional[List[str]] = None  # ✅ Optional and List imported
```

**Example (incorrect - will fail with Pydantic):**
```python
from __future__ import annotations

from pydantic import BaseModel

class MyModel(BaseModel):
    data: Dict[str, Any]  # ❌ Dict not imported - PydanticUndefinedAnnotation
    items: Optional[List[str]] = None  # ❌ Optional, List not imported
```

**Why this convention:**
- With `__future__` annotations, Pydantic v2 needs to resolve forward references at runtime
- Pydantic looks up annotation strings in the module's namespace
- If `Optional`, `Dict`, etc. aren't imported, Pydantic raises `PydanticUndefinedAnnotation`

**When in doubt:** omit `from __future__ import annotations` for Pydantic-heavy modules (API routes, plugin manifests). The performance benefit is minimal for most use cases.

### **ORM Reserved Attribute Names**

SQLAlchemy and Pydantic reserve certain attribute names. Using these names directly in ORM models (SQLModel with `table=True`) will cause errors.

**Hard Rules:**
1. **Never use `metadata` as an attribute name** in SQLModel table classes
   - SQLAlchemy reserves `metadata` for table metadata
   - Use `meta`, `extra`, or `data` instead
2. **Never use `model_*` prefixes** for field names in Pydantic models
   - Pydantic v2 reserves the `model_` namespace for internal methods
3. **Use explicit column mapping** when database columns use reserved names

**Example (correct approach):**
```python
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import JSON

class MyModel(SQLModel, table=True):
    id: int = Field(primary_key=True)

    # ✅ Safe: attribute is "meta", column is "metadata"
    meta: Dict[str, Any] = Field(
        default_factory=dict,
        sa_column=Column(JSON, name="metadata")
    )
```

**Example (incorrect - will fail):**
```python
class MyModel(SQLModel, table=True):
    id: int = Field(primary_key=True)
    metadata: Dict[str, Any] = Field(default_factory=dict)  # ❌ SQLAlchemy error!
    model_data: str = Field(...)  # ❌ Conflicts with Pydantic internals!
```

**Other Reserved Names to Avoid:**
- `metadata` (SQLAlchemy)
- `model_*` (Pydantic v2)
- `registry` (SQLAlchemy)
- `_sa_*` (SQLAlchemy internals)

See `pixsim7/backend/main/domain/npc_memory.py:104-107` for a reference implementation.

### **API Route Import Isolation**

To prevent cascading import failures where one broken API module prevents unrelated plugins or routes from loading:

**Best Practices:**
1. **Route manifests should import specific modules**, not the `api.v1` package:
   ```python
   # ✅ CORRECT - Import specific module
   from pixsim7.backend.main.api.v1.logs import router

   # ❌ INCORRECT - Import package (couples to all modules)
   from pixsim7.backend.main.api import v1
   ```

2. **Run route import self-check** during development:
   ```bash
   python scripts/check_api_imports.py
   ```
   This script imports each `api/v1` module independently and surfaces import errors early.

3. **Keep `api/v1/__init__.py` minimal** - it exists for IDE convenience and documentation,
   but production code should use explicit module imports.

**Rationale:**
- A broken `dev_architecture.py` shouldn't prevent `logs.py` from loading
- Plugin manifests that import specific modules are isolated from unrelated failures
- Early detection of import errors via the self-check script reduces debugging time

### **Logging Facade for Event Handlers and Plugins**

Backend code, event handlers, and plugins should use the logging facade instead of directly importing from `pixsim_logging`. This isolates them from changes to the logging implementation.

**Recommended Approach:**
```python
# ✅ CORRECT - Use backend logging facade
from pixsim7.backend.main.shared.logging import get_event_logger

logger = get_event_logger("auto_retry")
logger.info("Event handled", event_type="job:failed")
```

**Legacy Approach (avoid for new code):**
```python
# ⚠️ LEGACY - Direct import (fragile to logging changes)
from pixsim_logging import configure_logging

logger = configure_logging("events.auto_retry")
```

**Available Helpers:**
- `get_backend_logger(service_name)` - General backend logger
- `get_event_logger(handler_name)` - For event handlers (prefixes with "events.")
- `get_plugin_logger(plugin_id)` - For plugins (prefixes with "plugin.")

**Example for Event Handlers:**
```python
from pixsim7.backend.main.shared.logging import get_event_logger

logger = get_event_logger("auto_retry")  # Creates "events.auto_retry" logger
```

**Example for Plugins:**
```python
from pixsim7.backend.main.shared.logging import get_plugin_logger

logger = get_plugin_logger("game-dialogue")  # Creates "plugin.game-dialogue" logger
```

**Rationale:**
- Future changes to `pixsim_logging` structure only require updating the facade
- Event handlers and plugins remain isolated from logging implementation details
- Consistent naming conventions across all backend code

### **Backend Startup & Readiness**

The backend startup process distinguishes between **required** and **optional** subsystems to enable graceful degradation and proper orchestration health checks.

#### Startup Policy

**Required Subsystems** (fail-fast):
- **Database**: Must be available. Startup aborts if DB is unreachable.
- **Domain Registry**: Must load all domain models successfully.
- **Core ECS Components**: Must register successfully.

**Conditional Subsystems** (depends on environment):
- **Feature Plugins**: Fail-fast in dev/CI (`DEBUG=true`), tolerant in production (unless marked `required=true` in manifest).
- **Route Plugins**: Fail-fast in dev/CI, tolerant in production.

**Optional Subsystems** (degraded mode):
- **Redis**: Used for background jobs, LLM caching, and sessions. App continues without it, but background processing is disabled.
- **Default Presets**: Database seeding is optional. Warnings logged if it fails.

#### Health vs Readiness

The backend provides three endpoints with different semantics:

**`GET /` - Liveness Probe**
- Always returns HTTP 200 (unless process is wedged)
- Lightweight check with no dependency queries
- Use for: Kubernetes `livenessProbe`, basic monitoring

**`GET /health` - Health Check**
- Always returns HTTP 200 with detailed status
- Response includes DB/Redis/providers status
- Status field: `"healthy"` or `"degraded"`
- Use for: Monitoring dashboards, alerting on degraded state

**`GET /ready` - Readiness Probe**
- Returns HTTP 503 if database unavailable
- Returns HTTP 200 if ready to serve traffic
- Status field: `"ready"`, `"degraded"`, or `"unavailable"`
- Redis failure → `"degraded"` (still returns 200)
- Database failure → `"unavailable"` (returns 503)
- Use for: Kubernetes `readinessProbe`, load balancer routing

**Example Kubernetes Configuration:**
```yaml
livenessProbe:
  httpGet:
    path: /
    port: 8001
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /ready
    port: 8001
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3
```

**Rationale:**
- Liveness vs readiness separation prevents restart loops when DB is temporarily down
- Degraded mode (Redis unavailable) still serves traffic but without background jobs
- Fail-fast in dev/CI catches configuration errors early
- Graceful degradation in production improves availability

See `docs/BACKEND_STARTUP.md` for detailed startup sequence and helper function documentation.

---

## 📚 Key Design Decisions

### **Why Clean Architecture?**
- Testable (services are pure functions with DI)
- Maintainable (single responsibility)
- Extensible (new providers = new adapter)
- 81% less code than PixSim6

### **Why Zustand over Redux?**
- Simpler API
- No boilerplate
- Better TypeScript support
- Smaller bundle size

### **Why Dockview?**
- Professional dock management
- Floating panels
- Customizable layouts
- Active maintenance

### **Why ARQ over Celery?**
- Native async/await support
- Redis-only (simpler stack)
- Better performance for I/O-bound tasks
- Smaller footprint

---

## 🔗 Related Documentation

- **Development Guide:** `docs/DEVELOPMENT_GUIDE.md`
- **Backend Services:** `docs/backend/SERVICES.md`
- **Frontend Components:** `docs/frontend/COMPONENTS.md`
- **API Reference:** http://localhost:8001/docs (auto-generated)
- **Deployment:** `docs/DEPLOYMENT.md`

---

**Last Updated:** 2025-11-16
**Maintainers:** PixSim7 Team
