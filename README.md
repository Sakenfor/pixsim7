# PixSim7

> Multi-provider video generation orchestration platform with REST API, background workers, and unified account management.

**🤖 AI Assistant?** Read **[AI_README.md](./AI_README.md)** first - comprehensive guide to the codebase architecture and implementation status.

---

## What is PixSim7?

PixSim7 is a **provider-agnostic video generation platform** that unifies multiple AI video generation services (Pixverse, Runway, Pika, etc.) behind a single API. It handles:

- **Multi-account pooling** - Manage dozens of provider accounts, automatically rotating to maximize throughput
- **Session management** - Automatic credential refresh, JWT handling, and "logged in elsewhere" detection
- **Job orchestration** - Queue video generation tasks across multiple providers and accounts
- **Browser automation** - Chrome extension for seamless provider integration
- **Credit tracking** - Monitor usage across all accounts in real-time
- **Unified API** - One interface for multiple video generation backends

**Key Use Cases:**
- Scale video generation beyond single-account limits
- Aggregate credits across multiple accounts
- Build applications on top of AI video services without managing provider complexity
- Automate bulk video generation workflows

---

## Features

### Core Platform
- **REST API** - FastAPI with 25+ endpoints for jobs, accounts, assets, and automation
- **Background Workers** - ARQ-based async job processing
- **Admin Panel** - Real-time service monitoring, log viewer, and system metrics
- **Multi-Provider Support** - Unified interface for Pixverse, Runway, Pika, Sora, and more
- **Account Management** - Pool management with automatic session refresh

### Developer Tools
- **Chrome Extension** - Cookie import, account switching, provider detection
- **Android App** - Native Android agent for device automation and remote control
- **AI Hub** - LLM-powered prompt editing (OpenAI, Anthropic) with logging
- **Structured Logging** - JSON logs with advanced filtering and search
- **OpenAPI Docs** - Auto-generated Swagger documentation
- **Game Integration** - Node-based scene editor with video generation

### Infrastructure
- **PostgreSQL** - Account credentials, job history, assets
- **Redis** - Job queue, caching, and rate limiting
- **Docker Support** - Single-command deployment
- **ZeroTier Ready** - Remote access and distributed automation

---

## Quick Start

### Prerequisites
- **Docker** & Docker Compose (recommended)
- **Python 3.11+** (for local development)
- **Node.js 18+** (for admin panel)

### Option 1: Docker (Recommended)

```bash
# Clone repository
git clone https://github.com/sakenfor/pixsim7.git
cd pixsim7

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start all services
docker-compose up -d

# Access admin panel
open http://localhost:8002
```

### Option 2: Launcher (Windows)

```bash
# Double-click or run
launch.bat

# Opens web UI at http://localhost:8002 where you can:
# - Start/stop all services
# - Monitor logs in real-time
# - View system metrics
```

### Option 3: Development Mode

```bash
# Start databases only
docker-compose -f docker-compose.db-only.yml up -d

# Setup Python environment
conda env create -f environment.yml
conda activate pixsim7

# Start backend
uvicorn pixsim7.backend.main.main:app --host 0.0.0.0 --port 8001

# Start admin panel (separate terminal)
cd admin && npm install && npm run dev
```

**Access Points:**
- Admin Panel: http://localhost:8002
- API Documentation: http://localhost:8001/docs
- Health Check: http://localhost:8001/health

---

## Architecture

```
┌─────────────────┐
│  Chrome Ext     │  ← Import cookies, switch accounts
└────────┬────────┘
         │
┌────────▼────────────────────────────────────────┐
│             PixSim7 Backend                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │   API    │  │  Workers │  │  Redis   │      │
│  │ FastAPI  │─▶│   ARQ    │─▶│  Queue   │      │
│  └─────┬────┘  └────┬─────┘  └──────────┘      │
│        │            │                            │
│        └────────────┼────────────┐               │
│                     ▼            ▼               │
│              ┌──────────┐  ┌──────────┐          │
│              │PostgreSQL│  │ Storage  │          │
│              │Accounts  │  │  Videos  │          │
│              └──────────┘  └──────────┘          │
└─────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
┌─────────────────┐        ┌─────────────────┐
│  Pixverse API   │        │   Runway API    │
│  Pika API       │        │   Sora API      │
└─────────────────┘        └─────────────────┘
```

**Data Flow:**
1. Chrome extension imports provider cookies
2. Backend stores credentials and tracks session health
3. Jobs are queued and processed by workers
4. Workers use account pool to execute generation tasks
5. Assets are stored and linked back to jobs

---

## Documentation

### Getting Started
- **[Architecture Overview](./docs/architecture/README.md)** - System design and component overview **← Start here!**
- **[DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)** - Setup, workflows, and contribution guide
- **[Setup](./docs/getting-started/SETUP.md)** - Detailed installation and configuration
- **[AI_README.md](./AI_README.md)** - Guide for AI assistants working with the codebase

### Backend
- **[Backend README](./pixsim7/backend/main/README.md)** - Backend architecture
- **[Services Documentation](./docs/backend/SERVICES.md)** - Service layer reference
- **[Provider Account Strategy](./docs/PROVIDER_ACCOUNT_STRATEGY.md)** - Multi-account pooling
- **[Redis & Workers](./pixsim7/backend/main/REDIS_AND_WORKERS_SETUP.md)** - Job queue setup

