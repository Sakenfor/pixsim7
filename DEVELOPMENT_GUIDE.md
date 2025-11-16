# PixSim7 Development Guide

**Last Updated:** 2025-11-16

Complete guide for setting up, developing, and contributing to PixSim7.

---

## 🚀 Quick Start (5 Minutes)

### **Option 1: Single Launcher (Easiest - Windows)**

```bash
# Just double-click or run:
launch.bat

# Then visit:
# - Admin Panel: http://localhost:8002
# - Start all services from the web UI
```

### **Option 2: Docker Everything**

```bash
cd /g/code/pixsim7

# Start all services
docker-compose up -d

# Access:
# - Backend API: http://localhost:8001/docs
# - Admin Panel: http://localhost:8002
```

### **Option 3: Development Mode (Recommended for coding)**

```bash
# Terminal 1: Start databases
docker-compose -f docker-compose.db-only.yml up -d

# Terminal 2: Start backend
PYTHONPATH=/g/code/pixsim7 uvicorn pixsim7_backend.main:app --host 0.0.0.0 --port 8001 --reload

# Terminal 3: Start worker
PYTHONPATH=/g/code/pixsim7 arq pixsim7_backend.workers.arq_worker.WorkerSettings

# Terminal 4: Start admin panel
cd admin && npm run dev

# Terminal 5: Start frontend (optional)
cd frontend && npm run dev
```

---

## 📋 Prerequisites

### **Required**
- Python 3.11+ (3.12 recommended)
- Node.js 18+ (for admin panel and frontend)
- Docker + Docker Compose (for databases)
- Git

### **Optional**
- Conda (for isolated Python environments)
- pnpm (faster than npm, used by some packages)

---

## 🛠️ Initial Setup

### **1. Clone Repository**

```bash
git clone <repository-url>
cd pixsim7
```

### **2. Environment Configuration**

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your settings
```

**Key Environment Variables:**

```env
# Ports (avoid conflicts)
POSTGRES_PORT=5434          # Not default 5432
REDIS_PORT=6380             # Not default 6379
BACKEND_PORT=8001           # ⚠️ NOT 8000!
ADMIN_PORT=8002

# Database
DATABASE_URL=postgresql://pixsim:pixsim123@localhost:5434/pixsim7
REDIS_URL=redis://localhost:6380/0

# Security
SECRET_KEY=your-secret-key-here  # Generate with: openssl rand -hex 32
JWT_ALGORITHM=HS256
JWT_EXPIRATION_MINUTES=10080     # 7 days

# CORS
CORS_ORIGINS=http://localhost:8002,http://localhost:5173

# ZeroTier (optional - for remote access)
ZEROTIER_NETWORK=10.243.0.0/16
```

### **3. Python Environment Setup**

**Option A: Conda (Recommended)**

```bash
# Create environment
conda env create -f environment.yml
conda activate pixsim7

# Install local SDKs (if available)
pip install -e /path/to/pixverse-py
pip install -e /path/to/sora-py
```

**Option B: venv**

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate     # Windows

# Install dependencies
cd pixsim7_backend
pip install -r requirements.txt
```

### **4. Database Setup**

```bash
# Start PostgreSQL + Redis
docker-compose -f docker-compose.db-only.yml up -d

# Wait for PostgreSQL to be ready
docker-compose -f docker-compose.db-only.yml logs -f postgres
# Look for: "database system is ready to accept connections"

# Run migrations
cd pixsim7_backend
PYTHONPATH=/g/code/pixsim7 alembic upgrade head

# Verify database
docker-compose -f docker-compose.db-only.yml exec postgres \
  psql -U pixsim -d pixsim7 -c "\dt"
# Should show 22 tables
```

### **5. Admin Panel Setup**

```bash
cd admin
npm install
npm run dev

# Visit: http://localhost:8002
```

### **6. Frontend Setup (Optional)**

```bash
cd frontend
npm install
npm run dev

# Visit: http://localhost:5173
```

---

## 🏃 Running Services

### **Development Workflow**

**Start databases** (only needed once):
```bash
docker-compose -f docker-compose.db-only.yml up -d
```

**Start backend** (hot-reload enabled):
```bash
PYTHONPATH=/g/code/pixsim7 uvicorn pixsim7_backend.main:app \
  --host 0.0.0.0 --port 8001 --reload
```

**Start worker** (auto-reload on code changes):
```bash
PYTHONPATH=/g/code/pixsim7 arq pixsim7_backend.workers.arq_worker.WorkerSettings \
  --watch pixsim7_backend
```

