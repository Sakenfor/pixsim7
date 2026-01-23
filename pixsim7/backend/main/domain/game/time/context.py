"""
Time Context Building

Converts raw world_time (seconds) into semantic time context
suitable for link activation and other game systems.
"""

from dataclasses import dataclass
from typing import Dict, Any, Optional, List

from .config import (
    WorldTimeConfig,
    TimePeriodDefinition,
    DayDefinition,
    DEFAULT_WORLD_TIME_CONFIG,
)
from .utils import get_time_constants
from .matching import find_period_for_hour, find_day_for_index


@dataclass
class TimeComponents:
    """Parsed time components from raw world_time seconds."""
    day_of_week: int
    hour: int
    minute: int
    second: int
    period: Optional[TimePeriodDefinition]
    day: Optional[DayDefinition]

    @property
    def period_id(self) -> str:
        """Get period ID or 'unknown' if no matching period."""
        return self.period.id if self.period else "unknown"

    @property
    def period_display_name(self) -> str:
        """Get period display name or 'Unknown' if no matching period."""
        return self.period.display_name if self.period else "Unknown"

    @property
    def day_id(self) -> str:
        """Get day ID or fallback to 'day_{index}' if no matching day."""
        return self.day.id if self.day else f"day_{self.day_of_week}"

    @property
    def day_display_name(self) -> str:
        """Get day display name or fallback to 'Day {index}' if no matching day."""
        return self.day.display_name if self.day else f"Day {self.day_of_week}"

    @property
    def day_flags(self) -> List[str]:
        """Get day's special flags or empty list."""
        return self.day.special_flags if self.day and self.day.special_flags else []

    @property
    def is_rest_day(self) -> bool:
        """Check if current day is a rest day."""
        return self.day.is_rest_day if self.day and self.day.is_rest_day else False


def parse_world_time(
    world_time_seconds: int,
    config: Optional[WorldTimeConfig] = None,
) -> TimeComponents:
    """
    Parse raw world_time (seconds) into time components.

    Args:
        world_time_seconds: Raw world time in seconds (0 = Monday/Firstday 00:00)
        config: World time config. Uses DEFAULT_WORLD_TIME_CONFIG if None.

    Returns:
        TimeComponents with parsed values and matched period/day.

    Example:
        >>> config = WorldTimeConfig(hoursPerDay=30, daysPerWeek=10, ...)
        >>> components = parse_world_time(100000, config)
        >>> components.hour  # 100000 / 3600 = 27.7... → hour 27 in a 30-hour day
        27
        >>> components.period_id
        'witching_hour'  # if configured
    """
    if config is None:
        config = DEFAULT_WORLD_TIME_CONFIG

    constants = get_time_constants(config)

    # Normalize to week cycle (handle negative times gracefully)
    week_seconds = world_time_seconds % constants.seconds_per_week
    if week_seconds < 0:
        week_seconds += constants.seconds_per_week

    # Extract day of week
    day_of_week = week_seconds // constants.seconds_per_day

    # Extract time within day
    day_seconds = week_seconds % constants.seconds_per_day
    hour = day_seconds // constants.seconds_per_hour
    hour_seconds = day_seconds % constants.seconds_per_hour
    minute = hour_seconds // constants.seconds_per_minute
    second = hour_seconds % constants.seconds_per_minute

    # Find matching period and day
    period = find_period_for_hour(hour, config.periods, config.hours_per_day)
    day = find_day_for_index(day_of_week, config.days)

    return TimeComponents(
        day_of_week=day_of_week,
        hour=hour,
        minute=minute,
        second=second,
        period=period,
        day=day,
    )


def build_time_context(
    world_time_seconds: int,
    config: Optional[WorldTimeConfig] = None,
) -> Dict[str, Any]:
    """
    Build time context dictionary for link activation.

    The context is structured as:
    {
        "time": {
            "period": "witching_hour",
            "periodDisplayName": "The Witching Hour",
            "hour": 28,
            "minute": 30,
            "second": 0,
            "dayOfWeek": 9,
            "dayName": "bloodmoon",
            "dayDisplayName": "Bloodmoon",
            "dayFlags": ["dangerous"],
            "isRestDay": false,
            "rawSeconds": 123456,
        }
    }

    Args:
        world_time_seconds: Raw world time in seconds
        config: World time config. Uses DEFAULT_WORLD_TIME_CONFIG if None.

    Returns:
        Context dictionary suitable for link activation evaluation.

    Example:
        >>> context = build_time_context(50000, config)
        >>> context["time"]["period"]
        'afternoon'
        >>> context["time"]["dayFlags"]
        ['market_day']  # if configured
    """
    if config is None:
        config = DEFAULT_WORLD_TIME_CONFIG

    components = parse_world_time(world_time_seconds, config)

    return {
        "time": {
            "period": components.period_id,
            "periodDisplayName": components.period_display_name,
            "hour": components.hour,
            "minute": components.minute,
            "second": components.second,
            "dayOfWeek": components.day_of_week,
            "dayName": components.day_id,
            "dayDisplayName": components.day_display_name,
            "dayFlags": components.day_flags,
            "isRestDay": components.is_rest_day,
            "rawSeconds": world_time_seconds,
        }
    }


def get_period_from_hour(
    hour: int,
    config: Optional[WorldTimeConfig] = None,
) -> str:
    """
    Get period ID for a given hour.

    This is a convenience function for simple period lookups.
    For full context building, use build_time_context() instead.

    Args:
        hour: Hour of day (0 to hoursPerDay-1)
        config: World time config. Uses DEFAULT_WORLD_TIME_CONFIG if None.

    Returns:
        Period ID or "unknown" if no matching period.

    Example:
        >>> get_period_from_hour(14)
        'afternoon'
        >>> get_period_from_hour(23)
        'night'
    """
    if config is None:
        config = DEFAULT_WORLD_TIME_CONFIG

    period = find_period_for_hour(hour, config.periods, config.hours_per_day)
    return period.id if period else "unknown"
