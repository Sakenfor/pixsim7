# Multi-User Architecture & Service Layer Design

✅ **Updated** - Multi-user support added before building services

---

## 🎉 What We Added

### 1. **User Model** - `domain/user.py`

Complete user management with quotas and role-based access:

```python
class User(SQLModel, table=True):
    # Identity
    email: str (unique)
    username: str (unique)
    password_hash: str

    # Authorization
    role: str  # "admin", "user", "guest"
    is_active: bool
    is_verified: bool

    # Job Quotas
    max_concurrent_jobs: int = 10
    max_daily_jobs: int = 100
    jobs_today: int = 0

    # Asset Quotas
    max_assets: int = 1000
    max_storage_gb: float = 100.0
    current_storage_gb: float = 0.0

    # Provider Account Quotas
    max_provider_accounts: int = 5

    # Usage Stats
    total_jobs_created: int
    total_jobs_completed: int
    total_assets_created: int
```

**Key Methods:**
- `can_create_job()` - Check if user can create more jobs
- `has_storage_available(gb)` - Check storage quota
- `is_admin()` - Check admin role

---

### 2. **User Session Model** - Token Management

```python
class UserSession(SQLModel, table=True):
    user_id: int
    token_id: str (unique)  # JWT jti claim

    # Token lifecycle
    created_at: datetime
    expires_at: datetime
    last_used_at: datetime

    # Revocation
    is_revoked: bool
    revoked_at: datetime
    revoke_reason: str

    # Session info
    ip_address: str
    user_agent: str
```

**Use cases:**
- Token revocation (logout, security breach)
- Session management (view all active sessions)
- Security auditing

---

### 3. **User Quota Usage** - Daily Tracking

```python
class UserQuotaUsage(SQLModel, table=True):
    user_id: int
    date: datetime  # Day precision

    # Daily counters
    jobs_created: int
    jobs_completed: int
    jobs_failed: int
    assets_created: int
    storage_added_gb: float
```

**Use cases:**
- Rate limiting
- Usage analytics
- Billing (future)

---

### 4. **Workspace Model** - Project Organization

```python
class Workspace(SQLModel, table=True):
    user_id: int

    # Metadata
    name: str
    description: str
    color: str  # Hex color
    icon: str   # Icon/emoji

    # Organization
    parent_workspace_id: int (nested folders)
    tags: list[str]

    # State
    is_archived: bool
    is_template: bool
    is_public: bool  # Phase 2: sharing

    # Stats
    total_jobs: int
    total_assets: int
    total_scenes: int
```

**Use cases:**
- Organize jobs/assets by project
- "Emma's Story - Season 1" workspace
- Client-specific folders
- Template workspaces for reuse

---

### 5. **Enhanced Job Model** - Better Architecture

**Added fields:**
```python
class Job(SQLModel, table=True):
    # ... existing fields ...

    # NEW: Organization
    workspace_id: int (optional)
    name: str (user-friendly name)
    description: str

    # NEW: Priority & Scheduling
    priority: int = 5  # 0=highest, 10=lowest
    scheduled_at: datetime (optional)

    # NEW: Dependencies
    parent_job_id: int (optional)
```

**Use cases:**
- **Priority:** VIP users get priority=0, regular users get priority=5
- **Scheduling:** "Generate this at 2am when credits refresh"
- **Dependencies:** "Extend video after original completes"
- **Workspace:** Group jobs by project

---

## 🏗️ Multi-User Data Model

### Ownership Hierarchy

```
User (root)
├── Workspace 1 "Emma's Story"
│   ├── Job 1 (T2V: "Emma wakes up")
│   │   └── Asset 1 (video: emma_wakeup.mp4)
│   ├── Job 2 (Extend: Job 1)
│   │   └── Asset 2 (video: emma_wakeup_extended.mp4)
│   └── Scene 1 "Morning Routine"
│       ├── SceneAsset (Asset 1)
│       └── SceneAsset (Asset 2)
│
├── Workspace 2 "Client ABC"
│   └── Job 3, Asset 3, ...
│
└── ProviderAccount 1 (Pixverse)
    └── ProviderAccount 2 (Pixverse - backup)
```

**Key points:**
- ✅ **Every entity has user_id** (multi-tenant ready)
- ✅ **Workspaces organize jobs/assets** (optional but recommended)
- ✅ **Provider accounts can be private or shared** (is_private flag)
- ✅ **Jobs can depend on other jobs** (parent_job_id)

---

## 🔐 Authorization Model

### User Roles

