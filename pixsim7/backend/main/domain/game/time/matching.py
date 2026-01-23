"""
Time Period Matching

Provides functions for matching time periods with alias support
for template portability across worlds.
"""

from typing import List, Optional

from .config import (
    WorldTimeConfig,
    TimePeriodDefinition,
    DayDefinition,
    DEFAULT_WORLD_TIME_CONFIG,
)


def is_hour_in_period(
    hour: int,
    start_hour: int,
    end_hour: int,
    hours_per_day: int,
) -> bool:
    """
    Check if an hour falls within a period range, handling wrap-around.

    Args:
        hour: Current hour (0 to hoursPerDay-1)
        start_hour: Period start hour
        end_hour: Period end hour (can wrap around for night periods)
        hours_per_day: Total hours in a day

    Returns:
        True if hour is within the period.

    Examples:
        # Simple range (morning: 7-12)
        >>> is_hour_in_period(10, 7, 12, 24)
        True

        # Wrapping range (night: 21-5)
        >>> is_hour_in_period(23, 21, 5, 24)
        True
        >>> is_hour_in_period(3, 21, 5, 24)
        True
        >>> is_hour_in_period(10, 21, 5, 24)
        False
    """
    # Normalize hour to valid range
    normalized_hour = hour % hours_per_day
    if normalized_hour < 0:
        normalized_hour += hours_per_day

    if start_hour <= end_hour:
        # Simple range (e.g., morning: 7-12)
        return start_hour <= normalized_hour < end_hour
    else:
        # Wrapping range (e.g., night: 21-5)
        return normalized_hour >= start_hour or normalized_hour < end_hour


def find_period_for_hour(
    hour: int,
    periods: List[TimePeriodDefinition],
    hours_per_day: int,
) -> Optional[TimePeriodDefinition]:
    """
    Find the period definition that contains the given hour.

    Args:
        hour: Current hour (0 to hoursPerDay-1)
        periods: List of period definitions
        hours_per_day: Total hours in a day

    Returns:
        Matching period definition or None if no match.
    """
    for period in periods:
        if is_hour_in_period(hour, period.start_hour, period.end_hour, hours_per_day):
            return period
    return None


def find_day_for_index(
    day_of_week: int,
    days: List[DayDefinition],
) -> Optional[DayDefinition]:
    """
    Find the day definition for a given day index.

    Args:
        day_of_week: Day index (0 to daysPerWeek-1)
        days: List of day definitions

    Returns:
        Matching day definition or None if no match.
    """
    for day in days:
        if day.index == day_of_week:
            return day
    return None


def period_matches_target(
    actual_period_id: str,
    target_period_or_alias: str,
    config: Optional[WorldTimeConfig] = None,
) -> bool:
    """
    Check if a period ID matches a target (including alias resolution).

    This is the core function for template portability. Templates can use
    standard terms like "day" or "night", and this function resolves them
    to world-specific periods.

    Resolution order:
    1. Direct match: actual_period_id == target_period_or_alias
    2. Alias match: target_period_or_alias is an alias that includes actual_period_id
    3. Period alias match: actual_period_id has target_period_or_alias in its aliases

    Args:
        actual_period_id: The current period ID (e.g., "witching_hour")
        target_period_or_alias: The target to match (e.g., "night", "witching_hour")
        config: World time config. Uses DEFAULT_WORLD_TIME_CONFIG if None.

    Returns:
        True if the actual period matches the target.

    Examples:
        # Direct match
        >>> period_matches_target("morning", "morning", config)
        True

        # Alias match (if "day" alias includes "morning|afternoon")
        >>> period_matches_target("morning", "day", config)
        True

        # Period has alias (if morning.aliases = ["daytime"])
        >>> period_matches_target("morning", "daytime", config)
        True

        # No match
        >>> period_matches_target("morning", "night", config)
        False
    """
    if config is None:
        config = DEFAULT_WORLD_TIME_CONFIG

    # Direct match
    if actual_period_id == target_period_or_alias:
        return True

    # Check if target is an alias in periodAliases
    aliased_periods = config.period_aliases.get(target_period_or_alias, "")
    if aliased_periods:
        period_ids = [p.strip() for p in aliased_periods.split("|")]
        if actual_period_id in period_ids:
            return True

    # Check if actual period has target as an alias in its definition
    for period in config.periods:
        if period.id == actual_period_id:
            if period.aliases and target_period_or_alias in period.aliases:
                return True
            break

    return False


def day_has_flag(
    day_of_week: int,
    flag: str,
    config: Optional[WorldTimeConfig] = None,
) -> bool:
    """
    Check if a day has a specific special flag.

    Args:
        day_of_week: Day index (0 to daysPerWeek-1)
        flag: Flag to check for (e.g., "market_day", "magic_amplified")
        config: World time config. Uses DEFAULT_WORLD_TIME_CONFIG if None.

    Returns:
        True if the day has the specified flag.

    Example:
        >>> # If day 4 (Earthrest) has specialFlags=["market_day"]
        >>> day_has_flag(4, "market_day", config)
        True
    """
    if config is None:
        config = DEFAULT_WORLD_TIME_CONFIG

    day = find_day_for_index(day_of_week, config.days)
    if day and day.special_flags:
        return flag in day.special_flags
    return False


def is_rest_day(
    day_of_week: int,
    config: Optional[WorldTimeConfig] = None,
) -> bool:
    """
    Check if a day is a rest day.

    Args:
        day_of_week: Day index (0 to daysPerWeek-1)
        config: World time config. Uses DEFAULT_WORLD_TIME_CONFIG if None.

    Returns:
        True if the day is marked as a rest day.
    """
    if config is None:
        config = DEFAULT_WORLD_TIME_CONFIG

    day = find_day_for_index(day_of_week, config.days)
    return bool(day and day.is_rest_day)
