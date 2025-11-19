"""Backend Plugin System"""

from .types import PluginManifest, BackendPlugin, plugin_hooks, PluginEvents
from .manager import PluginManager, init_plugin_manager
from .context import PluginContext
from .dependencies import get_plugin_context, set_plugin_manager
from .permissions import (
    PluginPermission,
    PermissionGroup,
    PermissionDeniedError,
    PermissionDeniedBehavior,
)
from .behavior_registry import (
    behavior_registry,
    evaluate_condition,
    apply_effect,
    build_simulation_config,
)

__all__ = [
    # Core types
    'PluginManifest',
    'BackendPlugin',
    'plugin_hooks',
    'PluginEvents',

    # Manager
    'PluginManager',
    'init_plugin_manager',

    # Context and capabilities
    'PluginContext',
    'get_plugin_context',
    'set_plugin_manager',

    # Permissions
    'PluginPermission',
    'PermissionGroup',
    'PermissionDeniedError',
    'PermissionDeniedBehavior',

    # Behavior extensions (Phase 16.4)
    'behavior_registry',
    'evaluate_condition',
    'apply_effect',
    'build_simulation_config',
]
