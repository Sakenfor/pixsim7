"""
Behavior Extension Capability API

Allows plugins to register custom behavior conditions, effects, and configuration.
"""

from typing import Optional, Callable
import structlog

from ..permissions import PluginPermission, PermissionDeniedBehavior
from ..context_base import BaseCapabilityAPI


class BehaviorExtensionAPI(BaseCapabilityAPI):
    """
    Register custom behavior conditions and effects.

    Required permissions:
    - behavior:extend_conditions
    - behavior:extend_effects
    - behavior:configure_simulation
    """

    def __init__(
        self,
        plugin_id: str,
        permissions: set[str],
        logger: structlog.BoundLogger,
    ):
        super().__init__(plugin_id, permissions, logger)

    def register_condition_evaluator(
        self,
        condition_name: str,
        evaluator: Callable,
        description: Optional[str] = None,
        required_context: Optional[list[str]] = None,
    ) -> bool:
        """
        Register a custom behavior condition evaluator.

        Args:
            condition_name: Condition name (will be namespaced)
            evaluator: Callable that takes context dict and returns bool
            description: Human-readable description
            required_context: List of required context keys

        Returns:
            True if registered, False if permission denied

        Example:
            def has_disguise(context):
                session_flags = context.get('session_flags', {})
                return session_flags.get('stealth', {}).get('has_disguise', False)

            ctx.behavior.register_condition_evaluator(
                'has_disguise',
                has_disguise,
                description='Check if player has a disguise',
                required_context=['session_flags']
            )
        """
        if not self._check_permission(
            PluginPermission.BEHAVIOR_EXTEND_CONDITIONS.value,
            "BehaviorExtensionAPI.register_condition_evaluator",
            PermissionDeniedBehavior.WARN,
        ):
            return False

        # Namespace condition ID
        condition_id = f"plugin:{self.plugin_id}:{condition_name}"

        # Register in global registry
        from ..behavior_registry import behavior_registry

        success = behavior_registry.register_condition(
            condition_id=condition_id,
            plugin_id=self.plugin_id,
            evaluator=evaluator,
            description=description,
            required_context=required_context,
        )

        if success:
            self.logger.info(
                "Registered behavior condition",
                plugin_id=self.plugin_id,
                condition_id=condition_id,
            )

        return success

    def register_effect_handler(
        self,
        effect_name: str,
        handler: Callable,
        description: Optional[str] = None,
        default_params: Optional[dict] = None,
    ) -> bool:
        """
        Register a custom activity effect handler.

        Args:
            effect_name: Effect name (will be namespaced)
            handler: Callable that applies the effect (context, params) -> result
            description: Human-readable description
            default_params: Default parameters for this effect

        Returns:
            True if registered, False if permission denied

        Example:
            def arousal_boost_effect(context, params):
                boost = params.get('amount', 0.1)
                # Apply arousal boost logic
                return {'arousal_delta': boost}

            ctx.behavior.register_effect_handler(
                'arousal_boost',
                arousal_boost_effect,
                description='Increase NPC arousal',
                default_params={'amount': 0.1}
            )
        """
        if not self._check_permission(
            PluginPermission.BEHAVIOR_EXTEND_EFFECTS.value,
            "BehaviorExtensionAPI.register_effect_handler",
            PermissionDeniedBehavior.WARN,
        ):
            return False

        # Namespace effect ID
        effect_id = f"effect:plugin:{self.plugin_id}:{effect_name}"

        # Register in global registry
        from ..behavior_registry import behavior_registry

        success = behavior_registry.register_effect(
            effect_id=effect_id,
            plugin_id=self.plugin_id,
            handler=handler,
            description=description,
            default_params=default_params,
        )

        if success:
            self.logger.info(
                "Registered behavior effect",
                plugin_id=self.plugin_id,
                effect_id=effect_id,
            )

        return success

    def register_simulation_config(
        self,
        config_name: str,
        config_fn: Callable,
        description: Optional[str] = None,
        priority: int = 100,
    ) -> bool:
        """
        Register a simulation config provider.

        Args:
            config_name: Config provider name (will be namespaced)
            config_fn: Function that returns simulation config dict
            description: Human-readable description
            priority: Priority (lower = higher priority, defaults have priority 1000)

        Returns:
            True if registered, False if permission denied

        Example:
            def performance_config():
                return {
                    'max_active_npcs': 5,
                    'update_frequency_seconds': 300,
                }

            ctx.behavior.register_simulation_config(
                'performance',
                performance_config,
                description='Performance-optimized simulation settings',
                priority=50  # Higher priority than defaults
            )
        """
        if not self._check_permission(
            PluginPermission.BEHAVIOR_CONFIGURE_SIMULATION.value,
            "BehaviorExtensionAPI.register_simulation_config",
            PermissionDeniedBehavior.WARN,
        ):
            return False

        # Namespace provider ID
        provider_id = f"plugin:{self.plugin_id}:{config_name}"

        # Register in global registry
        from ..behavior_registry import behavior_registry

        success = behavior_registry.register_simulation_config(
            provider_id=provider_id,
            plugin_id=self.plugin_id,
            config_fn=config_fn,
            description=description,
            priority=priority,
        )

        if success:
            self.logger.info(
                "Registered simulation config provider",
                plugin_id=self.plugin_id,
                provider_id=provider_id,
                priority=priority,
            )

        return success

    def register_component_schema(
        self,
        component_name: str,
        schema: dict,
        description: Optional[str] = None,
        metrics: Optional[dict] = None,
    ) -> bool:
        """
        Register a component schema and associated metrics for a plugin.

        Args:
            component_name: Component name (will be namespaced if not already)
            schema: Component schema (JSON schema or dict of field definitions)
            description: Human-readable description
            metrics: Metric definitions (metricId -> {type, min, max, path, ...})

        Returns:
            True if registered, False if permission denied

        Example:
            success = ctx.behavior.register_component_schema(
                component_name="romance",  # Auto-namespaced to "plugin:game-romance"
                schema={
                    "arousal": {"type": "float", "min": 0, "max": 1},
                    "stage": {"type": "string", "enum": ["none", "flirting", "dating", "partner"]},
                    "consentLevel": {"type": "float", "min": 0, "max": 1}
                },
                description="Romance system component for NPCs",
                metrics={
                    "npcRelationship.arousal": {
                        "type": "float",
                        "min": 0,
                        "max": 1,
                        "component": "plugin:game-romance",
                        "path": "arousal",
                        "label": "Arousal"
                    },
                    "npcRelationship.romanceStage": {
                        "type": "enum",
                        "values": ["none", "flirting", "dating", "partner"],
                        "component": "plugin:game-romance",
                        "path": "stage",
                        "label": "Romance Stage"
                    }
                }
            )
        """
        if not self._check_permission(
            PluginPermission.BEHAVIOR_EXTEND_CONDITIONS.value,
            "BehaviorExtensionAPI.register_component_schema",
            PermissionDeniedBehavior.WARN,
        ):
            return False

        # Namespace component name for plugins
        core_components = {"core", "romance", "stealth", "mood", "behavior", "interactions", "quests"}
        if component_name in core_components:
            self.logger.warning(
                "Cannot register core component name",
                plugin_id=self.plugin_id,
                component_name=component_name,
            )
            return False

        if not component_name.startswith("plugin:"):
            component_name = f"plugin:{self.plugin_id}:{component_name}"

        # Ensure metrics reference the correct component
        if metrics:
            for metric_id, metric_def in metrics.items():
                if "component" not in metric_def:
                    metric_def["component"] = component_name

        # Register in global registry
        from ..behavior_registry import behavior_registry

        success = behavior_registry.register_component_schema(
            component_name=component_name,
            plugin_id=self.plugin_id,
            schema=schema,
            description=description,
            metrics=metrics,
        )

        if success:
            self.logger.info(
                "Registered component schema",
                plugin_id=self.plugin_id,
                component_name=component_name,
                metrics_count=len(metrics) if metrics else 0,
            )

        return success
