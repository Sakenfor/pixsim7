"""Activation Condition Evaluation for Generic Links

Provides simple JSON matching to evaluate activation conditions for links.
Uses dot-notation for nested field access (e.g., "location.zone").

Activation conditions allow links to be context-aware:
- Location-based: {"location.zone": "downtown"}
- Time-based: {"time.period": "night"} (with alias support for fantasy worlds)
- State-based: {"player.level": 10}

Time Period Aliases (Template Portability):
    Templates can use standard period terms ("day", "night", "morning") which
    are resolved to world-specific periods through the alias system.

    Example: A template with {"time.period": "night"} will match:
    - "night" period (direct match)
    - "witching_hour" if that period has "night" in its aliases
    - Any period listed in the "night" alias (e.g., "evening|night")

Usage:
    conditions = {"location.zone": "downtown", "time.period": "night"}
    context = {"location": {"zone": "downtown"}, "time": {"period": "evening"}}
    time_config = world.meta.time_config  # With "night" alias → "evening|night"

    if evaluate_activation(conditions, context, time_config=time_config):
        # Link is active - "evening" matches "night" alias
        ...
"""
from typing import Dict, Any, Optional, TYPE_CHECKING
from pixsim7.backend.main.services.prompt.context.mapping import get_nested_value

if TYPE_CHECKING:
    from pixsim7.backend.main.domain.game.time import WorldTimeConfig


def _get_context_value(context: Dict[str, Any], path: str) -> Any:
    """Read context values from either nested objects or flat dot-keys."""
    value = get_nested_value(context, path)
    if value is not None:
        return value
    return context.get(path)


def evaluate_activation(
    conditions: Optional[Dict[str, Any]],
    context: Dict[str, Any],
    time_config: Optional["WorldTimeConfig"] = None,
) -> bool:
    """Evaluate activation conditions against a runtime context

    Uses simple JSON matching with dot-notation support for nested paths.
    All conditions must match for the link to be considered active.

    Special handling for time conditions:
    - "time.period": Uses alias resolution for template portability
    - "time.dayFlags": Checks if current day has the specified flag

    Args:
        conditions: Activation conditions dict (dot-notation keys)
                   None or empty dict means always active
        context: Runtime context dict to evaluate against
        time_config: Optional world time config for alias resolution.
                    Uses DEFAULT_WORLD_TIME_CONFIG if not provided.

    Returns:
        True if all conditions match (or no conditions), False otherwise

    Examples:
        # No conditions - always active
        evaluate_activation(None, {})  # True
        evaluate_activation({}, {})    # True

        # Simple condition
        evaluate_activation(
            {"zone": "downtown"},
            {"zone": "downtown"}
        )  # True

        # Nested dot-notation condition
        evaluate_activation(
            {"location.zone": "downtown"},
            {"location": {"zone": "downtown"}}
        )  # True

        # Time period with alias support
        # If time_config has alias "night" → "evening|night"
        evaluate_activation(
            {"time.period": "night"},
            {"time": {"period": "evening"}},
            time_config=time_config
        )  # True - "evening" matches "night" alias

        # Day flag condition
        # If day 4 has specialFlags=["market_day"]
        evaluate_activation(
            {"time.dayFlags": "market_day"},
            {"time": {"dayOfWeek": 4}},
            time_config=time_config
        )  # True

        # Condition mismatch
        evaluate_activation(
            {"location.zone": "downtown"},
            {"location": {"zone": "suburbs"}}
        )  # False
    """
    if not conditions:
        return True  # No conditions = always active

    from pixsim7.backend.main.domain.game.time import (
        DEFAULT_WORLD_TIME_CONFIG,
        period_matches_target,
        day_has_flag,
    )

    if time_config is None:
        time_config = DEFAULT_WORLD_TIME_CONFIG

    for key, expected_value in conditions.items():
        # Special handling for time.period with alias support
        if key == "time.period":
            actual_period = _get_context_value(context, "time.period")
            if actual_period is None:
                return False
            if not period_matches_target(str(actual_period), str(expected_value), time_config):
                return False
            continue

        # Special handling for time.dayFlags
        if key == "time.dayFlags":
            day_of_week = _get_context_value(context, "time.dayOfWeek")
            if day_of_week is None:
                return False
            if not day_has_flag(int(day_of_week), str(expected_value), time_config):
                return False
            continue

        # Standard equality check with dot-notation support
        context_value = _get_context_value(context, key)
        if context_value != expected_value:
            return False

    return True


def evaluate_activation_for_link(
    link: Any,
    context: Dict[str, Any],
    time_config: Optional["WorldTimeConfig"] = None,
) -> bool:
    """Evaluate activation conditions for an ObjectLink

    Convenience wrapper that extracts activation_conditions from a link
    and evaluates them against the context.

    Args:
        link: ObjectLink instance with activation_conditions attribute
        context: Runtime context dict
        time_config: Optional world time config for alias resolution

    Returns:
        True if link is active in this context, False otherwise

    Example:
        link = ObjectLink(
            activation_conditions={"location.zone": "downtown"}
        )
        context = {"location": {"zone": "downtown"}}

        if evaluate_activation_for_link(link, context):
            # Link is active
            ...
    """
    return evaluate_activation(
        getattr(link, 'activation_conditions', None),
        context,
        time_config=time_config,
    )


def filter_active_links(
    links: list[Any],
    context: Dict[str, Any],
    time_config: Optional["WorldTimeConfig"] = None,
) -> list[Any]:
    """Filter a list of links to only those active in the given context

    Args:
        links: List of ObjectLink instances
        context: Runtime context dict
        time_config: Optional world time config for alias resolution

    Returns:
        List of links that are active in this context

    Example:
        links = [
            ObjectLink(activation_conditions={"time.period": "night"}),
            ObjectLink(activation_conditions={"time.period": "day"}),
            ObjectLink(activation_conditions=None),  # Always active
        ]
        context = {"time": {"period": "evening"}}
        # With time_config alias "night" → "evening|night"

        active = filter_active_links(links, context, time_config)
        # Returns: [first link, third link]
    """
    return [
        link for link in links
        if evaluate_activation_for_link(link, context, time_config)
    ]


def get_highest_priority_active_link(
    links: list[Any],
    context: Dict[str, Any],
    time_config: Optional["WorldTimeConfig"] = None,
) -> Optional[Any]:
    """Get the highest-priority active link from a list

    Filters links by activation conditions, then returns the one
    with the highest priority value.

    Args:
        links: List of ObjectLink instances
        context: Runtime context dict
        time_config: Optional world time config for alias resolution

    Returns:
        Highest-priority active link, or None if no links are active

    Example:
        links = [
            ObjectLink(priority=5, activation_conditions={"zone": "A"}),
            ObjectLink(priority=10, activation_conditions={"zone": "B"}),
            ObjectLink(priority=15, activation_conditions=None),
        ]
        context = {"zone": "A"}

        link = get_highest_priority_active_link(links, context)
        # Returns: link with priority=15 (always active, highest priority)
    """
    active_links = filter_active_links(links, context, time_config)

    if not active_links:
        return None

    # Sort by priority (descending) and return the first
    return sorted(
        active_links,
        key=lambda link: getattr(link, 'priority', 0),
        reverse=True
    )[0]
