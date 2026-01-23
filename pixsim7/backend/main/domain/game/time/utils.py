"""
Time Utility Functions

Provides helper functions for calculating time constants from config.
"""

from dataclasses import dataclass
from typing import Optional

from .config import WorldTimeConfig, DEFAULT_WORLD_TIME_CONFIG


@dataclass(frozen=True)
class TimeConstants:
    """Derived time constants from a WorldTimeConfig."""
    seconds_per_minute: int
    seconds_per_hour: int
    seconds_per_day: int
    seconds_per_week: int
    minutes_per_hour: int
    hours_per_day: int
    days_per_week: int


def get_time_constants(
    config: Optional[WorldTimeConfig] = None
) -> TimeConstants:
    """
    Calculate derived time constants from config.

    Args:
        config: World time config. Uses DEFAULT_WORLD_TIME_CONFIG if None.

    Returns:
        TimeConstants with calculated values.

    Example:
        >>> config = WorldTimeConfig(hoursPerDay=30, daysPerWeek=10)
        >>> constants = get_time_constants(config)
        >>> constants.seconds_per_day
        108000  # 30 * 60 * 60
        >>> constants.seconds_per_week
        1080000  # 30 * 60 * 60 * 10
    """
    if config is None:
        config = DEFAULT_WORLD_TIME_CONFIG

    seconds_per_minute = config.seconds_per_minute
    seconds_per_hour = seconds_per_minute * config.minutes_per_hour
    seconds_per_day = seconds_per_hour * config.hours_per_day
    seconds_per_week = seconds_per_day * config.days_per_week

    return TimeConstants(
        seconds_per_minute=seconds_per_minute,
        seconds_per_hour=seconds_per_hour,
        seconds_per_day=seconds_per_day,
        seconds_per_week=seconds_per_week,
        minutes_per_hour=config.minutes_per_hour,
        hours_per_day=config.hours_per_day,
        days_per_week=config.days_per_week,
    )


# Legacy constants for backward compatibility
# These should be phased out in favor of get_time_constants()
SECONDS_PER_MINUTE = 60
SECONDS_PER_HOUR = 3600
SECONDS_PER_DAY = 86400
SECONDS_PER_WEEK = 604800
