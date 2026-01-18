"""
Behavior Extension Registry

Central registry for plugin-provided behavior extensions (conditions, effects, scoring factors, simulation config).
Used by the NPC behavior system (Task 13) to discover and execute plugin extensions.

Plugins register extensions via BehaviorExtensionAPI (permission-checked).
The behavior system queries this registry to find available extensions.

See: claude-tasks/16-backend-plugin-capabilities-and-sandboxing.md Phase 16.4
     claude-tasks/13-npc-behavior-system-activities-and-routine-graphs.md
     claude-tasks/28-extensible-scoring-and-simulation-config.md
"""

from typing import Callable, Any, Optional, Dict, List
from dataclasses import dataclass
import structlog

from pixsim7.backend.main.lib.registry.group import RegistryGroup

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

    params_schema: Optional[Dict[str, Any]] = None
    """JSON Schema (Draft 7) for condition parameters"""

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

    params_schema: Optional[Dict[str, Any]] = None
    """JSON Schema (Draft 7) for effect parameters"""

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


@dataclass
class ComponentSchemaMetadata:
    """Metadata for a registered component schema"""
    component_name: str
    """Component name (e.g., 'plugin:game-romance' or 'romance')"""

    plugin_id: str
    """Plugin that registered this component"""

    schema: Dict[str, Any]
    """Component schema (JSON schema or Pydantic-like definition)"""

    description: Optional[str] = None
    """Human-readable description"""

    metrics: Dict[str, Dict[str, Any]] = None
    """Metric definitions for this component (metricId -> definition)"""

    def __post_init__(self):
        if self.metrics is None:
            self.metrics = {}


@dataclass
class ScoringFactorMetadata:
    """Metadata for a registered scoring factor"""
    factor_id: str
    """Scoring factor ID (e.g., 'baseWeight' or 'plugin:custom_factor')"""

    plugin_id: str
    """Plugin that registered this factor ('core' for built-ins)"""

    evaluator: Callable
    """Scoring function: (activity, npc_state, context) -> float"""

    default_weight: float = 1.0
    """Default weight for this factor in scoring config"""

    description: Optional[str] = None
    """Human-readable description"""

    params_schema: Optional[Dict[str, Any]] = None
    """JSON Schema (Draft 7) for scoring factor parameters (optional, rarely used)"""


@dataclass
class TagEffectMetadata:
    """
    Metadata for a registered tag effect.

    Tag effects define how semantic tags (like 'phobia', 'passion', 'addiction')
    affect activity scoring. Plugins can register custom tags with custom
    effect calculations.
    """
    tag_id: str
    """Tag ID (e.g., 'uncomfortable', 'phobia', 'plugin:romance:intimate')"""

    plugin_id: str
    """Plugin that registered this tag effect ('core' for built-ins)"""

    evaluator: Callable
    """Effect function: (activity, archetype, context) -> float (multiplier)"""

    default_multiplier: float = 1.0
    """Default multiplier if evaluator not needed (simple constant effect)"""

    description: Optional[str] = None
    """Human-readable description"""

    priority: int = 100
    """Priority for tag matching (lower = checked first, higher priority)"""


