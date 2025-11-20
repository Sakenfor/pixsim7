"""
Middleware Plugin Manager

Dynamically loads and manages HTTP middleware plugins.
"""

import importlib
import importlib.util
from pathlib import Path
from typing import Any, Optional, Type
from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
import structlog
import os

from .types import MiddlewareManifest, MiddlewarePlugin, middleware_hooks, MiddlewareEvents

logger = structlog.get_logger(__name__)


class MiddlewareManager:
    """
    Manages HTTP middleware plugins.

    Features:
    - Auto-discovery of middleware
    - Dynamic loading
    - Dependency resolution
    - Priority-based ordering
    - Lifecycle management
    - Hook system
    """

    def __init__(self, app: FastAPI):
        self.app = app
        self.middleware: dict[str, dict[str, Any]] = {}  # middleware_id -> {manifest, class, module}
        self.load_order: list[str] = []
        self.environment = os.getenv("ENVIRONMENT", "development")

    def discover_middleware(self, middleware_dir: str | Path) -> list[str]:
        """
        Discover middleware in a directory.

        Expected structure:
        middleware/
          request_id/
            __init__.py
            manifest.py  # exports: manifest, middleware_class
          custom_middleware/
            __init__.py
            manifest.py
        """
        middleware_dir = Path(middleware_dir)
        discovered = []

        if not middleware_dir.exists():
            logger.warning(f"Middleware directory not found: {middleware_dir}")
            return []

        for item in middleware_dir.iterdir():
            if item.is_dir() and not item.name.startswith('_'):
                manifest_file = item / 'manifest.py'
                if manifest_file.exists():
                    discovered.append(item.name)
                    logger.debug(f"Discovered middleware: {item.name}")

        return discovered

    def load_middleware(self, middleware_name: str, middleware_dir: str | Path) -> bool:
        """
        Load a single middleware from directory.

        Returns True if loaded successfully, False otherwise.
        """
        try:
            middleware_dir = Path(middleware_dir)
            module_path = middleware_dir / middleware_name / 'manifest.py'

            if not module_path.exists():
                logger.error(f"Middleware manifest not found: {module_path}")
                return False

            # Import module dynamically
            spec = importlib.util.spec_from_file_location(
                f"middleware.{middleware_name}",
                module_path
            )
            if not spec or not spec.loader:
                logger.error(f"Failed to load spec for {middleware_name}")
                return False

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            # Validate middleware exports
            if not hasattr(module, 'manifest'):
                logger.error(f"Middleware {middleware_name} missing 'manifest'")
                return False

            manifest: MiddlewareManifest = module.manifest

            # Get middleware class or factory
            middleware_class = None
            middleware_factory = None

            if hasattr(module, 'middleware_class'):
                middleware_class = module.middleware_class
            elif hasattr(module, 'middleware_factory'):
                middleware_factory = module.middleware_factory
            else:
                logger.error(f"Middleware {middleware_name} missing 'middleware_class' or 'middleware_factory'")
                return False

            # Validate manifest
            if manifest.id != middleware_name:
                logger.warning(
                    f"Middleware ID mismatch: directory={middleware_name}, manifest={manifest.id}"
                )

            # Check environment filter
            if manifest.environments and self.environment not in manifest.environments:
                logger.info(
                    f"Skipping middleware {manifest.id} - not enabled for environment {self.environment}"
                )
                return False

            # Store middleware
            self.middleware[manifest.id] = {
                'manifest': manifest,
                'middleware_class': middleware_class,
                'middleware_factory': middleware_factory,
                'module': module,
                'loaded': True,
                'enabled': manifest.enabled,
            }

            logger.info(
                f"Loaded middleware: {manifest.name} v{manifest.version}",
                middleware_id=manifest.id,
                priority=manifest.priority,
            )

            # Call on_load hook if defined
            if hasattr(module, 'on_load'):
                try:
                    module.on_load(self.app)
                    logger.debug(f"Called on_load for {manifest.id}")
                except Exception as e:
                    logger.error(f"Error in on_load for {manifest.id}: {e}")

            # Emit event
            middleware_hooks.emit(MiddlewareEvents.MIDDLEWARE_LOADED, manifest.id)

            return True

        except Exception as e:
            logger.error(f"Failed to load middleware {middleware_name}: {e}", exc_info=True)
            return False

    def resolve_dependencies(self) -> list[str]:
        """
        Resolve middleware load order based on dependencies and priority.

        Returns list of middleware IDs in load order.
        Raises ValueError if circular dependencies detected.
        """
        # First, topological sort for dependencies
        loaded = set()
        temp_order = []

        def visit(middleware_id: str, visiting: set):
            if middleware_id in loaded:
                return
            if middleware_id in visiting:
                raise ValueError(f"Circular dependency detected: {middleware_id}")

            visiting.add(middleware_id)

            middleware = self.middleware.get(middleware_id)
            if not middleware:
                raise ValueError(f"Missing dependency: {middleware_id}")

            # Visit dependencies first
            for dep in middleware['manifest'].dependencies:
                visit(dep, visiting)

            visiting.remove(middleware_id)
            loaded.add(middleware_id)
            temp_order.append(middleware_id)

        # Visit all middleware
        for middleware_id in self.middleware:
            visit(middleware_id, set())

        # Sort by priority (lower = earlier in chain)
        # This is the final order, respecting dependencies first, then priority
        temp_order.sort(key=lambda mid: self.middleware[mid]['manifest'].priority)

        return temp_order

    def register_all(self) -> None:
        """
        Register all loaded middleware with FastAPI app.

        Resolves dependencies and registers in correct order (by priority).
        """
        try:
            # Resolve load order
            self.load_order = self.resolve_dependencies()
            logger.info(f"Middleware load order: {self.load_order}")

            # Register middleware in REVERSE order
            # (FastAPI middleware stack is LIFO - last added = first executed)
            for middleware_id in reversed(self.load_order):
                middleware = self.middleware[middleware_id]
                manifest = middleware['manifest']

                if not manifest.enabled:
                    logger.info(f"Skipping disabled middleware: {middleware_id}")
                    continue

                # Get middleware class or factory
                if middleware['middleware_class']:
                    # Standard middleware class
                    self.app.add_middleware(
                        middleware['middleware_class'],
                        **manifest.config
                    )
                elif middleware['middleware_factory']:
                    # Factory function (for more complex middleware)
                    middleware_instance = middleware['middleware_factory'](
                        self.app,
                        **manifest.config
                    )
                    self.app.add_middleware(middleware_instance)

                logger.info(
                    f"Registered middleware: {manifest.name}",
                    middleware_id=middleware_id,
                    priority=manifest.priority,
                )

        except ValueError as e:
            logger.error(f"Dependency resolution failed: {e}")
            raise

    async def enable_all(self) -> None:
        """
        Enable all middleware (call on_enable hooks).

        Called after app startup.
        """
        for middleware_id in self.load_order:
            middleware = self.middleware[middleware_id]

            if not middleware['enabled']:
                continue

            # Call on_enable hook if defined
            module = middleware['module']
            if hasattr(module, 'on_enable'):
                try:
                    result = module.on_enable()
                    if result and hasattr(result, '__await__'):
                        await result
                    logger.debug(f"Called on_enable for {middleware_id}")
                except Exception as e:
                    logger.error(f"Error in on_enable for {middleware_id}: {e}")

            # Emit event
            await middleware_hooks.emit(MiddlewareEvents.MIDDLEWARE_ENABLED, middleware_id)

    async def disable_all(self) -> None:
        """
        Disable all middleware (call on_disable hooks).

        Called before app shutdown.
        """
        # Disable in reverse order
        for middleware_id in reversed(self.load_order):
            middleware = self.middleware.get(middleware_id)
            if not middleware or not middleware['enabled']:
                continue

            # Call on_disable hook if defined
            module = middleware['module']
            if hasattr(module, 'on_disable'):
                try:
                    result = module.on_disable()
                    if result and hasattr(result, '__await__'):
                        await result
                    logger.debug(f"Called on_disable for {middleware_id}")
                except Exception as e:
                    logger.error(f"Error in on_disable for {middleware_id}: {e}")

            # Emit event
            await middleware_hooks.emit(MiddlewareEvents.MIDDLEWARE_DISABLED, middleware_id)

    def get_middleware(self, middleware_id: str) -> Optional[dict]:
        """Get middleware info by ID"""
        return self.middleware.get(middleware_id)

    def list_middleware(self) -> list[dict]:
        """List all loaded middleware"""
        return [
            {
                'id': middleware_id,
                'name': middleware['manifest'].name,
                'version': middleware['manifest'].version,
                'priority': middleware['manifest'].priority,
                'enabled': middleware['enabled'],
            }
            for middleware_id, middleware in self.middleware.items()
        ]


# Global middleware manager instance (initialized in main.py)
middleware_manager: Optional[MiddlewareManager] = None


def init_middleware_manager(app: FastAPI, middleware_dir: str | Path) -> MiddlewareManager:
    """
    Initialize the global middleware manager.

    Usage in main.py:
        from pixsim7.backend.main.infrastructure.middleware import init_middleware_manager

        middleware_manager = init_middleware_manager(app, "pixsim7/backend/main/middleware")
    """
    global middleware_manager

    middleware_manager = MiddlewareManager(app)

    # Auto-discover middleware
    discovered = middleware_manager.discover_middleware(middleware_dir)
    logger.info(f"Discovered {len(discovered)} middleware", middleware=discovered)

    # Load all
    for middleware_name in discovered:
        middleware_manager.load_middleware(middleware_name, middleware_dir)

    # Register with FastAPI
    middleware_manager.register_all()

    return middleware_manager
