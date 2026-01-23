"""
Pydantic schemas for abstract stat system.

Defines configurable stat definitions that can be used for:
- Relationships (affinity, trust, chemistry, tension)
- Skills (strength, magic, stealth)
- Reputation (fame, honor, notoriety)
- Resources (health, mana, stamina)
- Or any custom stat types per world
"""

from typing import Dict, List, Optional, Any, Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StatAxis(BaseModel):
    """
    A single numeric stat axis.

    Examples:
    - Relationship axis: affinity (0-100)
    - Skill axis: strength (0-100)
    - Resource axis: health (0-maxHealth)

    Semantic Types:
    Axes can declare a semantic_type to enable automatic derivation between
    packages that don't know about each other. Standard semantic types include:

    Sentiment:
    - "positive_sentiment": Affinity, liking, approval, reputation
    - "negative_sentiment": Dislike, tension, disapproval, hostility

    Arousal/Energy:
    - "arousal_source": Chemistry, excitement, stimulation
    - "calming_source": Comfort, relaxation, peace

    Resources:
    - "energy_resource": Energy, stamina (depletable)
    - "stress_indicator": Stress, anxiety, pressure

    Personality:
    - "extraversion_trait": Social energy, outgoingness
    - "openness_trait": Curiosity, creativity
    - "agreeableness_trait": Cooperation, empathy
    """

    name: str = Field(description="Unique name for this axis (e.g., 'affinity', 'strength')")
    min_value: float = Field(default=0.0, description="Minimum value for this axis")
    max_value: float = Field(default=100.0, description="Maximum value for this axis")
    default_value: float = Field(default=0.0, description="Default starting value")
    display_name: Optional[str] = Field(default=None, description="Human-readable name")
    description: Optional[str] = Field(default=None, description="Axis description for tooltips")

    # Semantic type for automatic derivation discovery
    semantic_type: Optional[str] = Field(
        default=None,
        description="Semantic type for cross-package derivation (e.g., 'positive_sentiment')"
    )
    semantic_weight: float = Field(
        default=1.0,
        description="Weight when combining multiple axes of same semantic type (0.0-1.0)"
    )

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        """Ensure axis name is not empty or whitespace-only."""
        if not v or not v.strip():
            raise ValueError('Axis name cannot be empty')
        return v.strip()

    @model_validator(mode='after')
    def validate_value_ranges(self):
        """Ensure min <= default <= max."""
        if self.min_value > self.max_value:
            raise ValueError(f'min_value ({self.min_value}) must be <= max_value ({self.max_value})')
        if self.default_value < self.min_value or self.default_value > self.max_value:
            raise ValueError(
                f'default_value ({self.default_value}) must be between '
                f'min_value ({self.min_value}) and max_value ({self.max_value})'
            )
        return self


