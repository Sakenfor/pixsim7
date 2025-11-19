"""
Example Behavior Extension Plugin (Phase 16.4)

Demonstrates how to extend the NPC behavior system with:
- Custom conditions (for activity selection)
- Custom effects (for activity outcomes)
- Simulation config providers

This plugin shows the proper pattern for behavior extensions:
1. Declare behavior:extend_* permissions in manifest
2. Register extensions via BehaviorExtensionAPI in on_load hook
3. Extensions are automatically namespaced and permission-checked
4. The behavior system will discover and use these extensions

See: claude-tasks/16-backend-plugin-capabilities-and-sandboxing.md Phase 16.4
     claude-tasks/13-npc-behavior-system-activities-and-routine-graphs.md
"""

from fastapi import APIRouter

from pixsim7_backend.infrastructure.plugins.types import PluginManifest
from pixsim7_backend.infrastructure.plugins.context import PluginContext


# ===== PLUGIN MANIFEST =====

manifest = PluginManifest(
    id="example-behavior-extension",
    name="Example Behavior Extension Plugin",
    version="1.0.0",
    description="Example plugin demonstrating behavior system extensions",
    author="PixSim Team",
    kind="feature",
    prefix="/api/v1",
    tags=["example", "behavior"],
    dependencies=[],
    requires_db=False,  # Behavior extensions don't need DB directly
    requires_redis=False,
    enabled=False,  # Disabled by default (example plugin)

    # Declare behavior extension permissions
    permissions=[
        "behavior:extend_conditions",
        "behavior:extend_effects",
        "behavior:configure_simulation",
        "log:emit",
    ],
)


# ===== API ROUTER =====

router = APIRouter(prefix="/example/behavior", tags=["example-behavior"])


# ===== BEHAVIOR EXTENSIONS =====

# Custom condition evaluators

def has_high_intimacy(context: dict) -> bool:
    """
    Example condition: Check if NPC intimacy is high.

    Args:
        context: Behavior context containing:
            - session_id: int
            - npc_id: int
            - session_state: dict (flags, relationships)

    Returns:
        True if intimacy >= 70, False otherwise
    """
    session_state = context.get('session_state', {})
    relationships = session_state.get('relationships', {})
    npc_key = f"npc:{context.get('npc_id')}"
    relationship = relationships.get(npc_key, {})

    intimacy = relationship.get('intimacy', 0)
    return intimacy >= 70


def is_player_disguised(context: dict) -> bool:
    """
    Example condition: Check if player has an active disguise.

    This would integrate with a stealth system plugin.
    """
    session_state = context.get('session_state', {})
    stealth_flags = session_state.get('flags', {}).get('stealth', {})
    return stealth_flags.get('has_disguise', False)


# Custom effect handlers

def mood_boost_effect(context: dict, params: dict) -> dict:
    """
    Example effect: Boost NPC mood (valence/arousal).

    Args:
        context: Effect context
        params: Effect parameters (valence_delta, arousal_delta)

    Returns:
        Effect result with mood deltas
    """
    valence_delta = params.get('valence_delta', 0.1)
    arousal_delta = params.get('arousal_delta', 0.05)

    return {
        'effect_type': 'mood_boost',
        'mood_delta': {
            'valence': valence_delta,
            'arousal': arousal_delta,
        },
        'description': f'Mood boosted (+{valence_delta} valence, +{arousal_delta} arousal)',
    }


def relationship_impact_effect(context: dict, params: dict) -> dict:
    """
    Example effect: Impact relationship metrics.

    Args:
        context: Effect context (npc_id, session_id)
        params: Effect parameters (affinity_delta, trust_delta, etc.)

    Returns:
        Effect result with relationship deltas
    """
    npc_id = context.get('npc_id')
    affinity_delta = params.get('affinity_delta', 5)
    trust_delta = params.get('trust_delta', 0)
    chemistry_delta = params.get('chemistry_delta', 0)

    return {
        'effect_type': 'relationship_impact',
        'npc_id': npc_id,
        'relationship_delta': {
            'affinity': affinity_delta,
            'trust': trust_delta,
            'chemistry': chemistry_delta,
        },
        'description': f'Relationship changed (affinity: {affinity_delta:+d})',
    }


# Simulation config provider

def performance_simulation_config() -> dict:
    """
    Example simulation config: Performance-optimized settings.

    Returns:
        Simulation config dict (merged with world config)
    """
    return {
        'max_active_npcs': 5,
        'update_frequency_seconds': 300,  # 5 minutes
        'simulation_tier': 'minimal',
        'example_plugin_enabled': True,
    }


# ===== LIFECYCLE HOOKS =====

def on_load(app):
    """
    Called when plugin is loaded (before app starts).

    This is where we register behavior extensions with the global registry.
    Registration happens via PluginContext to ensure permission checking.
    """
    from pixsim_logging import configure_logging
    from pixsim7_backend.infrastructure.plugins.context import PluginContext

    logger = configure_logging("plugin.example-behavior-extension")
    logger.info("Example behavior extension plugin loading...")

    # Create a PluginContext for registration
    # (normally this would come from dependency injection, but for on_load we create it manually)
    ctx = PluginContext(
        plugin_id=manifest.id,
        permissions=manifest.permissions,
    )

    # Register custom conditions
    ctx.behavior.register_condition_evaluator(
        'has_high_intimacy',
        has_high_intimacy,
        description='Check if NPC intimacy level is high (>= 70)',
        required_context=['session_state', 'npc_id'],
    )

    ctx.behavior.register_condition_evaluator(
        'is_player_disguised',
        is_player_disguised,
        description='Check if player has an active disguise',
        required_context=['session_state'],
    )

    # Register custom effects
    ctx.behavior.register_effect_handler(
        'mood_boost',
        mood_boost_effect,
        description='Boost NPC mood (valence and arousal)',
        default_params={'valence_delta': 0.1, 'arousal_delta': 0.05},
    )

    ctx.behavior.register_effect_handler(
        'relationship_impact',
        relationship_impact_effect,
        description='Impact relationship metrics (affinity, trust, chemistry)',
        default_params={'affinity_delta': 5, 'trust_delta': 0, 'chemistry_delta': 0},
    )

    # Register simulation config provider
    ctx.behavior.register_simulation_config(
        'performance',
        performance_simulation_config,
        description='Performance-optimized simulation settings',
        priority=50,  # Higher priority than defaults (1000)
    )

    logger.info(
        "Example behavior extension plugin loaded",
        conditions=2,
        effects=2,
        simulation_configs=1,
    )


async def on_enable():
    """Called when plugin is enabled (after app starts)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.example-behavior-extension")
    logger.info("Example behavior extension plugin enabled")


async def on_disable():
    """Called when plugin is disabled (before app shuts down)"""
    from pixsim_logging import configure_logging
    logger = configure_logging("plugin.example-behavior-extension")
    logger.info("Example behavior extension plugin disabled")
