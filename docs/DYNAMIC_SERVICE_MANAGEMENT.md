# Dynamic Service Management in Launcher

## Current Architecture

The launcher is **already dynamic** - it automatically discovers and manages services from `services.json`:

### How It Works Today

```python
# 1. Load services from services.json (or fallback to hardcoded)
self.services = build_services_with_fallback()

# 2. Create process managers for ALL services dynamically
self.processes = {s.key: ServiceProcess(s) for s in self.services}

# 3. Create UI cards for ALL services dynamically
for s in self.services:
    sp = self.processes[s.key]
    card = ServiceCard(s, sp)
    self.cards[s.key] = card
```

**Result:** Add a service to services.json → launcher automatically shows it in GUI!

---

## Process ID Tracking

### Current System

Each service has a `ServiceProcess` object that tracks:

```python
class ServiceProcess:
    self.proc: QProcess | subprocess.Popen  # The actual process
    self.running: bool                      # Is it running?
    self.detected_pid: Optional[int]        # PID if externally running
    self.started_pid: Optional[int]         # PID if launcher started it
    self.health_status: HealthStatus        # STOPPED/STARTING/HEALTHY/UNHEALTHY
```

### How PIDs Are Tracked

1. **QProcess (Managed)**:
   - `self.proc.processId()` gives PID
   - Launcher fully controls start/stop

2. **Detached Processes**:
   - Saved to `data/launcher/{service}.pid` files
   - `detected_pid` tracks externally running instances

3. **Health Monitoring**:
   - Polls service health URLs
   - Updates `health_status` every few seconds
   - GUI cards reflect status with colors

---

## Example: Splitting Generation API

Let's say you want to split the generation service out of the main backend.

### Step 1: Create the Generation API Service

Create `generation_api/main.py`:

```python
from fastapi import FastAPI

app = FastAPI(
    title="PixSim7 Generation API",
    version="1.0.0"
)

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/dev/info")
async def service_info():
    return {
        "service_id": "generation-api",
        "name": "PixSim7 Generation API",
        "version": "1.0.0",
        "type": "backend",
        "port": 8001,
        "provides": ["generations", "prompts", "providers"],
        "dependencies": ["db"],
        "endpoints": {
            "health": "/health",
            "docs": "/docs",
            "architecture": "/dev/architecture/map",
            "info": "/dev/info"
        }
    }

@app.get("/dev/architecture/map")
async def architecture():
    # Return architecture metadata like main backend does
    return {
        "version": "1.0",
        "routes": [...],
        "capabilities": [...],
        "metrics": {...}
    }

# Generation routes
from generation_api.routes import generations, prompts, providers

app.include_router(generations.router)
app.include_router(prompts.router)
app.include_router(providers.router)
```

### Step 2: Add to services.json

Just add one entry to `launcher/services.json`:

```json
{
  "backend_services": [
    {
      "id": "main-api",
      "name": "Main Backend API",
      "default_port": 8000,
      "module": "pixsim7.backend.main.main:app",
      "enabled": true,
      "provides": ["game", "users", "assets", "dialogue", "actions"]
    },
    {
      "id": "generation-api",
      "name": "Generation API",
      "description": "AI generation and prompt management",
      "port_env": "GENERATION_API_PORT",
      "default_port": 8001,
      "module": "generation_api.main:app",
      "info_endpoint": "/dev/info",
      "health_endpoint": "/health",
      "docs_endpoint": "/docs",
      "auto_start": false,
      "depends_on": ["db"],
      "enabled": true,
      "type": "python",
      "tags": ["api", "generation", "ai"],
      "provides": ["generations", "prompts", "providers"]
    }
  ]
}
```

### Step 3: That's It! 🎉

**The launcher automatically:**

✅ **Shows the service card** in the GUI
✅ **Creates start/stop buttons** for it
✅ **Tracks its PID** when running
✅ **Monitors its health** via `/health` endpoint
✅ **Shows logs** in the console tab
✅ **Displays in Architecture panel** (via multi-service discovery)
✅ **Respects dependencies** (starts after db)

### Step 4: Start the Service

In the GUI launcher:
1. Service card appears: "Generation API"
2. Click "Start" button
3. Launcher runs: `python -m uvicorn generation_api.main:app --port 8001 --reload`
4. Health monitor polls `http://localhost:8001/health`
5. Card turns green when healthy
6. Architecture panel shows: "2/2 services discovered"
7. Combined metrics show routes from both services