class StatTier(BaseModel):
    """
    A tier/band for a single stat axis.

    Examples:
    - Relationship tier: "friend" (affinity 40-69)
    - Skill tier: "expert" (strength 80-100)
    - Reputation tier: "famous" (fame 70-89)
    """

    id: str = Field(description="Unique tier ID (e.g., 'friend', 'expert')")
    axis_name: str = Field(description="Which axis this tier applies to")
    min: float = Field(description="Minimum value for this tier")
    max: Optional[float] = Field(default=None, description="Maximum value (None = unbounded)")
    display_name: Optional[str] = Field(default=None, description="Human-readable tier name")
    description: Optional[str] = Field(default=None, description="Tier description")

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure tier ID is not empty or whitespace-only."""
        if not v or not v.strip():
            raise ValueError('Tier ID cannot be empty')
        return v.strip()

    @model_validator(mode='after')
    def validate_min_max(self):
        """Ensure max >= min when max is specified."""
        if self.max is not None and self.max < self.min:
            raise ValueError(f'max ({self.max}) must be >= min ({self.min})')
        return self


class StatCondition(BaseModel):
    """
    A condition for a multi-axis level.

    Supports various comparison types:
    - min: value >= threshold
    - max: value <= threshold
    - range: min <= value <= max
    """

    type: Literal["min", "max", "range"] = Field(description="Type of condition")
    min_value: Optional[float] = Field(default=None, description="Minimum value (for 'min' or 'range')")
    max_value: Optional[float] = Field(default=None, description="Maximum value (for 'max' or 'range')")

    @model_validator(mode='after')
    def validate_condition_values(self):
        """Ensure appropriate values are set for condition type."""
        if self.type == "min" and self.min_value is None:
            raise ValueError('min condition requires min_value')
        if self.type == "max" and self.max_value is None:
            raise ValueError('max condition requires max_value')
        if self.type == "range":
            if self.min_value is None or self.max_value is None:
                raise ValueError('range condition requires both min_value and max_value')
            if self.min_value > self.max_value:
                raise ValueError(f'min_value ({self.min_value}) must be <= max_value ({self.max_value})')
        return self

    def matches(self, value: float) -> bool:
        """Check if a value satisfies this condition."""
        if self.type == "min":
            return value >= self.min_value
        elif self.type == "max":
            return value <= self.max_value
        elif self.type == "range":
            return self.min_value <= value <= self.max_value
        return False


class StatLevel(BaseModel):
    """
    A level computed from multiple stat axes.

    Examples:
    - Intimacy level: "intimate" (affinity >= 70, trust >= 60, chemistry >= 50)
    - Combat readiness: "battle_ready" (strength >= 80, stamina >= 70)
    """

    id: str = Field(description="Unique level ID (e.g., 'intimate', 'battle_ready')")
    conditions: Dict[str, StatCondition] = Field(
        description="Map of axis_name -> condition. All must be satisfied."
    )
    display_name: Optional[str] = Field(default=None, description="Human-readable level name")
    description: Optional[str] = Field(default=None, description="Level description")
    priority: int = Field(
        default=0,
        description="Priority for level matching (higher = checked first). Useful for overlapping conditions."
    )

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure level ID is not empty or whitespace-only."""
        if not v or not v.strip():
            raise ValueError('Level ID cannot be empty')
        return v.strip()

    @model_validator(mode='after')
    def validate_has_conditions(self):
        """Ensure at least one condition is defined."""
        if not self.conditions:
            raise ValueError('Level must have at least one condition')
        return self

    def matches(self, stat_values: Dict[str, float]) -> bool:
        """Check if stat values satisfy all conditions for this level."""
        for axis_name, condition in self.conditions.items():
            value = stat_values.get(axis_name, 0.0)
            if not condition.matches(value):
                return False
        return True


