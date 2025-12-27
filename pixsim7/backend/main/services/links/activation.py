"""Activation Condition Evaluation for Generic Links

Provides simple JSON matching to evaluate activation conditions for links.
Uses dot-notation for nested field access (e.g., "location.zone").

Activation conditions allow links to be context-aware:
- Location-based: {"location.zone": "downtown"}
- Time-based: {"time.hour": 18}
- State-based: {"player.level": 10}

Usage:
    conditions = {"location.zone": "downtown", "time.hour": 18}
    context = {"location": {"zone": "downtown"}, "time": {"hour": 18}}

    if evaluate_activation(conditions, context):
        # Link is active in this context
        ...
"""
from typing import Dict, Any, Optional
from pixsim7.backend.main.services.prompt.context.mapping import get_nested_value


def evaluate_activation(
    conditions: Optional[Dict[str, Any]],
    context: Dict[str, Any]
) -> bool:
    """Evaluate activation conditions against a runtime context

    Uses simple JSON matching with dot-notation support for nested paths.
    All conditions must match for the link to be considered active.

    Args:
        conditions: Activation conditions dict (dot-notation keys)
                   None or empty dict means always active
        context: Runtime context dict to evaluate against

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

        # Multiple conditions (all must match)
        evaluate_activation(
            {"location.zone": "downtown", "time.hour": 18},
            {"location": {"zone": "downtown"}, "time": {"hour": 18}}
        )  # True

        # Condition mismatch
        evaluate_activation(
            {"location.zone": "downtown"},
            {"location": {"zone": "suburbs"}}
        )  # False
    """
    if not conditions:
        return True  # No conditions = always active

    for key, expected_value in conditions.items():
        # Use get_nested_value to support dot notation (e.g., "location.zone")
        context_value = get_nested_value(context, key)

        # Exact equality check
        if context_value != expected_value:
            return False

    return True


def evaluate_activation_for_link(
    link: Any,
    context: Dict[str, Any]
) -> bool:
    """Evaluate activation conditions for an ObjectLink

    Convenience wrapper that extracts activation_conditions from a link
    and evaluates them against the context.

    Args:
        link: ObjectLink instance with activation_conditions attribute
        context: Runtime context dict

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
        context
    )


def filter_active_links(
    links: list[Any],
    context: Dict[str, Any]
) -> list[Any]:
    """Filter a list of links to only those active in the given context

    Args:
        links: List of ObjectLink instances
        context: Runtime context dict

    Returns:
        List of links that are active in this context

    Example:
        links = [
            ObjectLink(activation_conditions={"time.hour": 18}),
            ObjectLink(activation_conditions={"time.hour": 10}),
            ObjectLink(activation_conditions=None),  # Always active
        ]
        context = {"time": {"hour": 18}}

        active = filter_active_links(links, context)
        # Returns: [first link, third link]
    """
    return [
        link for link in links
        if evaluate_activation_for_link(link, context)
    ]


def get_highest_priority_active_link(
    links: list[Any],
    context: Dict[str, Any]
) -> Optional[Any]:
    """Get the highest-priority active link from a list

    Filters links by activation conditions, then returns the one
    with the highest priority value.

    Args:
        links: List of ObjectLink instances
        context: Runtime context dict

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
    active_links = filter_active_links(links, context)

    if not active_links:
        return None

    # Sort by priority (descending) and return the first
    return sorted(
        active_links,
        key=lambda link: getattr(link, 'priority', 0),
        reverse=True
    )[0]