**Start admin panel**:
```bash
cd admin && npm run dev
```

### **Production Mode**

```bash
# Everything in Docker
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f backend
docker-compose logs -f worker
```

### **Stop Services**

```bash
# Development mode
docker-compose -f docker-compose.db-only.yml down

# Production mode
docker-compose down

# Clean everything (⚠️ deletes data!)
docker-compose down -v
rm -rf data/
```

---

## 🧪 Testing

### **Backend Tests**

```bash
cd pixsim7_backend

# Run all tests
pytest

# Run specific test file
pytest tests/test_structured_logging.py

# Run with coverage
pytest --cov=pixsim7_backend --cov-report=html

# Watch mode (re-run on file changes)
pytest-watch
```

### **Frontend Tests**

```bash
cd frontend

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

---

## 🗄️ Database Management

### **Migrations**

**Create a new migration:**
```bash
cd pixsim7_backend
PYTHONPATH=/g/code/pixsim7 alembic revision --autogenerate -m "Add new field to User"
```

**Apply migrations:**
```bash
PYTHONPATH=/g/code/pixsim7 alembic upgrade head
```

**Rollback migration:**
```bash
PYTHONPATH=/g/code/pixsim7 alembic downgrade -1
```

**Check current version:**
```bash
PYTHONPATH=/g/code/pixsim7 alembic current
```

**View migration history:**
```bash
PYTHONPATH=/g/code/pixsim7 alembic history
```

### **Database Access**

**PostgreSQL shell:**
```bash
docker-compose -f docker-compose.db-only.yml exec postgres \
  psql -U pixsim pixsim7
```

**Redis CLI:**
```bash
docker-compose -f docker-compose.db-only.yml exec redis redis-cli
```

**Common SQL queries:**
```sql
-- List all tables
\dt

-- Check user count
SELECT COUNT(*) FROM "user";

-- View recent jobs
SELECT id, status, provider_id, created_at
FROM job
ORDER BY created_at DESC
LIMIT 10;

-- Check account credits
SELECT provider_id, email, webapi_credits, openapi_credits
FROM provider_account
WHERE is_active = true;
```

---

## 🔧 Development Patterns

### **Backend Service Pattern**

```python
# services/my_feature/my_service.py
from pixsim7_backend.infrastructure.database import DatabaseSession

class MyService:
    def __init__(self, db: DatabaseSession):
        self.db = db

    async def do_something(self, param: str) -> Result:
        # Business logic here
        pass

# api/v1/my_endpoint.py
from pixsim7_backend.api.dependencies import get_database

@router.get("/my-endpoint")
async def my_endpoint(
    db: DatabaseSession = Depends(get_database),
):
    service = MyService(db)
    result = await service.do_something("value")
    return result
```

### **Frontend Component Pattern**

```tsx
// components/my-feature/MyComponent.tsx
import { Icon } from '@/lib/icons';
import { useMyStore } from '@/stores/myStore';

export const MyComponent = () => {
  const { data, fetchData } = useMyStore();

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="p-4">
      <Icon name="check" size="md" />
      {/* Component content */}
    </div>
  );
};
```

### **Adding a Background Task**

```python
# workers/my_task.py
from pixsim_logging import get_logger

logger = get_logger()

async def my_background_task(ctx):
    logger.info("Task started", stage="task:start")
    # Do work
    logger.info("Task completed", stage="task:complete")

# workers/arq_worker.py
from .my_task import my_background_task

class WorkerSettings:
    functions = [
        process_job,
        poll_status,
        my_background_task,  # Add here
    ]

    cron_jobs = [
        cron(my_background_task, hour=0, minute=0),  # Daily at midnight
    ]
```

---

## 📝 Code Style & Conventions

### **Python (Backend)**

- **Style:** PEP 8
- **Formatter:** Black (line length 100)
- **Linter:** Ruff
- **Type Hints:** Required for public APIs
- **Docstrings:** Google style

```python
from typing import Optional

async def create_user(
    email: str,
    password: str,
    display_name: Optional[str] = None,
) -> User:
    """Create a new user account.

    Args:
        email: User's email address
        password: Plain text password (will be hashed)
        display_name: Optional display name

    Returns:
        Created User instance

    Raises:
        ValidationError: If email is invalid
        DuplicateError: If email already exists
    """
    # Implementation