class StatDefinition(BaseModel):
    """
    Complete definition of a stat system.

    Examples:
    - "relationships": axes=[affinity, trust, chemistry, tension], tiers=[...], levels=[...]
    - "skills": axes=[strength, magic, stealth], tiers=[novice, expert, master]
    - "reputation": axes=[fame, honor], tiers=[unknown, known, famous, legendary]
    """

    id: str = Field(description="Unique stat definition ID (e.g., 'relationships', 'skills')")
    display_name: Optional[str] = Field(default=None, description="Human-readable name")
    description: Optional[str] = Field(default=None, description="Description of this stat system")

    axes: List[StatAxis] = Field(description="List of stat axes in this system")
    tiers: List[StatTier] = Field(
        default_factory=list,
        description="Optional tier definitions for single-axis tiers"
    )
    levels: List[StatLevel] = Field(
        default_factory=list,
        description="Optional level definitions for multi-axis levels"
    )

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure stat definition ID is not empty or whitespace-only."""
        if not v or not v.strip():
            raise ValueError('Stat definition ID cannot be empty')
        return v.strip()

    @model_validator(mode='after')
    def validate_axes_not_empty(self):
        """Ensure at least one axis is defined."""
        if not self.axes:
            raise ValueError('Stat definition must have at least one axis')
        return self

    @model_validator(mode='after')
    def validate_unique_axis_names(self):
        """Ensure all axis names are unique."""
        axis_names = [axis.name for axis in self.axes]
        duplicates = [name for name in axis_names if axis_names.count(name) > 1]
        if duplicates:
            raise ValueError(f'Duplicate axis names in stat definition "{self.id}": {set(duplicates)}')
        return self

    @model_validator(mode='after')
    def validate_tier_references(self):
        """Ensure tier axis_name references exist."""
        axis_names = {axis.name for axis in self.axes}
        for tier in self.tiers:
            if tier.axis_name not in axis_names:
                raise ValueError(
                    f'Tier "{tier.id}" references unknown axis "{tier.axis_name}". '
                    f'Available axes: {axis_names}'
                )
        return self

    @model_validator(mode='after')
    def validate_tier_overlaps(self):
        """Check for tier overlaps within each axis."""
        # Group tiers by axis
        tiers_by_axis: Dict[str, List[StatTier]] = {}
        for tier in self.tiers:
            if tier.axis_name not in tiers_by_axis:
                tiers_by_axis[tier.axis_name] = []
            tiers_by_axis[tier.axis_name].append(tier)

        # Check each axis for overlaps
        for axis_name, axis_tiers in tiers_by_axis.items():
            # Sort tiers by min for deterministic comparisons
            sorted_tiers = sorted(axis_tiers, key=lambda t: t.min)

            overlaps: List[str] = []
            for i, tier1 in enumerate(sorted_tiers):
                tier1_max = tier1.max if tier1.max is not None else float("inf")

                for tier2 in sorted_tiers[i + 1 :]:
                    tier2_max = tier2.max if tier2.max is not None else float("inf")

                    # Ranges overlap if tier1's max is greater than tier2's min
                    if tier1_max > tier2.min:
                        overlaps.append(
                            f'Tiers "{tier1.id}" ({tier1.min}-{tier1_max}) '
                            f'and "{tier2.id}" ({tier2.min}-{tier2_max}) overlap'
                        )

            if overlaps:
                raise ValueError(
                    f'Overlapping tiers in axis "{axis_name}": {"; ".join(overlaps)}'
                )

        return self

    @model_validator(mode='after')
    def validate_level_references(self):
        """Ensure level conditions reference existing axes."""
        axis_names = {axis.name for axis in self.axes}
        for level in self.levels:
            for axis_name in level.conditions.keys():
                if axis_name not in axis_names:
                    raise ValueError(
                        f'Level "{level.id}" references unknown axis "{axis_name}". '
                        f'Available axes: {axis_names}'
                    )
        return self


class WorldStatsConfig(BaseModel):
    """
    World-level configuration for all stat systems.

    Stored in GameWorld.meta.stats_config (replaces relationship_schemas, intimacy_schema, etc.)
    """

    version: int = Field(default=1, description="Schema version for migrations")
    definitions: Dict[str, StatDefinition] = Field(
        default_factory=dict,
        description="Map of stat_definition_id -> StatDefinition"
    )

    @model_validator(mode='after')
    def validate_unique_definition_ids(self):
        """Ensure definition IDs match their keys."""
        for key, definition in self.definitions.items():
            if key != definition.id:
                raise ValueError(
                    f'Definition key "{key}" does not match definition.id "{definition.id}"'
                )
        return self

    class Config:
        extra = "ignore"  # Allow extra fields for forward compatibility

    def get_definition(self, definition_id: str) -> Optional[StatDefinition]:
        """Get a stat definition by ID."""
        return self.definitions.get(definition_id)

    def get_tier_order(self, definition_id: str) -> List[str]:
        """Get tier order for a definition (sorted by min value)."""
        defn = self.get_definition(definition_id)
        if not defn:
            return []
        sorted_tiers = sorted(defn.tiers, key=lambda t: t.min)
        return [t.id for t in sorted_tiers]

    def get_level_order(self, definition_id: str) -> List[str]:
        """Get level order for a definition (sorted by priority)."""
        defn = self.get_definition(definition_id)
        if not defn:
            return []
        sorted_levels = sorted(defn.levels, key=lambda l: l.priority)
        return [l.id for l in sorted_levels]


# =============================================================================
# Schema Version
# =============================================================================

STATS_SCHEMA_VERSION = 1


# =============================================================================
# Intimacy Gating Config
# =============================================================================

class IntimacyBandThreshold(BaseModel):
    """Threshold for an intimacy band."""
    chemistry: Optional[float] = Field(default=None, ge=0, le=100)
    affinity: Optional[float] = Field(default=None, ge=0, le=100)


class ContentRatingGate(BaseModel):
    """Gate requirements for a content rating."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    minimum_band: Optional[str] = Field(default=None, alias="minimumBand")
    minimum_chemistry: Optional[float] = Field(default=None, ge=0, le=100, alias="minimumChemistry")
    minimum_affinity: Optional[float] = Field(default=None, ge=0, le=100, alias="minimumAffinity")
    minimum_level: Optional[str] = Field(default=None, alias="minimumLevel")


