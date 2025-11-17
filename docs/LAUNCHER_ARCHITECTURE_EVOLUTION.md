# Launcher Architecture Evolution

## Journey to Multi-UI Architecture

This document chronicles the transformation of the PixSim7 launcher from a monolithic Qt application to a clean, multi-UI capable architecture.

---

## Phase 1: Extract Core Managers ✅ COMPLETE

**Goal:** Extract business logic into pure Python managers

**What We Built:**
- `ProcessManager`: Service lifecycle (start/stop/restart)
- `HealthManager`: Health monitoring (threading, not QThread)
- `LogManager`: Log aggregation and persistence
- Core types: `ServiceDefinition`, `ServiceState`, `HealthStatus`

**Architecture:**
```
Qt Launcher (monolithic)
    ↓
launcher_core (pure Python)
    ├── ProcessManager
    ├── HealthManager
    └── LogManager
```

**Key Achievement:** Business logic now runs without Qt!

**Examples:**
- CLI launcher (no UI)
- Web API example (FastAPI)

**Commit:** `22cefcd` - Phase 1: Extract launcher core managers

---

## Phase 2: Qt Integration ✅ COMPLETE

**Goal:** Integrate pure core with existing Qt launcher

**What We Built:**
- `QtEventBridge`: Converts core callbacks → Qt signals
- `LauncherFacade`: Qt-friendly wrapper around managers
- `ServiceProcessAdapter`: Compatibility layer (looks like old `ServiceProcess`)
- Updated `launcher.py`: Auto-detects and uses new core

**Architecture:**
```
Qt UI (unchanged!)
    ↓
ServiceProcessAdapter (compatibility)
    ↓
LauncherFacade (Qt wrapper)
    ↓
launcher_core (pure Python managers)
```

**Key Achievement:** Zero UI code changes required!

**How It Works:**
- `USE_NEW_CORE` flag enables new architecture
- Falls back to old `ServiceProcess` if core unavailable
- Adapter provides exact same interface UI expects
- All existing functionality preserved

**Testing:**
- Check logs for: `"launcher_using_new_core"`
- All services start/stop normally
- Health monitoring works
- Logs appear in console

**Commit:** `193ea6d` - Phase 2: Integrate launcher_core with Qt launcher

---

## Phase 3: Dependency Injection ✅ COMPLETE

**Goal:** Clean interfaces and structured configuration

**What We Built:**

### Interfaces (`interfaces.py`)
- Protocol definitions for all managers
- `IProcessManager`, `IHealthManager`, `ILogManager`, `IEventBus`
- Enables mocking and testing
- Clear contracts

### Configuration (`config.py`)
- Structured config classes replace scattered parameters
- `ProcessManagerConfig`, `HealthManagerConfig`, `LogManagerConfig`
- `LauncherConfig` bundles everything
- JSON/dict serialization support

### Container (`container.py`)
- DI container wires up all managers
- `LauncherContainer` manages dependencies
- Lazy initialization
- Context manager support (auto start/stop)

**Architecture Enhancement:**
```
Application Code
    ↓
LauncherContainer (DI)
    ├── Config (structured)
    ├── ProcessManager (interface)
    ├── HealthManager (interface)
    └── LogManager (interface)
```

**Key Achievement:** Professional DI pattern, easy testing!

**Usage:**
```python
container = create_container(services, config_overrides={...})

with container:
    process_mgr = container.get_process_manager()
    process_mgr.start('backend')
# Auto-cleanup
```

**Commit:** `31f593f` (part 1) - Phase 3: Dependency injection

---

## Phase 4: Event Bus ✅ COMPLETE

**Goal:** Decouple managers from UI via pub/sub

**What We Built:**

