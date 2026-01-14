# PixSim7 Setup

This guide covers the current launcher-driven workflow. The old admin panel has been removed.

## Prerequisites

- Python 3.11+
- Node.js 18+
- Docker Desktop (for Postgres/Redis)

## Quick Start (Launcher)

1) Copy env file:

```bash
copy .env.example .env
```

2) Start the launcher:

```bash
launch.bat
```

3) Use the launcher to start services (DB, backend, frontend, devtools).

## Manual Start (No Launcher)

Start databases:

```bash
docker-compose -f docker-compose.db-only.yml up -d
```

Start backend:

```bash
set PYTHONPATH=%CD%
python -m uvicorn pixsim7.backend.main.main:app --reload --port 8001
```

Start worker:

```bash
set PYTHONPATH=%CD%
python -m arq pixsim7.backend.main.workers.arq_worker.WorkerSettings
```

Start main frontend:

```bash
pnpm --filter @pixsim7/main dev
```

Start devtools:

```bash
pnpm --filter @pixsim7/devtools dev
```

## Ports and Base URLs

Edit these in `.env` or via the launcher UI:

```env
BACKEND_PORT=8001
FRONTEND_PORT=5173
GAME_FRONTEND_PORT=5174
DEVTOOLS_PORT=5176
GENERATION_API_PORT=8003
LAUNCHER_PORT=8100
```

Base URL overrides (optional):

```env
BACKEND_BASE_URL=http://localhost:8001
FRONTEND_BASE_URL=http://localhost:5173
DEVTOOLS_BASE_URL=http://localhost:5176
```

## Service Manifests

Services are defined by manifests (no central registry):

- `package.json` -> `pixsim.service`
- `pixsim.service.json`

The launcher and OpenAPI scripts read these manifests automatically.