class InteractionGate(BaseModel):
    """Gate requirements for an interaction."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    minimum_affinity: Optional[float] = Field(default=None, ge=0, le=100, alias="minimumAffinity")
    minimum_chemistry: Optional[float] = Field(default=None, ge=0, le=100, alias="minimumChemistry")
    minimum_level: Optional[str] = Field(default=None, alias="minimumLevel")
    appropriate_levels: Optional[List[str]] = Field(default=None, alias="appropriateLevels")


class IntimacyGatingConfig(BaseModel):
    """Intimacy gating configuration."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    version: int = Field(default=1, ge=1)
    intimacy_bands: Optional[Dict[str, IntimacyBandThreshold]] = Field(
        default=None, alias="intimacyBands"
    )
    content_ratings: Optional[Dict[str, ContentRatingGate]] = Field(
        default=None, alias="contentRatings"
    )
    interactions: Optional[Dict[str, InteractionGate]] = None


# =============================================================================
# World Manifest
# =============================================================================

class WorldManifest(BaseModel):
    """World manifest configuration."""
    turn_preset: Optional[str] = None
    enabled_arc_graphs: List[str] = Field(default_factory=list)
    enabled_campaigns: List[str] = Field(default_factory=list)
    enabled_plugins: List[str] = Field(default_factory=list)
    # TODO: gating_plugin is stored but not yet wired into runtime gating logic.
    # Currently the frontend uses 'intimacy.default' plugin directly.
    # Future work: backend should use this field to select the gating plugin.
    gating_plugin: Optional[str] = Field(
        default="intimacy.default",
        description="ID of the gating plugin to use (not yet wired - future work)"
    )

    class Config:
        extra = "allow"  # Allow additional fields


# =============================================================================
# Complete World Config Response
# =============================================================================

# =============================================================================
# World Time Configuration
# =============================================================================

class TimePeriodDefinition(BaseModel):
    """
    A named time period with hour boundaries.

    Supports wrapping (night: 21-5 means 21:00 to 05:00 next day).
    For fantasy worlds, hours can exceed 24 (e.g., 30-hour days).
    """
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str = Field(description="Canonical period ID (e.g., 'morning', 'witching_hour')")
    display_name: str = Field(alias="displayName", description="Display name for UI")
    start_hour: int = Field(alias="startHour", ge=0, description="Start hour (0 to hoursPerDay-1)")
    end_hour: int = Field(alias="endHour", ge=0, description="End hour - can wrap around")
    aliases: Optional[List[str]] = Field(
        default=None,
        description="Aliases for template portability (e.g., ['night', 'nighttime'])"
    )
    color: Optional[str] = Field(default=None, description="UI color hint (hex or CSS color)")
    ambient_preset: Optional[str] = Field(
        default=None, alias="ambientPreset",
        description="Reference to ambient preset (lighting, audio)"
    )

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Period ID cannot be empty')
        return v.strip()


