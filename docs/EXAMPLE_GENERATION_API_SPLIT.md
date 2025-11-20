# Example: Generation API Split

A concrete example showing how to split the generation service into a separate API.

## Project Structure After Split

```
pixsim7/
├── pixsim7_backend/           # Main backend (game, users, assets, dialogue)
│   ├── routes/
│   │   ├── game/
│   │   ├── users/
│   │   ├── dialogue/
│   │   └── ...
│   └── main.py
│
├── generation_api/            # NEW: Separate generation service
│   ├── __init__.py
│   ├── main.py               # FastAPI app
│   ├── routes/
│   │   ├── __init__.py
│   │   ├── generations.py    # Moved from pixsim7_backend
│   │   ├── prompts.py        # Moved from pixsim7_backend
│   │   └── providers.py      # Moved from pixsim7_backend
│   ├── services/
│   │   ├── generation_service.py  # Core generation logic
│   │   └── ...
│   └── models.py             # Database models
│
└── launcher/
    └── services.json         # Updated with generation-api entry
```

---

## 1. Create generation_api/main.py

```python
"""
Generation API - Separate microservice for AI generation

Handles:
- Image generation
- Prompt management
- Provider configuration
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

# Import settings from main backend (shared config)
from pixsim7_backend.shared.config import settings
from pixsim7_backend.shared.database import engine, Base

# Import routes
from .routes import generations, prompts, providers

app = FastAPI(
    title="PixSim7 Generation API",
    description="AI generation and prompt management microservice",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Service info endpoint (for launcher discovery)
@app.get("/dev/info")
async def service_info():
    """Service metadata for multi-service discovery."""
    port = int(os.getenv("GENERATION_API_PORT", 8001))

    return {
        "service_id": "generation-api",
        "name": "PixSim7 Generation API",
        "version": "1.0.0",
        "type": "backend",
        "port": port,

        "endpoints": {
            "health": "/health",
            "docs": "/docs",
            "architecture": "/dev/architecture/map",
            "info": "/dev/info"
        },

        "provides": [
            "generations",  # Image generation
            "prompts",      # Prompt management
            "providers"     # AI provider config
        ],

        "dependencies": [
            "db"  # Requires PostgreSQL
        ],

        "tags": ["api", "generation", "ai", "microservice"]
    }


# Health check
@app.get("/health")
async def health():
    """Health check endpoint."""
    # Check database connection
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "service": "generation-api",
            "database": "connected"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "service": "generation-api",
            "database": "disconnected",
            "error": str(e)
        }


# Architecture introspection (for App Map panel)
@app.get("/dev/architecture/map")
async def architecture_map():
    """Backend architecture introspection."""
    # Discover routes from this app
    routes_data = []
    for route in app.routes:
        if hasattr(route, "methods"):
            routes_data.append({
                "path": route.path,
                "methods": list(route.methods),
                "name": route.name,
                "tags": getattr(route, "tags", [])
            })

    return {
        "version": "1.0",
        "service_id": "generation-api",
        "routes": routes_data,
        "services": {
            "generation_service": {
                "sub_services": ["creation", "lifecycle", "query", "validation"]
            }
        },
        "metrics": {
            "total_routes": len(routes_data),
            "total_services": 1,
            "total_sub_services": 4
        }
    }


# Include route modules
app.include_router(generations.router, prefix="/generations", tags=["generations"])
app.include_router(prompts.router, prefix="/prompts", tags=["prompts"])
app.include_router(providers.router, prefix="/providers", tags=["providers"])


# Database initialization
@app.on_event("startup")
async def startup():
    """Initialize database tables for generation service."""
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    print("Generation API started successfully")


@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown."""
    print("Generation API shutting down")
```

---

## 2. Move Routes to generation_api/routes/

### generation_api/routes/generations.py

