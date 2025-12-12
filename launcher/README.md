# PixSim7 Launcher

Unified launcher system for managing PixSim7 services across multiple interfaces.

## Architecture

```
launcher/
├── core/       # Pure Python service management library (UI-agnostic)
├── api/        # FastAPI REST API server
├── web/        # Svelte web UI (consumes API)
└── gui/        # PySide6 Qt desktop application
```

## Components

### Core (`launcher/core/`)
**Pure Python managers** - UI-agnostic business logic
- `ProcessManager` - Service lifecycle (start/stop/restart)
- `HealthManager` - Health monitoring (HTTP/TCP checks)
- `LogManager` - Log aggregation and persistence
- `EventBus` - Pub/sub event system

**Used by:** API, GUI (and future: web, CLI, tests)

📖 [Core Documentation](./core/README.md)

### API (`launcher/api/`)
**FastAPI REST API** - HTTP/WebSocket interface
- RESTful service management
- Real-time event streaming via WebSocket
- Log querying and filtering
- OpenAPI documentation

**Status:** ✅ Production-ready
**Port:** 8100
**Start:** `python -m uvicorn launcher.api.main:app --reload`

📖 [API Documentation](./api/README.md)

### Web (`launcher/web/`)
**Svelte Web UI** - Modern web interface
- Consumes launcher API
- Real-time status updates
- Service control dashboard

**Status:** 🚧 In Development
**Port:** 3100
**Start:** `./launcher/web/start-web.sh`

📖 [Web Documentation](./web/README.md)

### GUI (`launcher/gui/`)
**Qt Desktop App** - Native desktop launcher
- PySide6 interface
- Local service management
- Database log viewer

**Status:** ✅ Production (migrating to use core)
**Start:** `python launcher/gui/launcher.py`

## Quick Start

### Option 1: Desktop Launcher (Qt)
```bash
python launcher/gui/launcher.py
```

### Option 2: API Server + Web UI
```bash
# Terminal 1: Start API
python -m uvicorn launcher.api.main:app --port 8100 --reload

# Terminal 2: Start Web UI
cd launcher/web && npm run dev
```

### Option 3: API Only (for automation)
```bash
python -m uvicorn launcher.api.main:app --port 8100

# Use with curl, Python requests, or any HTTP client
curl http://localhost:8100/services
```

## Features

### Console Field Metadata API

The launcher integrates with the backend's `/api/v1/logs/console-fields` endpoint to dynamically render clickable log fields in both the Qt GUI and web UI.

**How it works:**
1. Backend defines field metadata (name, color, pattern, clickability) in `pixsim7/backend/main/api/v1/logs.py`
2. Launcher fetches metadata on startup and caches it locally (`data/cache/console_fields.json`)
3. Console logs are parsed for field patterns (e.g., `job_id=123`)
4. Matching fields are rendered as colored, clickable badges
5. Clicking a field ID opens the database log viewer filtered by that field

**Adding custom fields:**
Services can register new clickable fields via the backend's `console_field_registry`:

```python
from pixsim7.backend.main.api.v1.logs import console_field_registry, ConsoleFieldDefinition

console_field_registry.register(ConsoleFieldDefinition(
    name="trace_id",
    color="#9C27B0",
    clickable=True,
    pattern=r"trace_id=(\S+)",
    description="Distributed trace identifier"
))
```

**Fallback behavior:**
If the backend API is unavailable, the launcher falls back to hardcoded default fields, ensuring the UI remains functional.

## Design Principles

1. **Separation of Concerns** - Core logic decoupled from UI
2. **Reusability** - Same managers for desktop, web, API, CLI
3. **Event-Driven** - Pub/sub architecture for real-time updates
4. **Testability** - Pure Python core, easy to unit test
5. **Multiple Interfaces** - Choose the best UI for your workflow

## Integration Status

| Component | Uses Core | Status |
|-----------|-----------|--------|
| Core      | N/A       | ✅ Complete |
| API       | ✅ Yes    | ✅ Production |
| Web       | Via API   | 🚧 Development |
| GUI       | ⏳ Planned | ⏳ Migration pending |

## Migration Path

The Qt desktop launcher is being migrated to use the core managers:

- **Phase 1** ✅ - Core extracted
- **Phase 2** ✅ - API built and deployed
- **Phase 3** ⏳ - Migrate Qt launcher to use core
- **Phase 4** ⏳ - Complete web UI
- **Phase 5** ⏳ - Add CLI interface

## Development

### Running Tests
```bash
# Core tests
pytest launcher/core/

# API tests
pytest launcher/api/
```

### Code Structure
```
launcher/
├── core/
│   ├── process_manager.py   # Service lifecycle
│   ├── health_manager.py    # Health checks
│   ├── log_manager.py       # Log handling
│   ├── event_bus.py         # Pub/sub events
│   └── container.py         # DI container
│
├── api/
│   ├── main.py              # FastAPI app
│   ├── routes/              # API endpoints
│   └── dependencies.py      # DI for routes
│
├── web/
│   └── src/                 # Svelte components
│
└── gui/
    ├── launcher.py          # Main Qt app
    ├── widgets/             # Qt widgets
    └── dialogs/             # Dialog windows
```

## Contributing

When adding features:
1. Add to **core** if it's UI-agnostic logic
2. Add to **api** for REST endpoints
3. Add to **web** or **gui** for UI-specific features

## Documentation

- [Core Documentation](./core/README.md) - Managers and architecture
- [API Documentation](./api/README.md) - REST API reference
- [Web Documentation](./web/README.md) - Web UI guide
- [GUI Documentation](./gui/README.md) - Desktop app guide

---

**Version:** 1.0.0
**License:** MIT
**Maintainers:** PixSim7 Team
