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
from .observability import (
    metrics_tracker,
    RequestTimer,
)
from .world_scoping import (
    get_enabled_plugins_for_world,
    is_plugin_enabled_for_world,
    set_enabled_plugins_for_world,
    add_enabled_plugin_for_world,
    remove_enabled_plugin_for_world,
)
from .frontend_manifest import (
    FrontendPluginManifest,
    FrontendInteractionDef,
    FrontendHelperDef,
    FrontendGatingDef,
    FrontendToolDef,
    FrontendToolPack,
    CodegenTaskDef,
    AllFrontendManifestsResponse,
    FrontendManifestEntry,
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

    # Observability (Phase 16.5)
    'metrics_tracker',
    'RequestTimer',

    # World scoping (Phase 16.6)
    'get_enabled_plugins_for_world',
    'is_plugin_enabled_for_world',
    'set_enabled_plugins_for_world',
    'add_enabled_plugin_for_world',
    'remove_enabled_plugin_for_world',

    # Frontend manifest schema (OpenAPI codegen)
    'FrontendPluginManifest',
    'FrontendInteractionDef',
    'FrontendHelperDef',
    'FrontendGatingDef',
    'FrontendToolDef',
    'FrontendToolPack',
    'CodegenTaskDef',
    'AllFrontendManifestsResponse',
    'FrontendManifestEntry',
]