```python
"""
Generations routes - moved from pixsim7_backend
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from pixsim7_backend.shared.database import get_db
from pixsim7_backend.models import Generation
from ..services.generation_service import GenerationService

router = APIRouter()


@router.post("/", response_model=dict)
async def create_generation(
    prompt: str,
    model: str = "stable-diffusion",
    db: Session = Depends(get_db)
):
    """Create a new generation."""
    service = GenerationService(db)
    generation = await service.create_generation(
        prompt=prompt,
        model=model
    )
    return generation


@router.get("/{generation_id}")
async def get_generation(
    generation_id: int,
    db: Session = Depends(get_db)
):
    """Get generation by ID."""
    service = GenerationService(db)
    generation = service.get_generation(generation_id)

    if not generation:
        raise HTTPException(status_code=404, detail="Generation not found")

    return generation


@router.get("/")
async def list_generations(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List generations."""
    service = GenerationService(db)
    generations = service.list_generations(skip=skip, limit=limit)
    return generations
```

---

## 3. Update launcher/services.json

```json
{
  "version": "2.0",
  "description": "PixSim7 service configuration",

  "backend_services": [
    {
      "id": "main-api",
      "name": "Main Backend API",
      "description": "Core API handling game, users, assets, and dialogue",
      "port_env": "BACKEND_PORT",
      "default_port": 8000,
      "info_endpoint": "/dev/info",
      "health_endpoint": "/health",
      "docs_endpoint": "/docs",
      "auto_start": true,
      "depends_on": ["db"],
      "enabled": true,
      "type": "python",
      "module": "pixsim7_backend.main:app",
      "tags": ["core", "api"],
      "provides": ["game", "users", "assets", "dialogue", "actions"]
    },
    {
      "id": "generation-api",
      "name": "Generation API",
      "description": "AI generation and prompt management microservice",
      "port_env": "GENERATION_API_PORT",
      "default_port": 8001,
      "info_endpoint": "/dev/info",
      "health_endpoint": "/health",
      "docs_endpoint": "/docs",
      "auto_start": false,
      "depends_on": ["db"],
      "enabled": true,
      "type": "python",
      "module": "generation_api.main:app",
      "tags": ["api", "generation", "ai"],
      "provides": ["generations", "prompts", "providers"]
    }
  ],

  "frontend_services": [...],
  "infrastructure_services": [...]
}
```

---

## 4. Add Environment Variable

Add to `.env`:

```bash
# Backend Services
BACKEND_PORT=8000
GENERATION_API_PORT=8001

# Frontend Services
FRONTEND_PORT=5173
ADMIN_PORT=5174
GAME_FRONTEND_PORT=5175

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/pixsim7
```

---

## 5. Update Main Backend to Call Generation API

### Option A: Direct HTTP Calls

```python
# pixsim7_backend/services/generation_client.py

import httpx
import os

GENERATION_API_URL = f"http://localhost:{os.getenv('GENERATION_API_PORT', 8001)}"

async def create_generation(prompt: str, model: str = "stable-diffusion"):
    """Call generation API to create generation."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{GENERATION_API_URL}/generations/",
            json={"prompt": prompt, "model": model}
        )
        return response.json()

async def get_generation(generation_id: int):
    """Get generation from generation API."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{GENERATION_API_URL}/generations/{generation_id}"
        )
        return response.json()
```

### Option B: Fallback Pattern

```python
# pixsim7_backend/services/generation_client.py

import httpx
import os
from typing import Optional

GENERATION_API_URL = f"http://localhost:{os.getenv('GENERATION_API_PORT', 8001)}"

async def create_generation(prompt: str, model: str = "stable-diffusion"):
    """
    Create generation using Generation API if available,
    otherwise use local generation service.
    """
    try:
        # Try generation API first
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.post(
                f"{GENERATION_API_URL}/generations/",
                json={"prompt": prompt, "model": model}
            )
            if response.status_code == 200:
                return response.json()
    except (httpx.ConnectError, httpx.TimeoutException):
        # Generation API not available, use local
        pass

    # Fallback to local generation service
    from pixsim7_backend.services.generation_service import GenerationService
    from pixsim7_backend.shared.database import get_db

    db = next(get_db())
    service = GenerationService(db)
    return await service.create_generation(prompt=prompt, model=model)
```

