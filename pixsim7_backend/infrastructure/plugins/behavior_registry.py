"""
Behavior Extension Registry

Central registry for plugin-provided behavior extensions (conditions, effects, simulation config).
Used by the NPC behavior system (Task 13) to discover and execute plugin extensions.

Plugins register extensions via BehaviorExtensionAPI (permission-checked).
The behavior system queries this registry to find available extensions.

See: claude-tasks/16-backend-plugin-capabilities-and-sandboxing.md Phase 16.4
     claude-tasks/13-npc-behavior-system-activities-and-routine-graphs.md
"""

from typing import Callable, Any, Optional, Dict, List
from dataclasses import dataclass
import structlog

logger = structlog.get_logger(__name__)


# ===== EXTENSION METADATA =====

@dataclass
class ConditionMetadata:
    """Metadata for a registered condition evaluator"""
    condition_id: str
    """Fully qualified condition ID (e.g., 'plugin:game-stealth:has_disguise')"""

    plugin_id: str
    """Plugin that registered this condition"""

    evaluator: Callable
    """Condition evaluator function: (context) -> bool"""

    description: Optional[str] = None
    """Human-readable description"""

    required_context: List[str] = None
    """Required context keys (e.g., ['npc_id', 'location_id'])"""

    def __post_init__(self):
        if self.required_context is None:
            self.required_context = []


@dataclass
class EffectMetadata:
    """Metadata for a registered effect handler"""
    effect_id: str
    """Fully qualified effect ID (e.g., 'effect:plugin:game-romance:arousal_boost')"""

    plugin_id: str
    """Plugin that registered this effect"""

    handler: Callable
    """Effect handler function: (context, params) -> effect_result"""

    description: Optional[str] = None
    """Human-readable description"""

    default_params: Dict[str, Any] = None
    """Default parameters for this effect"""

    def __post_init__(self):
        if self.default_params is None:
            self.default_params = {}


@dataclass
class SimulationConfigProvider:
    """Metadata for a simulation config provider"""
    provider_id: str
    """Provider ID (e.g., 'plugin:behavior-presets:performance')"""

    plugin_id: str
    """Plugin that registered this provider"""

    config_fn: Callable
    """Function that returns simulation config: () -> dict"""

    description: Optional[str] = None
    """Human-readable description"""

    priority: int = 100
    """Priority (lower = higher priority, default configs have priority 1000)"""


# ===== GLOBAL REGISTRIES =====

