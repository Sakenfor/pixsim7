# 🤝 Handoff Notes for Next Session

**Priority:** Read this FIRST before coding!

---

## ⚡ Quick Start Commands

```bash
cd /g/code/pixsim7/backend

# 1. Read this file first
cat CURRENT_STATUS_AND_NEXT_STEPS.md

# 2. Verify everything works
python main.py
# Visit http://localhost:8000/health
# Should see: {"status": "healthy", "providers": ["pixverse"]}

# 3. Start building API endpoints
# Create: api/v1/auth.py
```

---

## 🎯 CRITICAL: What NOT to Change

### ❌ DO NOT Modify These (They Work!)

1. **Domain models** (`domain/*.py`) - ALL DONE, don't touch
2. **Services** (`services/*/*.py`) - 7 services complete, use them as-is
3. **Dependencies** (`api/dependencies.py`) - DI is configured, just use it
4. **Provider system** (`services/provider/`) - Pixverse works, don't refactor

### ❌ DO NOT Create These

- **Don't create new services** - Use existing 7 services
- **Don't create schemas in domain/** - Put Pydantic schemas in `shared/schemas/`
- **Don't modify infrastructure** - DB sessions work, leave them alone

---

## ✅ What TO Do (Next Steps)

### 1. Create API Endpoints (Priority Order)

**Step 1: Auth endpoints** (`api/v1/auth.py`)
```python
from fastapi import APIRouter, HTTPException
from pixsim7.backend.main.api.dependencies import AuthSvc, UserSvc
from pydantic import BaseModel

router = APIRouter()

class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict  # UserResponse

@router.post("/auth/login", response_model=LoginResponse)
async def login(
    request: LoginRequest,
    auth_service: AuthSvc  # Auto-injected!
):
    user, token = await auth_service.login(
        email=request.email,
        password=request.password
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user.dict()
    }
```

**Step 2: Wire up in main.py**
```python
from pixsim7.backend.main.api.v1 import auth

app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
```

**Step 3: Test in Swagger UI**
- Visit http://localhost:8000/docs
- Try POST /api/v1/auth/login

**Step 4: Repeat for users, jobs, assets**

---

## 🔑 Key Patterns to Follow

### Pattern 1: Use Dependency Injection (Not Direct Imports)

**❌ WRONG:**
```python
from pixsim7.backend.main.services.user.auth_service import AuthService

async def login(request):
    db = get_db()  # Manual setup
    user_service = UserService(db)
    auth_service = AuthService(db, user_service)
    # ...
```

**✅ RIGHT:**
```python
from pixsim7.backend.main.api.dependencies import AuthSvc, CurrentUser

async def login(
    request: LoginRequest,
    auth_service: AuthSvc  # Magic! Auto-injected
):
    # Just use it!
    user, token = await auth_service.login(...)
```

### Pattern 2: Use Type Aliases from dependencies.py

**Available aliases:**
- `CurrentUser` - Auto-authenticated user
- `CurrentActiveUser` - Active user only
- `CurrentAdminUser` - Admin only
- `DatabaseSession` - DB session
- `UserSvc`, `AuthSvc`, `JobSvc`, `AssetSvc`, etc.

**Example:**
```python
from pixsim7.backend.main.api.dependencies import CurrentUser, JobSvc

@router.get("/jobs")
async def list_jobs(
    user: CurrentUser,  # Auto-auth!
    job_service: JobSvc  # Auto-inject!
):
    jobs = await job_service.list_jobs(user)
    return jobs
```

### Pattern 3: Authorization is Built Into Services

