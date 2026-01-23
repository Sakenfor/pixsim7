"""
World Time System

Provides configurable time handling for fantasy/sci-fi worlds:
- Custom hours per day, days per week
- Named time periods with aliases for template portability
- Time context building for link activation
- Period matching with alias support

Usage:
    from pixsim7.backend.main.domain.game.time import (
        WorldTimeConfig,
        DEFAULT_WORLD_TIME_CONFIG,
        build_time_context,
        parse_world_time,
        period_matches_target,
        get_time_constants,
    )
"""

from .config import (
    WorldTimeConfig,
    TimePeriodDefinition,
    DayDefinition,
    TimeContextPaths,
    DEFAULT_WORLD_TIME_CONFIG,
    DEFAULT_TIME_PERIODS,
    DEFAULT_DAYS,
    DEFAULT_PERIOD_ALIASES,
)
from .context import (
    build_time_context,
    parse_world_time,
    TimeComponents,
)
from .matching import (
    period_matches_target,
    is_hour_in_period,
    find_period_for_hour,
    find_day_for_index,
    day_has_flag,
    is_rest_day,
)
from .utils import (
    get_time_constants,
    TimeConstants,
)

__all__ = [
    # Config types
    "WorldTimeConfig",
    "TimePeriodDefinition",
    "DayDefinition",
    "TimeContextPaths",
    # Defaults
    "DEFAULT_WORLD_TIME_CONFIG",
    "DEFAULT_TIME_PERIODS",
    "DEFAULT_DAYS",
    "DEFAULT_PERIOD_ALIASES",
    # Context building
    "build_time_context",
    "parse_world_time",
    "TimeComponents",
    # Matching
    "period_matches_target",
    "is_hour_in_period",
    "find_period_for_hour",
    "find_day_for_index",
    "day_has_flag",
    "is_rest_day",
    # Utils
    "get_time_constants",
    "TimeConstants",
]
