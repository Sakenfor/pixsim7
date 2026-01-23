"""
World Time Configuration

Re-exports time configuration types from the stats schemas module
to maintain a single source of truth while providing a clean API.
"""

from ..stats.schemas import (
    WorldTimeConfig,
    TimePeriodDefinition,
    DayDefinition,
    TimeContextPaths,
    DEFAULT_WORLD_TIME_CONFIG,
    DEFAULT_TIME_PERIODS,
    DEFAULT_DAYS,
    DEFAULT_PERIOD_ALIASES,
)

__all__ = [
    "WorldTimeConfig",
    "TimePeriodDefinition",
    "DayDefinition",
    "TimeContextPaths",
    "DEFAULT_WORLD_TIME_CONFIG",
    "DEFAULT_TIME_PERIODS",
    "DEFAULT_DAYS",
    "DEFAULT_PERIOD_ALIASES",
]
