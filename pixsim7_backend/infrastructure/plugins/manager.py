"""
Backend Plugin Manager

Dynamically loads and manages API router plugins.
"""

import importlib
import importlib.util
from pathlib import Path
from typing import Any, Optional
from fastapi import FastAPI, APIRouter
import structlog

from pixsim7_backend.shared.config import settings
from .types import PluginManifest, BackendPlugin, plugin_hooks, PluginEvents
from .permissions import (
    validate_permissions,
    expand_permission_groups,
    PermissionValidationResult,
)

logger = structlog.get_logger(__name__)


class PluginManager:
    """
    Manages backend plugins (API routers).

    Features:
    - Auto-discovery of plugins
    - Dynamic loading
    - Dependency resolution
    - Lifecycle management
    - Hook system
    """

    def __init__(self, app: FastAPI):
        self.app = app
        self.plugins: dict[str, dict[str, Any]] = {}  # plugin_id -> {manifest, router, module}
        self.load_order: list[str] = []

    def discover_plugins(self, plugin_dir: str | Path) -> list[str]:
        """
        Discover plugins in a directory.

        Expected structure:
        plugins/
          game_stealth/
            __init__.py
            manifest.py  # exports: manifest, router
          custom_plugin/
            __init__.py
            manifest.py
        """
        plugin_dir = Path(plugin_dir)
        discovered = []

        if not plugin_dir.exists():
            logger.warning(f"Plugin directory not found: {plugin_dir}")
            return []

        for item in plugin_dir.iterdir():
            if item.is_dir() and not item.name.startswith('_'):
                manifest_file = item / 'manifest.py'
                if manifest_file.exists():
                    discovered.append(item.name)
                    logger.debug(f"Discovered plugin: {item.name}")

        return discovered

    def load_plugin(self, plugin_name: str, plugin_dir: str | Path) -> bool:
        """
        Load a single plugin from directory.

        Returns True if loaded successfully, False otherwise.
        """
        try:
            plugin_dir = Path(plugin_dir)
            module_path = plugin_dir / plugin_name / 'manifest.py'

            if not module_path.exists():
                logger.error(f"Plugin manifest not found: {module_path}")
                return False

            # Import module dynamically
            spec = importlib.util.spec_from_file_location(
                f"plugins.{plugin_name}",
                module_path
            )
            if not spec or not spec.loader:
                logger.error(f"Failed to load spec for {plugin_name}")
                return False

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            # Validate plugin exports
            if not hasattr(module, 'manifest'):
                logger.error(f"Plugin {plugin_name} missing 'manifest'")
                return False

            if not hasattr(module, 'router'):
                logger.error(f"Plugin {plugin_name} missing 'router'")
                return False

            manifest: PluginManifest = module.manifest
            router: APIRouter = module.router

            # Validate manifest
            if manifest.id != plugin_name:
                logger.warning(
                    f"Plugin ID mismatch: directory={plugin_name}, manifest={manifest.id}"
                )

            # Validate and expand permissions
            expanded_permissions = expand_permission_groups(manifest.permissions)
            validation = validate_permissions(expanded_permissions, allow_unknown=True)

            if not validation.valid:
                logger.error(
                    f"Plugin {manifest.id} has invalid permissions",
                    unknown=validation.unknown,
                )
                return False

            # Log permission warnings
            for warning in validation.warnings:
                logger.warning(
                    f"Plugin {manifest.id}: {warning}",
                    plugin_id=manifest.id,
                )

            # Store validated permissions back in manifest
            manifest.permissions = validation.granted

            logger.debug(
                f"Plugin {manifest.id} permissions validated",
                plugin_id=manifest.id,
                permissions=validation.granted,
                warnings=len(validation.warnings),
            )

            # Compute effective enabled state using manifest and settings
            effective_enabled = manifest.enabled

            # Apply allowlist: if set, anything not in the list is disabled
            allowlist = getattr(settings, "plugin_allowlist", None)
            if allowlist:
                if manifest.id not in allowlist:
                    effective_enabled = False

            # Apply denylist override
            denylist = getattr(settings, "plugin_denylist", []) or []
            if manifest.id in denylist:
                effective_enabled = False

            # Persist effective state back to manifest so downstream checks see it
            manifest.enabled = effective_enabled

            # Store plugin
            self.plugins[manifest.id] = {
                'manifest': manifest,
                'router': router,
                'module': module,
                'loaded': True,
                'enabled': effective_enabled,
            }

            logger.info(
                f"Loaded plugin: {manifest.name} v{manifest.version}",
                plugin_id=manifest.id,
            )

            # Call on_load hook if defined and plugin is enabled
            if effective_enabled and hasattr(module, 'on_load'):
                try:
                    module.on_load(self.app)
                    logger.debug(f"Called on_load for {manifest.id}")
                except Exception as e:
                    logger.error(f"Error in on_load for {manifest.id}: {e}")
            elif hasattr(module, 'on_load') and not effective_enabled:
                logger.debug(
                    f"Skipping on_load for disabled plugin: {manifest.id}"
                )

            # Emit event
            plugin_hooks.emit(PluginEvents.PLUGIN_LOADED, manifest.id)

            return True

        except Exception as e:
            logger.error(f"Failed to load plugin {plugin_name}: {e}", exc_info=True)
            return False

    def resolve_dependencies(self) -> list[str]:
        """
        Resolve plugin load order based on dependencies.

        Returns list of plugin IDs in load order.
        Raises ValueError if circular dependencies detected.
        """
        # Topological sort
        loaded = set()
        load_order = []

        def visit(plugin_id: str, visiting: set):
            if plugin_id in loaded:
                return
            if plugin_id in visiting:
                raise ValueError(f"Circular dependency detected: {plugin_id}")

            visiting.add(plugin_id)

            plugin = self.plugins.get(plugin_id)
            if not plugin:
                raise ValueError(f"Missing dependency: {plugin_id}")

            # Visit dependencies first
            for dep in plugin['manifest'].dependencies:
                visit(dep, visiting)

            visiting.remove(plugin_id)
            loaded.add(plugin_id)
            load_order.append(plugin_id)

        # Visit all plugins
        for plugin_id in self.plugins:
            visit(plugin_id, set())

        return load_order

    def register_all(self) -> None:
        """
        Register all loaded plugins with FastAPI app.

        Resolves dependencies and registers in correct order.
        """
        try:
            # Resolve load order
            self.load_order = self.resolve_dependencies()
            logger.info(f"Plugin load order: {self.load_order}")

            # Register routers
            for plugin_id in self.load_order:
                plugin = self.plugins[plugin_id]
                manifest = plugin['manifest']

                if not manifest.enabled:
                    logger.info(f"Skipping disabled plugin: {plugin_id}")
                    continue

                # Register router
                self.app.include_router(
                    plugin['router'],
                    prefix=manifest.prefix,
                    tags=manifest.tags or [plugin_id],
                )

                logger.info(
                    f"Registered plugin: {manifest.name}",
                    plugin_id=plugin_id,
                    prefix=manifest.prefix,
                )

        except ValueError as e:
            logger.error(f"Dependency resolution failed: {e}")
            raise

    async def enable_all(self) -> None:
        """
        Enable all plugins (call on_enable hooks).

        Called after app startup.
        """
        for plugin_id in self.load_order:
            plugin = self.plugins[plugin_id]

            if not plugin['enabled']:
                continue

            # Call on_enable hook if defined
            module = plugin['module']
            if hasattr(module, 'on_enable'):
                try:
                    result = module.on_enable()
                    if result and hasattr(result, '__await__'):
                        await result
                    logger.debug(f"Called on_enable for {plugin_id}")
                except Exception as e:
                    logger.error(f"Error in on_enable for {plugin_id}: {e}")

            # Emit event
            await plugin_hooks.emit(PluginEvents.PLUGIN_ENABLED, plugin_id)

    async def disable_all(self) -> None:
        """
        Disable all plugins (call on_disable hooks).

        Called before app shutdown.
        """
        # Disable in reverse order
        for plugin_id in reversed(self.load_order):
            plugin = self.plugins.get(plugin_id)
            if not plugin or not plugin['enabled']:
                continue

            # Call on_disable hook if defined
            module = plugin['module']
            if hasattr(module, 'on_disable'):
                try:
                    result = module.on_disable()
                    if result and hasattr(result, '__await__'):
                        await result
                    logger.debug(f"Called on_disable for {plugin_id}")
                except Exception as e:
                    logger.error(f"Error in on_disable for {plugin_id}: {e}")

            # Emit event
            await plugin_hooks.emit(PluginEvents.PLUGIN_DISABLED, plugin_id)

    def get_plugin(self, plugin_id: str) -> Optional[dict]:
        """Get plugin info by ID"""
        return self.plugins.get(plugin_id)

    def list_plugins(self) -> list[dict]:
        """List all loaded plugins"""
        return [
            {
                'id': plugin_id,
                'name': plugin['manifest'].name,
                'version': plugin['manifest'].version,
                'enabled': plugin['enabled'],
            }
            for plugin_id, plugin in self.plugins.items()
        ]


def init_plugin_manager(app: FastAPI, plugin_dir: str | Path) -> PluginManager:
    """
    Initialize a plugin manager instance.

    Usage in main.py:
        from pixsim7_backend.infrastructure.plugins import init_plugin_manager

        plugin_manager = init_plugin_manager(app, "pixsim7_backend/plugins")
        routes_manager = init_plugin_manager(app, "pixsim7_backend/routes")
    """
    manager = PluginManager(app)

    # Auto-discover plugins
    discovered = manager.discover_plugins(plugin_dir)
    logger.info(f"Discovered {len(discovered)} plugins", plugins=discovered)

    # Load all
    for plugin_name in discovered:
        manager.load_plugin(plugin_name, plugin_dir)

    # Register with FastAPI
    manager.register_all()

    return manager
