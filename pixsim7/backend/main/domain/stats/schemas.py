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
from pydantic import BaseModel, Field, field_validator, model_validator


class StatAxis(BaseModel):
    """
    A single numeric stat axis.

    Examples:
    - Relationship axis: affinity (0-100)
    - Skill axis: strength (0-100)
    - Resource axis: health (0-maxHealth)
    """

    name: str = Field(description="Unique name for this axis (e.g., 'affinity', 'strength')")
    min_value: float = Field(default=0.0, description="Minimum value for this axis")
    max_value: float = Field(default=100.0, description="Maximum value for this axis")
    default_value: float = Field(default=0.0, description="Default starting value")
    display_name: Optional[str] = Field(default=None, description="Human-readable name")
    description: Optional[str] = Field(default=None, description="Axis description for tooltips")

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
        from pixsim7.backend.main.domain.game.schemas.relationship import detect_tier_overlaps

        # Group tiers by axis
        tiers_by_axis: Dict[str, List[StatTier]] = {}
        for tier in self.tiers:
            if tier.axis_name not in tiers_by_axis:
                tiers_by_axis[tier.axis_name] = []
            tiers_by_axis[tier.axis_name].append(tier)

        # Check each axis for overlaps (convert to format expected by helper)
        for axis_name, axis_tiers in tiers_by_axis.items():
            # Convert StatTier to dict format for compatibility
            tier_dicts = [
                {"id": t.id, "min": t.min, "max": t.max}
                for t in axis_tiers
            ]
            overlaps = detect_tier_overlaps(tier_dicts)
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
