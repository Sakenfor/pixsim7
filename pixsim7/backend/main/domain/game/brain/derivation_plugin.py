"""
Derivation plugin protocol and base class.

Derivation plugins compute derived values from stat packages.
They declare which packages they need, and the engine only runs
them if those packages are available in the world.
"""

from typing import List, Optional, Protocol, runtime_checkable
from .types import DerivationContext, DerivationResult


@runtime_checkable
class DerivationPlugin(Protocol):
    """
    Protocol for brain derivation plugins.

    Plugins compute derived values from stat packages.
    They declare which packages they need, and the engine
    only runs them if those packages are available.

    Example plugin that derives mood from relationships:

        class MoodFromRelationships(BaseDerivationPlugin):
            @property
            def id(self) -> str:
                return "mood_from_relationships"

            @property
            def required_stats(self) -> List[str]:
                return ["relationships"]

            def compute(self, context: DerivationContext) -> Optional[DerivationResult]:
                rel = context.stats["relationships"]
                valence = rel.axes.get("affinity", 50) * 0.6 + rel.axes.get("chemistry", 50) * 0.4
                return DerivationResult(key="mood", value={"valence": valence, ...})
    """

    @property
    def id(self) -> str:
        """Unique plugin ID (e.g., 'mood_from_relationships')."""
        ...

    @property
    def name(self) -> str:
        """Human-readable name."""
        ...

    @property
    def required_stats(self) -> List[str]:
        """
        Stat definition IDs this plugin requires.
        Plugin only runs if ALL are present.
        e.g., ['relationships'] or ['mood', 'personality']
        """
        ...

    @property
    def optional_stats(self) -> List[str]:
        """
        Stat definition IDs this plugin can use but doesn't require.
        e.g., ['resources'] - will use if available
        """
        ...

    @property
    def depends_on(self) -> List[str]:
        """
        Other derivation plugin IDs that must run first.
        For chaining derivations.
        e.g., ['mood_from_relationships'] must run before ['behavior_from_mood']
        """
        ...

    @property
    def priority(self) -> int:
        """
        Execution priority (higher = runs first among same dependency level).
        Default: 50
        """
        ...

    def compute(self, context: DerivationContext) -> Optional[DerivationResult]:
        """
        Compute the derived value.

        Returns None if computation should be skipped.
        Can access context.stats for raw stats, context.derived for
        previously computed derivations.

        Use context.get_plugin_config(self.id) to access plugin-specific
        configuration from world meta.
        """
        ...


class BaseDerivationPlugin:
    """
    Base class with sensible defaults for derivation plugins.

    Subclass this and override id, name, required_stats, and compute().
    """

    @property
    def id(self) -> str:
        raise NotImplementedError("Subclass must implement id property")

    @property
    def name(self) -> str:
        raise NotImplementedError("Subclass must implement name property")

    @property
    def required_stats(self) -> List[str]:
        raise NotImplementedError("Subclass must implement required_stats property")

    @property
    def optional_stats(self) -> List[str]:
        return []

    @property
    def depends_on(self) -> List[str]:
        return []

    @property
    def priority(self) -> int:
        return 50

    def compute(self, context: DerivationContext) -> Optional[DerivationResult]:
        raise NotImplementedError("Subclass must implement compute method")