---

## 6. What the Launcher Does Automatically

### When you start the launcher:

```
┌──────────────────────────────────────────────┐
│ PixSim7 Launcher                             │
├──────────────────────────────────────────────┤
│ Services:                                    │
│                                              │
│ ┌────────────────────────────────┐          │
│ │ Databases (Docker)      [ ]    │ Gray     │
│ │ Port: N/A                      │          │
│ │ [Start]                        │          │
│ └────────────────────────────────┘          │
│                                              │
│ ┌────────────────────────────────┐          │
│ │ Main Backend API        [ ]    │ Gray     │
│ │ Port: 8000                     │          │
│ │ [Start]                        │          │
│ └────────────────────────────────┘          │
│                                              │
│ ┌────────────────────────────────┐          │
│ │ Generation API          [ ]    │ Gray     │ <-- NEW!
│ │ Port: 8001                     │          │
│ │ [Start]                        │          │
│ └────────────────────────────────┘          │
│                                              │
│ [...more services...]                       │
│                                              │
│ [Start All] [Stop All]                      │
└──────────────────────────────────────────────┘
```

### Click "Start All":

```
1. Launcher checks dependencies:
   - db has no dependencies → start first
   - main-api depends on db → start after db
   - generation-api depends on db → start after db

2. Start order: [db] → [main-api, generation-api] (parallel)

3. Process tracking:
   - db: docker-compose (no PID, check via docker ps)
   - main-api: QProcess, PID 5678
   - generation-api: QProcess, PID 5679

4. Health monitoring starts:
   - Poll http://localhost:8000/health (main-api)
   - Poll http://localhost:8001/health (generation-api)

5. Multi-service discovery:
   - Query http://localhost:8000/dev/info
   - Query http://localhost:8001/dev/info
   - Fetch architecture from both
   - Show "2/2 services discovered"
```

### After 2 seconds (all healthy):

```
┌──────────────────────────────────────────────┐
│ PixSim7 Launcher                             │
├──────────────────────────────────────────────┤
│ Services:                                    │
│                                              │
│ ┌────────────────────────────────┐          │
│ │ Databases (Docker)      [●]    │ Green    │
│ │ Running                        │          │
│ │ [Stop] [Logs]                  │          │
│ └────────────────────────────────┘          │
│                                              │
│ ┌────────────────────────────────┐          │
│ │ Main Backend API        [●]    │ Green    │
│ │ Port: 8000  PID: 5678          │          │
│ │ [Stop] [Restart] [Logs]        │          │
│ └────────────────────────────────┘          │
│                                              │
│ ┌────────────────────────────────┐          │
│ │ Generation API          [●]    │ Green    │ <-- Running!
│ │ Port: 8001  PID: 5679          │          │
│ │ [Stop] [Restart] [Logs]        │          │
│ └────────────────────────────────┘          │
│                                              │
│ [Stop All] [Restart All]                    │
└──────────────────────────────────────────────┘

┌── Architecture Panel ────────────────────────┐
│ ✓ 2/2 services discovered                   │
│                                              │
│ 🛣️  Routes: 60       🏗️  Services: 4       │
│ 🔌  Modernized: 85%  📏  Avg Module: 150    │
│                                              │
│ Services:                                   │
│ • Main Backend API (45 routes)              │
│ • Generation API (15 routes)                │
└──────────────────────────────────────────────┘
```

---

## 7. Testing the Split

### Start Both Services

```bash
# Terminal 1 - Main API
cd /path/to/pixsim7
export BACKEND_PORT=8000
uvicorn pixsim7_backend.main:app --port 8000 --reload

# Terminal 2 - Generation API
cd /path/to/pixsim7
export GENERATION_API_PORT=8001
uvicorn generation_api.main:app --port 8001 --reload
```

