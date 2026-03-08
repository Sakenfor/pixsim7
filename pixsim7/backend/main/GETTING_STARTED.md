# Getting Started with PixSim7 Backend

## Prerequisites

- **Python 3.11+**
- **PostgreSQL 14+**
- **Redis 6+**

---

## Quick Start

### 1. Set Up Environment

```bash
# Navigate to backend
cd pixsim7/backend/main

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment Variables

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your settings
# Update DATABASE_URL, REDIS_URL, SECRET_KEY
```

### 3. Set Up Database

```bash
# Create database (in PostgreSQL)
createdb -U pixsim pixsim7

# Or using psql:
psql -U postgres
CREATE DATABASE pixsim7;
CREATE USER pixsim WITH PASSWORD 'pixsim123';
GRANT ALL PRIVILEGES ON DATABASE pixsim7 TO pixsim;
\q
```

### 4. Run Migrations

```bash
# Run all migration chains from repository root
cd ../../..
python scripts/migrate_all.py

# Optional: run one chain only
python scripts/migrate_all.py --scope blocks
```

### 5. Start Server

```bash
# Development server (auto-reload)
python main.py

# Or with uvicorn directly
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Server will start at: http://localhost:8000

---

## Verify Installation

### Check API Docs

Visit: http://localhost:8000/docs

You should see the FastAPI interactive documentation (Swagger UI).

### Check Health

```bash
curl http://localhost:8000/health
```

Response:
```json
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected"
}
```

---

## Development Workflow

### Database Migrations

```bash
# Create new migration after model changes
alembic -c ../../../alembic.ini revision --autogenerate -m "Add new field"

# Review the generated migration file in migrations/versions/

# Apply migration
cd ../../..
python scripts/migrate_all.py

# Rollback migration
alembic -c alembic.ini downgrade -1
```

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=pixsim7.backend.main

# Run specific test file
pytest tests/test_models.py
```

### Code Formatting

```bash
# Format code with Black
black .

# Lint with Ruff
ruff check .

# Fix linting issues
ruff check . --fix
```

---

## Project Structure

```
pixsim7/backend/main/
├── domain/                 # Core entities (models)
├── services/              # Business logic
├── api/                   # FastAPI routes
├── infrastructure/        # Technical implementation
│   ├── database/         # DB session, migrations
│   ├── events/           # Event bus
│   ├── cache/            # Redis cache
│   └── queue/            # Background workers
├── shared/               # Shared utilities
│   ├── config.py        # Settings
│   ├── errors.py        # Custom exceptions
│   └── schemas/         # Pydantic schemas
├── workers/              # Background workers
├── main.py               # FastAPI app
└── requirements.txt      # Dependencies
```

---

## Common Tasks

### Add a New Model

1. Create model in `domain/` directory
2. Import model in `domain/__init__.py`
3. Import model in `main.py` lifespan (for SQLModel registration)
4. Create migration: `alembic -c ../../../alembic.ini revision --autogenerate -m "Add ModelName"`
5. Apply migration: `python scripts/migrate_all.py` (run from repo root)

### Add a New API Endpoint

1. Create router in `api/v1/`
2. Include router in `main.py`
3. Add service logic in `services/`
4. Test endpoint at http://localhost:8000/docs

### Add an Event Handler

1. Subscribe in service initialization:
   ```python
   from infrastructure.events import event_bus

   @event_bus.on("job:created")
   async def on_job_created(event):
       # Handle event
       pass
   ```

2. Publish events from services:
   ```python
   await event_bus.publish("job:created", {"job_id": job.id})
   ```

---

## Troubleshooting

### Database Connection Error

```
sqlalchemy.exc.OperationalError: connection to server failed
```

**Solution:**
1. Check PostgreSQL is running: `pg_ctl status`
2. Verify DATABASE_URL in `.env`
3. Test connection: `psql -U pixsim pixsim7`

### Redis Connection Error

```
redis.exceptions.ConnectionError: Error connecting to Redis
```

**Solution:**
1. Check Redis is running: `redis-cli ping` (should return PONG)
2. Verify REDIS_URL in `.env`

### Import Errors

```
ModuleNotFoundError: No module named 'pixsim7_backend'
```

**Solution:**
1. Ensure virtual environment is activated
2. Install dependencies: `pip install -r requirements.txt`
3. Run from project root: `python main.py` (not from subdirectory)

### Alembic Migration Conflicts

```
alembic.util.exc.CommandError: Multiple heads detected
```

**Solution:**
1. Check current heads: `alembic heads`
2. Merge heads: `alembic merge -m "merge heads" head1 head2`
3. Apply: `python scripts/migrate_all.py` (run from repo root)

---

## Next Steps

**Phase 1 (Current):**
- ✅ Domain models
- ✅ Infrastructure setup
- 🚧 Port Pixverse provider
- 🚧 Implement core services
- 🚧 Create API endpoints

**Phase 2:**
- Scene assembly
- Event-driven workflows
- Background workers

**Phase 3:**
- Story graph system
- Player progression
- Game client API

See `README.md` for full roadmap.

---

## Support

- **Documentation:** See `README.md`
- **Architecture:** Start at [docs/README.md](../../../docs/README.md) and [docs/architecture/README.md](../../../docs/architecture/README.md)
- **Issues:** Check existing docs or ask in chat
