"""
World-Scoped Plugin Enablement

Allows plugins to be enabled/disabled on a per-world basis.

World configuration is stored in GameWorld.meta.behavior.enabledPlugins.
The behavior system filters extensions based on this configuration.

See: claude-tasks/16-backend-plugin-capabilities-and-sandboxing.md Phase 16.6
"""

from typing import Optional, List
import structlog

logger = structlog.get_logger(__name__)


# ===== WORLD PLUGIN CONFIGURATION =====

def get_enabled_plugins_for_world(world_meta: dict) -> Optional[List[str]]:
    """
    Get list of enabled plugin IDs for a world.

    Args:
        world_meta: GameWorld.meta dictionary

    Returns:
        List of enabled plugin IDs, or None if not configured (all plugins enabled)

    Example world_meta:
        {
            "behavior": {
                "enabledPlugins": ["game-stealth", "game-romance"],
                "simulationConfig": {...}
            }
        }
    """
    if not world_meta:
        return None  # No meta = all plugins enabled

    behavior_config = world_meta.get("behavior", {})
    enabled_plugins = behavior_config.get("enabledPlugins")

    if enabled_plugins is None:
        return None  # Not configured = all plugins enabled

    if not isinstance(enabled_plugins, list):
        logger.warning(
            "Invalid enabledPlugins config (not a list)",
            type=type(enabled_plugins).__name__,
        )
        return None

    return enabled_plugins


def is_plugin_enabled_for_world(
    plugin_id: str,
    world_meta: dict,
) -> bool:
    """
    Check if a plugin is enabled for a specific world.

    Args:
        plugin_id: Plugin ID to check
        world_meta: GameWorld.meta dictionary

    Returns:
        True if plugin is enabled, False otherwise

    Note:
        - If enabledPlugins is not configured, all plugins are enabled (True)
        - If enabledPlugins is [], no plugins are enabled (False)
        - If enabledPlugins contains plugin_id, plugin is enabled (True)
    """
    enabled_plugins = get_enabled_plugins_for_world(world_meta)

    # No configuration = all enabled
    if enabled_plugins is None:
        return True

    # Explicit list = check membership
    return plugin_id in enabled_plugins


def set_enabled_plugins_for_world(
    world_meta: dict,
    plugin_ids: List[str],
) -> dict:
    """
    Set enabled plugins for a world.

    Args:
        world_meta: GameWorld.meta dictionary (will be modified)
        plugin_ids: List of plugin IDs to enable

    Returns:
        Updated world_meta

    Note: This modifies world_meta in place and returns it.
    """
    if "behavior" not in world_meta:
        world_meta["behavior"] = {}

    world_meta["behavior"]["enabledPlugins"] = plugin_ids

    logger.info(
        "Updated enabled plugins for world",
        enabled_plugins=plugin_ids,
    )

    return world_meta


def add_enabled_plugin_for_world(
    world_meta: dict,
    plugin_id: str,
) -> dict:
    """
    Add a plugin to the enabled list for a world.

    Args:
        world_meta: GameWorld.meta dictionary
        plugin_id: Plugin ID to enable

    Returns:
        Updated world_meta
    """
    enabled_plugins = get_enabled_plugins_for_world(world_meta) or []

    if plugin_id not in enabled_plugins:
        enabled_plugins.append(plugin_id)
        set_enabled_plugins_for_world(world_meta, enabled_plugins)

    return world_meta


def remove_enabled_plugin_for_world(
    world_meta: dict,
    plugin_id: str,
) -> dict:
    """
    Remove a plugin from the enabled list for a world.

    Args:
        world_meta: GameWorld.meta dictionary
        plugin_id: Plugin ID to disable

    Returns:
        Updated world_meta
    """
    enabled_plugins = get_enabled_plugins_for_world(world_meta)

    # If None, convert to explicit list (all plugins -> all except this one)
    if enabled_plugins is None:
        # Get all plugin IDs (this would require access to plugin manager)
        # For now, just create an empty list (disables all plugins)
        logger.warning(
            "Removing plugin from world with no enabledPlugins config - this will disable all plugins"
        )
        enabled_plugins = []
    elif plugin_id in enabled_plugins:
        enabled_plugins.remove(plugin_id)

    set_enabled_plugins_for_world(world_meta, enabled_plugins)
    return world_meta


# ===== INTEGRATION EXAMPLES =====

"""
Example usage in behavior system:

# When evaluating activities for an NPC:
from pixsim7_backend.infrastructure.plugins import evaluate_condition
from pixsim7_backend.infrastructure.plugins.world_scoping import get_enabled_plugins_for_world

# Get world configuration
world = await db.get(GameWorld, world_id)
enabled_plugins = get_enabled_plugins_for_world(world.meta)

# Evaluate condition (filters by enabled plugins)
can_do_activity = await evaluate_condition(
    "plugin:game-stealth:has_disguise",
    context=context,
    world_enabled_plugins=enabled_plugins,  # Only enabled plugins can execute
)

# Apply effect (filters by enabled plugins)
result = await apply_effect(
    "effect:plugin:game-romance:arousal_boost",
    context=context,
    params={"amount": 0.2},
    world_enabled_plugins=enabled_plugins,  # Only enabled plugins can execute
)
"""

"""
Example world configuration (GameWorld.meta):

{
    "behavior": {
        "enabledPlugins": [
            "game-stealth",
            "game-romance",
            "custom-behavior-plugin"
        ],
        "simulationConfig": {
            "max_active_npcs": 10,
            "update_frequency_seconds": 300
        }
    }
}

To enable/disable plugins for a world via API:

PATCH /api/v1/game/worlds/{world_id}
{
    "meta": {
        "behavior": {
            "enabledPlugins": ["game-stealth", "game-romance"]
        }
    }
}
"""
