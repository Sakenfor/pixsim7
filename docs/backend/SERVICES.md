# Backend Services Guide

Complete reference for PixSim7's service layer.

---

## 🎯 Service Layer Architecture

PixSim7 uses a clean service layer pattern with dependency injection. All business logic lives in services, keeping API endpoints thin and testable.

### **Core Principles**

1. **Single Responsibility:** Each service handles one domain
2. **Dependency Injection:** Services receive dependencies via constructor
3. **No Direct DB Access in APIs:** Always go through services
4. **Async Throughout:** All service methods are async
5. **Structured Logging:** Use pixsim_logging for all operations

---

## 📦 Service Inventory

### **1. UserService** (`services/user/user_service.py`)

Handles user account management, quotas, and profiles.

**Key Methods:**
```python
async def get_user_by_id(user_id: int) -> User | None
async def get_user_by_email(email: str) -> User | None
async def create_user(email: str, password: str, ...) -> User
async def update_user(user_id: int, updates: dict) -> User
async def delete_user(user_id: int) -> None
async def track_quota_usage(user_id: int, operation_type: OperationType) -> None
```

**Usage Example:**
```python
from pixsim7.backend.main.services.user.user_service import UserService
from pixsim7.backend.main.api.dependencies import get_database

@router.get("/users/me")
async def get_current_user(
    current_user: User = Depends(get_current_user),
    db: DatabaseSession = Depends(get_database),
):
    service = UserService(db)
    user = await service.get_user_by_id(current_user.id)
    return user
```

---

### **2. AuthService** (`services/user/auth_service.py`)

Manages authentication, JWT tokens, and sessions.

**Key Methods:**
```python
async def authenticate(email: str, password: str) -> tuple[User, str]  # (user, token)
async def create_session(user_id: int, ip_address: str, user_agent: str) -> UserSession
async def revoke_session(session_id: int) -> None
async def revoke_all_sessions(user_id: int) -> None
async def validate_token(token: str) -> User | None
```

**JWT Token Structure:**
```python
{
    "user_id": 123,
    "session_id": 456,
    "exp": 1234567890,  # Expiration timestamp
    "iat": 1234567890,  # Issued at
}
```

**Usage Example:**
```python
@router.post("/auth/login")
async def login(
    credentials: LoginRequest,
    request: Request,
    db: DatabaseSession = Depends(get_database),
):
    service = AuthService(db)
    user, token = await service.authenticate(
        credentials.email,
        credentials.password
    )

    # Create session
    await service.create_session(
        user.id,
        request.client.host,
        request.headers.get("user-agent", "")
    )

    return {"access_token": token, "token_type": "bearer"}
```

---

### **3. JobService** (`services/job/job_service.py`)

Manages job lifecycle, queue, and status tracking.

**Key Methods:**
```python
async def create_job(user_id: int, provider_id: str, operation_type: OperationType, params: dict) -> Job
async def get_job(job_id: int) -> Job | None
async def list_jobs(user_id: int, filters: dict, pagination: dict) -> list[Job]
async def update_status(job_id: int, status: JobStatus, error: str = None) -> Job
async def cancel_job(job_id: int) -> None
async def get_pending_jobs(limit: int = 10) -> list[Job]
```

**Job Status Flow:**
```
PENDING → PROCESSING → COMPLETED
         ↘ FAILED
         ↘ CANCELLED
```

**Usage Example:**
```python
@router.post("/jobs")
async def create_job(
    request: CreateJobRequest,
    current_user: User = Depends(get_current_user),
    db: DatabaseSession = Depends(get_database),
):
    service = JobService(db)
    job = await service.create_job(
        user_id=current_user.id,
        provider_id=request.provider_id,
        operation_type=request.operation_type,
        params=request.params,
    )

    # Queue for background processing
    await enqueue_job(job.id)

    return JobResponse.from_orm(job)
```

---

### **4. AccountService** (`services/account/account_service.py`)

Provider account pooling, selection, and credit management.

**Key Methods:**
```python
async def select_account(provider_id: str, operation_type: OperationType) -> ProviderAccount
async def get_account(account_id: int) -> ProviderAccount | None
async def list_accounts(provider_id: str = None, is_active: bool = None) -> list[ProviderAccount]
async def create_account(provider_id: str, email: str, jwt_token: str = None, ...) -> ProviderAccount
async def update_credits(account_id: int, webapi: int = None, openapi: int = None) -> ProviderAccount
async def deduct_credits(account_id: int, cost: int, credit_type: str) -> None
async def mark_account_failed(account_id: int, error: str) -> None
async def release_account(account_id: int) -> None
```

**Account Selection Algorithm:**
1. Filter by provider_id and is_active=True
2. Filter by sufficient credits
3. Filter by concurrency limit (current_jobs < max_concurrent_jobs)
4. Sort by priority (higher first), then credits (lower first for balancing)
5. Return first match or raise NoAvailableAccountError