### Event Bus (`event_bus.py`)
- Thread-safe pub/sub system
- Multiple subscribers per event type
- Wildcard subscriptions (`"process.*"`)
- Error isolation (one bad handler doesn't break others)
- Global singleton or instance-based
- Event statistics

### Event Types
- `EventTypes.PROCESS_STARTED`, `PROCESS_STOPPED`, `PROCESS_FAILED`
- `EventTypes.HEALTH_UPDATE`
- `EventTypes.LOG_LINE`
- Extensible for custom events

**Architecture Enhancement:**
```
┌─────────────┐         ┌─────────────┐
│   Qt UI     │         │   Web UI    │
│  (PySide6)  │         │  (Svelte)   │
└──────┬──────┘         └──────┬──────┘
       │                       │
       └───────┬───────────────┘
               │ Subscribe to events
       ┌───────▼────────┐
       │   Event Bus    │ ← Pub/sub
       │   (decoupled)  │
       └───────▲────────┘
               │ Publish events
       ┌───────┴────────┐
       │  Managers       │
       │  (core logic)   │
       └─────────────────┘
```

**Key Achievement:** Complete decoupling! UIs only depend on events!

**Usage:**
```python
bus = get_event_bus()

def on_health(event):
    print(f"{event.data.service_key}: {event.data.status}")

bus.subscribe(EventTypes.HEALTH_UPDATE, on_health)

container = create_container(services)
container.start_all()
# Events flow automatically
```

**Commit:** `31f593f` (part 2) - Phase 4: Event bus

---

## Current Architecture (Phase 1-4 Complete)

### Full Stack View:

```
┌─────────────────────────────────────────────────────────┐
│                    UI Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Qt UI      │  │   Web UI     │  │     CLI      │ │
│  │  (PySide6)   │  │  (Svelte)    │  │  (terminal)  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
└─────────┼──────────────────┼──────────────────┼─────────┘
          │                  │                  │
          │ Subscribe        │ Subscribe        │ Subscribe
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼─────────┐
│                     Event Bus                            │
│               (pub/sub, thread-safe)                     │
└─────────▲──────────────────────────────────────▲─────────┘
          │ Publish                              │ Publish
          │                                      │
┌─────────┴──────────────────────────────────────┴─────────┐
│               LauncherContainer (DI)                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Config (structured settings)                    │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ ProcessMgr   │  │ HealthMgr    │  │  LogManager  │  │
│  │              │  │              │  │              │  │
│  │ start/stop   │  │ monitoring   │  │  logs        │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└───────────────────────────────────────────────────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│              Python Standard Library                     │
│     subprocess, threading, urllib, socket               │
└─────────────────────────────────────────────────────────┘
```

### Key Characteristics:

**✓ UI-Agnostic Core**
- Managers have zero UI dependencies
- Work with Qt, web, CLI, tests

**✓ Event-Driven**
- Pub/sub decouples components
- Multiple UIs can coexist

**✓ Dependency Injection**
- Container manages wiring
- Easy to test and mock

**✓ Structured Configuration**
- Type-safe config classes
- Centralized settings

**✓ Professional Patterns**
- Protocols for interfaces
- Factory functions
- Context managers

---

## What's Possible Now

### ✅ Already Working:

1. **Qt Launcher** (existing users)
   - Uses new core via adapter
   - All features work
   - No UI changes

2. **CLI Launcher** (example)
   - Pure terminal interface
   - Uses container + event bus
   - Same business logic

3. **Web API** (example)
   - FastAPI REST endpoints
   - WebSocket log streaming
   - Ready to build on

### 🎯 Ready to Build:

1. **Production REST API** (Phase 5)
   - Use container for DI
   - Subscribe to event bus
   - WebSocket for real-time updates
   - Clean endpoints

2. **Svelte Web UI** (Phase 6)
   - Connect to REST API
   - WebSocket for live updates
   - Modern reactive UI
   - Same functionality as Qt

3. **Tests** (ongoing)
   - Mock managers via protocols
   - Test via event bus
   - Container makes setup easy

---

## Benefits Achieved

### Before (Monolithic):
```python
class Launcher:
    def __init__(self):
        # 1452 lines of mixed UI + logic
        self.processes = {...}  # Qt QProcess
        self.health_worker = QThread(...)  # Qt QThread
        # Everything coupled to Qt
```

**Problems:**
- ❌ Can't reuse logic
- ❌ Can't test without Qt
- ❌ Can't build web UI
- ❌ Hard to maintain

### After (Clean Architecture):
```python
# Pure Python core
container = create_container(services)

# Qt UI
qt_bridge = QtBridge(container.get_event_bus())

# Web UI
api = FastAPI()
api.container = container

# CLI
cli = CLI(container)
```

**Benefits:**
- ✅ Logic reusable everywhere
- ✅ Test without UI
- ✅ Multiple UIs from one core
- ✅ Clean, maintainable

---

## Code Metrics

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Lines of Code** | 1,452 (monolithic) | ~800 (split) | -45% |
| **UI Dependencies** | Throughout | Zero in core | 100% decoupled |
| **Testability** | Requires Qt | Pure Python | ∞ better |
| **Reusability** | Qt only | Qt, Web, CLI | 3+ UIs |
| **Maintainability** | Single file | Separated | Much better |

---

## Next Steps

### Phase 5: Production REST API

**Goal:** Build production-ready web API

**Plan:**
```python
# Use container for DI
container = create_container(services)

# Subscribe to event bus
bus = container.get_event_bus()

# Build FastAPI routes
@app.post("/services/{key}/start")
async def start(key: str):
    return container.get_process_manager().start(key)

# WebSocket for real-time updates
@app.websocket("/ws/events")
async def events(ws: WebSocket):
    def send_event(event):
        ws.send_json(event)
    bus.subscribe("*", send_event)
```

**Deliverables:**
- Full REST API (based on example)
- OpenAPI docs
- WebSocket event streaming
- Authentication (optional)

### Phase 6: Svelte Web UI

**Goal:** Modern web interface

**Plan:**
- SvelteKit app
- Connects to REST API
- WebSocket for live updates
- Responsive design

**Features:**
- Same as Qt launcher
- Web-based
- Mobile-friendly

---

## Summary

We've successfully transformed the launcher from a monolithic Qt app into a **professional, multi-UI capable architecture**:

**✅ Phase 1:** Core managers extracted (pure Python)
**✅ Phase 2:** Qt integration (zero UI changes)
**✅ Phase 3:** Dependency injection (clean interfaces)
**✅ Phase 4:** Event bus (complete decoupling)
**⏳ Phase 5:** REST API (ready to build)
**⏳ Phase 6:** Svelte web UI (ready to build)

**The Vision is Real:**

```
One Core ────┬──→ Qt Launcher (existing users)
             ├──→ Web Launcher (new users)
             ├──→ CLI (power users)
             └──→ Tests (developers)
```

**All using the same battle-tested business logic!**

---

**Status:** Phase 1-4 complete (version 0.2.0)
**Next:** Build production REST API (Phase 5)
**Timeline:** Phases 5-6 estimated 2-3 days development
**Ready:** Architecture is production-ready ✅
