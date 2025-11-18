# Launcher Core

Pure Python service management library for PixSim7, decoupled from any UI framework.

## Overview

The `launcher_core` package provides the core business logic for managing PixSim7 services:

- **ProcessManager**: Service lifecycle management (start/stop/restart)
- **HealthManager**: Service health monitoring via HTTP/TCP checks
- **LogManager**: Console log aggregation and persistence

These managers are **UI-agnostic** and can be used from:
- PySide6/Qt desktop launcher (existing)
- FastAPI web service (future)
- CLI tools
- Tests

## Architecture

```
┌─────────────────────────────────────────────────┐
│            UI Layer (any framework)             │
│   • PySide6/Qt (existing launcher)              │
│   • FastAPI (future web UI)                     │
│   • CLI                                         │
└──────────────┬──────────────────────────────────┘
               │ Uses events/callbacks
┌──────────────▼──────────────────────────────────┐
│         Launcher Core (this package)            │
│   • ProcessManager (start/stop/restart)         │
│   • HealthManager (health checks)               │
│   • LogManager (log aggregation)                │
└──────────────┬──────────────────────────────────┘
               │ Uses
┌──────────────▼──────────────────────────────────┐
│         Standard Library Only                   │
│   • subprocess, threading, urllib               │
│   • No Qt, no UI dependencies                   │
└─────────────────────────────────────────────────┘
```

## Quick Start

```python
from pixsim7.launcher_core import (
    ServiceDefinition,
    ProcessManager,
    HealthManager,
    LogManager
)

# 1. Define services
services = [
    ServiceDefinition(
        key="backend",
        title="Backend API",
        program="python",
        args=["-m", "uvicorn", "pixsim7_backend.main:app"],
        cwd="/path/to/project",
        health_url="http://localhost:8000/health",
        health_grace_attempts=6
    )
]

# 2. Create managers
process_mgr = ProcessManager(services)
health_mgr = HealthManager(
    states=process_mgr.states,
    interval_sec=2.0
)
log_mgr = LogManager(
    states=process_mgr.states
)

# 3. Start services
process_mgr.start("backend")
health_mgr.start()
log_mgr.start_monitoring()

# 4. Get status
state = process_mgr.get_state("backend")
logs = log_mgr.get_logs("backend", filter_level="ERROR")

# 5. Stop everything
health_mgr.stop()
log_mgr.stop_monitoring()
process_mgr.stop("backend")
```

## Event-Driven Usage

Subscribe to events for real-time updates:

```python
def on_process_event(event: ProcessEvent):
    print(f"Process {event.service_key}: {event.event_type}")
    if event.data:
        print(f"  Data: {event.data}")

def on_health_event(event: HealthEvent):
    print(f"Health {event.service_key}: {event.status}")

def on_log_line(service_key: str, line: str):
    print(f"[{service_key}] {line}")

# Register callbacks
process_mgr = ProcessManager(
    services,
    event_callback=on_process_event
)
health_mgr = HealthManager(
    process_mgr.states,
    event_callback=on_health_event
)
log_mgr = LogManager(
    process_mgr.states,
    log_callback=on_log_line
)
```

## Integration with Qt Launcher

The existing Qt launcher can be migrated incrementally:

### Phase 1: Use Core Managers (Current Status)
- ✅ Core managers extracted
- ⏳ Update `ServiceProcess` to use `ProcessManager`
- ⏳ Update `HealthWorker` to use `HealthManager`
- ⏳ Update log handling to use `LogManager`

### Phase 2: Remove Qt Dependencies
- Replace `QProcess` → `subprocess.Popen` ✅ (already done in ProcessManager)
- Replace `QThread` → `threading.Thread` ✅ (already done in HealthManager)
- Replace `QTimer` → `threading.Timer`

### Phase 3: Event System
- Qt UI subscribes to manager events
- Managers emit events instead of Qt signals
- Bridge layer converts events → Qt signals

### Example Qt Integration:

