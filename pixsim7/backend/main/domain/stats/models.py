"""
Stat Definition Models (Pydantic)

These models mirror the TypeScript schemas in packages/shared/types/src/worldConfig.ts.
They define the canonical structure for stat systems (relationships, skills, etc.).

Schema version: 1
"""
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field, field_validator


# =============================================================================
# Schema Version
# =============================================================================

STATS_SCHEMA_VERSION = 1


# =============================================================================
# Stat Axis
# =============================================================================

class StatAxis(BaseModel):
    """A single numeric stat axis (e.g., affinity, strength, health)"""
    name: str = Field(..., min_length=1)
    min_value: float = 0
    max_value: float = 100
    default_value: float = 0
    display_name: Optional[str] = None
    description: Optional[str] = None
    semantic_type: Optional[str] = None
    semantic_weight: float = Field(default=1.0, ge=0, le=1)


# =============================================================================
# Stat Tier
# =============================================================================

class StatTier(BaseModel):
    """A tier/band for a single stat axis (e.g., 'friend' for affinity 40-69)"""
    id: str = Field(..., min_length=1)
    axis_name: str = Field(..., min_length=1)
    min: float
    max: Optional[float] = None
    display_name: Optional[str] = None
    description: Optional[str] = None


# =============================================================================
# Stat Condition & Level
# =============================================================================

class StatCondition(BaseModel):
    """A condition for multi-axis level matching"""
    type: str = Field(..., pattern="^(min|max|range)$")
    min_value: Optional[float] = None
    max_value: Optional[float] = None


class StatLevel(BaseModel):
    """A level computed from multiple stat axes (e.g., 'intimate' requires high affinity + chemistry + trust)"""
    id: str = Field(..., min_length=1)
    conditions: Dict[str, StatCondition]
    display_name: Optional[str] = None
    description: Optional[str] = None
    priority: int = 0


# =============================================================================
# Stat Definition
# =============================================================================

class StatDefinition(BaseModel):
    """Complete definition of a stat system"""
    id: str = Field(..., min_length=1)
    display_name: Optional[str] = None
    description: Optional[str] = None
    axes: List[StatAxis] = Field(..., min_length=1)
    tiers: List[StatTier] = Field(default_factory=list)
    levels: List[StatLevel] = Field(default_factory=list)

    def get_tier_order(self) -> List[str]:
        """Get tier IDs ordered by min value (ascending)"""
        sorted_tiers = sorted(self.tiers, key=lambda t: t.min)
        return [t.id for t in sorted_tiers]

    def get_level_order(self) -> List[str]:
        """Get level IDs ordered by priority (ascending)"""
        sorted_levels = sorted(self.levels, key=lambda l: l.priority)
        return [l.id for l in sorted_levels]


# =============================================================================
# World Stats Config
# =============================================================================

class WorldStatsConfig(BaseModel):
    """World-level stats configuration"""
    version: int = Field(default=1, ge=1)
    definitions: Dict[str, StatDefinition] = Field(default_factory=dict)

    def get_definition(self, definition_id: str) -> Optional[StatDefinition]:
        """Get a stat definition by ID"""
        return self.definitions.get(definition_id)

    def get_tier_order(self, definition_id: str) -> List[str]:
        """Get tier order for a definition"""
        defn = self.get_definition(definition_id)
        return defn.get_tier_order() if defn else []

    def get_level_order(self, definition_id: str) -> List[str]:
        """Get level order for a definition"""
        defn = self.get_definition(definition_id)
        return defn.get_level_order() if defn else []


# =============================================================================
# Intimacy Gating Config
# =============================================================================

class IntimacyBandThreshold(BaseModel):
    """Threshold for an intimacy band"""
    chemistry: Optional[float] = Field(default=None, ge=0, le=100)
    affinity: Optional[float] = Field(default=None, ge=0, le=100)


class ContentRatingGate(BaseModel):
    """Gate requirements for a content rating"""
    minimum_band: Optional[str] = None
    minimum_chemistry: Optional[float] = Field(default=None, ge=0, le=100)
    minimum_affinity: Optional[float] = Field(default=None, ge=0, le=100)
    minimum_level: Optional[str] = None


class InteractionGate(BaseModel):
    """Gate requirements for an interaction"""
    minimum_affinity: Optional[float] = Field(default=None, ge=0, le=100)
    minimum_chemistry: Optional[float] = Field(default=None, ge=0, le=100)
    minimum_level: Optional[str] = None
    appropriate_levels: Optional[List[str]] = None


class IntimacyGatingConfig(BaseModel):
    """Intimacy gating configuration"""
    version: int = Field(default=1, ge=1)
    intimacy_bands: Optional[Dict[str, IntimacyBandThreshold]] = None
    content_ratings: Optional[Dict[str, ContentRatingGate]] = None
    interactions: Optional[Dict[str, InteractionGate]] = None


# =============================================================================
# World Manifest
# =============================================================================

class WorldManifest(BaseModel):
    """World manifest configuration"""
    turn_preset: Optional[str] = None
    enabled_arc_graphs: List[str] = Field(default_factory=list)
    enabled_campaigns: List[str] = Field(default_factory=list)
    enabled_plugins: List[str] = Field(default_factory=list)
    gating_plugin: Optional[str] = "intimacy.default"

    class Config:
        extra = "allow"  # Allow additional fields


# =============================================================================
# Complete World Config Response
# =============================================================================

class WorldConfigResponse(BaseModel):
    """Complete world configuration returned by /worlds/{id}/config endpoint"""
    schema_version: int = STATS_SCHEMA_VERSION
    stats_config: WorldStatsConfig
    manifest: WorldManifest
    intimacy_gating: IntimacyGatingConfig
    # Pre-computed for frontend
    tier_order: List[str] = Field(default_factory=list)
    level_order: List[str] = Field(default_factory=list)
