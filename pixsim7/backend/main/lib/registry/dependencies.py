"""
Dependency resolution utilities for registry systems.

Provides topological sorting for package/plugin load order based on dependencies.
Used by PluginManager, DomainModelRegistry, Brain derivations, and similar systems.
"""

from __future__ import annotations

from typing import Callable, Dict, Iterable, List, Optional, Set, TypeVar

T = TypeVar("T")


class CircularDependencyError(ValueError):
    """Raised when circular dependencies are detected."""

    def __init__(self, item_id: str, cycle_path: Optional[List[str]] = None):
        self.item_id = item_id
        self.cycle_path = cycle_path or []
        cycle_str = " -> ".join(self.cycle_path) if self.cycle_path else item_id
        super().__init__(f"Circular dependency detected: {cycle_str}")


class MissingDependencyError(ValueError):
    """Raised when a required dependency is not found."""

    def __init__(self, item_id: str, missing_dep: str):
        self.item_id = item_id
        self.missing_dep = missing_dep
        super().__init__(f"Missing dependency: '{missing_dep}' required by '{item_id}'")


def resolve_load_order(
    dependencies: Dict[str, Iterable[str]],
    strict: bool = True,
) -> List[str]:
    """
    Resolve load order using topological sort (Kahn's algorithm variant).

    Args:
        dependencies: Mapping of item_id -> list of dependency IDs.
            Example: {"a": ["b", "c"], "b": [], "c": ["b"]}
            Means: 'a' depends on 'b' and 'c', 'c' depends on 'b'

        strict: If True, raise MissingDependencyError for unknown deps.
            If False, ignore unknown dependencies.

    Returns:
        List of item IDs in load order (dependencies first).
        Example: ["b", "c", "a"]

    Raises:
        CircularDependencyError: If circular dependencies detected.
        MissingDependencyError: If strict=True and dependency not in dict.

    Example:
        >>> deps = {"plugin_a": ["core"], "core": [], "plugin_b": ["plugin_a"]}
        >>> resolve_load_order(deps)
        ['core', 'plugin_a', 'plugin_b']
    """
    # Track state
    loaded: Set[str] = set()
    load_order: List[str] = []
    visiting: Set[str] = set()  # For cycle detection

    def visit(item_id: str, path: List[str]) -> None:
        if item_id in loaded:
            return

        if item_id in visiting:
            # Found cycle - build path for error message
            cycle_start = path.index(item_id)
            cycle_path = path[cycle_start:] + [item_id]
            raise CircularDependencyError(item_id, cycle_path)

        visiting.add(item_id)
        path.append(item_id)

        # Visit dependencies first
        item_deps = dependencies.get(item_id, [])
        for dep_id in item_deps:
            if dep_id not in dependencies:
                if strict:
                    raise MissingDependencyError(item_id, dep_id)
                # Skip unknown deps in non-strict mode
                continue
            visit(dep_id, path)

        path.pop()
        visiting.remove(item_id)
        loaded.add(item_id)
        load_order.append(item_id)

    # Visit all items
    for item_id in dependencies:
        visit(item_id, [])

    return load_order


def resolve_load_order_with_getter(
    items: Dict[str, T],
    get_dependencies: Callable[[T], Iterable[str]],
    strict: bool = True,
) -> List[str]:
    """
    Resolve load order using a dependency getter function.

    Convenience wrapper when dependencies are stored in item objects.

    Args:
        items: Mapping of item_id -> item object.
        get_dependencies: Function to extract dependency IDs from an item.
        strict: If True, raise on missing dependencies.

    Returns:
        List of item IDs in load order.

    Example:
        >>> @dataclass
        ... class Plugin:
        ...     deps: list[str]
        ...
        >>> plugins = {
        ...     "a": Plugin(deps=["b"]),
        ...     "b": Plugin(deps=[]),
        ... }
        >>> resolve_load_order_with_getter(plugins, lambda p: p.deps)
        ['b', 'a']
    """
    dependencies = {
        item_id: list(get_dependencies(item)) for item_id, item in items.items()
    }
    return resolve_load_order(dependencies, strict=strict)


def find_dependents(
    item_id: str,
    dependencies: Dict[str, Iterable[str]],
    recursive: bool = False,
) -> Set[str]:
    """
    Find all items that depend on the given item.

    Useful for determining what needs to be reloaded when an item changes.

    Args:
        item_id: The item to find dependents of.
        dependencies: Mapping of item_id -> dependency IDs.
        recursive: If True, find transitive dependents.

    Returns:
        Set of item IDs that depend on item_id.

    Example:
        >>> deps = {"a": ["b"], "b": ["c"], "c": []}
        >>> find_dependents("c", deps, recursive=False)
        {'b'}
        >>> find_dependents("c", deps, recursive=True)
        {'a', 'b'}
    """
    # Build reverse mapping (item -> dependents)
    dependents: Dict[str, Set[str]] = {k: set() for k in dependencies}
    for dependent_id, dep_list in dependencies.items():
        for dep_id in dep_list:
            if dep_id in dependents:
                dependents[dep_id].add(dependent_id)

    if not recursive:
        return dependents.get(item_id, set())

    # BFS for transitive dependents
    result: Set[str] = set()
    queue = list(dependents.get(item_id, set()))

    while queue:
        current = queue.pop(0)
        if current in result:
            continue
        result.add(current)
        queue.extend(dependents.get(current, set()))

    return result
