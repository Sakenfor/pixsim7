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