**Usage Example:**
```python
# In job processor worker
async def process_job(job_id: int):
    service = AccountService(db)

    # Select best account
    account = await service.select_account(
        provider_id=job.provider_id,
        operation_type=job.operation_type
    )

    try:
        # Use account for job
        await provider.execute(account, job.params)
    finally:
        # Always release
        await service.release_account(account.id)
```

---

### **5. ProviderService** (`services/provider/provider_service.py`)

Orchestrates provider operations via adapter pattern.

**Key Methods:**
```python
async def execute_job(provider_id: str, account: ProviderAccount, operation_type: OperationType, params: dict) -> GenerationResult
async def check_status(provider_id: str, account: ProviderAccount, provider_job_id: str) -> VideoStatusResult
async def upload_asset(provider_id: str, account: ProviderAccount, file_path: str) -> str
async def get_provider(provider_id: str) -> BaseProvider
async def list_providers() -> list[dict]
```

**Provider Registry:**
- Providers auto-register on import
- Registry maps provider_id → Provider class instance
- Example: `"pixverse"` → `PixverseProvider()`

**Usage Example:**
```python
from pixsim7.backend.main.services.provider.provider_service import ProviderService

service = ProviderService()

# Execute generation
result = await service.execute_job(
    provider_id="pixverse",
    account=account,
    operation_type=OperationType.TEXT_TO_VIDEO,
    params={"prompt": "A cat", "duration": 4}
)

# Check status later
status = await service.check_status(
    provider_id="pixverse",
    account=account,
    provider_job_id=result.provider_job_id
)
```

---

### **6. AssetService** (`services/asset/asset_service.py`)

Asset management, cross-provider uploads, metadata, and lineage.

**Key Methods:**
```python
async def create_asset(user_id: int, provider_id: str, remote_url: str, ...) -> Asset
async def get_asset(asset_id: int) -> Asset | None
async def list_assets(user_id: int, filters: dict, pagination: dict) -> list[Asset]
async def delete_asset(asset_id: int) -> None
async def get_asset_for_provider(asset_id: int, target_provider_id: str) -> str  # Returns provider_asset_id
async def download_asset(asset_id: int) -> str  # Returns local_path
async def sync_asset(asset_id: int) -> Asset
```

**Cross-Provider Upload:**

The `get_asset_for_provider()` method is critical for cross-provider workflows:

```python
# Job uses Asset #123 (from Pixverse) as input for Sora
asset = await asset_service.get_asset_for_provider(
    asset_id=123,
    target_provider_id="sora"
)
# Returns sora's provider_asset_id (uploads if needed, caches result)
```

**Flow:**
1. Check `asset.provider_uploads` for cached upload
2. If not cached, download to local storage
3. Upload to target provider
4. Cache `provider_asset_id` in `asset.provider_uploads`
5. Update `asset.last_accessed_at` for LRU tracking
6. Return `provider_asset_id`

**Usage Example:**
```python
@router.get("/assets")
async def list_assets(
    current_user: User = Depends(get_current_user),
    provider_id: str = None,
    media_type: MediaType = None,
    skip: int = 0,
    limit: int = 50,
    db: DatabaseSession = Depends(get_database),
):
    service = AssetService(db)
    assets = await service.list_assets(
        user_id=current_user.id,
        filters={"provider_id": provider_id, "media_type": media_type},
        pagination={"skip": skip, "limit": limit}
    )
    return AssetListResponse(assets=assets, total=len(assets))
```

---

### **7. LineageService** (`services/asset/lineage_service.py`)

Asset lineage graph management.

**Key Methods:**
```python
async def create_lineage(child_id: int, parent_ids: list[int], operation_type: OperationType) -> list[AssetLineage]
async def get_ancestors(asset_id: int, max_depth: int = 10) -> list[Asset]
async def get_descendants(asset_id: int, max_depth: int = 10) -> list[Asset]
async def get_lineage_graph(asset_id: int) -> dict
```

**Usage Example:**
```python
# When creating asset from job
lineage_service = LineageService(db)

# Link new asset to source assets
await lineage_service.create_lineage(
    child_id=new_asset.id,
    parent_ids=[source_asset.id],
    operation_type=job.operation_type
)

# Later, retrieve full lineage tree
graph = await lineage_service.get_lineage_graph(new_asset.id)
```

---

### **8. SubmissionPipeline** (`services/submission/pipeline.py`)

Job submission orchestration with structured logging.

**Key Methods:**
```python
async def submit_job(job: Job) -> ProviderSubmission
```

**Stages (logged):**
1. `pipeline:start` - Begin submission
2. `pipeline:artifact` - Prepare artifacts (upload source assets)
3. `provider:submit` - Submit to provider
4. `provider:status` - Status check
5. `provider:complete` - Job completed

**Usage Example:**
```python
from pixsim7.backend.main.services.submission.pipeline import SubmissionPipeline

pipeline = SubmissionPipeline(db, account_service, provider_service, asset_service)

# Called by worker
submission = await pipeline.submit_job(job)
# Returns ProviderSubmission with provider_job_id
```

---

### **9. UploadService** (`services/upload/upload_service.py`)

User file upload handling.