class BehaviorExtensionRegistry:
    """
    Global registry for behavior extensions.

    Plugins register extensions via BehaviorExtensionAPI.
    The behavior system queries this registry to find and execute extensions.

    Thread-safe for plugin registration during startup.
    """

    def __init__(self):
        self._conditions: Dict[str, ConditionMetadata] = {}
        self._effects: Dict[str, EffectMetadata] = {}
        self._simulation_configs: Dict[str, SimulationConfigProvider] = {}
        self._locked = False  # Lock registry after initialization

    # ===== CONDITION REGISTRATION =====

    def register_condition(
        self,
        condition_id: str,
        plugin_id: str,
        evaluator: Callable,
        description: Optional[str] = None,
        required_context: Optional[List[str]] = None,
    ) -> bool:
        """
        Register a condition evaluator.

        Args:
            condition_id: Fully qualified ID (e.g., 'plugin:my_plugin:my_condition')
            plugin_id: Plugin registering this condition
            evaluator: Condition function (context) -> bool
            description: Human-readable description
            required_context: Required context keys

        Returns:
            True if registered, False if already exists or locked

        Note: Should only be called via BehaviorExtensionAPI, which checks permissions.
        """
        if self._locked:
            logger.warning(
                "Cannot register condition - registry is locked",
                condition_id=condition_id,
                plugin_id=plugin_id,
            )
            return False

        if condition_id in self._conditions:
            logger.warning(
                "Condition already registered",
                condition_id=condition_id,
                existing_plugin=self._conditions[condition_id].plugin_id,
                new_plugin=plugin_id,
            )
            return False

        metadata = ConditionMetadata(
            condition_id=condition_id,
            plugin_id=plugin_id,
            evaluator=evaluator,
            description=description,
            required_context=required_context or [],
        )

        self._conditions[condition_id] = metadata

        logger.info(
            "Registered behavior condition",
            condition_id=condition_id,
            plugin_id=plugin_id,
        )

        return True

    def get_condition(self, condition_id: str) -> Optional[ConditionMetadata]:
        """Get condition metadata by ID"""
        return self._conditions.get(condition_id)

    def list_conditions(self, plugin_id: Optional[str] = None) -> List[ConditionMetadata]:
        """
        List all registered conditions.

        Args:
            plugin_id: Optional filter by plugin ID

        Returns:
            List of condition metadata
        """
        conditions = list(self._conditions.values())

        if plugin_id:
            conditions = [c for c in conditions if c.plugin_id == plugin_id]

        return conditions

    # ===== EFFECT REGISTRATION =====

    def register_effect(
        self,
        effect_id: str,
        plugin_id: str,
        handler: Callable,
        description: Optional[str] = None,
        default_params: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Register an effect handler.

        Args:
            effect_id: Fully qualified ID (e.g., 'effect:plugin:my_plugin:my_effect')
            plugin_id: Plugin registering this effect
            handler: Effect function (context, params) -> result
            description: Human-readable description
            default_params: Default parameters

        Returns:
            True if registered, False if already exists or locked
        """
        if self._locked:
            logger.warning(
                "Cannot register effect - registry is locked",
                effect_id=effect_id,
                plugin_id=plugin_id,
            )
            return False

        if effect_id in self._effects:
            logger.warning(
                "Effect already registered",
                effect_id=effect_id,
                existing_plugin=self._effects[effect_id].plugin_id,
                new_plugin=plugin_id,
            )
            return False

        metadata = EffectMetadata(
            effect_id=effect_id,
            plugin_id=plugin_id,
            handler=handler,
            description=description,
            default_params=default_params or {},
        )

        self._effects[effect_id] = metadata

        logger.info(
            "Registered behavior effect",
            effect_id=effect_id,
            plugin_id=plugin_id,
        )

        return True

    def get_effect(self, effect_id: str) -> Optional[EffectMetadata]:
        """Get effect metadata by ID"""
        return self._effects.get(effect_id)

    def list_effects(self, plugin_id: Optional[str] = None) -> List[EffectMetadata]:
        """
        List all registered effects.

        Args:
            plugin_id: Optional filter by plugin ID

        Returns:
            List of effect metadata
        """
        effects = list(self._effects.values())

        if plugin_id:
            effects = [e for e in effects if e.plugin_id == plugin_id]

        return effects

    # ===== SIMULATION CONFIG REGISTRATION =====

    def register_simulation_config(
        self,
        provider_id: str,
        plugin_id: str,
        config_fn: Callable,
        description: Optional[str] = None,
        priority: int = 100,
    ) -> bool:
        """
        Register a simulation config provider.

        Args:
            provider_id: Provider ID (e.g., 'plugin:my_plugin:my_config')
            plugin_id: Plugin registering this provider
            config_fn: Function returning simulation config dict
            description: Human-readable description
            priority: Priority (lower = higher priority)

        Returns:
            True if registered, False if already exists or locked
        """
        if self._locked:
            logger.warning(
                "Cannot register simulation config - registry is locked",
                provider_id=provider_id,
                plugin_id=plugin_id,
            )
            return False

        if provider_id in self._simulation_configs:
            logger.warning(
                "Simulation config already registered",
                provider_id=provider_id,
                existing_plugin=self._simulation_configs[provider_id].plugin_id,
                new_plugin=plugin_id,
            )
            return False

        provider = SimulationConfigProvider(
            provider_id=provider_id,
            plugin_id=plugin_id,
            config_fn=config_fn,
            description=description,
            priority=priority,
        )

        self._simulation_configs[provider_id] = provider

        logger.info(
            "Registered simulation config provider",
            provider_id=provider_id,
            plugin_id=plugin_id,
            priority=priority,
        )

        return True

    def get_simulation_config_providers(self) -> List[SimulationConfigProvider]:
        """
        Get all simulation config providers, sorted by priority.

        Returns:
            List of providers (lower priority first)
        """
        providers = list(self._simulation_configs.values())
        providers.sort(key=lambda p: p.priority)
        return providers

    # ===== LIFECYCLE =====

    def lock(self):
        """
        Lock the registry (no more registrations allowed).

        Called after all plugins are loaded to prevent runtime modifications.
        """
        self._locked = True
        logger.info(
            "Behavior extension registry locked",
            conditions=len(self._conditions),
            effects=len(self._effects),
            simulation_configs=len(self._simulation_configs),
        )

    def unlock(self):
        """Unlock the registry (for hot-reloading, testing)"""
        self._locked = False
        logger.info("Behavior extension registry unlocked")

    def clear(self):
        """Clear all registrations (for testing)"""
        self._conditions.clear()
        self._effects.clear()
        self._simulation_configs.clear()
        logger.info("Behavior extension registry cleared")

    # ===== STATISTICS =====

    def get_stats(self) -> Dict[str, Any]:
        """Get registry statistics"""
        return {
            "locked": self._locked,
            "conditions": {
                "total": len(self._conditions),
                "by_plugin": self._count_by_plugin(self._conditions.values()),
            },
            "effects": {
                "total": len(self._effects),
                "by_plugin": self._count_by_plugin(self._effects.values()),
            },
            "simulation_configs": {
                "total": len(self._simulation_configs),
                "by_plugin": self._count_by_plugin(self._simulation_configs.values()),
            },
        }

    def _count_by_plugin(self, items) -> Dict[str, int]:
        """Count items by plugin_id"""
        counts = {}
        for item in items:
            plugin_id = item.plugin_id
            counts[plugin_id] = counts.get(plugin_id, 0) + 1
        return counts


# ===== GLOBAL INSTANCE =====

# Global registry instance (singleton)
behavior_registry = BehaviorExtensionRegistry()


# ===== HELPER FUNCTIONS FOR BEHAVIOR SYSTEM =====

async def evaluate_condition(
    condition_id: str,
    context: Dict[str, Any],
    world_enabled_plugins: Optional[List[str]] = None,
) -> bool:
    """
    Evaluate a behavior condition.

    Args:
        condition_id: Condition ID to evaluate
        context: Evaluation context (npc_id, location_id, session_state, etc.)
        world_enabled_plugins: List of enabled plugin IDs for this world (None = all enabled)

    Returns:
        True if condition passes, False otherwise

    Note: Failing conditions return False (do not crash behavior system).
    """
    metadata = behavior_registry.get_condition(condition_id)

    if not metadata:
        logger.warning("Condition not found", condition_id=condition_id)
        return False

    # Check if plugin is enabled for this world
    if world_enabled_plugins is not None:
        if metadata.plugin_id not in world_enabled_plugins:
            logger.debug(
                "Condition skipped - plugin not enabled for world",
                condition_id=condition_id,
                plugin_id=metadata.plugin_id,
            )
            return False

    # Check required context
    for key in metadata.required_context:
        if key not in context:
            logger.warning(
                "Condition missing required context",
                condition_id=condition_id,
                missing_key=key,
            )
            return False

    # Evaluate condition (with error handling and metrics)
    try:
        result = metadata.evaluator(context)
        success = bool(result)

        # Track metrics
        from .observability import metrics_tracker
        metrics_tracker.record_condition_evaluation(metadata.plugin_id, success=True)

        return success
    except Exception as e:
        logger.error(
            "Condition evaluation failed",
            condition_id=condition_id,
            plugin_id=metadata.plugin_id,
            error=str(e),
            exc_info=True,
        )

        # Track failure metrics
        from .observability import metrics_tracker
        metrics_tracker.record_condition_evaluation(metadata.plugin_id, success=False)
        metrics_tracker.record_error(
            metadata.plugin_id,
            "ConditionEvaluationError",
            str(e),
            {"condition_id": condition_id},
        )

        return False  # Failed conditions = False


async def apply_effect(
    effect_id: str,
    context: Dict[str, Any],
    params: Optional[Dict[str, Any]] = None,
    world_enabled_plugins: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Apply a behavior effect.

    Args:
        effect_id: Effect ID to apply
        context: Effect context (npc_id, session_state, etc.)
        params: Effect parameters (merged with defaults)
        world_enabled_plugins: List of enabled plugin IDs for this world (None = all enabled)

    Returns:
        Effect result dict or None if failed

    Note: Failing effects return None (do not crash behavior system).
    """
    metadata = behavior_registry.get_effect(effect_id)

    if not metadata:
        logger.warning("Effect not found", effect_id=effect_id)
        return None

    # Check if plugin is enabled for this world
    if world_enabled_plugins is not None:
        if metadata.plugin_id not in world_enabled_plugins:
            logger.debug(
                "Effect skipped - plugin not enabled for world",
                effect_id=effect_id,
                plugin_id=metadata.plugin_id,
            )
            return None

    # Merge params with defaults
    merged_params = {**metadata.default_params, **(params or {})}

    # Apply effect (with error handling and metrics)
    try:
        result = metadata.handler(context, merged_params)

        # Track metrics
        from .observability import metrics_tracker
        metrics_tracker.record_effect_application(metadata.plugin_id, success=True)

        return result
    except Exception as e:
        logger.error(
            "Effect application failed",
            effect_id=effect_id,
            plugin_id=metadata.plugin_id,
            error=str(e),
            exc_info=True,
        )

        # Track failure metrics
        from .observability import metrics_tracker
        metrics_tracker.record_effect_application(metadata.plugin_id, success=False)
        metrics_tracker.record_error(
            metadata.plugin_id,
            "EffectApplicationError",
            str(e),
            {"effect_id": effect_id},
        )

        return None  # Failed effects return None


def build_simulation_config(
    base_config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Build simulation config by merging plugin providers.

    Args:
        base_config: Base config (from world.meta or defaults)

    Returns:
        Merged simulation config

    Note: Providers are applied in priority order (lower priority first).
          Later providers can override earlier ones.
    """
    config = base_config or {}

    providers = behavior_registry.get_simulation_config_providers()

    for provider in providers:
        try:
            provider_config = provider.config_fn()
            if isinstance(provider_config, dict):
                # Deep merge (simple implementation - can be enhanced)
                config.update(provider_config)
                logger.debug(
                    "Applied simulation config provider",
                    provider_id=provider.provider_id,
                    plugin_id=provider.plugin_id,
                )
            else:
                logger.warning(
                    "Simulation config provider returned non-dict",
                    provider_id=provider.provider_id,
                    type=type(provider_config).__name__,
                )
        except Exception as e:
            logger.error(
                "Simulation config provider failed",
                provider_id=provider.provider_id,
                plugin_id=provider.plugin_id,
                error=str(e),
                exc_info=True,
            )

    return config
