# PixSim7

Video generation platform with REST API, background workers, and web admin panel.

**🤖 AI Assistant?** Read **[AI_README.md](./AI_README.md)** first - comprehensive guide to what's implemented, what's not, and what NOT to recreate.

---

## Quick Start

### Easiest: Single Launcher (Windows)

**Just double-click or run:**
```bash
launch.bat
```

This starts the admin panel (http://localhost:8002) where you can:
- Start/stop all services from the web UI
- Monitor logs in real-time
- View system metrics
- No command line management needed!

See `docs/LAUNCHER.md` for details.

### Advanced: Manual Control

**Windows:**
```bash
cd G:\code\pixsim7

# Development mode (databases only)
scripts\start-dev.bat

# Full Docker mode (everything)
scripts\start-all.bat
```

**Linux/macOS/WSL:**
```bash
cd /g/code/pixsim7

# Development mode (databases only)
./scripts/start-dev.sh

# Full Docker mode (everything)
./scripts/start-all.sh
```

**Access:**
- Admin Panel: http://localhost:8002
- Services: http://localhost:8002/services ← Manage all services here!
- Logs: http://localhost:8002/logs
- API: http://localhost:8001/docs (after starting from web UI)

**🔌 Port Reference (for AI assistants & developers):**
- **Backend API:** Port **8001** (`http://localhost:8001/api`) ⚠️ NOT 8000!
- **Admin Panel:** Port **8002** (`http://localhost:8002`)
- **PostgreSQL:** Port **5434** (not default 5432)
- **Redis:** Port **6380** (not default 6379)

---

## Features

- **REST API** - FastAPI with 25+ endpoints (auth, users, jobs, assets, admin)
- **Background Workers** - ARQ for async job processing
- **Admin Panel** - Svelte web UI with comprehensive log viewer
- **Database** - PostgreSQL with async support
- **Cache & Queue** - Redis for job queue and caching
- **ZeroTier Support** - Remote access configuration
- **Structured Logging** - JSON logs with advanced filtering
- **Configurable Ports** - Avoid conflicts with other services

---

## Documentation Index

**📖 Core Documentation (START HERE):**
- `/README.md` - Quick start and overview (this file)
- `/ARCHITECTURE.md` - Complete system architecture **← Read this first!**
- `/DEVELOPMENT_GUIDE.md` - Setup, development, and workflows
- `/AI_README.md` - Guide for AI assistants

**🏗️ Backend:**
- `/docs/backend/SERVICES.md` - Service layer reference (10 services)
- `/pixsim7_backend/GETTING_STARTED.md` - Backend setup
- `/pixsim7_backend/HANDOFF_NOTES.md` - Critical patterns
- `/docs/PROVIDER_ACCOUNT_STRATEGY.md` - Multi-account pooling

**💻 Frontend:**
- `/docs/frontend/COMPONENTS.md` - Component library reference
- `/frontend/README.md` - Frontend architecture
- `/frontend/src/lib/ICONS_README.md` - Icon system guide
- `/frontend/EMOJI_MIGRATION.md` - Emoji migration status (100% complete)

**🎮 Game & Integration:**
- `/docs/NODE_EDITOR_DEVELOPMENT.md` - Scene editor development
- `/docs/GAME_BACKEND_SIM_SPEC.md` - Game backend spec
- `/chrome-extension/README.md` - Chrome extension guide

**🔧 Operations:**
- `/docs/LAUNCHER.md` - Single-click launcher guide
- `/docs/SETUP.md` - Manual setup guide
- `/docs/PORT_CONFIGURATION.md` - Port reference ⚠️ **Backend is port 8001!**
- `/LOGGING_STRUCTURE.md` - Structured logging spec
- `/MIGRATION_INSTRUCTIONS.md` - Database migrations

**📦 Additional Resources:**
- `/CROSS_PROVIDER_ASSETS.md` - Asset system architecture
- `/pixsim7_backend/REDIS_AND_WORKERS_SETUP.md` - Redis and ARQ workers
- `/docs/ADMIN_PANEL.md` - Admin panel user guide
- `/docs/TIMESCALEDB_SETUP.md` - TimescaleDB for logs
- `/docs/LOG_VIEWER_FIELD_METADATA_API.md` - Log viewer API
- `/docs/DYNAMIC_GENERATION_FOUNDATION.md` - Dynamic parameters
- `/docs/MICROFRONTENDS_SETUP.md` - Microfrontend setup
- `/chrome-extension/SORA_SUPPORT.md` - Sora extension support
- `/scripts/launcher_gui/README.md` - Launcher GUI docs
- API Docs: `http://localhost:8001/docs` (auto-generated Swagger)
- `/docs/archive/` - Archived/outdated documentation

---

## Project Structure

```
/g/code/pixsim7/
├── pixsim7_backend/     # Backend application
│   ├── api/             # REST API endpoints
│   ├── services/        # Business logic layer
│   ├── domain/          # Database models
│   ├── workers/         # Background jobs (ARQ)
│   ├── infrastructure/  # Database, Redis, logging
│   └── shared/          # Config, schemas, errors
├── admin/               # Svelte admin panel
│   ├── src/
│   │   ├── routes/      # Pages (dashboard, logs)
│   │   └── lib/         # Components, API client
│   └── README.md        # Admin tech docs
├── data/                # All persistent data (gitignored)
│   ├── postgres/        # PostgreSQL database files
│   ├── redis/           # Redis persistence (AOF/RDB)
│   ├── storage/         # Videos, user uploads
│   ├── logs/            # Application logs (JSON)
│   └── cache/           # Temporary cache files
├── scripts/             # Helper scripts
│   ├── start-dev.sh     # Start databases only
│   ├── start-all.sh     # Start full Docker
│   └── manage.sh        # Process manager (prevents zombies)
├── docs/                # Documentation
│   ├── SETUP.md         # Setup guide
│   └── ADMIN_PANEL.md   # Admin panel guide
├── docker-compose.yml          # Full Docker (all services)
├── docker-compose.db-only.yml  # Databases only
└── README.md            # This file
```

---

## Development Setup

### Option 1: Docker for Databases Only (Recommended)

**Best for:** Development, debugging, fast code iteration

```bash
# Quick start
./scripts/start-dev.sh

# Manual steps:
# 1. Start PostgreSQL & Redis
docker-compose -f docker-compose.db-only.yml up -d

# 2. Start backend & worker (prevents zombie processes)
./scripts/manage.sh start

# 3. Start admin panel
cd admin && npm run dev
```

**Advantages:**
- Easy debugging (see output directly)
- Fast code changes (auto-reload)
- No zombie processes (PID tracking)
- Better IDE integration

### Option 2: Full Docker

**Best for:** Production, deployment, "just run it"

```bash
# Quick start
./scripts/start-all.sh

# Manual:
docker-compose up -d
```

**Advantages:**
- One command starts everything
- Consistent environment
- Easy deployment
- Automatic process management

### Option 3: Conda Environment (Python Only)

Use a single shared conda env for all Python code (API, worker, scripts).

```bash
cd G:/code/pixsim7
conda env create -f environment.yml
conda activate pixsim7

# Install local provider SDKs (if cloned alongside this repo)
pip install -e G:/code/pixverse-py
pip install -e G:/code/sora-py  # if available

# Run backend
uvicorn pixsim7_backend.main:app --host 0.0.0.0 --port 8001
```

If you see errors like `Could not find a version that satisfies the requirement pixverse-py`, it means the SDK isn't published. Remove it from `environment.yml` (already commented) and install from local path with `pip install -e`.

**Troubleshooting Pillow build errors (Windows):**
```bash
conda update -n base -c defaults conda
pip install --upgrade pip setuptools wheel
pip install --force-reinstall pillow
```

**Common Issues:**
- Missing aiosqlite: ensure environment.yml was applied (contains aiosqlite for async tests).
- Structlog not found: verify `structlog` line present and recreate env: `conda env remove -n pixsim7; conda env create -f environment.yml`.
- Local SDK path wrong: check drive letter (`G:/code/pixverse-py`).

---

## Data Organization

All persistent data in `./data/`:
```
data/
├── postgres/   # PostgreSQL database files
├── redis/      # Redis AOF/RDB
├── storage/    # Videos, user uploads
├── logs/       # JSON application logs
└── cache/      # Temporary files
```

**Backup:** `tar -czf backup.tar.gz data/`
**Restore:** `tar -xzf backup.tar.gz`

---

## Key Commands

### Windows
```bash
# Development mode
scripts\start-dev.bat         # Start databases, show next steps
scripts\manage.bat start      # Start backend & worker
scripts\manage.bat stop       # Stop backend & worker
scripts\manage.bat status     # Check status
scripts\manage.bat cleanup    # Kill zombie processes

# Full Docker mode
scripts\start-all.bat         # Start everything
docker-compose ps             # Check status
docker-compose logs -f backend  # View logs
docker-compose down           # Stop everything
```

### Linux/macOS/WSL
```bash
# Development mode
./scripts/start-dev.sh        # Start databases, show next steps
./scripts/manage.sh start     # Start backend & worker
./scripts/manage.sh stop      # Stop backend & worker
./scripts/manage.sh status    # Check status
./scripts/manage.sh cleanup   # Kill zombie processes

# Full Docker mode
./scripts/start-all.sh        # Start everything
docker-compose ps             # Check status
docker-compose logs -f backend  # View logs
docker-compose down           # Stop everything
```

# View logs
tail -f data/logs/pixsim7.log
docker-compose logs -f backend

# Database access
docker-compose -f docker-compose.db-only.yml exec postgres psql -U pixsim pixsim7
docker-compose -f docker-compose.db-only.yml exec redis redis-cli

# Check disk usage
du -sh data/*/
```

---

## Configuration

Copy `.env.example` to `.env`:

```env
# Ports (avoid conflicts with other services)
# ⚠️ IMPORTANT FOR AI ASSISTANTS: Backend API runs on port 8001, NOT 8000!
POSTGRES_PORT=5434
REDIS_PORT=6380
BACKEND_PORT=8001  # ← Backend FastAPI server (http://localhost:8001/api)
ADMIN_PORT=8002    # ← Admin panel SvelteKit dev server

# ZeroTier network (for remote access)
ZEROTIER_NETWORK=10.243.0.0/16

# CORS origins
CORS_ORIGINS=http://localhost:8002

# Database
DATABASE_URL=postgresql://pixsim:pixsim123@localhost:5434/pixsim7
REDIS_URL=redis://localhost:6380/0
```

---

## Tech Stack

**Backend:**
- **FastAPI** - Async web framework
- **SQLModel** - Database ORM (SQLAlchemy + Pydantic)
- **PostgreSQL** - Relational database
- **Redis** - Cache & job queue
- **ARQ** - Background workers
- **Uvicorn** - ASGI server

**Frontend:**
- **SvelteKit 5** - UI framework
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **TypeScript** - Type safety
- **Chart.js** - Visualizations

**Infrastructure:**
- **Docker Compose** - Container orchestration
- **Pydantic** - Data validation
- **asyncpg** - Async PostgreSQL driver

---

## Admin Panel Features

**Dashboard:**
- Real-time service status (API, Worker, PostgreSQL, Redis)
- Auto-refresh every 10 seconds

**Log Viewer:**
- Color-coded by level (CRITICAL, ERROR, WARNING, INFO, DEBUG)
- Advanced filtering: level, logger, user_id, job_id, search, time range
- Expandable entries (click to see full details)
- Auto-refresh every 5 seconds
- Pagination (100 logs per page)
- Metadata badges (User ID, Job ID, Exceptions)

See `docs/ADMIN_PANEL.md` for detailed usage.

---

## Zombie Process Prevention

**Problem:** Running `python main.py &` repeatedly creates zombie processes.

**Solutions:**

1. **Use Docker** (best):
   ```bash
   docker-compose up -d  # Handles all processes
   ```

2. **Use process manager**:
   ```bash
   ./scripts/manage.sh start   # Tracks PIDs
   ./scripts/manage.sh restart # Clean restart
   ```

3. **Cleanup zombies**:
   ```bash
   ./scripts/manage.sh cleanup
   ```

---

## Development Guidelines

1. **Use dependency injection** - Never manually instantiate services
2. **Follow existing patterns** - Check similar code first
3. **Structured logging** - Use logger, include context (user_id, job_id)
4. **Test incrementally** - Test each change before moving on
5. **Document when needed** - Follow docs guidelines above

---

## API Endpoints

Full API documentation at http://localhost:8001/docs

**Auth:**
- POST `/api/v1/auth/register` - Create account
- POST `/api/v1/auth/login` - Login
- POST `/api/v1/auth/logout` - Logout

**Users:**
- GET `/api/v1/users/me` - Current user profile
- PUT `/api/v1/users/me` - Update profile

**Jobs:**
- POST `/api/v1/jobs` - Create job
- GET `/api/v1/jobs` - List jobs
- GET `/api/v1/jobs/{id}` - Get job details

**Assets:**
- GET `/api/v1/assets` - List assets
- GET `/api/v1/assets/{id}` - Get asset

**Admin:**
- GET `/api/v1/admin/services/status` - Service health
- GET `/api/v1/admin/system/metrics` - System metrics
- GET `/api/v1/admin/logs` - Query logs

---

## Troubleshooting

See `docs/SETUP.md` for detailed troubleshooting.

**Quick fixes:**

```bash
# Can't start backend (port in use)
netstat -ano | findstr :8001
# Kill the process or change BACKEND_PORT in .env

# Database doesn't exist
docker-compose -f docker-compose.db-only.yml exec postgres \
  psql -U pixsim -c "CREATE DATABASE pixsim7;"

# Clean up everything
./scripts/manage.sh cleanup
docker-compose down
rm -rf data/*  # WARNING: deletes all data!
```

---

## License

[Add license here]

---

## Next Steps

1. **Setup:** Follow `docs/SETUP.md`
2. **Try the admin panel:** http://localhost:8002
3. **View logs:** http://localhost:8002/logs
4. **Read API docs:** http://localhost:8001/docs

**For detailed instructions, see `docs/SETUP.md`**