---

## What Happens Under the Hood

### Process Creation

```python
# Launcher automatically creates ServiceDef
ServiceDef(
    key="generation-api",
    title="Generation API",
    program=python_exe,
    args=["-m", "uvicorn", "generation_api.main:app",
          "--host", "0.0.0.0", "--port", "8001", "--reload"],
    cwd=ROOT,
    env_overrides={"PYTHONPATH": ROOT, ...},
    url="http://localhost:8001/docs",
    health_url="http://localhost:8001/health",
    depends_on=["db"]
)

# Creates ServiceProcess wrapper
process = ServiceProcess(service_def)
```

### PID Tracking

```python
# When you click "Start":
process.start()
  -> self.proc = QProcess()
  -> self.proc.start(program, args)
  -> self.started_pid = self.proc.processId()  # Track PID
  -> Save to data/launcher/generation-api.pid

# Process ID stored in:
1. process.proc.processId() - Live QProcess
2. process.started_pid - Integer PID
3. data/launcher/generation-api.pid - File persistence
```

### Health Monitoring

```python
# Health worker polls every 2 seconds:
async def check_health(service):
    response = await fetch(service.health_url)
    if response.ok:
        service.health_status = HealthStatus.HEALTHY
    else:
        service.health_status = HealthStatus.UNHEALTHY

# GUI card updates color:
- Green: HEALTHY
- Yellow: STARTING
- Red: UNHEALTHY
- Gray: STOPPED
```

### Multi-Service Discovery

```python
# Architecture panel automatically:
multi_discovery = MultiServiceDiscovery(services_config)
results = multi_discovery.discover_all_services()

# For each service in services.json:
- Fetches /dev/info endpoint
- Fetches /dev/architecture/map
- Combines metrics
- Shows "2/2 services discovered"

# Combined metrics:
- Total routes: 45 (main) + 15 (generation) = 60
- Total services: 3 (main) + 1 (generation) = 4
- Total plugins: 12 (main) + 3 (generation) = 15
```

---

## Advanced: Cross-Service Communication

When services are split, they need to communicate:

### Option 1: Direct HTTP Calls

```python
# In main backend
async def get_generation(generation_id: int):
    # Call generation API
    response = await httpx.get(
        f"http://localhost:8001/generations/{generation_id}"
    )
    return response.json()
```

### Option 2: Service Discovery

```python
# Read from services.json
from launcher.gui.multi_service_discovery import load_services_config

services = load_services_config()
generation_service = next(s for s in services if s['id'] == 'generation-api')
port = generation_service['default_port']
base_url = f"http://localhost:{port}"
```

### Option 3: Shared Database

Services can share the same database and just own different tables:

```python
# generation_api/models.py
class Generation(Base):
    __tablename__ = "generations"
    # Generation API owns this table

# pixsim7/backend/main/models.py
class GameSession(Base):
    __tablename__ = "game_sessions"
    generation_id = Column(Integer)  # References generation service
```

---

## Current Limitations & Improvements

### What Works Great ✅

1. **Dynamic service cards** - Automatically created from services.json
2. **Process management** - QProcess handles start/stop/PID tracking
3. **Health monitoring** - Polls health URLs, updates status
4. **Multi-service discovery** - Architecture panel shows all services
5. **Dependency management** - Services start in correct order

### What Could Be Better 🔧

#### 1. **Service Groups/Categories**

Currently all services shown in one flat list. Could group by type:

```
┌─ Backend Services ─────────┐
│ [●] Main API       (8000)  │
│ [●] Generation API (8001)  │
└────────────────────────────┘
┌─ Frontend Services ────────┐
│ [ ] Admin Panel    (5174)  │
│ [ ] Main Frontend  (5173)  │
└────────────────────────────┘
```

**Implementation:** Add to services.json:
```json
{
  "service_groups": {
    "backend": {
      "name": "Backend Services",
      "icon": "🖥️",
      "services": ["main-api", "generation-api"]
    }
  }
}
```

#### 2. **Better PID Display**

Show PID in service card:

```
┌─────────────────────────────┐
│ Generation API       [●]    │
│ Port: 8001  PID: 12345      │
│ [Stop] [Restart] [Logs]     │
└─────────────────────────────┘
```

**Implementation:** Add to ServiceCard widget:
```python
self.pid_label = QLabel(f"PID: {process.get_pid()}")
```

#### 3. **Process Tree View**

Show parent-child process relationships:

```
db (docker-compose)
├── postgres (pid: 1234)
└── redis (pid: 1235)

main-api (pid: 5678)
├── worker-1 (pid: 5679)
└── worker-2 (pid: 5680)
```

#### 4. **Resource Usage**

Show CPU/memory per service:

```python
import psutil

def get_process_stats(pid):
    process = psutil.Process(pid)
    return {
        "cpu_percent": process.cpu_percent(),
        "memory_mb": process.memory_info().rss / 1024 / 1024
    }
```

#### 5. **Service Communication Map**

Visualize which services talk to each other:

```
main-api ──calls──> generation-api
    │                     │
    └──reads──> db <──reads──┘
```

Read from services.json `provides` and `dependencies` fields.

---

## Migration Strategy

When you're ready to split generation API:

### Phase 1: Prepare (No Breaking Changes)

1. ✅ Create `generation_api/` package
2. ✅ Copy generation routes there
3. ✅ Keep imports working in main backend
4. ✅ Add to services.json with `enabled: false`

### Phase 2: Test Independently

1. ✅ Set `enabled: true` for generation-api
2. ✅ Start both services via launcher
3. ✅ Test generation API independently
4. ✅ Main backend still has generation code (fallback)

### Phase 3: Update Main Backend

1. ✅ Main backend calls generation API via HTTP
2. ✅ Keep local generation code as fallback
3. ✅ If generation-api down, use local code

### Phase 4: Remove Duplication

1. ✅ Remove generation code from main backend
2. ✅ Require generation-api to be running
3. ✅ Update dependencies in services.json

---

## Complete Example: Starting Both Services

### User Action:
1. Open launcher
2. See two service cards: "Main API" and "Generation API"
3. Click "Start All"

### What Happens:
```python
# 1. Launcher checks dependencies
services_to_start = ["db", "main-api", "generation-api"]
ordered = topological_sort(services_to_start)  # ["db", "main-api", "generation-api"]

# 2. Start db first
db_process.start()
wait_until(db_process.health_status == HEALTHY)

# 3. Start main-api
main_api_process.start()  # PID: 5678
save_pid("data/launcher/main-api.pid", 5678)

# 4. Start generation-api
generation_api_process.start()  # PID: 5679
save_pid("data/launcher/generation-api.pid", 5679)

# 5. Health monitor polls both
poll_health("http://localhost:8000/health")  # main-api
poll_health("http://localhost:8001/health")  # generation-api

# 6. Multi-service discovery queries both
discover_all_services()
# Fetches /dev/info from both
# Fetches /dev/architecture/map from both
# Shows "2/2 services discovered" in Architecture panel
```

### GUI State:
```
┌─────────────────────────────┐
│ Main Backend API     [●]    │ GREEN (Healthy)
│ Port: 8000  PID: 5678       │
│ [Stop] [Restart] [Logs]     │
└─────────────────────────────┘
┌─────────────────────────────┐
│ Generation API       [●]    │ GREEN (Healthy)
│ Port: 8001  PID: 5679       │
│ [Stop] [Restart] [Logs]     │
└─────────────────────────────┘

Architecture Panel:
✓ 2/2 services discovered
Routes: 60 total
Services: 4 (2 backends + 2 sub-services each)
Plugins: 15 modernized
```

---

## Summary

### The Good News ✅

Your launcher is **already dynamic**! Just add services to `services.json` and they automatically appear in the GUI with:
- Start/Stop buttons
- PID tracking
- Health monitoring
- Log streaming
- Architecture metrics

### For Generation API Split

1. Create `generation_api/main.py` with FastAPI app
2. Add one entry to `launcher/services.json`
3. Launcher handles everything else automatically

### Process Management

- **QProcess** manages subprocess lifecycle
- **PID tracking** via `processId()` and `.pid` files
- **Health monitoring** via HTTP polling
- **Multi-service discovery** shows combined metrics

No code changes needed - just add to services.json! 🚀