### Frontend & Extensions
- **[Admin Panel Guide](./docs/getting-started/ADMIN_PANEL.md)** - Web UI features
- **[Chrome Extension](./chrome-extension/README.md)** - Browser integration
- **[Android App](./apps/pixsim7-android/README.md)** - Native Android automation agent
- **[Frontend Architecture](./frontend/README.md)** - Component library and design
- **[Game Integration](./docs/NODE_EDITOR_DEVELOPMENT.md)** - Scene editor development

### Security & Authentication
- **[Authentication](./docs/authentication/README.md)** - Auth flows, storage abstraction, desktop support

### Operations
- **[Launcher Documentation](./docs/getting-started/LAUNCHER.md)** - Single-click launcher
- **[Port Configuration](./docs/getting-started/PORT_CONFIGURATION.md)** - Network and port reference
- **[Logging Structure](./LOGGING_STRUCTURE.md)** - Structured logging specification

Full documentation index in the original README section.

---

## Configuration

### Environment Variables

```env
# API Server
BACKEND_PORT=8001          # Backend API (http://localhost:8001)
ADMIN_PORT=8002            # Admin panel (http://localhost:8002)

# Database
POSTGRES_PORT=5434         # PostgreSQL (avoid conflicts)
DATABASE_URL=postgresql://user:pass@localhost:5434/pixsim7

# Cache & Queue
REDIS_PORT=6380            # Redis (avoid conflicts)
REDIS_URL=redis://localhost:6380/0

# Optional: Remote Access
ZEROTIER_NETWORK=10.243.0.0/16
CORS_ORIGINS=http://localhost:8002

# Optional: AI Hub (LLM prompt editing)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Directory Structure

```
pixsim7/
├── pixsim7/backend/main/   # Backend application
│   ├── api/                # REST endpoints
│   ├── services/           # Business logic
│   ├── domain/             # Database models
│   ├── workers/            # Background jobs
│   └── infrastructure/     # Database, Redis, logging
├── admin/                  # Svelte admin panel
├── chrome-extension/       # Browser extension
├── data/                   # Persistent data (gitignored)
│   ├── postgres/           # Database files
│   ├── redis/              # Redis persistence
│   ├── storage/            # Videos, uploads
│   └── logs/               # Application logs
├── scripts/                # Helper scripts
├── docs/                   # Documentation
└── docker-compose.yml      # Container orchestration
```

---

## API Overview

### Authentication
```bash
# Register new user
curl -X POST http://localhost:8001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "secure123"}'

# Login
curl -X POST http://localhost:8001/api/v1/auth/login \
  -d "username=user@example.com&password=secure123"
```

### Account Management
```bash
# List provider accounts
GET /api/v1/accounts?provider_id=pixverse

# Import cookies from chrome extension
POST /api/v1/accounts/import
```

### Job Execution
```bash
# Create video generation job
POST /api/v1/jobs
{
  "provider_id": "pixverse",
  "account_id": 42,
  "parameters": {
    "prompt": "A cat playing piano",
    "duration": 5
  }
}

# Check job status
GET /api/v1/jobs/{job_id}
```

**Full API reference:** http://localhost:8001/docs

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | FastAPI, SQLModel, PostgreSQL, Redis, ARQ |
| **Frontend** | SvelteKit 5, TypeScript, Tailwind CSS, Chart.js |
| **Browser** | Chrome Extension, Manifest V3, Playwright |
| **Infrastructure** | Docker, uvicorn, asyncpg, structlog |
| **AI Integration** | pixverse-py, sora-py, OpenAI, Anthropic |

---

## Development

### Running Tests
```bash
# Backend tests
pytest pixsim7/backend/main/tests/

# Frontend tests
cd admin && npm test
```

### Code Style
```bash
# Format Python
black pixsim7/

# Lint
ruff check pixsim7/

# Type check
mypy pixsim7/
```

### Database Migrations
```bash
# Create migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head
```

See [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) for detailed workflows.

---

## Deployment

### Docker Production

```bash
# Build and start
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Manual Production

```bash
# Install dependencies
pip install -r pixsim7/backend/main/requirements.txt

# Run with gunicorn
gunicorn pixsim7.backend.main.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8001

# Start ARQ worker
arq pixsim7.backend.main.workers.WorkerSettings
```

---

## Troubleshooting

### Common Issues

**Port already in use:**
```bash
# Check what's using the port
netstat -ano | grep 8001  # Linux/macOS
netstat -ano | findstr :8001  # Windows

# Change port in .env
BACKEND_PORT=8002
```

**Database connection failed:**
```bash
# Verify PostgreSQL is running
docker-compose ps

# Check connection
docker-compose exec postgres psql -U pixsim pixsim7
```

**Worker not processing jobs:**
```bash
# Check Redis connection
docker-compose exec redis redis-cli PING

# View worker logs
docker-compose logs -f worker
```

See [docs/getting-started/SETUP.md](./docs/getting-started/SETUP.md) for comprehensive troubleshooting.

---

## Contributing

We welcome contributions! Please see [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) for:
- Development setup
- Code style guidelines
- Testing requirements
- Pull request process

---

## License

[Add your license here - MIT, Apache 2.0, etc.]

---

## Support

- **Issues:** [GitHub Issues](https://github.com/sakenfor/pixsim7/issues)
- **Discussions:** [GitHub Discussions](https://github.com/sakenfor/pixsim7/discussions)
- **Documentation:** [docs/](./docs/)

---

## Acknowledgments

Built with:
- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [SvelteKit](https://kit.svelte.dev/) - Frontend framework
- [pixverse-py](https://github.com/sakenfor/pixverse-py) - Pixverse API client
- Community contributors and testers

---

**Ready to get started?** Follow the [Quick Start](#quick-start) guide above or read the full [Setup Documentation](./docs/getting-started/SETUP.md).