```

### **TypeScript (Frontend)**

- **Style:** Airbnb TypeScript Guide
- **Formatter:** Prettier
- **Linter:** ESLint
- **Type Safety:** Strict mode enabled

```tsx
interface MyComponentProps {
  title: string;
  onSubmit: (value: string) => void;
  optional?: boolean;
}

export const MyComponent: React.FC<MyComponentProps> = ({
  title,
  onSubmit,
  optional = false,
}) => {
  // Implementation
};
```

### **Commit Messages**

Use conventional commits:

```
feat: add user profile endpoint
fix: resolve JWT expiration bug
docs: update API reference
refactor: simplify asset service
test: add tests for job creation
chore: update dependencies
```

---

## 🐛 Debugging

### **Backend Debugging**

**Enable debug logging:**
```env
# .env
LOG_LEVEL=DEBUG
```

**Use breakpoints with debugpy:**
```python
# Add to code
import debugpy
debugpy.listen(5678)
debugpy.wait_for_client()
```

**View structured logs:**
```bash
# Real-time logs
tail -f data/logs/pixsim7.log | jq .

# Filter by level
cat data/logs/pixsim7.log | jq 'select(.level == "ERROR")'

# Filter by job_id
cat data/logs/pixsim7.log | jq 'select(.job_id == 123)'
```

### **Frontend Debugging**

**React DevTools:**
- Install browser extension
- Inspect component hierarchy
- View state and props

**Redux DevTools:** (if using Redux)
- Time-travel debugging
- Action replay

**Network Tab:**
- Monitor API calls
- Check request/response
- Verify JWT tokens

---

## 🔒 Security Best Practices

### **Backend**

1. **Never commit secrets** to git
   - Use `.env` files (gitignored)
   - Use environment variables in production

2. **Validate all inputs**
   - Use Pydantic schemas
   - Sanitize user input
   - Check file uploads

3. **Use parameterized queries**
   - SQLAlchemy/SQLModel handles this
   - Never string concatenation for SQL

4. **Rate limiting**
   - Applied to job creation
   - Applied to login attempts
   - Configurable limits

### **Frontend**

1. **Sanitize user content**
   - Don't use `dangerouslySetInnerHTML`
   - Escape user input

2. **Secure storage**
   - Use httpOnly cookies for sensitive tokens
   - Don't store secrets in localStorage

3. **HTTPS only** in production
   - Force SSL
   - Set secure cookie flags

---

## 📊 Performance Optimization

### **Backend**

1. **Use async/await everywhere**
2. **Batch database queries**
3. **Add database indexes** for frequent queries
4. **Cache expensive operations** (Redis)
5. **Use connection pooling**

### **Frontend**

1. **Code splitting** with React.lazy
2. **Memoization** with React.memo, useMemo, useCallback
3. **Virtual scrolling** for large lists
4. **Lazy load images** with Intersection Observer
5. **Debounce/throttle** user input

---

## 🚨 Common Issues

### **Port Already in Use**

```bash
# Find process using port
netstat -ano | findstr :8001  # Windows
lsof -i :8001                 # Linux/Mac

# Change port in .env
BACKEND_PORT=8002
```

### **Database Connection Failed**

```bash
# Check PostgreSQL is running
docker-compose -f docker-compose.db-only.yml ps

# Restart database
docker-compose -f docker-compose.db-only.yml restart postgres

# Check logs
docker-compose -f docker-compose.db-only.yml logs postgres
```

### **Migration Failed**

```bash
# Check current version
alembic current

# Rollback and retry
alembic downgrade -1
alembic upgrade head

# If stuck, check database
psql -U pixsim pixsim7 -c "SELECT * FROM alembic_version;"
```

### **Import Errors (Python)**

```bash
# Always set PYTHONPATH
export PYTHONPATH=/g/code/pixsim7  # Linux/Mac
set PYTHONPATH=G:\code\pixsim7     # Windows

# Or use conda environment
conda activate pixsim7
```

---

## 📚 Additional Resources

- **Architecture:** `ARCHITECTURE.md`
- **Backend Services:** `docs/backend/SERVICES.md`
- **Frontend Components:** `docs/frontend/COMPONENTS.md`
- **API Documentation:** http://localhost:8001/docs
- **Deployment Guide:** `docs/DEPLOYMENT.md`

---

## 🤝 Contributing

1. **Create a feature branch:** `git checkout -b feat/my-feature`
2. **Make changes** following code style
3. **Write tests** for new functionality
4. **Update documentation** if needed
5. **Commit changes** using conventional commits
6. **Push and create PR**

---

**Last Updated:** 2025-11-16