**❌ WRONG (Don't check auth in routes):**
```python
@router.get("/jobs/{id}")
async def get_job(id: int, user: CurrentUser, db: DatabaseSession):
    job = await db.get(Job, id)
    if job.user_id != user.id:  # Don't do this!
        raise HTTPException(403, "Not authorized")
    return job
```

**✅ RIGHT (Services handle it):**
```python
@router.get("/jobs/{id}")
async def get_job(id: int, user: CurrentUser, job_service: JobSvc):
    # JobService.get_job_for_user() checks auth automatically!
    job = await job_service.get_job_for_user(id, user)
    return job
```

---

## 🚨 Common Pitfalls

### Issue 1: Import Errors

**Problem:** `ModuleNotFoundError: No module named 'pixsim7.backend.main'`

**Solution:** Run from project root:
```bash
cd /g/code/pixsim7/backend
python main.py  # ✅ Correct

# Not from subdirectory:
cd /g/code/pixsim7/backend/api
python main.py  # ❌ Wrong - import errors!
```

### Issue 2: Missing pixverse-py

**Problem:** `ModuleNotFoundError: No module named 'pixverse'`

**Solution:**
```bash
pip install -e G:/code/pixverse-py
```

### Issue 3: Database Not Created

**Problem:** `sqlalchemy.exc.OperationalError: database "pixsim7" does not exist`

**Solution:**
```bash
createdb -U pixsim pixsim7
# Or using psql:
# CREATE DATABASE pixsim7;
```

### Issue 4: Missing .env

**Problem:** Database connection fails

**Solution:**
```bash
cd /g/code/pixsim7/backend
cp .env.example .env
# Edit .env with correct DATABASE_URL
```

---

## 📋 Checklist Before Starting

- [ ] Read `CURRENT_STATUS_AND_NEXT_STEPS.md`
- [ ] Verify server starts: `python main.py`
- [ ] Check health endpoint: http://localhost:8000/health
- [ ] Review existing service code in `services/`
- [ ] Look at DI patterns in `api/dependencies.py`
- [ ] Have Swagger UI open: http://localhost:8000/docs

---

## 🎓 Learn from Existing Code

### Example 1: How Services Work

Read these files (in order):
1. `services/user/user_service.py` - See CRUD patterns
2. `services/user/auth_service.py` - See how login works
3. `services/job/job_service.py` - See event emission
4. `api/dependencies.py` - See DI setup

### Example 2: How Events Work

```python
# In JobService.create_job():
await event_bus.publish(JOB_CREATED, {
    "job_id": job.id,
    "user_id": user.id,
    "params": params
})

# Worker listens to this event (will be built later)
```

### Example 3: How Errors Work

```python
# Services raise specific errors
from pixsim7.backend.main.shared.errors import ResourceNotFoundError

if not user:
    raise ResourceNotFoundError("User", user_id)

# FastAPI catches and converts to HTTP responses automatically
```

---

## 💡 Pro Tips

### Tip 1: Use Pydantic for Request/Response

Create schemas in `shared/schemas/`:
```python
# shared/schemas/auth_schemas.py
from pydantic import BaseModel, EmailStr

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    role: str

    class Config:
        from_attributes = True  # For SQLModel compatibility
```

### Tip 2: Return Models Directly from Routes

```python
from pixsim7.backend.main.domain import Job

@router.get("/jobs/{id}", response_model=Job)
async def get_job(id: int, user: CurrentUser, job_service: JobSvc):
    job = await job_service.get_job_for_user(id, user)
    return job  # FastAPI auto-converts to JSON!
```

### Tip 3: Test Incrementally

Don't write all endpoints at once. Do this:
1. Write ONE endpoint (e.g., POST /auth/login)
2. Wire it up in main.py
3. Test in Swagger UI
4. Verify it works
5. Move to next endpoint

### Tip 4: Copy Patterns from Services

When unsure how to do something, look at existing services:
- Authorization checks? → See `job_service.get_job_for_user()`
- Quota checks? → See `user_service.check_can_create_job()`
- Event emission? → See `job_service.create_job()`

---

## 🎯 Success Criteria

**After API layer is done, you should be able to:**

1. ✅ Register user: `POST /api/v1/auth/register`
2. ✅ Login: `POST /api/v1/auth/login` → Returns JWT
3. ✅ Get current user: `GET /api/v1/users/me` (with auth)
4. ✅ Create job: `POST /api/v1/jobs` (with auth)
5. ✅ List jobs: `GET /api/v1/jobs` (with auth)
6. ✅ Get job: `GET /api/v1/jobs/{id}` (with auth check)
7. ✅ List assets: `GET /api/v1/assets` (with auth)

**All tested via Swagger UI at http://localhost:8000/docs**

---

## 🚀 Recommended Approach

### Day 1: Auth Endpoints (2-3 hours)
1. Create `shared/schemas/auth_schemas.py`
2. Create `api/v1/auth.py` with:
   - POST /auth/register
   - POST /auth/login
   - POST /auth/logout
   - GET /auth/sessions
3. Wire up in `main.py`
4. Test in Swagger UI

### Day 2: User & Job Endpoints (2-3 hours)
1. Create `shared/schemas/user_schemas.py`
2. Create `shared/schemas/job_schemas.py`
3. Create `api/v1/users.py`
4. Create `api/v1/jobs.py`
5. Wire up in `main.py`
6. Test end-to-end

### Day 3: Asset Endpoints (1-2 hours)
1. Create `shared/schemas/asset_schemas.py`
2. Create `api/v1/assets.py`
3. Wire up in `main.py`
4. Test full API

### Day 4: Background Workers (2-3 hours)
1. Create `workers/job_processor.py`
2. Create `workers/status_poller.py`
3. Set up ARQ
4. Test end-to-end job execution

---

## 📞 If You Get Stuck

1. **Check existing services** - They have all the patterns you need
2. **Check `api/dependencies.py`** - See how DI works
3. **Read service docstrings** - They explain what each method does
4. **Test incrementally** - Don't write everything at once

**Key files to reference:**
- `services/job/job_service.py` - Job creation patterns
- `services/user/auth_service.py` - Auth patterns
- `api/dependencies.py` - DI patterns

---

## ✅ Final Checklist

Before starting:
- [ ] Server runs: `python main.py`
- [ ] Health check works: http://localhost:8000/health
- [ ] Understand DI patterns from `api/dependencies.py`
- [ ] Know which service to use for what (see SERVICE_LAYER_COMPLETE.md)

While coding:
- [ ] Use dependency injection (not manual instantiation)
- [ ] Don't modify existing services (they work!)
- [ ] Test each endpoint in Swagger UI before moving on
- [ ] Follow patterns from existing code

When done:
- [ ] All endpoints work in Swagger UI
- [ ] Can create user, login, create job, list assets
- [ ] Ready for workers layer

---

**TL;DR:**
1. ✅ Don't touch existing services - they work!
2. ✅ Use DI from `api/dependencies.py` - don't instantiate manually
3. ✅ Create API endpoints in `api/v1/` - follow existing patterns
4. ✅ Test incrementally in Swagger UI
5. ✅ Workers come AFTER API works

**Good luck! The foundation is solid - just build on top of it! 🚀**