| Role | Permissions |
|------|-------------|
| **admin** | - Full access to all users' data<br>- Manage provider accounts<br>- View system stats<br>- No quotas |
| **user** | - Own data only<br>- Create jobs (within quotas)<br>- Upload assets<br>- Subject to quotas |
| **guest** | - Read-only access<br>- View public workspaces<br>- Cannot create jobs |

### Access Control (to implement in services)

```python
# Example authorization in JobService
async def get_job(job_id: int, current_user: User) -> Job:
    job = await db.get(Job, job_id)

    # Authorization check
    if job.user_id != current_user.id and not current_user.is_admin():
        raise PermissionDeniedError("Cannot access other users' jobs")

    return job
```

### Quota Enforcement

```python
# Example quota check in JobService
async def create_job(..., current_user: User) -> Job:
    # Check if user can create job
    if not current_user.can_create_job():
        raise QuotaExceededError(
            f"Daily job limit reached ({current_user.max_daily_jobs})"
        )

    # Create job...

    # Increment counter
    current_user.jobs_today += 1
    await db.commit()
```

---

## 🏛️ Service Layer Architecture Design

### Recommended Structure

```
services/
├── user/
│   ├── user_service.py        # User CRUD
│   ├── auth_service.py        # Login, JWT, sessions
│   └── quota_service.py       # Quota enforcement
│
├── workspace/
│   └── workspace_service.py   # Workspace CRUD
│
├── job/
│   ├── job_service.py         # Job creation & tracking
│   ├── job_orchestrator.py   # Coordinate job workflow
│   └── job_scheduler.py       # Handle scheduled jobs
│
├── asset/
│   ├── asset_service.py       # Asset creation & management
│   ├── asset_downloader.py   # Download from providers
│   └── asset_hasher.py        # SHA256 & phash
│
├── provider/
│   ├── base.py               # ✅ Already done
│   ├── registry.py           # ✅ Already done
│   ├── provider_service.py   # Orchestrate provider calls
│   ├── account_selector.py   # Select best account
│   └── adapters/
│       └── pixverse.py       # ✅ Already done
│
└── scene/
    └── scene_service.py       # Scene assembly (Phase 2)
```

---

### Service Design Principles

#### 1. **Single Responsibility**

**Bad (PixSim6):**
```python
class VideoGeneratorService:
    def generate_video(...):
        # 1200 lines doing EVERYTHING:
        # - Account selection
        # - Provider calls
        # - Asset creation
        # - Lineage tracking
        # - Error handling
```

**Good (PixSim7):**
```python
# Each service does ONE thing

class JobService:
    async def create_job(...) -> Job:
        # ONLY: Create Job record, validate, emit events

class ProviderService:
    async def execute_job(job: Job) -> ProviderSubmission:
        # ONLY: Call provider, record submission

class AssetService:
    async def create_from_submission(...) -> Asset:
        # ONLY: Create Asset record from submission
```

#### 2. **Dependency Injection**

```python
class JobService:
    def __init__(
        self,
        db: AsyncSession,
        event_bus: EventBus,
        quota_service: QuotaService
    ):
        self.db = db
        self.events = event_bus
        self.quotas = quota_service

    async def create_job(self, request: CreateJobRequest, user: User):
        # Use injected dependencies
        await self.quotas.check_can_create_job(user)
        # ...
```

**Benefits:**
- Easy to test (mock dependencies)
- Flexible (swap implementations)
- Clear dependencies

#### 3. **Event-Driven Coordination**

**Instead of direct calls:**
```python
# ❌ Tight coupling
class JobService:
    async def create_job(...):
        job = Job(...)
        await db.add(job)

        # Direct call - tight coupling!
        await provider_service.execute_job(job)
```

**Use events:**
```python
# ✅ Loose coupling
class JobService:
    async def create_job(...):
        job = Job(...)
        await db.add(job)

        # Emit event - workers handle it
        await event_bus.publish("job:created", {"job_id": job.id})

# Separate handler
@event_bus.on("job:created")
async def on_job_created(event):
    job_id = event.data["job_id"]
    # Execute in background worker
    await execute_job_workflow(job_id)
```

---

## 🔄 Recommended Service Layer Workflow

### Job Creation Flow (Event-Driven)

