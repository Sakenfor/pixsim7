"""
Backend Plugin Manager

Dynamically loads and manages API router plugins.

## Plugin Discovery Paths

The manager searches for plugins in two locations:

1. **Core plugins** (pixsim7/backend/main/plugins/):
   Traditional plugins where each plugin is a subdirectory with manifest.py
   Example: pixsim7/backend/main/plugins/game_analytics/manifest.py

2. **External plugins** (packages/plugins/*/backend/):
   Self-contained plugin packages with frontend/backend/shared structure.
   The backend/ subdirectory contains manifest.py.
   Example: packages/plugins/stealth/backend/manifest.py

   For external plugins, the plugin ID is derived from the parent directory
   name (e.g., 'stealth' from packages/plugins/stealth/).
"""

import importlib
import importlib.util
import sys
from pathlib import Path
from typing import Any, Optional
from fastapi import FastAPI, APIRouter
import structlog

from pixsim7.backend.main.shared.config import settings
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

    def __init__(self, app: FastAPI, plugin_type: str = "feature"):
        """
        Initialize plugin manager.

        Args:
            app: FastAPI application instance
            plugin_type: Plugin type for module namespacing ("feature" or "route")
        """
        self.app = app
        self.plugin_type = plugin_type
        self.plugins: dict[str, dict[str, Any]] = {}  # plugin_id -> {manifest, router, module}
        self.load_order: list[str] = []
        self.failed_plugins: dict[str, dict[str, Any]] = {}  # plugin_id -> {error_message, manifest?, required?}

    # Valid plugin name pattern: lowercase alphanumeric, underscores, hyphens
    _PLUGIN_NAME_PATTERN = __import__('re').compile(r'^[a-z][a-z0-9_-]*$')
    _RESERVED_NAMES = {'plugin', 'plugins', 'core', 'system', 'internal', 'test', 'tests'}

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

        Plugin names must be lowercase alphanumeric with underscores/hyphens.
        Reserved names (plugin, core, system, etc.) are not allowed.
        """
        plugin_dir = Path(plugin_dir)
        discovered = []

        if not plugin_dir.exists():
            logger.warning(f"Plugin directory not found: {plugin_dir}")
            return []

        for item in plugin_dir.iterdir():
            if item.is_dir() and not item.name.startswith('_'):
                # Validate plugin name format
                if not self._PLUGIN_NAME_PATTERN.match(item.name):
                    logger.warning(
                        f"Skipping invalid plugin name (must be lowercase alphanumeric with _/-): {item.name}"
                    )
                    continue

                # Check reserved names
                if item.name in self._RESERVED_NAMES:
                    logger.warning(f"Skipping reserved plugin name: {item.name}")
                    continue

                manifest_file = item / 'manifest.py'
                if manifest_file.exists():
                    discovered.append(item.name)
                    logger.debug(f"Discovered plugin: {item.name}")

        return discovered

    def discover_external_plugins(self, external_plugins_dir: str | Path) -> list[tuple[str, Path]]:
        """
        Discover external plugins in packages/plugins/*/backend/ structure.

        External plugins have a different structure where the plugin lives in
        a self-contained package with shared types, frontend, and backend code.

        Expected structure:
        packages/plugins/
          stealth/
            backend/
              manifest.py  # exports: manifest, router
            frontend/
              ...
            shared/
              types.ts
          another-plugin/
            backend/
              manifest.py

        Returns:
            List of (plugin_name, manifest_dir_path) tuples
        """
        external_plugins_dir = Path(external_plugins_dir)
        discovered: list[tuple[str, Path]] = []

        if not external_plugins_dir.exists():
            logger.debug(f"External plugins directory not found: {external_plugins_dir}")
            return []

        for item in external_plugins_dir.iterdir():
            if item.is_dir() and not item.name.startswith('_') and not item.name.startswith('.'):
                # Check if this is an external plugin (has backend/ subdirectory with manifest.py)
                backend_dir = item / 'backend'
                manifest_file = backend_dir / 'manifest.py'

                if manifest_file.exists():
                    # External plugin found - use the parent directory name as plugin name
                    plugin_name = item.name

                    # Validate plugin name format
                    if not self._PLUGIN_NAME_PATTERN.match(plugin_name):
                        logger.warning(
                            f"Skipping invalid external plugin name "
                            f"(must be lowercase alphanumeric with _/-): {plugin_name}"
                        )
                        continue

                    # Check reserved names
                    if plugin_name in self._RESERVED_NAMES:
                        logger.warning(f"Skipping reserved external plugin name: {plugin_name}")
                        continue

                    discovered.append((plugin_name, backend_dir))
                    logger.debug(f"Discovered external plugin: {plugin_name} at {backend_dir}")

        return discovered

    def load_external_plugin(self, plugin_name: str, backend_dir: Path) -> bool:
        """
        Load an external plugin from packages/plugins/{name}/backend/.

        External plugins have their manifest in backend/manifest.py.
        The parent directory is added to sys.path to allow relative imports.

        Args:
            plugin_name: Name of the plugin (from parent directory name)
            backend_dir: Path to the backend/ directory containing manifest.py

        Returns:
            True if loaded successfully, False otherwise.
        """
        import time
        start_time = time.perf_counter()

        try:
            module_path = backend_dir / 'manifest.py'

            if not module_path.exists():
                logger.error(f"External plugin manifest not found: {module_path}")
                self.failed_plugins[plugin_name] = {
                    'error': f"Manifest not found: {module_path}",
                    'required': False,
                    'manifest': None
                }
                return False

            # Add the backend directory's parent to sys.path for relative imports
            # This allows manifest.py to import from sibling files (models.py, etc.)
            parent_dir = str(backend_dir.parent)
            if parent_dir not in sys.path:
                sys.path.insert(0, parent_dir)

            # Import module dynamically with namespaced module path
            # e.g., "pixsim7.plugins.external.stealth"
            module_name = f"pixsim7.plugins.external.{plugin_name}"
            spec = importlib.util.spec_from_file_location(
                module_name,
                module_path
            )
            if not spec or not spec.loader:
                logger.error(f"Failed to load spec for external plugin {plugin_name}")
                self.failed_plugins[plugin_name] = {
                    'error': "Failed to create module spec",
                    'required': False,
                    'manifest': None
                }
                return False

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            # Validate plugin exports (same as regular plugins)
            if not hasattr(module, 'manifest'):
                logger.error(f"External plugin {plugin_name} missing 'manifest'")
                self.failed_plugins[plugin_name] = {
                    'error': "Module missing 'manifest' export",
                    'required': False,
                    'manifest': None
                }
                return False

            if not hasattr(module, 'router'):
                logger.error(f"External plugin {plugin_name} missing 'router'")
                self.failed_plugins[plugin_name] = {
                    'error': "Module missing 'router' export",
                    'required': False,
                    'manifest': None
                }
                return False

            manifest: PluginManifest = module.manifest
            router: APIRouter = module.router

            # For external plugins, allow manifest ID to differ from directory name
            # but warn about it for discoverability
            if manifest.id != plugin_name:
                logger.info(
                    f"External plugin directory '{plugin_name}' has manifest ID '{manifest.id}'",
                    directory=plugin_name,
                    manifest_id=manifest.id,
                )

            # Use manifest ID as the canonical plugin ID
            canonical_id = manifest.id

            # Continue with standard plugin loading (validation, registration, etc.)
            return self._finalize_plugin_load(
                canonical_id,
                plugin_name,
                manifest,
                router,
                module,
                start_time,
                is_external=True
            )

        except Exception as e:
            error_msg = str(e)
            logger.error(f"Failed to load external plugin {plugin_name}: {e}", exc_info=True)

            self.failed_plugins[plugin_name] = {
                'error': error_msg,
                'required': False,
                'manifest': None
            }
            return False

    def _finalize_plugin_load(
        self,
        plugin_id: str,
        directory_name: str,
        manifest: PluginManifest,
        router: APIRouter,
        module,
        start_time: float,
        is_external: bool = False
    ) -> bool:
        """
        Finalize plugin loading after module import (shared between core and external plugins).
        """
        import time

        # Validate and expand permissions
        expanded_permissions = expand_permission_groups(manifest.permissions)
        validation = validate_permissions(expanded_permissions, allow_unknown=True)

        if not validation.valid:
            logger.error(
                f"Plugin {plugin_id} has invalid permissions",
                unknown=validation.unknown,
            )
            self.failed_plugins[directory_name] = {
                'error': f"Invalid permissions: {validation.unknown}",
                'required': manifest.required,
                'manifest': manifest
            }
            return False

        # Warn about unknown permissions (possible typos) even when allowed
        for unknown_perm in validation.unknown:
            logger.warning(
                f"Plugin '{plugin_id}' uses unknown permission (possible typo)",
                plugin_id=plugin_id,
                permission=unknown_perm,
            )

        # Log permission warnings
        for warning in validation.warnings:
            logger.warning(
                f"Plugin {plugin_id}: {warning}",
                plugin_id=plugin_id,
            )

        # Store validated permissions back in manifest
        manifest.permissions = validation.granted

        logger.debug(
            f"Plugin {plugin_id} permissions validated",
            plugin_id=plugin_id,
            permissions=validation.granted,
            warnings=len(validation.warnings),
        )

        # Compute effective enabled state using manifest and settings
        effective_enabled = manifest.enabled

        # Apply allowlist: if set, anything not in the list is disabled
        allowlist = getattr(settings, "plugin_allowlist", None)
        if allowlist:
            if plugin_id not in allowlist:
                effective_enabled = False

        # Apply denylist override
        denylist = getattr(settings, "plugin_denylist", []) or []
        if plugin_id in denylist:
            effective_enabled = False

        # Persist effective state back to manifest so downstream checks see it
        manifest.enabled = effective_enabled

        # Store plugin
        self.plugins[plugin_id] = {
            'manifest': manifest,
            'router': router,
            'module': module,
            'loaded': True,
            'enabled': effective_enabled,
            'is_external': is_external,
        }

        plugin_source = "external" if is_external else "core"
        logger.info(
            f"Loaded {plugin_source} plugin: {manifest.name} v{manifest.version}",
            plugin_id=plugin_id,
        )

        # Call on_load hook if defined and plugin is enabled
        if effective_enabled and hasattr(module, 'on_load'):
            try:
                module.on_load(self.app)
                logger.debug(f"Called on_load for {plugin_id}")
            except Exception as e:
                logger.error(f"Error in on_load for {plugin_id}: {e}", exc_info=True)
                # Unload plugin if on_load fails
                self.plugins.pop(plugin_id, None)
                self.failed_plugins[directory_name] = {
                    'error': f"on_load hook failed: {e}",
                    'required': manifest.required,
                    'manifest': manifest
                }
                if manifest.required:
                    raise RuntimeError(
                        f"Required plugin '{plugin_id}' failed on_load: {e}"
                    )
                return False
        elif hasattr(module, 'on_load') and not effective_enabled:
            logger.debug(
                f"Skipping on_load for disabled plugin: {plugin_id}"
            )

        # Allow plugins to register stat packages or other extensions
        # during load. Handlers receive the plugin ID so they can tag
        # ownership metadata if needed.
        plugin_hooks.emit_sync(PluginEvents.STAT_PACKAGES_REGISTER, plugin_id=plugin_id)
        plugin_hooks.emit_sync(PluginEvents.NPC_SURFACES_REGISTER, plugin_id=plugin_id)

        # Emit event (sync context)
        plugin_hooks.emit_sync(PluginEvents.PLUGIN_LOADED, plugin_id)

        # Log load time metrics
        load_duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(
            "Plugin load completed",
            plugin_id=plugin_id,
            duration_ms=round(load_duration_ms, 2),
            is_external=is_external,
        )

        return True

    def load_plugin(self, plugin_name: str, plugin_dir: str | Path) -> bool:
        """
        Load a single plugin from directory.

        Returns True if loaded successfully, False otherwise.
        """
        import time
        start_time = time.perf_counter()

        try:
            plugin_dir = Path(plugin_dir)
            module_path = plugin_dir / plugin_name / 'manifest.py'

            if not module_path.exists():
                logger.error(f"Plugin manifest not found: {module_path}")
                self.failed_plugins[plugin_name] = {
                    'error': f"Manifest not found: {module_path}",
                    'required': False,
                    'manifest': None
                }
                return False

            # Import module dynamically with namespaced module path
            # e.g., "pixsim7.plugins.feature.analytics" or "pixsim7.plugins.route.generations"
            module_name = f"pixsim7.plugins.{self.plugin_type}.{plugin_name}"
            spec = importlib.util.spec_from_file_location(
                module_name,
                module_path
            )
            if not spec or not spec.loader:
                logger.error(f"Failed to load spec for {plugin_name}")
                self.failed_plugins[plugin_name] = {
                    'error': "Failed to create module spec",
                    'required': False,
                    'manifest': None
                }
                return False

            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)

            # Validate plugin exports
            if not hasattr(module, 'manifest'):
                logger.error(f"Plugin {plugin_name} missing 'manifest'")
                self.failed_plugins[plugin_name] = {
                    'error': "Module missing 'manifest' export",
                    'required': False,
                    'manifest': None
                }
                return False

            if not hasattr(module, 'router'):
                logger.error(f"Plugin {plugin_name} missing 'router'")
                self.failed_plugins[plugin_name] = {
                    'error': "Module missing 'router' export",
                    'required': False,
                    'manifest': None
                }
                return False

            manifest: PluginManifest = module.manifest
            router: APIRouter = module.router

            # Validate manifest ID matches directory name (security: prevent ID spoofing)
            if manifest.id != plugin_name:
                logger.error(
                    f"Plugin ID must match directory name",
                    directory=plugin_name,
                    manifest_id=manifest.id,
                )
                self.failed_plugins[plugin_name] = {
                    'error': f"Manifest ID '{manifest.id}' must match directory name '{plugin_name}'",
                    'required': False,
                    'manifest': manifest
                }
                return False

            # Validate and expand permissions
            expanded_permissions = expand_permission_groups(manifest.permissions)
            validation = validate_permissions(expanded_permissions, allow_unknown=True)

            if not validation.valid:
                logger.error(
                    f"Plugin {manifest.id} has invalid permissions",
                    unknown=validation.unknown,
                )
                self.failed_plugins[plugin_name] = {
                    'error': f"Invalid permissions: {validation.unknown}",
                    'required': manifest.required,
                    'manifest': manifest
                }
                return False

            # Warn about unknown permissions (possible typos) even when allowed
            for unknown_perm in validation.unknown:
                logger.warning(
                    f"Plugin '{manifest.id}' uses unknown permission (possible typo)",
                    plugin_id=manifest.id,
                    permission=unknown_perm,
                )

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
                    logger.error(f"Error in on_load for {manifest.id}: {e}", exc_info=True)
                    # Unload plugin if on_load fails
                    self.plugins.pop(manifest.id, None)
                    self.failed_plugins[plugin_name] = {
                        'error': f"on_load hook failed: {e}",
                        'required': manifest.required,
                        'manifest': manifest
                    }
                    if manifest.required:
                        raise RuntimeError(
                            f"Required plugin '{manifest.id}' failed on_load: {e}"
                        )
                    return False
            elif hasattr(module, 'on_load') and not effective_enabled:
                logger.debug(
                    f"Skipping on_load for disabled plugin: {manifest.id}"
                )

            # Allow plugins to register stat packages or other extensions
            # during load. Handlers receive the plugin ID so they can tag
            # ownership metadata if needed.
            plugin_hooks.emit_sync(PluginEvents.STAT_PACKAGES_REGISTER, plugin_id=manifest.id)
            plugin_hooks.emit_sync(PluginEvents.NPC_SURFACES_REGISTER, plugin_id=manifest.id)

            # Emit event (sync context)
            plugin_hooks.emit_sync(PluginEvents.PLUGIN_LOADED, manifest.id)

            # Log load time metrics
            load_duration_ms = (time.perf_counter() - start_time) * 1000
            logger.info(
                "Plugin load completed",
                plugin_id=manifest.id,
                duration_ms=round(load_duration_ms, 2),
            )

            return True

        except Exception as e:
            error_msg = str(e)
            logger.error(f"Failed to load plugin {plugin_name}: {e}", exc_info=True)

            # Try to extract manifest to check if plugin was required
            manifest_required = False
            manifest_obj = None
            try:
                # Try to import just the manifest to check required field
                module_path = Path(plugin_dir) / plugin_name / 'manifest.py'
                if module_path.exists():
                    spec = importlib.util.spec_from_file_location(
                        f"pixsim7.plugins.{self.plugin_type}.{plugin_name}._manifest_check",
                        module_path
                    )
                    if spec and spec.loader:
                        temp_module = importlib.util.module_from_spec(spec)
                        spec.loader.exec_module(temp_module)
                        if hasattr(temp_module, 'manifest'):
                            manifest_obj = temp_module.manifest
                            manifest_required = getattr(manifest_obj, 'required', False)
            except Exception:
                # If we can't parse manifest, assume not required
                pass

            # Store failure info with manifest metadata
            self.failed_plugins[plugin_name] = {
                'error': error_msg,
                'required': manifest_required,
                'manifest': manifest_obj
            }

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

        def visit(plugin_id: str, visiting: set, path: list):
            if plugin_id in loaded:
                return
            if plugin_id in visiting:
                # Build cycle path for clear error message
                cycle_start = path.index(plugin_id)
                cycle_path = path[cycle_start:] + [plugin_id]
                raise ValueError(
                    f"Circular dependency detected: {' -> '.join(cycle_path)}"
                )

            visiting.add(plugin_id)
            path.append(plugin_id)

            plugin = self.plugins.get(plugin_id)
            if not plugin:
                raise ValueError(f"Missing dependency: {plugin_id}")

            # Visit dependencies first (and validate they are enabled)
            for dep in plugin['manifest'].dependencies:
                dep_plugin = self.plugins.get(dep)
                if dep_plugin and not dep_plugin['enabled']:
                    raise ValueError(
                        f"Plugin '{plugin_id}' depends on '{dep}' which is disabled"
                    )
                visit(dep, visiting, path)

            path.pop()

            visiting.remove(plugin_id)
            loaded.add(plugin_id)
            load_order.append(plugin_id)

        # Visit all plugins
        for plugin_id in self.plugins:
            visit(plugin_id, set(), [])

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

    def has_failures(self) -> bool:
        """Return True if any plugins failed to load."""
        return bool(self.failed_plugins)

    def print_health_table(self) -> None:
        """
        Print a health table of all plugins (loaded and failed).

        Shows: ID, Kind, Required, Enabled, Status
        """
        import sys

        # Use ASCII markers on Windows to avoid encoding issues with legacy consoles
        ok_marker = "[OK]" if sys.platform == "win32" else "✓"
        fail_marker = "[FAIL]" if sys.platform == "win32" else "✗"

        rows = []

        # Add loaded plugins
        for plugin_id, plugin in self.plugins.items():
            manifest = plugin['manifest']
            rows.append({
                'id': plugin_id,
                'kind': manifest.kind,
                'required': "Yes" if manifest.required else "No",
                'enabled': "Yes" if plugin['enabled'] else "No",
                'status': f"{ok_marker} Loaded"
            })

        # Add failed plugins
        for plugin_id, failure_info in self.failed_plugins.items():
            error = failure_info.get('error', 'unknown error')
            required = failure_info.get('required', False)
            manifest = failure_info.get('manifest')

            kind = "unknown"
            if manifest:
                kind = getattr(manifest, 'kind', 'unknown')

            rows.append({
                'id': plugin_id,
                'kind': kind,
                'required': "Yes" if required else "No",
                'enabled': "?",
                'status': f"{fail_marker} Failed: {error[:40]}..."
            })

        # Sort by status (loaded first), then by ID
        rows.sort(key=lambda r: (0 if ok_marker in r['status'] else 1, r['id']))

        # Format table manually
        headers = ["Plugin ID", "Kind", "Required", "Enabled", "Status"]
        col_widths = [
            max(len(headers[0]), max([len(r['id']) for r in rows] or [0])),
            max(len(headers[1]), max([len(r['kind']) for r in rows] or [0])),
            max(len(headers[2]), max([len(r['required']) for r in rows] or [0])),
            max(len(headers[3]), max([len(r['enabled']) for r in rows] or [0])),
            max(len(headers[4]), max([len(r['status']) for r in rows] or [0])),
        ]

        # Build table
        header_row = " | ".join([
            headers[0].ljust(col_widths[0]),
            headers[1].ljust(col_widths[1]),
            headers[2].ljust(col_widths[2]),
            headers[3].ljust(col_widths[3]),
            headers[4].ljust(col_widths[4]),
        ])
        separator = "-+-".join(["-" * w for w in col_widths])

        table_lines = [header_row, separator]
        for row in rows:
            table_lines.append(" | ".join([
                row['id'].ljust(col_widths[0]),
                row['kind'].ljust(col_widths[1]),
                row['required'].ljust(col_widths[2]),
                row['enabled'].ljust(col_widths[3]),
                row['status'].ljust(col_widths[4]),
            ]))

        table = "\n".join(table_lines)
        logger.info(f"Plugin Health Table:\n{table}")

    def check_required_plugins(self, fail_fast: bool = False) -> tuple[bool, list[str]]:
        """
        Check if all required plugins loaded successfully.

        Resolution logic:
        - If fail_fast=True: Any plugin failure (required or not) aborts
        - If fail_fast=False: Only required plugin failures are reported

        Args:
            fail_fast: If True, raise exception on ANY plugin failure (dev/CI mode)

        Returns:
            (all_required_ok, list of failed plugin IDs)
        """
        failed_required = []

        # Check failed plugins for required=True
        for plugin_id, failure_info in self.failed_plugins.items():
            if failure_info.get('required', False):
                failed_required.append(plugin_id)
                logger.error(
                    f"Required plugin failed to load: {plugin_id}",
                    error=failure_info.get('error', 'unknown error')
                )

        all_ok = len(failed_required) == 0

        # In fail_fast mode, ANY plugin failure aborts (dev/CI strict mode)
        if fail_fast and len(self.failed_plugins) > 0:
            all_failed = list(self.failed_plugins.keys())
            raise RuntimeError(
                f"Plugin loading failed in strict mode (fail_fast=True). "
                f"Failed plugins: {', '.join(all_failed)}"
            )

        # In production mode, only required plugin failures abort
        if not all_ok:
            raise RuntimeError(
                f"Required plugins failed to load: {', '.join(failed_required)}"
            )

        return all_ok, failed_required


def init_plugin_manager(
    app: FastAPI,
    plugin_dir: str | Path,
    plugin_type: str = "feature",
    fail_fast: bool = False,
    print_health: bool = True,
    external_plugins_dir: str | Path | None = None
) -> PluginManager:
    """
    Initialize a plugin manager instance.

    Discovers and loads plugins from two sources:
    1. Core plugins in plugin_dir (e.g., pixsim7/backend/main/plugins/)
    2. External plugins in external_plugins_dir/*/backend/ (if provided)

    Args:
        app: FastAPI application instance
        plugin_dir: Directory containing core plugin manifests
        plugin_type: Plugin type for module namespacing ("feature" or "route")
        fail_fast: If True, raise exception if required plugins fail to load (useful for dev/CI)
        print_health: If True, print health table after loading
        external_plugins_dir: Optional directory containing external plugin packages
                              (e.g., packages/plugins/). Each subdirectory should have
                              a backend/ folder with manifest.py.

    Usage in main.py:
        from pixsim7.backend.main.infrastructure.plugins import init_plugin_manager

        plugin_manager = init_plugin_manager(
            app,
            "pixsim7/backend/main/plugins",
            plugin_type="feature",
            external_plugins_dir="packages/plugins"
        )
        routes_manager = init_plugin_manager(app, "pixsim7/backend/main/routes", plugin_type="route")
    """
    manager = PluginManager(app, plugin_type=plugin_type)

    # Auto-discover core plugins
    discovered = manager.discover_plugins(plugin_dir)
    logger.info(f"Discovered {len(discovered)} core plugins in {plugin_dir}", plugins=discovered)

    # Load core plugins
    for plugin_name in discovered:
        manager.load_plugin(plugin_name, plugin_dir)

    # Auto-discover and load external plugins (if directory provided)
    if external_plugins_dir:
        external_discovered = manager.discover_external_plugins(external_plugins_dir)
        external_names = [name for name, _ in external_discovered]
        logger.info(
            f"Discovered {len(external_discovered)} external plugins in {external_plugins_dir}",
            plugins=external_names
        )

        for plugin_name, backend_dir in external_discovered:
            manager.load_external_plugin(plugin_name, backend_dir)

    # Register with FastAPI
    manager.register_all()

    # Print health table if requested
    if print_health:
        manager.print_health_table()

    # Check required plugins - raises if any required plugins failed
    # or if fail_fast=True and ANY plugin failed
    manager.check_required_plugins(fail_fast=fail_fast)

    return manager