@dataclass
class BehaviorProfileMetadata:
    """
    Metadata for a registered behavior profile.

    Behavior profiles are contextual behavior modifications that activate
    when certain conditions are met. They stack with archetype modifiers
    following a deterministic layering order.
    """
    profile_id: str
    """Unique profile ID (e.g., 'plugin:romance:romantic_evening')"""

    plugin_id: str
    """Plugin that registered this profile"""

    name: str
    """Display name"""

    conditions: List[Dict[str, Any]]
    """List of condition dicts that must ALL be met for activation"""

    modifiers: Dict[str, Any]
    """Modifiers to apply when active (activity_weights, category_weights, etc.)"""

    condition_evaluator: Optional[Callable] = None
    """Optional custom condition evaluator: (context) -> bool"""

    priority: int = 100
    """Priority for layering (higher = applied later, can override)"""

    exclusivity_group: Optional[str] = None
    """Only one profile per group can be active (highest priority wins)"""

    description: Optional[str] = None
    """Human-readable description"""

    tags: List[str] = None
    """Tags for categorization"""

    def __post_init__(self):
        if self.tags is None:
            self.tags = []


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
        self._component_schemas: Dict[str, ComponentSchemaMetadata] = {}
        self._scoring_factors: Dict[str, ScoringFactorMetadata] = {}
        self._tag_effects: Dict[str, TagEffectMetadata] = {}
        self._behavior_profiles: Dict[str, BehaviorProfileMetadata] = {}
        self._trait_effect_mappings: Dict[str, Dict[str, List[Dict]]] = {}  # Phase 4
        self._locked = False  # Lock registry after initialization

        # Registry metadata for dynamic operations (name -> dict)
        # All items in these registries have a `plugin_id` attribute
        self._sub_registries: Dict[str, Dict[str, Any]] = {
            "conditions": self._conditions,
            "effects": self._effects,
            "simulation_configs": self._simulation_configs,
            "component_schemas": self._component_schemas,
            "scoring_factors": self._scoring_factors,
            "tag_effects": self._tag_effects,
            "behavior_profiles": self._behavior_profiles,
            # Note: _trait_effect_mappings excluded - items don't have plugin_id
        }
        self._registry_group = RegistryGroup("behavior_extensions")
        for name, registry in self._sub_registries.items():
            self._registry_group.register_registry(name, registry, plugin_attr="plugin_id")

    @property
    def name(self) -> str:
        """Registry name for plugin tracking."""
        return "behavior_extensions"

    # ===== CONDITION REGISTRATION =====

    def register_condition(
        self,
        condition_id: str,
        plugin_id: str,
        evaluator: Callable,
        description: Optional[str] = None,
        required_context: Optional[List[str]] = None,
        params_schema: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Register a condition evaluator.

        Args:
            condition_id: Fully qualified ID (e.g., 'plugin:my_plugin:my_condition')
            plugin_id: Plugin registering this condition
            evaluator: Condition function (context) -> bool
            description: Human-readable description
            required_context: Required context keys
            params_schema: JSON Schema (Draft 7) for condition parameters

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
            params_schema=params_schema,
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
        params_schema: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Register an effect handler.

        Args:
            effect_id: Fully qualified ID (e.g., 'effect:plugin:my_plugin:my_effect')
            plugin_id: Plugin registering this effect
            handler: Effect function (context, params) -> result
            description: Human-readable description
            default_params: Default parameters
            params_schema: JSON Schema (Draft 7) for effect parameters

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
            params_schema=params_schema,
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

    # ===== COMPONENT SCHEMA REGISTRATION =====

    def register_component_schema(
        self,
        component_name: str,
        plugin_id: str,
        schema: Dict[str, Any],
        description: Optional[str] = None,
        metrics: Optional[Dict[str, Dict[str, Any]]] = None,
    ) -> bool:
        """
        Register a component schema and its associated metrics.

        Args:
            component_name: Component name (e.g., 'plugin:game-romance')
            plugin_id: Plugin registering this schema
            schema: Component schema (JSON schema or Pydantic-like definition)
            description: Human-readable description
            metrics: Metric definitions (metricId -> {type, min, max, component, ...})

        Returns:
            True if registered, False if already exists or locked

        Example:
            behavior_registry.register_component_schema(
                component_name="plugin:game-romance",
                plugin_id="game-romance",
                schema={"arousal": {"type": "float"}, "stage": {"type": "str"}},
                description="Romance system component",
                metrics={
                    "npcRelationship.arousal": {
                        "type": "float",
                        "min": 0,
                        "max": 1,
                        "component": "plugin:game-romance",
                        "path": "arousal"
                    }
                }
            )
        """
        if self._locked:
            logger.warning(
                "Cannot register component schema - registry is locked",
                component_name=component_name,
                plugin_id=plugin_id,
            )
            return False

        if component_name in self._component_schemas:
            logger.warning(
                "Component schema already registered",
                component_name=component_name,
                existing_plugin=self._component_schemas[component_name].plugin_id,
                new_plugin=plugin_id,
            )
            return False

        metadata = ComponentSchemaMetadata(
            component_name=component_name,
            plugin_id=plugin_id,
            schema=schema,
            description=description,
            metrics=metrics or {},
        )

        self._component_schemas[component_name] = metadata

        logger.info(
            "Registered component schema",
            component_name=component_name,
            plugin_id=plugin_id,
            metrics_count=len(metadata.metrics),
        )

        return True

    def get_component_schema(self, component_name: str) -> Optional[ComponentSchemaMetadata]:
        """Get component schema metadata by name"""
        return self._component_schemas.get(component_name)

    def list_component_schemas(self, plugin_id: Optional[str] = None) -> List[ComponentSchemaMetadata]:
        """
        List all registered component schemas.

        Args:
            plugin_id: Optional filter by plugin ID

        Returns:
            List of component schema metadata
        """
        schemas = list(self._component_schemas.values())

        if plugin_id:
            schemas = [s for s in schemas if s.plugin_id == plugin_id]

        return schemas

    # ===== SCORING FACTOR REGISTRATION =====

    def register_scoring_factor(
        self,
        factor_id: str,
        plugin_id: str,
        evaluator: Callable,
        default_weight: float = 1.0,
        description: Optional[str] = None,
        params_schema: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Register a scoring factor for activity selection.

        Args:
            factor_id: Unique identifier (e.g., 'baseWeight', 'plugin:custom_factor')
            plugin_id: Plugin registering this factor ('core' for built-ins)
            evaluator: Function(activity, npc_state, context) -> float
            default_weight: Default weight in scoring config
            description: Human-readable description
            params_schema: JSON Schema (Draft 7) for scoring factor parameters (optional)

        Returns:
            True if registered, False if already exists or locked
        """
        if self._locked:
            logger.warning(
                "Cannot register scoring factor - registry is locked",
                factor_id=factor_id,
                plugin_id=plugin_id,
            )
            return False

        if factor_id in self._scoring_factors:
            logger.warning(
                "Scoring factor already registered",
                factor_id=factor_id,
                existing_plugin=self._scoring_factors[factor_id].plugin_id,
                new_plugin=plugin_id,
            )
            return False

        self._scoring_factors[factor_id] = ScoringFactorMetadata(
            factor_id=factor_id,
            plugin_id=plugin_id,
            evaluator=evaluator,
            default_weight=default_weight,
            description=description,
            params_schema=params_schema,
        )

        logger.info(
            "Registered scoring factor",
            factor_id=factor_id,
            plugin_id=plugin_id,
            default_weight=default_weight,
        )

        return True

    def get_scoring_factor(self, factor_id: str) -> Optional[ScoringFactorMetadata]:
        """Get scoring factor metadata by ID"""
        return self._scoring_factors.get(factor_id)

    def list_scoring_factors(self, plugin_id: Optional[str] = None) -> List[ScoringFactorMetadata]:
        """
        List all registered scoring factors.

        Args:
            plugin_id: Optional filter by plugin ID

        Returns:
            List of scoring factor metadata
        """
        factors = list(self._scoring_factors.values())

        if plugin_id:
            factors = [f for f in factors if f.plugin_id == plugin_id]

        return factors

    # ===== TAG EFFECT REGISTRATION =====

    def register_tag_effect(
        self,
        tag_id: str,
        plugin_id: str,
        evaluator: Optional[Callable] = None,
        default_multiplier: float = 1.0,
        description: Optional[str] = None,
        priority: int = 100,
    ) -> bool:
        """
        Register a tag effect for activity scoring.

        Tag effects define how semantic tags (e.g., 'phobia', 'passion')
        affect activity scoring. Archetypes can use these tags in their
        uncomfortableWith/comfortableWith lists, or define custom tagEffects.

        Args:
            tag_id: Unique tag identifier (e.g., 'uncomfortable', 'plugin:romance:intimate')
            plugin_id: Plugin registering this tag ('core' for built-ins)
            evaluator: Optional function(activity, archetype, context) -> float
                       If None, default_multiplier is used as a constant.
            default_multiplier: Default multiplier when evaluator is None
            description: Human-readable description
            priority: Priority for tag matching (lower = checked first)

        Returns:
            True if registered, False if already exists or locked

        Example:
            # Simple constant effect
            register_tag_effect("phobia", "core", default_multiplier=0.05,
                               description="Strong aversion (95% penalty)")

            # Dynamic effect based on context
            def passion_effect(activity, archetype, context):
                # Boost increases with relationship level
                rel = context.get("relationship_level", 0)
                return 1.5 + (rel * 0.5)  # 1.5x to 2.0x

            register_tag_effect("passion", "core", evaluator=passion_effect,
                               description="Strong preference (dynamic boost)")
        """
        if self._locked:
            logger.warning(
                "Cannot register tag effect - registry is locked",
                tag_id=tag_id,
                plugin_id=plugin_id,
            )
            return False

        if tag_id in self._tag_effects:
            logger.warning(
                "Tag effect already registered",
                tag_id=tag_id,
                existing_plugin=self._tag_effects[tag_id].plugin_id,
                new_plugin=plugin_id,
            )
            return False

        # If no evaluator, create a simple constant function
        if evaluator is None:
            mult = default_multiplier
            evaluator = lambda activity, archetype, context: mult

        self._tag_effects[tag_id] = TagEffectMetadata(
            tag_id=tag_id,
            plugin_id=plugin_id,
            evaluator=evaluator,
            default_multiplier=default_multiplier,
            description=description,
            priority=priority,
        )

        logger.info(
            "Registered tag effect",
            tag_id=tag_id,
            plugin_id=plugin_id,
            default_multiplier=default_multiplier,
            priority=priority,
        )

        return True

    def get_tag_effect(self, tag_id: str) -> Optional[TagEffectMetadata]:
        """Get tag effect metadata by ID"""
        return self._tag_effects.get(tag_id)

    def list_tag_effects(self, plugin_id: Optional[str] = None) -> List[TagEffectMetadata]:
        """
        List all registered tag effects, sorted by priority.

        Args:
            plugin_id: Optional filter by plugin ID

        Returns:
            List of tag effect metadata (sorted by priority, lower first)
        """
        effects = list(self._tag_effects.values())

        if plugin_id:
            effects = [e for e in effects if e.plugin_id == plugin_id]

        # Sort by priority (lower = higher priority)
        effects.sort(key=lambda e: e.priority)

        return effects

    def evaluate_tag_effect(
        self,
        tag_id: str,
        activity: Dict[str, Any],
        archetype: Optional[Dict[str, Any]],
        context: Dict[str, Any],
    ) -> float:
        """
        Evaluate a tag effect and return the multiplier.

        Checks in order:
        1. Archetype's custom tagEffects (per-archetype override)
        2. Registered tag effect (plugin/core)
        3. Default 1.0 (no effect)

        Args:
            tag_id: Tag to evaluate
            activity: Activity being scored
            archetype: NPC's archetype (may have custom tagEffects)
            context: Scoring context

        Returns:
            Multiplier (0.0 to 10.0 typically)
        """
        # 1. Check archetype's custom tagEffects (highest priority)
        if archetype:
            behavior_mods = archetype.get("behaviorModifiers", {})
            tag_effects = behavior_mods.get("tagEffects", {})
            if tag_id in tag_effects:
                effect = tag_effects[tag_id]
                if isinstance(effect, dict):
                    return effect.get("multiplier", 1.0)
                elif isinstance(effect, (int, float)):
                    return float(effect)

        # 2. Check registered tag effect
        metadata = self._tag_effects.get(tag_id)
        if metadata:
            try:
                return metadata.evaluator(activity, archetype, context)
            except Exception as e:
                logger.error(
                    "Tag effect evaluation failed",
                    tag_id=tag_id,
                    plugin_id=metadata.plugin_id,
                    error=str(e),
                )
                return metadata.default_multiplier

        # 3. No effect registered - return neutral
        return 1.0

    # ===== BEHAVIOR PROFILE REGISTRATION =====

    def register_behavior_profile(
        self,
        profile_id: str,
        plugin_id: str,
        name: str,
        conditions: List[Dict[str, Any]],
        modifiers: Dict[str, Any],
        condition_evaluator: Optional[Callable] = None,
        priority: int = 100,
        exclusivity_group: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
    ) -> bool:
        """
        Register a behavior profile for contextual behavior modification.

        Behavior profiles activate when their conditions are met and apply
        modifiers on top of archetype settings. They follow a deterministic
        layering order based on priority.

        Args:
            profile_id: Unique ID (e.g., 'plugin:romance:romantic_evening')
                        Must be namespaced with plugin_id for plugin profiles.
            plugin_id: Plugin registering this profile ('core' for built-ins)
            name: Display name
            conditions: List of condition dicts (ALL must be met)
                        Each dict has 'type' and type-specific fields.
            modifiers: Modifier dict with keys like:
                       - activityWeights: {activity_id: multiplier}
                       - categoryWeights: {category: multiplier}
                       - tagEffects: {tag: multiplier}
                       - moodAdjustments: {mood_axis: delta}
            condition_evaluator: Optional custom evaluator (context) -> bool
                                 If provided, used instead of condition list.
            priority: Layering priority (higher = applied later, can override)
            exclusivity_group: Only one profile per group active (highest wins)
            description: Human-readable description
            tags: Tags for categorization

        Returns:
            True if registered, False if already exists or locked

        Example:
            register_behavior_profile(
                profile_id="plugin:romance:romantic_evening",
                plugin_id="romance",
                name="Romantic Evening",
                conditions=[
                    {"type": "time_window", "windows": ["evening", "night"]},
                    {"type": "relationship_tier", "min_tier": "lover"},
                ],
                modifiers={
                    "activityWeights": {"intimate_conversation": 2.0, "dining": 1.5},
                    "categoryWeights": {"romantic": 1.5},
                    "moodAdjustments": {"romantic": 20},
                },
                priority=150,
                exclusivity_group="time_of_day_mood",
                description="Boosts romantic activities during evening with lover",
            )
        """
        if self._locked:
            logger.warning(
                "Cannot register behavior profile - registry is locked",
                profile_id=profile_id,
                plugin_id=plugin_id,
            )
            return False

        if profile_id in self._behavior_profiles:
            logger.warning(
                "Behavior profile already registered",
                profile_id=profile_id,
                existing_plugin=self._behavior_profiles[profile_id].plugin_id,
                new_plugin=plugin_id,
            )
            return False

        # Validate namespacing for plugin profiles
        if plugin_id != "core" and not profile_id.startswith(f"plugin:{plugin_id}:"):
            logger.warning(
                "Plugin profile ID should be namespaced",
                profile_id=profile_id,
                expected_prefix=f"plugin:{plugin_id}:",
            )
            # Allow but warn - don't block registration

        self._behavior_profiles[profile_id] = BehaviorProfileMetadata(
            profile_id=profile_id,
            plugin_id=plugin_id,
            name=name,
            conditions=conditions,
            modifiers=modifiers,
            condition_evaluator=condition_evaluator,
            priority=priority,
            exclusivity_group=exclusivity_group,
            description=description,
            tags=tags or [],
        )

        logger.info(
            "Registered behavior profile",
            profile_id=profile_id,
            plugin_id=plugin_id,
            priority=priority,
            exclusivity_group=exclusivity_group,
            condition_count=len(conditions),
        )

        return True

    def get_behavior_profile(self, profile_id: str) -> Optional[BehaviorProfileMetadata]:
        """Get behavior profile metadata by ID"""
        return self._behavior_profiles.get(profile_id)

    def list_behavior_profiles(
        self,
        plugin_id: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> List[BehaviorProfileMetadata]:
        """
        List all registered behavior profiles, sorted by priority.

        Args:
            plugin_id: Optional filter by plugin ID
            tag: Optional filter by tag

        Returns:
            List of profile metadata (sorted by priority ascending)
        """
        profiles = list(self._behavior_profiles.values())

        if plugin_id:
            profiles = [p for p in profiles if p.plugin_id == plugin_id]

        if tag:
            profiles = [p for p in profiles if tag in p.tags]

        # Sort by priority (ascending - lower priority first)
        profiles.sort(key=lambda p: p.priority)

        return profiles

    def get_active_profiles(
        self,
        context: Dict[str, Any],
        enabled_plugins: Optional[List[str]] = None,
    ) -> List[BehaviorProfileMetadata]:
        """
        Get all currently active behavior profiles for a context.

        Evaluates conditions for all profiles and returns those that
        are active, respecting exclusivity groups.

        Args:
            context: Evaluation context (npc, world, session, etc.)
            enabled_plugins: List of enabled plugin IDs (None = all enabled)

        Returns:
            List of active profiles, sorted by priority (lower first)
        """
        active_profiles = []
        exclusivity_winners: Dict[str, BehaviorProfileMetadata] = {}

        for profile in self._behavior_profiles.values():
            # Check if plugin is enabled
            if enabled_plugins is not None:
                if profile.plugin_id not in enabled_plugins and profile.plugin_id != "core":
                    continue

            # Evaluate conditions
            is_active = self._evaluate_profile_conditions(profile, context)

            if is_active:
                # Handle exclusivity groups
                if profile.exclusivity_group:
                    existing = exclusivity_winners.get(profile.exclusivity_group)
                    if existing is None or profile.priority > existing.priority:
                        exclusivity_winners[profile.exclusivity_group] = profile
                else:
                    active_profiles.append(profile)

        # Add exclusivity winners
        active_profiles.extend(exclusivity_winners.values())

        # Sort by priority (ascending - lower priority applied first)
        active_profiles.sort(key=lambda p: p.priority)

        return active_profiles

    def _evaluate_profile_conditions(
        self,
        profile: BehaviorProfileMetadata,
        context: Dict[str, Any],
    ) -> bool:
        """
        Evaluate whether a profile's conditions are met.

        Args:
            profile: Profile to evaluate
            context: Evaluation context

        Returns:
            True if ALL conditions are met
        """
        # Use custom evaluator if provided
        if profile.condition_evaluator:
            try:
                return bool(profile.condition_evaluator(context))
            except Exception as e:
                logger.error(
                    "Profile condition evaluator failed",
                    profile_id=profile.profile_id,
                    error=str(e),
                )
                return False

        # Evaluate standard conditions (ALL must be true)
        for condition in profile.conditions:
            if not self._evaluate_single_condition(condition, context):
                return False

        return True

    def _evaluate_single_condition(
        self,
        condition: Dict[str, Any],
        context: Dict[str, Any],
    ) -> bool:
        """
        Evaluate a single profile condition.

        Args:
            condition: Condition dict with 'type' and type-specific fields
            context: Evaluation context

        Returns:
            True if condition is met
        """
        condition_type = condition.get("type", "")

        if condition_type == "time_window":
            return self._eval_time_window_condition(condition, context)
        elif condition_type == "relationship_tier":
            return self._eval_relationship_tier_condition(condition, context)
        elif condition_type == "flag":
            return self._eval_flag_condition(condition, context)
        elif condition_type == "location":
            return self._eval_location_condition(condition, context)
        elif condition_type == "mood":
            return self._eval_mood_condition(condition, context)
        elif condition_type == "energy":
            return self._eval_energy_condition(condition, context)
        elif condition_type == "expression":
            return self._eval_expression_condition(condition, context)
        else:
            logger.warning(
                "Unknown profile condition type",
                condition_type=condition_type,
            )
            return False

    def _eval_time_window_condition(self, condition: Dict, context: Dict) -> bool:
        """Evaluate time_window condition."""
        windows = condition.get("windows", [])
        if not windows:
            return True

        world_time = context.get("world_time", 0)

        # Convert world_time (seconds since Monday 00:00) to hour
        hour = (world_time // 3600) % 24

        # Map hour to window
        if 5 <= hour < 12:
            current_window = "morning"
        elif 12 <= hour < 17:
            current_window = "afternoon"
        elif 17 <= hour < 21:
            current_window = "evening"
        else:
            current_window = "night"

        return current_window in windows

    def _eval_relationship_tier_condition(self, condition: Dict, context: Dict) -> bool:
        """Evaluate relationship_tier condition."""
        min_tier = condition.get("min_tier")
        max_tier = condition.get("max_tier")

        # Get current relationship tier from context
        npc_state = context.get("npc_state", {})
        current_tier = npc_state.get("relationship_tier", "stranger")

        # Define tier order
        tier_order = ["stranger", "acquaintance", "friend", "close_friend", "lover", "partner"]

        try:
            current_idx = tier_order.index(current_tier)
        except ValueError:
            current_idx = 0

        if min_tier:
            try:
                min_idx = tier_order.index(min_tier)
                if current_idx < min_idx:
                    return False
            except ValueError:
                pass

        if max_tier:
            try:
                max_idx = tier_order.index(max_tier)
                if current_idx > max_idx:
                    return False
            except ValueError:
                pass

        return True

    def _eval_flag_condition(self, condition: Dict, context: Dict) -> bool:
        """Evaluate flag condition."""
        flag_name = condition.get("flag")
        expected_value = condition.get("flag_value")

        if not flag_name:
            return True

        flags = context.get("flags", {})
        actual_value = flags.get(flag_name)

        if expected_value is None:
            # Just check existence
            return actual_value is not None
        else:
            return actual_value == expected_value

    def _eval_location_condition(self, condition: Dict, context: Dict) -> bool:
        """Evaluate location condition."""
        location_type = condition.get("location_type")
        location_tags = condition.get("location_tags", [])

        npc_state = context.get("npc_state", {})
        current_location = npc_state.get("location", {})

        if location_type:
            if current_location.get("type") != location_type:
                return False

        if location_tags:
            current_tags = current_location.get("tags", [])
            if not all(tag in current_tags for tag in location_tags):
                return False

        return True

    def _eval_mood_condition(self, condition: Dict, context: Dict) -> bool:
        """Evaluate mood condition."""
        mood_tags = condition.get("mood_tags", [])
        min_valence = condition.get("min_valence")
        max_valence = condition.get("max_valence")

        npc_state = context.get("npc_state", {})
        mood_state = npc_state.get("moodState", {})

        if mood_tags:
            current_tags = mood_state.get("tags", [])
            if not any(tag in current_tags for tag in mood_tags):
                return False

        valence = mood_state.get("valence", 0)

        if min_valence is not None and valence < min_valence:
            return False

        if max_valence is not None and valence > max_valence:
            return False

        return True

    def _eval_energy_condition(self, condition: Dict, context: Dict) -> bool:
        """Evaluate energy condition."""
        min_energy = condition.get("min_energy")
        max_energy = condition.get("max_energy")

        npc_state = context.get("npc_state", {})
        energy = npc_state.get("energy", 50)

        if min_energy is not None and energy < min_energy:
            return False

        if max_energy is not None and energy > max_energy:
            return False

        return True

    def _eval_expression_condition(self, condition: Dict, context: Dict) -> bool:
        """Evaluate expression condition (simple eval for now)."""
        expression = condition.get("expression")
        if not expression:
            return True

        # For safety, only allow simple comparisons
        # A more robust implementation would use a safe expression evaluator
        logger.warning(
            "Expression conditions not fully implemented",
            expression=expression,
        )
        return True

    # ===== TRAIT EFFECT MAPPING REGISTRATION (Phase 4) =====

    def register_trait_effect_mapping(
        self,
        trait_id: str,
        plugin_id: str,
        mappings: Dict[str, List[Dict[str, Any]]],
        description: Optional[str] = None,
    ) -> bool:
        """
        Register trait effect mappings for a trait.

        Mappings define what behavioral effects are produced when a trait
        is at a specific level (very_low, low, medium, high, very_high).

        Args:
            trait_id: Trait identifier (e.g., 'introversion', 'neuroticism')
            plugin_id: Plugin registering this mapping ('core' for built-ins)
            mappings: Dict of level -> list of effects
                      e.g., {"high": [{"type": "activity_preference", ...}]}
            description: Human-readable description

        Returns:
            True if registered, False if already exists or locked

        Example:
            register_trait_effect_mapping(
                trait_id="introversion",
                plugin_id="core",
                mappings={
                    "high": [
                        {"type": "activity_preference", "tags": ["solitary"], "modifier": "preferred"},
                        {"type": "category_weight", "categories": {"social": "low"}},
                    ],
                    "low": [
                        {"type": "activity_preference", "tags": ["parties"], "modifier": "preferred"},
                        {"type": "category_weight", "categories": {"social": "high"}},
                    ],
                },
                description="How introversion affects activity preferences",
            )
        """
        if self._locked:
            logger.warning(
                "Cannot register trait effect mapping - registry is locked",
                trait_id=trait_id,
                plugin_id=plugin_id,
            )
            return False

        if trait_id in self._trait_effect_mappings:
            logger.warning(
                "Trait effect mapping already registered",
                trait_id=trait_id,
                new_plugin=plugin_id,
            )
            return False

        self._trait_effect_mappings[trait_id] = mappings

        logger.info(
            "Registered trait effect mapping",
            trait_id=trait_id,
            plugin_id=plugin_id,
            levels=list(mappings.keys()),
        )

        return True

    def get_trait_effect_mapping(self, trait_id: str) -> Optional[Dict[str, List[Dict]]]:
        """Get trait effect mapping by trait ID."""
        return self._trait_effect_mappings.get(trait_id)

    def list_trait_effect_mappings(self) -> Dict[str, Dict[str, List[Dict]]]:
        """Get all registered trait effect mappings."""
        return dict(self._trait_effect_mappings)

    def get_all_metrics(self) -> Dict[str, Dict[str, Any]]:
        """
        Get all registered metrics from all component schemas.

        Returns:
            Dict of metricId -> metric definition

        Example:
            {
                "npcRelationship.arousal": {
                    "type": "float",
                    "min": 0,
                    "max": 1,
                    "component": "plugin:game-romance",
                    "source": "game-romance"
                },
                "npcRelationship.suspicion": {
                    "type": "float",
                    "min": 0,
                    "max": 1,
                    "component": "plugin:game-stealth",
                    "source": "game-stealth"
                }
            }
        """
        all_metrics = {}

        for schema_meta in self._component_schemas.values():
            for metric_id, metric_def in schema_meta.metrics.items():
                # Merge with source plugin info
                metric_with_source = {**metric_def, "source": schema_meta.plugin_id}
                all_metrics[metric_id] = metric_with_source

        return all_metrics

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
            component_schemas=len(self._component_schemas),
            scoring_factors=len(self._scoring_factors),
            tag_effects=len(self._tag_effects),
            behavior_profiles=len(self._behavior_profiles),
        )

    def unlock(self):
        """Unlock the registry (for hot-reloading, testing)"""
        self._locked = False
        logger.info("Behavior extension registry unlocked")

    def clear(self):
        """Clear all registrations (for testing)"""
        for registry in self._sub_registries.values():
            registry.clear()
        self._trait_effect_mappings.clear()
        logger.info("Behavior extension registry cleared")

    def unregister_by_plugin(self, plugin_id: str) -> Dict[str, int]:
        """
        Unregister all extensions from a specific plugin.

        Use this when a plugin is disabled or unloaded to clean up
        all its registered extensions.

        Args:
            plugin_id: Plugin ID to unregister

        Returns:
            Dict with counts of removed items per extension type

        Note: Respects lock - returns empty counts if locked.
        """
        if self._locked:
            logger.warning(
                "Cannot unregister by plugin - registry is locked",
                plugin_id=plugin_id,
            )
            return {name: 0 for name in self._sub_registries}

        counts = self._registry_group.unregister_by_plugin(plugin_id)

        total = sum(counts.values())
        if total > 0:
            logger.info(
                "Unregistered plugin extensions",
                plugin_id=plugin_id,
                **counts,
            )

        return counts

    # ===== STATISTICS =====

    def get_stats(self) -> Dict[str, Any]:
        """Get registry statistics"""
        stats: Dict[str, Any] = {"locked": self._locked}

        for name, registry in self._sub_registries.items():
            stats[name] = {
                "total": len(registry),
                "by_plugin": self._count_by_plugin(registry.values()),
            }

        # Special case: component_schemas has additional metrics count
        stats["component_schemas"]["total_metrics"] = sum(
            len(s.metrics) for s in self._component_schemas.values()
        )

        # Special case: trait_effect_mappings not in _sub_registries
        stats["trait_effect_mappings"] = {
            "total": len(self._trait_effect_mappings),
            "traits": list(self._trait_effect_mappings.keys()),
        }

        return stats

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

# Register with central plugin tracking (BehaviorExtensionRegistry doesn't inherit RegistryBase)
from pixsim7.backend.main.lib.registry.base import RegistryBase
RegistryBase.register_plugin_aware(behavior_registry)


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

    # Evaluate condition (with error handling, timing, and metrics)
    import time
    start_time = time.perf_counter()
    try:
        result = metadata.evaluator(context)
        success = bool(result)

        # Warn about slow callbacks (> 100ms)
        duration_ms = (time.perf_counter() - start_time) * 1000
        if duration_ms > 100:
            logger.warning(
                "Slow condition evaluation",
                condition_id=condition_id,
                plugin_id=metadata.plugin_id,
                duration_ms=round(duration_ms, 2),
            )

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

        # Track failure metrics with error classification
        from .observability import metrics_tracker
        metrics_tracker.record_condition_evaluation(metadata.plugin_id, success=False)
        metrics_tracker.record_error(
            metadata.plugin_id,
            "ConditionEvaluationError",
            str(e),
            {
                "condition_id": condition_id,
                "error_type": type(e).__name__,
                "is_plugin_error": True,  # Distinguishes from "plugin disabled" or "missing context"
            },
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

    # Apply effect (with error handling, timing, and metrics)
    import time
    start_time = time.perf_counter()
    try:
        result = metadata.handler(context, merged_params)

        # Warn about slow callbacks (> 100ms)
        duration_ms = (time.perf_counter() - start_time) * 1000
        if duration_ms > 100:
            logger.warning(
                "Slow effect application",
                effect_id=effect_id,
                plugin_id=metadata.plugin_id,
                duration_ms=round(duration_ms, 2),
            )

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

        # Track failure metrics with error classification
        from .observability import metrics_tracker
        metrics_tracker.record_effect_application(metadata.plugin_id, success=False)
        metrics_tracker.record_error(
            metadata.plugin_id,
            "EffectApplicationError",
            str(e),
            {
                "effect_id": effect_id,
                "error_type": type(e).__name__,
                "is_plugin_error": True,  # Distinguishes from "plugin disabled"
            },
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