```
1. User Request
   POST /api/v1/jobs
   {
     "operation_type": "text_to_video",
     "provider_id": "pixverse",
     "workspace_id": 123,
     "params": {"prompt": "sunset", "quality": "720p"}
   }

2. API Layer (JobsRouter)
   - Validate request
   - Get current user (from JWT)
   - Call JobService.create_job()

3. JobService.create_job()
   - Check user.can_create_job() ← QuotaService
   - Create Job record (status=PENDING)
   - Increment user.jobs_today
   - Emit event: "job:created"
   - Return Job to API

4. JobOrchestrator (listens to "job:created")
   - Select ProviderAccount ← AccountService
   - Map parameters ← Provider.map_parameters()
   - Emit event: "account:selected"

5. ProviderWorker (listens to "account:selected")
   - Call provider.execute() ← ProviderService
   - Create ProviderSubmission record
   - Update Job.status = PROCESSING
   - Emit event: "provider:submitted"

6. StatusPollerWorker (background)
   - Poll provider.check_status() every 10s
   - When completed:
     - Create Asset ← AssetService
     - Update Job.status = COMPLETED
     - Emit event: "job:completed"

7. User gets notification
   "Your video is ready!"
```

**Benefits:**
- Async (user doesn't wait)
- Scalable (workers can be on different servers)
- Resilient (retry failed steps)
- Auditable (event log)

---

## 🔑 Key Service Interfaces (Recommended)

### UserService
```python
class UserService:
    async def create_user(email, password) -> User
    async def get_user(user_id) -> User
    async def update_user(user_id, updates) -> User
    async def delete_user(user_id) -> None
```

### AuthService
```python
class AuthService:
    async def login(email, password) -> tuple[User, str]  # Returns user + JWT
    async def logout(token_id) -> None  # Revoke session
    async def verify_token(token) -> User
    async def refresh_token(old_token) -> str  # New JWT
```

### JobService
```python
class JobService:
    async def create_job(request, user) -> Job
    async def get_job(job_id, user) -> Job  # With auth check
    async def list_jobs(user, workspace_id, filters) -> list[Job]
    async def cancel_job(job_id, user) -> Job
    async def update_status(job_id, status) -> Job
```

### ProviderService
```python
class ProviderService:
    async def execute_job(job, account) -> ProviderSubmission
    async def check_status(submission) -> ProviderStatusResult
    async def cancel_job(submission) -> bool
```

### AssetService
```python
class AssetService:
    async def create_from_submission(submission, job) -> Asset
    async def get_asset(asset_id, user) -> Asset
    async def download_asset(asset) -> str  # Returns local_path
    async def delete_asset(asset_id, user) -> None
```

### QuotaService
```python
class QuotaService:
    async def check_can_create_job(user) -> None  # Raises if quota exceeded
    async def check_storage_available(user, gb) -> None
    async def increment_job_count(user) -> None
    async def increment_storage(user, gb) -> None
    async def reset_daily_quotas() -> None  # Cron job
```

---

## 🚀 Implementation Roadmap

### Phase 1a: Auth & User Management (1-2 days)
- [ ] UserService
- [ ] AuthService (JWT login/logout)
- [ ] QuotaService
- [ ] User API endpoints

### Phase 1b: Core Job Flow (2-3 days)
- [ ] JobService
- [ ] ProviderService (orchestration)
- [ ] AccountService (selection)
- [ ] AssetService
- [ ] Job API endpoints

### Phase 1c: Background Workers (1-2 days)
- [ ] ARQ worker setup
- [ ] Status poller worker
- [ ] Event handlers

### Phase 2: Advanced Features (1 week)
- [ ] WorkspaceService
- [ ] Job scheduling
- [ ] Job dependencies
- [ ] Scene assembly

---

## ✅ What's Ready NOW

**Domain Models:** ✅ Complete
- User, UserSession, UserQuotaUsage
- Workspace
- Job (with priority, scheduling, dependencies)
- Asset, ProviderSubmission, ProviderAccount
- Scene, SceneAsset, SceneConnection

**Infrastructure:** ✅ Complete
- Database session management
- Event bus
- Configuration
- Error hierarchy

**Provider System:** ✅ Complete
- Provider abstraction
- Pixverse adapter
- Provider registry

**Next:** Build services on this solid foundation!

---

## 💡 Key Architectural Wins

| Feature | PixSim6 | PixSim7 |
|---------|---------|---------|
| **Multi-user** | Partial | ✅ Full support with quotas |
| **Authorization** | None | ✅ Role-based access |
| **Workspaces** | None | ✅ Project organization |
| **Job Priority** | None | ✅ Queue ordering |
| **Job Dependencies** | Hardcoded | ✅ parent_job_id |
| **Quota Tracking** | Manual | ✅ Automated per user |
| **Session Management** | Basic | ✅ Revocable tokens |

---

**Ready to build services?** We now have a solid multi-user foundation with proper authorization, quotas, and organization. The service layer will be clean and maintainable!
