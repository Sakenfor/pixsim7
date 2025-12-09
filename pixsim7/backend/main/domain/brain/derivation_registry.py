"""
Registry for brain derivation plugins.

Handles plugin registration, dependency resolution, and conditional
execution based on available stats and world configuration.
"""

from typing import Dict, List, Optional, Set, Any
import logging

from .derivation_plugin import DerivationPlugin
from .types import DerivationContext, DerivationResult, BrainStatSnapshot

logger = logging.getLogger(__name__)


class DerivationRegistry:
    """
    Registry for brain derivation plugins.

    Handles:
    - Plugin registration/discovery
    - Dependency resolution (topological sort)
    - Conditional execution based on available stats
    - Per-world plugin filtering via allowed_plugin_ids
    """

    def __init__(self):
        self._plugins: Dict[str, DerivationPlugin] = {}

    def register(self, plugin: DerivationPlugin) -> None:
        """Register a derivation plugin."""
        if plugin.id in self._plugins:
            logger.warning(f"Overwriting derivation plugin: {plugin.id}")
        self._plugins[plugin.id] = plugin
        logger.info(
            f"Registered derivation plugin: {plugin.id} "
            f"(requires: {plugin.required_stats}, optional: {plugin.optional_stats})"
        )

    def unregister(self, plugin_id: str) -> None:
        """Unregister a derivation plugin."""
        self._plugins.pop(plugin_id, None)

    def get(self, plugin_id: str) -> Optional[DerivationPlugin]:
        """Get a plugin by ID."""
        return self._plugins.get(plugin_id)

    def list_plugins(self) -> List[DerivationPlugin]:
        """List all registered plugins."""
        return list(self._plugins.values())

    def get_applicable_plugins(
        self,
        available_stats: Set[str],
        allowed_plugin_ids: Optional[Set[str]] = None,
    ) -> List[DerivationPlugin]:
        """
        Get plugins that can run given the available stat definitions.

        A plugin is applicable if:
        1. All its required_stats are in available_stats
        2. It's in allowed_plugin_ids (if specified, per-world filtering)

        Args:
            available_stats: Set of stat definition IDs available in world
            allowed_plugin_ids: Optional set of plugin IDs allowed by world config.
                               If None, all plugins are allowed.

        Returns:
            Plugins in dependency-resolved, priority-sorted order.
        """
        applicable: List[DerivationPlugin] = []

        for plugin in self._plugins.values():
            # Check world-level allowlist
            if allowed_plugin_ids is not None and plugin.id not in allowed_plugin_ids:
                continue

            # Check required stats are available
            required = set(plugin.required_stats)
            if required.issubset(available_stats):
                applicable.append(plugin)

        return self._resolve_execution_order(applicable)

    def _resolve_execution_order(self, plugins: List[DerivationPlugin]) -> List[DerivationPlugin]:
        """
        Sort plugins by dependencies, then by priority within each level.

        Uses Kahn's algorithm for topological sort.
        """
        if not plugins:
            return []

        plugin_map = {p.id: p for p in plugins}
        plugin_ids = set(plugin_map.keys())

        # Build dependency graph (only for plugins in our list)
        in_degree: Dict[str, int] = {pid: 0 for pid in plugin_ids}
        dependents: Dict[str, List[str]] = {pid: [] for pid in plugin_ids}

        for plugin in plugins:
            for dep_id in plugin.depends_on:
                if dep_id in plugin_ids:
                    in_degree[plugin.id] += 1
                    dependents[dep_id].append(plugin.id)

        # Kahn's algorithm with priority tie-breaking
        result: List[DerivationPlugin] = []
        ready = [pid for pid, deg in in_degree.items() if deg == 0]

        while ready:
            # Sort by priority (descending) for deterministic order
            ready.sort(key=lambda pid: -plugin_map[pid].priority)
            current = ready.pop(0)
            result.append(plugin_map[current])

            for dependent in dependents[current]:
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    ready.append(dependent)

        # Check for cycles
        if len(result) != len(plugins):
            missing = plugin_ids - {p.id for p in result}
            logger.warning(f"Circular dependency detected in derivation plugins: {missing}")

        return result

    def compute_derivations(
        self,
        stats: Dict[str, BrainStatSnapshot],
        context_base: Dict[str, Any],
        allowed_plugin_ids: Optional[Set[str]] = None,
    ) -> Dict[str, Any]:
        """
        Run all applicable derivation plugins and collect results.

        Args:
            stats: Available stat snapshots keyed by definition ID
            context_base: Base context (npc_id, world_id, world_meta, etc.)
            allowed_plugin_ids: Optional set of plugin IDs allowed by world config

        Returns:
            Dict of derivation_key -> computed value
        """
        available_stats = set(stats.keys())
        applicable = self.get_applicable_plugins(available_stats, allowed_plugin_ids)

        derived: Dict[str, Any] = {}

        context = DerivationContext(
            stats=stats,
            derived=derived,
            **context_base,
        )

        for plugin in applicable:
            try:
                result = plugin.compute(context)
                if result is not None:
                    derived[result.key] = result.value
                    # Update context for next plugins (enables chaining)
                    context.derived = derived
                    logger.debug(f"Derivation {plugin.id} produced: {result.key}")
            except Exception as e:
                logger.error(f"Derivation plugin {plugin.id} failed: {e}", exc_info=True)

        return derived


# Global registry instance
derivation_registry = DerivationRegistry()


def register_derivation(plugin: DerivationPlugin) -> None:
    """Convenience function to register a derivation plugin."""
    derivation_registry.register(plugin)


def unregister_derivation(plugin_id: str) -> None:
    """Convenience function to unregister a derivation plugin."""
    derivation_registry.unregister(plugin_id)