class DayDefinition(BaseModel):
    """
    A named day in the world's week.
    For fantasy worlds, weeks can have any number of days.
    """
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    id: str = Field(description="Canonical day ID (e.g., 'monday', 'bloodmoon')")
    display_name: str = Field(alias="displayName", description="Display name for UI")
    index: int = Field(ge=0, description="0-indexed position in week")
    is_rest_day: Optional[bool] = Field(
        default=None, alias="isRestDay",
        description="Whether this is a rest day (affects NPC schedules)"
    )
    special_flags: Optional[List[str]] = Field(
        default=None, alias="specialFlags",
        description="Special flags for this day (e.g., 'market_day', 'magic_amplified')"
    )

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError('Day ID cannot be empty')
        return v.strip()


class TimeContextPaths(BaseModel):
    """Paths where time values are placed in context for link activation."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    period: str = Field(default="time.period", description="Path for current period ID")
    hour: str = Field(default="time.hour", description="Path for current hour")
    day_of_week: str = Field(default="time.dayOfWeek", alias="dayOfWeek", description="Path for day index")
    day_name: str = Field(default="time.dayName", alias="dayName", description="Path for day name/ID")
    minute: str = Field(default="time.minute", description="Path for current minute")


class WorldTimeConfig(BaseModel):
    """
    Complete world time configuration.

    Allows full customization of time structure for fantasy/sci-fi settings:
    - Custom hours per day (24, 30, 20, etc.)
    - Custom days per week (7, 10, 5, etc.)
    - Custom period definitions with aliases
    - Custom day names and special flags

    Template portability is maintained through period aliases:
    - Templates use standard terms ("day", "night", "morning")
    - Worlds define which of their periods match these aliases
    """
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    version: int = Field(default=1, ge=1, description="Schema version for migrations")

    # Time Structure
    seconds_per_minute: int = Field(
        default=60, ge=1, alias="secondsPerMinute",
        description="Seconds per minute (default: 60, rarely changed)"
    )
    minutes_per_hour: int = Field(
        default=60, ge=1, alias="minutesPerHour",
        description="Minutes per hour (default: 60, rarely changed)"
    )
    hours_per_day: int = Field(
        default=24, ge=1, alias="hoursPerDay",
        description="Hours per day (default: 24, fantasy: 30, 20, etc.)"
    )
    days_per_week: int = Field(
        default=7, ge=1, alias="daysPerWeek",
        description="Days per week (default: 7, fantasy: 10, 5, etc.)"
    )

    # Period Definitions
    periods: List[TimePeriodDefinition] = Field(
        default_factory=list,
        description="Time period definitions (morning, afternoon, etc.)"
    )

    # Day Definitions
    days: List[DayDefinition] = Field(
        default_factory=list,
        description="Day definitions (Monday, Tuesday, etc.)"
    )

    # Display Preferences
    use_24_hour_format: bool = Field(
        default=True, alias="use24HourFormat",
        description="Use 24-hour format (true) or 12-hour with AM/PM (false)"
    )
    date_format: str = Field(
        default="{dayName}, {hour}:{minute}", alias="dateFormat",
        description="Date/time format string with placeholders"
    )

    # Semantic Aliases (Template Portability)
    period_aliases: Dict[str, str] = Field(
        default_factory=dict, alias="periodAliases",
        description="Maps standard period terms to world-specific period IDs (e.g., 'day': 'morning|afternoon')"
    )

    # Link System Integration
    time_context_paths: TimeContextPaths = Field(
        default_factory=TimeContextPaths, alias="timeContextPaths",
        description="Paths where time values are placed in context"
    )

    @model_validator(mode='after')
    def validate_period_hours(self):
        """Ensure period hours are within valid range for hoursPerDay."""
        for period in self.periods:
            if period.start_hour >= self.hours_per_day:
                raise ValueError(
                    f'Period "{period.id}" startHour ({period.start_hour}) must be < hoursPerDay ({self.hours_per_day})'
                )
            if period.end_hour > self.hours_per_day and period.end_hour != period.start_hour:
                # Allow end_hour == hoursPerDay for periods ending at midnight
                # But for wrapping periods, end_hour should be < start_hour
                if period.end_hour >= self.hours_per_day and period.end_hour > period.start_hour:
                    raise ValueError(
                        f'Period "{period.id}" endHour ({period.end_hour}) must be <= hoursPerDay ({self.hours_per_day}) '
                        f'or < startHour for wrapping periods'
                    )
        return self

    @model_validator(mode='after')
    def validate_day_indices(self):
        """Ensure day indices are within valid range for daysPerWeek."""
        for day in self.days:
            if day.index >= self.days_per_week:
                raise ValueError(
                    f'Day "{day.id}" index ({day.index}) must be < daysPerWeek ({self.days_per_week})'
                )
        return self

    def get_seconds_per_hour(self) -> int:
        """Calculate seconds per hour."""
        return self.seconds_per_minute * self.minutes_per_hour

    def get_seconds_per_day(self) -> int:
        """Calculate seconds per day."""
        return self.get_seconds_per_hour() * self.hours_per_day

    def get_seconds_per_week(self) -> int:
        """Calculate seconds per week."""
        return self.get_seconds_per_day() * self.days_per_week


# Default time periods (matches common expectations)
DEFAULT_TIME_PERIODS = [
    TimePeriodDefinition(
        id="dawn", displayName="Dawn", startHour=5, endHour=7,
        aliases=["early_morning"], color="#FFE4B5"
    ),
    TimePeriodDefinition(
        id="morning", displayName="Morning", startHour=7, endHour=12,
        aliases=["day", "daytime"], color="#87CEEB"
    ),
    TimePeriodDefinition(
        id="afternoon", displayName="Afternoon", startHour=12, endHour=17,
        aliases=["day", "daytime"], color="#F0E68C"
    ),
    TimePeriodDefinition(
        id="evening", displayName="Evening", startHour=17, endHour=21,
        aliases=["dusk"], color="#DDA0DD"
    ),
    TimePeriodDefinition(
        id="night", displayName="Night", startHour=21, endHour=5,
        aliases=["nighttime"], color="#191970"
    ),
]

# Default day definitions (standard week)
DEFAULT_DAYS = [
    DayDefinition(id="monday", displayName="Monday", index=0),
    DayDefinition(id="tuesday", displayName="Tuesday", index=1),
    DayDefinition(id="wednesday", displayName="Wednesday", index=2),
    DayDefinition(id="thursday", displayName="Thursday", index=3),
    DayDefinition(id="friday", displayName="Friday", index=4),
    DayDefinition(id="saturday", displayName="Saturday", index=5, isRestDay=True),
    DayDefinition(id="sunday", displayName="Sunday", index=6, isRestDay=True),
]

# Default period aliases for template portability
DEFAULT_PERIOD_ALIASES = {
    "day": "dawn|morning|afternoon",
    "night": "evening|night",
    "daytime": "morning|afternoon",
    "nighttime": "evening|night",
    "early_morning": "dawn",
    "dusk": "evening",
}

# Default world time config (24-hour day, 7-day week)
DEFAULT_WORLD_TIME_CONFIG = WorldTimeConfig(
    version=1,
    secondsPerMinute=60,
    minutesPerHour=60,
    hoursPerDay=24,
    daysPerWeek=7,
    periods=DEFAULT_TIME_PERIODS,
    days=DEFAULT_DAYS,
    use24HourFormat=True,
    dateFormat="{dayName}, {hour}:{minute}",
    periodAliases=DEFAULT_PERIOD_ALIASES,
    timeContextPaths=TimeContextPaths(),
)


class WorldConfigResponse(BaseModel):
    """Complete world configuration returned by /worlds/{id}/config endpoint."""
    schema_version: int = STATS_SCHEMA_VERSION
    stats_config: WorldStatsConfig
    manifest: WorldManifest
    intimacy_gating: IntimacyGatingConfig
    time_config: WorldTimeConfig = Field(default_factory=lambda: DEFAULT_WORLD_TIME_CONFIG)
    # Pre-computed for frontend
    tier_order: List[str] = Field(default_factory=list)
    level_order: List[str] = Field(default_factory=list)
    # Merge warnings (e.g., invalid overrides in world.meta)
    merge_warnings: List[str] = Field(
        default_factory=list,
        description="Warnings from merging world.meta overrides (e.g., invalid definitions)"
    )
