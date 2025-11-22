# Backend Startup Mechanics

This document describes the detailed mechanics of backend startup, including the sequence of operations, helper functions, and error handling strategy.

For high-level policy and health check semantics, see `ARCHITECTURE.md` § "Backend Startup & Readiness".

---

## Table of Contents

- [Startup Sequence](#startup-sequence)
- [Helper Functions](#helper-functions)
- [App State Management](#app-state-management)
- [Error Handling Strategy](#error-handling-strategy)
- [Plugin Required Flag](#plugin-required-flag)
- [Testing Startup](#testing-startup)

---

## Startup Sequence

The backend startup process is orchestrated by `lifespan()` in `main.py`, which calls focused helper functions from `startup.py` in this order:

### 1. **Settings Validation**
```python
validate_settings(settings)
```
- **Purpose**: Verify production safety (e.g., `SECRET_KEY` is not default)
- **Error Handling**: Fail-fast with `ValueError` if invalid

### 2. **Domain Registry**
```python
domain_registry = setup_domain_registry(settings.domain_models_dir)
app.state.domain_registry = domain_registry
```
- **Purpose**: Auto-register all SQLModel domain models from directory
- **Error Handling**: Fail-fast if models fail to load
- **Attached to**: `app.state.domain_registry`

### 3. **Database & Seeding**
```python
await setup_database_and_seed()
```
- **Purpose**: Initialize database connection (required) and seed defaults (optional)
- **Error Handling**:
  - Database init: Fail-fast (required)
  - Default presets: Warn and continue (optional)

### 4. **Redis**
```python
redis_available = await setup_redis()
app.state.redis_available = redis_available
```
- **Purpose**: Connect to Redis for background jobs, caching, sessions
- **Error Handling**: Warn and continue in degraded mode (optional)
- **Attached to**: `app.state.redis_available` (boolean)

### 5. **Providers**
```python
setup_providers()
```
- **Purpose**: Register video generation and LLM providers
- **Error Handling**: Fail-fast if provider registration fails

### 6. **Event Handlers**
```python
setup_event_handlers()
```
- **Purpose**: Register event bus handlers (metrics, webhooks, auto-retry)
- **Error Handling**: Fail-fast if handler registration fails

### 7. **ECS Components**
```python
ecs_count = setup_ecs_components()
```
- **Purpose**: Register core ECS (Entity-Component-System) components for game state
- **Error Handling**: Fail-fast if component registration fails
- **Must run before plugins** so plugins can see core components

### 8. **Plugins**
```python
plugin_manager, routes_manager = await setup_plugins(
    app,
    settings.feature_plugins_dir,
    settings.route_plugins_dir,
    fail_fast=settings.debug
)
app.state.plugin_manager = plugin_manager
app.state.routes_manager = routes_manager
```
- **Purpose**: Load and enable feature and route plugins
- **Error Handling**: Conditional based on `fail_fast` flag and plugin manifest `required` field
  - Dev/CI (`DEBUG=true`): Any plugin failure aborts startup
  - Prod: Only `required=true` plugin failures abort startup
- **Attached to**: `app.state.plugin_manager`, `app.state.routes_manager`

### 9. **Backward Compatibility**
```python
set_plugin_manager(plugin_manager)
```
- **Purpose**: Set global plugin manager for legacy code
- **Note**: New code should use `request.app.state.plugin_manager` instead

### 10. **Behavior Registry Lock**
```python
stats = setup_behavior_registry_lock(plugin_manager, routes_manager)
```
- **Purpose**: Lock behavior registry to prevent runtime registration
- **Must run after plugins** to capture all plugin-registered behaviors

### 11. **Admin Diagnostics**
```python
configure_admin_diagnostics(plugin_manager, routes_manager)
```
- **Purpose**: Set up `/admin/plugins` endpoint for plugin inspection

### 12. **Middleware Lifecycle**
```python
await setup_middleware_lifecycle(app)
```
- **Purpose**: Enable middleware lifecycle hooks
- **Attached to**: `app.state.middleware_manager`

---

## Helper Functions

All helper functions are defined in `pixsim7/backend/main/startup.py`.

### `validate_settings(settings) -> None`

Validates application settings for production safety.

**Raises**: `ValueError` if settings are invalid

**Example**:
```python
validate_settings(settings)
```

---

### `setup_domain_registry(models_dir: str | Path) -> DomainModelRegistry`

Auto-registers SQLModel domain models from a directory.

**Args**:
- `models_dir`: Directory containing `*.py` files with domain models

**Returns**: `DomainModelRegistry` instance

**Example**:
```python
registry = setup_domain_registry("pixsim7/backend/main/domain_models")
```

**Testing**:
```python
def test_domain_registry():
    with tempfile.TemporaryDirectory() as tmpdir:
        # Write test model to tmpdir
        registry = setup_domain_registry(tmpdir)
        assert len(registry.registered_models) > 0
```

---

### `setup_database_and_seed() -> None`

Initializes database (required) and seeds default presets (optional).

**Error Handling**:
- Database init failure → raises exception (fail-fast)
- Preset seeding failure → logs warning, continues

**Example**:
```python
await setup_database_and_seed()
```

---

### `setup_redis() -> bool`

Attempts to connect to Redis.

**Returns**: `True` if Redis is available, `False` otherwise

**Example**:
```python
redis_available = await setup_redis()
if not redis_available:
    logger.warning("Running in degraded mode without Redis")
```

---

### `setup_providers() -> None`

Registers default provider implementations (Pixverse, Anthropic, etc.).

**Example**:
```python
setup_providers()
```

---

### `setup_event_handlers() -> None`

Registers event bus handlers and WebSocket handlers.

**Example**:
```python
setup_event_handlers()
```

---

### `setup_ecs_components() -> int`

Registers core ECS components.

**Returns**: Number of registered components

**Note**: Must run before plugin loading

**Example**:
```python
count = setup_ecs_components()
logger.info(f"Registered {count} ECS components")
```

---

### `setup_plugins(app, plugins_dir, routes_dir, fail_fast) -> tuple`

Initializes and enables plugin managers.

**Args**:
- `app`: FastAPI application instance
- `plugins_dir`: Directory containing feature plugins
- `routes_dir`: Directory containing route plugins
- `fail_fast`: If `True`, abort startup on any plugin failure

**Returns**: `(plugin_manager, routes_manager)` tuple

**Example**:
```python
pm, rm = await setup_plugins(
    app,
    "pixsim7/backend/main/plugins",
    "pixsim7/backend/main/routes",
    fail_fast=True
)
```

**Testing**:
```python
async def test_plugin_loading():
    app = FastAPI()
    pm, rm = await setup_plugins(app, "tests/fixtures/plugins", "tests/fixtures/routes", fail_fast=True)
    assert len(pm.list_plugins()) > 0
```

---

### `setup_behavior_registry_lock(plugin_manager, routes_manager) -> dict`

Locks the behavior extension registry after plugins are loaded.

**Returns**: Dictionary with registry statistics

**Example**:
```python
stats = setup_behavior_registry_lock(plugin_manager, routes_manager)
logger.info(f"Locked registry with {stats['conditions']['total']} conditions")
```

---

### `configure_admin_diagnostics(plugin_manager, routes_manager) -> None`

Configures the `/admin/plugins` endpoint.

**Example**:
```python
configure_admin_diagnostics(plugin_manager, routes_manager)
```

---

### `setup_middleware_lifecycle(app) -> None`

Enables middleware lifecycle hooks.

**Example**:
```python
await setup_middleware_lifecycle(app)
```

---

## App State Management

After startup, the following state is attached to `app.state` for per-request access:

```python
# Access in route handlers:
@router.get("/example")
async def example(request: Request):
    domain_registry = request.app.state.domain_registry
    plugin_manager = request.app.state.plugin_manager
    redis_available = request.app.state.redis_available

    if not redis_available:
        # Fallback for degraded mode
        pass
```

**Available State**:
- `app.state.domain_registry` - Domain model registry
- `app.state.redis_available` - Boolean, `True` if Redis is connected
- `app.state.plugin_manager` - Feature plugin manager
- `app.state.routes_manager` - Route plugin manager
- `app.state.middleware_manager` - Middleware manager

**Backward Compatibility**:
Legacy code can still use module-level globals:
```python
from pixsim7.backend.main.infrastructure.plugins import get_plugin_context
context = get_plugin_context()  # Falls back to global if no request
```

---

## Error Handling Strategy

### Required Subsystems

These subsystems **must** succeed or startup aborts with an exception:
- Database initialization
- Domain model registration
- Core ECS component registration
- Provider registration
- Event handler registration

**Implementation**: No `try/except` - let exceptions propagate to crash startup.

### Optional Subsystems

These subsystems can fail without aborting startup:
- **Redis**: Logs warning, sets `app.state.redis_available = False`, continues in degraded mode
- **Default Presets**: Logs warning, continues without seeded data

**Implementation**: `try/except` with warning logs, return status/None.

### Conditional Subsystems (Plugins)

Plugin failures are handled based on two factors:

1. **Environment Mode** (`settings.debug`):
   - `DEBUG=true` (dev/CI): `fail_fast=True` → any plugin failure aborts
   - `DEBUG=false` (prod): `fail_fast=False` → tolerant unless plugin is required

2. **Plugin Manifest** (`required: bool`):
   - `required=true`: Always fail-fast, even in production
   - `required=false` or unset: Tolerant in production, fail-fast in dev/CI

**Resolution Logic** (in `PluginManager.check_required_plugins()`):
```python
if fail_fast and len(self.failed_plugins) > 0:
    # Dev/CI mode - strict, ANY failure aborts
    raise RuntimeError(f"Plugin loading failed in strict mode")

# Check failed plugins for required=True
for plugin_id, failure_info in self.failed_plugins.items():
    if failure_info.get('required', False):
        # Production, but plugin is marked required
        raise RuntimeError(f"Required plugin failed: {plugin_id}")

# Optional plugin failures in production → logged, startup continues
```

---

## Plugin Required Flag

Plugin manifests can specify `required: bool` to control fail-fast behavior in production.

### Example Manifest

```python
# pixsim7/backend/main/plugins/game_dialogue/manifest.py

class HandlerManifest:
    enabled = True
    required = True  # ← Fail-fast even in production
    name = "Game Dialogue System"
    description = "Core dialogue functionality"
```

### Default Behavior

If `required` is not specified, defaults to `False` (optional).

### When to Use `required=True`

Mark a plugin as required if:
- It provides core functionality (e.g., authentication, logging)
- The app cannot function without it
- You want to fail-fast in production to catch misconfigurations

### When to Use `required=False`

Mark a plugin as optional if:
- It provides nice-to-have features
- Graceful degradation is acceptable
- You want maximum availability in production

---

## Testing Startup

### Unit Testing Helpers

Each helper function can be tested independently:

```python
# tests/test_startup.py
import pytest
from pixsim7.backend.main.startup import setup_domain_registry, setup_redis

def test_domain_registry_loads_models(tmp_path):
    # Create test model file
    model_file = tmp_path / "test_model.py"
    model_file.write_text("""
from sqlmodel import SQLModel, Field

class TestModel(SQLModel, table=True):
    id: int = Field(primary_key=True)
""")

    registry = setup_domain_registry(tmp_path)
    assert len(registry.registered_models) == 1
    assert "TestModel" in [m.__name__ for m in registry.registered_models]


@pytest.mark.asyncio
async def test_redis_degraded_mode():
    # With Redis unavailable
    available = await setup_redis()

    # Should not raise, but return False
    assert available in [True, False]
```

### Integration Testing Startup

Test the full startup sequence:

```python
@pytest.mark.asyncio
async def test_full_startup_sequence():
    from fastapi import FastAPI
    from pixsim7.backend.main.main import lifespan

    app = FastAPI()

    async with lifespan(app):
        # App should have state populated
        assert hasattr(app.state, 'domain_registry')
        assert hasattr(app.state, 'plugin_manager')
        assert hasattr(app.state, 'redis_available')

    # After shutdown, cleanup should have run
    # (check that managers are disabled, connections closed)
```

### Readiness Endpoint Testing

```python
@pytest.mark.asyncio
async def test_readiness_when_db_down(client):
    # Mock database failure
    with patch('pixsim7.backend.main.api.health.get_async_session') as mock_db:
        mock_db.side_effect = Exception("DB connection failed")

        response = await client.get("/ready")

        # Should return 503
        assert response.status_code == 503
        assert response.json()['status'] == 'unavailable'
```

---

## Troubleshooting

### Startup Fails with "SECRET_KEY must be set in production"

**Cause**: Running with `DEBUG=false` and default `SECRET_KEY`.

**Solution**: Set `SECRET_KEY` environment variable:
```bash
export SECRET_KEY="your-secure-random-key-here"
```

### Plugin Fails to Load in Production

**Cause**: Plugin marked as `required=true` or misconfigured.

**Solution**:
1. Check plugin manifest: Is `required=true`? If so, the plugin must load.
2. Check plugin logs for specific error.
3. If plugin is optional, set `required=false` in manifest.

### Redis Unavailable - Background Jobs Not Working

**Cause**: Redis connection failed during startup.

**Expected**: App continues in degraded mode.

**Check**:
```bash
curl http://localhost:8001/ready
# Should return status="degraded" if Redis is down
```

**Solution**: Start Redis or accept degraded mode (no background jobs).

### Database Unavailable - Startup Aborts

**Cause**: Database is required and unavailable.

**Expected**: Startup fails with error.

**Solution**: Fix database connection and restart.

---

## See Also

- `ARCHITECTURE.md` § "Backend Startup & Readiness" - High-level policy
- `pixsim7/backend/main/startup.py` - Helper function implementations
- `pixsim7/backend/main/main.py` - Startup orchestration
- `pixsim7/backend/main/api/health.py` - Health and readiness endpoints