```python
# In launcher.py
from pixsim7.launcher_core import ProcessManager, HealthManager
from PySide6.QtCore import QObject, Signal

class EventBridge(QObject):
    """Bridge between core events and Qt signals."""
    process_event = Signal(object)
    health_event = Signal(object)

    def on_process_event(self, event):
        self.process_event.emit(event)

    def on_health_event(self, event):
        self.health_event.emit(event)

# Usage
bridge = EventBridge()
process_mgr = ProcessManager(
    services,
    event_callback=bridge.on_process_event
)

# Connect Qt UI to signals
bridge.process_event.connect(self.update_ui)
```

## Integration with Web UI

Future FastAPI integration:

```python
# In api/launcher.py
from fastapi import FastAPI, WebSocket
from pixsim7.launcher_core import ProcessManager, HealthManager

app = FastAPI()
process_mgr = ProcessManager(services)
health_mgr = HealthManager(process_mgr.states)

@app.post("/services/{service_key}/start")
async def start_service(service_key: str):
    success = process_mgr.start(service_key)
    return {"success": success}

@app.get("/services/{service_key}/status")
async def get_status(service_key: str):
    state = process_mgr.get_state(service_key)
    return {
        "status": state.status.value,
        "health": state.health.value,
        "pid": state.pid
    }

@app.websocket("/ws/logs/{service_key}")
async def logs_websocket(websocket: WebSocket, service_key: str):
    await websocket.accept()

    def send_log(key: str, line: str):
        if key == service_key:
            asyncio.create_task(websocket.send_text(line))

    log_mgr.log_callback = send_log
    # Stream logs...
```

## Testing

Pure Python managers are easy to test:

```python
import pytest
from pixsim7.launcher_core import ProcessManager, ServiceDefinition

def test_process_lifecycle():
    service = ServiceDefinition(
        key="test",
        title="Test Service",
        program="python",
        args=["-m", "http.server", "8888"],
        cwd="."
    )

    mgr = ProcessManager([service])

    # Start
    assert mgr.start("test")
    assert mgr.is_running("test")

    # Stop
    assert mgr.stop("test")
    assert not mgr.is_running("test")
```

## Benefits

### ✅ Already Achieved (Phase 1)

1. **Separation of Concerns**: Business logic separated from UI
2. **Testability**: Can test without Qt
3. **Reusability**: Same code for desktop, web, CLI
4. **No Framework Lock-in**: Pure Python, works anywhere

### 🎯 Next Steps (Phase 2-6)

1. **Remove Remaining Qt**: Eliminate all Qt dependencies from core
2. **Dependency Injection**: Clean interfaces for extensions
3. **Event System**: Pub/sub for multiple UIs
4. **REST API**: Web service layer
5. **Svelte Web UI**: Modern web interface

## Migration Path

```mermaid
graph LR
    A[Current: Monolithic Qt] --> B[Phase 1: Extract Core]
    B --> C[Phase 2: Remove Qt from Core]
    C --> D[Phase 3: Event System]
    D --> E[Phase 4: REST API]
    E --> F[Phase 5: Web UI]

    style B fill:#90EE90
    style A fill:#FFB6C1
    style F fill:#87CEEB
```

- **Phase 1** (✅ DONE): Core managers extracted
- **Phase 2**: Remove Qt dependencies from managers
- **Phase 3**: Event system for UI decoupling
- **Phase 4**: REST API layer
- **Phase 5**: Svelte web UI

## Design Principles

1. **Pure Python Core**: No UI framework dependencies in managers
2. **Event-Driven**: Managers emit events, UIs subscribe
3. **Callback-Based**: Simple function callbacks for integration
4. **Thread-Safe**: Managers use threading primitives correctly
5. **Stateful**: Managers maintain service state
6. **Observable**: State changes are observable via events

## Next Actions

To continue the refactoring:

1. ✅ Create `ProcessManager`, `HealthManager`, `LogManager`
2. ⏳ Update `launcher/gui/processes.py` to use `ProcessManager`
3. ⏳ Update `launcher/gui/health_worker.py` to use `HealthManager`
4. ⏳ Update `launcher/gui/launcher.py` to use `LogManager`
5. ⏳ Test existing launcher works with new managers
6. ⏳ Remove Qt dependencies from managers (QProcess, QThread, QTimer)
7. ⏳ Build REST API using managers
8. ⏳ Build Svelte web UI consuming API

---

**Status**: Phase 1 Complete ✅
**Next**: Integrate managers into existing Qt launcher
