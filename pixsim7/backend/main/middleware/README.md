# Middleware Plugin System

This directory contains dynamically-loaded HTTP middleware plugins for the PixSim7 application.

## Overview

The middleware plugin system provides:
- **Dynamic loading** - Middleware is auto-discovered from this directory
- **Priority-based ordering** - Control execution order with priority values
- **Dependency resolution** - Middleware can depend on other middleware
- **Lifecycle hooks** - `on_load()`, `on_enable()`, `on_disable()`
- **Configuration** - Each middleware can have custom config
- **Environment filtering** - Enable middleware for specific environments

## Directory Structure

```
middleware/
  ├── request_id/          # Priority 100 - Request tracking
  │   ├── __init__.py
  │   └── manifest.py
  ├── request_logging/     # Priority 200 - HTTP logging
  │   ├── __init__.py
  │   └── manifest.py
  └── cors/                # Priority 900 - CORS (last)
      ├── __init__.py
      └── manifest.py
```

## Priority Ranges

Middleware execution order is determined by priority (lower = earlier in chain):

- **0-99**: Security/auth middleware
- **100-199**: Request tracking and ID injection
- **200-299**: Logging and monitoring
- **300-499**: Business logic middleware
- **500-899**: Response processing
- **900-999**: CORS and other "last" middleware

## Creating a Middleware Plugin

### 1. Create the directory

```bash
mkdir pixsim7_backend/middleware/my_middleware
```

### 2. Create `manifest.py`

```python
"""
My Middleware Plugin
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from pixsim7_backend.infrastructure.middleware.types import MiddlewareManifest

# Manifest
manifest = MiddlewareManifest(
    id="my_middleware",
    name="My Middleware",
    version="1.0.0",
    description="Does something cool",
    author="Your Name",
    priority=300,  # Choose appropriate priority
    dependencies=[],  # e.g., ["request_id"]
    requires_db=False,
    requires_redis=False,
    enabled=True,
    config={
        # Custom config here
        "my_setting": "value",
    },
)

# Middleware class
class MyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # Do something before request
        response = await call_next(request)
        # Do something after request
        return response

# Export
middleware_class = MyMiddleware

# Lifecycle hooks (optional)
def on_load(app):
    """Called when middleware is loaded"""
    pass

async def on_enable():
    """Called when middleware is enabled"""
    pass

async def on_disable():
    """Called when middleware is disabled"""
    pass
```

### 3. Create `__init__.py`

```python
from .manifest import manifest, middleware_class

__all__ = ["manifest", "middleware_class"]
```

### 4. Restart the application

The middleware will be auto-discovered and loaded in the correct order.

## Configuration

Middleware configuration is passed via the `config` dict in the manifest:

```python
manifest = MiddlewareManifest(
    id="my_middleware",
    # ...
    config={
        "timeout": 30,
        "max_retries": 3,
    },
)
```

Configuration is passed to the middleware class constructor via `**config`.

## Dependencies

Middleware can depend on other middleware:

```python
manifest = MiddlewareManifest(
    id="my_middleware",
    dependencies=["request_id"],  # This middleware needs request_id to run first
    # ...
)
```

The middleware manager will resolve dependencies and ensure proper load order.

## Environment Filtering

Restrict middleware to specific environments:

```python
manifest = MiddlewareManifest(
    id="debug_middleware",
    environments=["development"],  # Only load in development
    # ...
)
```

Empty list = all environments.

## Disabling Middleware

Set `enabled=False` in the manifest:

```python
manifest = MiddlewareManifest(
    id="my_middleware",
    enabled=False,  # Middleware will not be loaded
    # ...
)
```

## Built-in Middleware

### request_id (Priority 100)
- Generates unique request IDs
- Binds request_id to structlog context
- Adds X-Request-ID header to responses

### request_logging (Priority 200)
- Logs HTTP request metrics
- Records method, path, status, duration
- Depends on request_id for correlation

### cors (Priority 900)
- Handles CORS for cross-origin requests
- Configured via `settings.cors_origins`
- Should be last in chain (executed first)

## Advanced: Middleware Factory

For complex middleware that needs custom initialization:

```python
def middleware_factory(app, **config):
    """Factory function for complex middleware"""
    class MyMiddleware(BaseHTTPMiddleware):
        def __init__(self, app):
            super().__init__(app)
            self.config = config

        async def dispatch(self, request, call_next):
            # ...
            pass

    return MyMiddleware

# Export factory instead of class
middleware_factory = middleware_factory
```

## Troubleshooting

### Middleware not loading
- Check manifest.py exists in middleware directory
- Verify `manifest` and `middleware_class` are exported
- Check logs for error messages

### Wrong execution order
- Adjust priority values (lower = earlier)
- Check dependencies are correctly specified

### Configuration not working
- Ensure config dict is in manifest
- Verify middleware class accepts **kwargs

## See Also

- [Plugin System](../plugins/README.md) - For API router plugins
- [Event Handlers](../event_handlers/README.md) - For event handler plugins
- [Provider Registry](../services/provider/README.md) - For provider plugins