Or just use the launcher GUI!

### Test Generation API Independently

```bash
# Check health
curl http://localhost:8001/health
# {"status": "healthy", "service": "generation-api"}

# Check service info
curl http://localhost:8001/dev/info
# {...service metadata...}

# Create generation
curl -X POST http://localhost:8001/generations/ \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cat", "model": "stable-diffusion"}'
```

### Test Main Backend Calling Generation API

```bash
# Main backend proxies to generation API
curl -X POST http://localhost:8000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a dog"}'

# Main backend internally calls:
# http://localhost:8001/generations/
```

---

## 8. Process Management Details

### PID Tracking

```python
# Launcher tracks PIDs in multiple ways:

1. QProcess.processId()
   - Returns PID of running process
   - Used for process control (kill, etc.)

2. .pid files (data/launcher/generation-api.pid)
   - Persisted to disk
   - Survives launcher restarts
   - Used to detect externally running instances

3. ServiceProcess.started_pid
   - Stored in memory
   - Tracks PID of process we started
   - Used for health checks

4. ServiceProcess.detected_pid
   - External process detection
   - Found via port scanning or PID files
   - Shows "externally running" status
```

### When Generation API is Killed

```python
# User clicks "Stop" on Generation API card:

1. Launcher calls: process.stop()

2. QProcess sends termination signal:
   - Windows: CTRL+BREAK signal to process group
   - Linux: SIGTERM to process

3. Wait 5 seconds for graceful shutdown

4. If still running, force kill:
   - Windows: os.kill(pid, signal.SIGKILL)
   - Linux: SIGKILL

5. Clean up:
   - Remove data/launcher/generation-api.pid
   - Clear process.started_pid
   - Set process.running = False
   - Update GUI card to gray (stopped)
```

### Process Groups (Windows)

```python
# On Windows, launcher uses CREATE_NEW_PROCESS_GROUP
# This ensures child processes are also killed:

if sys.platform == 'win32':
    process.setCreateProcessArgumentsModifier(
        lambda args: args + [
            subprocess.CREATE_NEW_PROCESS_GROUP
        ]
    )

# When you stop generation-api:
# - Main generation process killed
# - Any worker processes also killed
# - All part of same process group
```

---

## 9. Advantages of This Split

### Development

✅ **Independent Deployment**: Update generation API without touching main backend
✅ **Faster Iteration**: Restart only generation service during development
✅ **Clearer Codebase**: Generation logic separated from game logic

### Performance

✅ **Horizontal Scaling**: Run multiple generation API instances
✅ **Resource Isolation**: Generation API can use more memory/CPU without affecting main backend
✅ **Independent Caching**: Each service can have its own Redis cache

### Monitoring

✅ **Separate Logs**: Generation API has its own log file
✅ **Individual Health**: Monitor generation API health independently
✅ **Granular Metrics**: See generation API performance separately

### Operations

✅ **Rolling Updates**: Update generation API while main backend stays up
✅ **Failure Isolation**: Generation API crash doesn't crash main backend
✅ **Different Tech**: Could rewrite generation API in different language if needed

---

## Summary

### To Split Generation API:

1. ✅ Create `generation_api/main.py` with FastAPI app
2. ✅ Move generation routes to `generation_api/routes/`
3. ✅ Add entry to `launcher/services.json`
4. ✅ Add `GENERATION_API_PORT=8001` to `.env`
5. ✅ Update main backend to call generation API

### What Happens Automatically:

✅ Launcher shows new service card
✅ Start/stop buttons work automatically
✅ PID tracking via QProcess
✅ Health monitoring via `/health` endpoint
✅ Architecture panel shows both services
✅ Combined metrics displayed
✅ Process groups ensure clean shutdown

### No Code Changes Needed In:

- Launcher GUI (dynamically creates cards)
- Process management (handles any service)
- Health monitoring (polls any health URL)
- Architecture panel (discovers any service)

Just add to services.json and the launcher handles everything! 🚀