**Key Methods:**
```python
async def upload(user_id: int, file: UploadFile, provider_id: str) -> Asset
async def validate_image(file: UploadFile) -> None
async def prepare_file_for_provider(file_path: str, provider_id: str) -> str
```

**Upload Flow:**
1. Validate file (type, size, format)
2. Save to temporary storage
3. Calculate SHA256 hash (deduplication)
4. Check if asset already exists (by hash)
5. Upload to provider (if needed)
6. Create Asset record
7. Return Asset

**Usage Example:**
```python
@router.post("/assets/upload")
async def upload_asset(
    file: UploadFile = File(...),
    provider_id: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: DatabaseSession = Depends(get_database),
):
    service = UploadService(db)
    asset = await service.upload(
        user_id=current_user.id,
        file=file,
        provider_id=provider_id
    )
    return AssetResponse.from_orm(asset)
```

---

### **10. AutomationService** (`services/automation/`)

Device automation for mobile app control.

**Key Components:**
- `device_sync_service.py` - Device agent sync
- `execution_loop_service.py` - Automation loop
- `action_executor.py` - Execute actions
- `adb.py` - ADB wrapper

**Usage Example:**
```python
# Start automation loop
from pixsim7.backend.main.services.automation import ExecutionLoopService

service = ExecutionLoopService(db)
await service.start_loop(device_id=1)
```

---

## 🔄 Service Interaction Patterns

### **Pattern 1: Simple CRUD**

```python
# API Endpoint
@router.get("/resources/{id}")
async def get_resource(
    id: int,
    db: DatabaseSession = Depends(get_database),
):
    service = ResourceService(db)
    resource = await service.get(id)
    if not resource:
        raise HTTPException(404)
    return resource
```

### **Pattern 2: Multi-Service Coordination**

```python
# Job submission requires multiple services
async def submit_job(job_id: int):
    # 1. Get job
    job_service = JobService(db)
    job = await job_service.get_job(job_id)

    # 2. Select account
    account_service = AccountService(db)
    account = await account_service.select_account(
        job.provider_id,
        job.operation_type
    )

    # 3. Submit via pipeline
    pipeline = SubmissionPipeline(db, account_service, provider_service, asset_service)
    submission = await pipeline.submit_job(job)

    # 4. Update job status
    await job_service.update_status(job.id, JobStatus.PROCESSING)
```

### **Pattern 3: Transaction Safety**

```python
async def transfer_credits(from_account: int, to_account: int, amount: int):
    service = AccountService(db)

    async with db.begin():  # Transaction
        # Deduct from source
        await service.deduct_credits(from_account, amount, "webapi")

        # Add to destination
        await service.update_credits(to_account, webapi=amount)

        # Transaction commits automatically if no exception
```

---

## 🧪 Testing Services

### **Unit Test Example**

```python
import pytest
from pixsim7.backend.main.services.user.user_service import UserService

@pytest.mark.asyncio
async def test_create_user(db_session):
    service = UserService(db_session)

    user = await service.create_user(
        email="test@example.com",
        password="password123",
        display_name="Test User"
    )

    assert user.id is not None
    assert user.email == "test@example.com"
    assert user.display_name == "Test User"

@pytest.mark.asyncio
async def test_duplicate_email(db_session):
    service = UserService(db_session)

    # Create first user
    await service.create_user("test@example.com", "pass123")

    # Try to create duplicate
    with pytest.raises(DuplicateError):
        await service.create_user("test@example.com", "pass456")
```

---

## 📝 Best Practices

### **1. Always Use Dependency Injection**

❌ **Bad:**
```python
@router.get("/users/me")
async def get_user():
    db = get_database()  # Direct call
    service = UserService(db)
    ...
```

✅ **Good:**
```python
@router.get("/users/me")
async def get_user(
    db: DatabaseSession = Depends(get_database),
):
    service = UserService(db)
    ...
```

### **2. Use Structured Logging**

✅ **Good:**
```python
from pixsim_logging import get_logger

logger = get_logger()

async def submit_job(job: Job):
    logger.info(
        "Submitting job",
        job_id=job.id,
        provider_id=job.provider_id,
        stage="pipeline:start"
    )
```

### **3. Handle Errors Gracefully**

```python
from pixsim7.backend.main.shared.errors import ResourceNotFoundError

async def get_user(user_id: int) -> User:
    user = await db.get(User, user_id)
    if not user:
        raise ResourceNotFoundError(f"User {user_id} not found")
    return user
```

### **4. Use Type Hints**

```python
from typing import Optional

async def get_user_by_email(email: str) -> Optional[User]:
    result = await db.execute(
        select(User).where(User.email == email)
    )
    return result.scalar_one_or_none()
```

---

## 🔗 Related Documentation

- **Architecture:** `/ARCHITECTURE.md`
- **Development Guide:** `/DEVELOPMENT_GUIDE.md`
- **API Reference:** http://localhost:8001/docs
- **Provider Integration:** `docs/backend/PROVIDERS.md`

---

**Last Updated:** 2025-11-16
