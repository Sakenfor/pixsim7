from __future__ import annotations

"""
Pydantic models for validating world-level relationship/intimacy schemas.

These models intentionally cover only the schema-related portions of
GameWorld.meta and ignore any unrelated fields (UI config, generation, etc.).
"""

from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


def detect_tier_overlaps(tiers: List["RelationshipTierSchema"]) -> List[str]:
    """
    Detect overlapping tier ranges.

    Returns list of overlap descriptions, empty if no overlaps.
    """
    overlaps = []
    sorted_tiers = sorted(tiers, key=lambda t: t.min)

    for i, tier1 in enumerate(sorted_tiers):
        for tier2 in sorted_tiers[i + 1 :]:
            # Check if ranges overlap
            tier1_max = tier1.max if tier1.max is not None else 100
            tier2_max = tier2.max if tier2.max is not None else 100

            if tier1_max > tier2.min:
                overlaps.append(
                    f'Tiers "{tier1.id}" ({tier1.min}-{tier1_max}) '
                    f'and "{tier2.id}" ({tier2.min}-{tier2_max}) overlap'
                )

    return overlaps


def detect_tier_gaps(tiers: List["RelationshipTierSchema"]) -> List[str]:
    """
    Detect gaps in tier coverage (optional warning, not error).

    Returns list of gap descriptions.
    """
    gaps = []
    sorted_tiers = sorted(tiers, key=lambda t: t.min)

    for i in range(len(sorted_tiers) - 1):
        tier1 = sorted_tiers[i]
        tier2 = sorted_tiers[i + 1]
        tier1_max = tier1.max if tier1.max is not None else 100

        if tier1_max < tier2.min:
            gaps.append(
                f'Gap between "{tier1.id}" (ends at {tier1_max}) '
                f'and "{tier2.id}" (starts at {tier2.min})'
            )

    return gaps


class RelationshipTierSchema(BaseModel):
    """
    Schema entry for a single relationship tier.

    Example:
    {
        "id": "friend",
        "min": 40,
        "max": 69
    }
    """

    id: str
    min: float
    max: Optional[float] = None

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure tier ID is not empty or whitespace-only."""
        if not v or not v.strip():
            raise ValueError('Tier ID cannot be empty')
        return v.strip()

    @field_validator('min')
    @classmethod
    def min_in_range(cls, v: float) -> float:
        """Ensure min value is between 0 and 100."""
        if v < 0 or v > 100:
            raise ValueError('min must be between 0 and 100')
        return v

    @field_validator('max')
    @classmethod
    def max_in_range(cls, v: Optional[float]) -> Optional[float]:
        """Ensure max value is between 0 and 100 if provided."""
        if v is not None and (v < 0 or v > 100):
            raise ValueError('max must be between 0 and 100')
        return v

    @model_validator(mode='after')
    def validate_min_max_relationship(self):
        """Ensure max >= min when max is specified."""
        if self.max is not None and self.max < self.min:
            raise ValueError(f'max ({self.max}) must be >= min ({self.min})')
        return self


class IntimacyLevelSchema(BaseModel):
    """
    Schema entry for a single intimacy level.

    Example (stored under GameWorld.meta.intimacy_schema.levels):
    {
        "id": "light_flirt",
        "minAffinity": 30,
        "minTrust": 20,
        "minChemistry": 30,
        "maxTension": 40
    }
    """

    id: str
    minAffinity: Optional[float] = None
    minTrust: Optional[float] = None
    minChemistry: Optional[float] = None
    maxTension: Optional[float] = None

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure intimacy level ID is not empty or whitespace-only."""
        if not v or not v.strip():
            raise ValueError('Intimacy level ID cannot be empty')
        return v.strip()

    @field_validator('minAffinity', 'minTrust', 'minChemistry', 'maxTension')
    @classmethod
    def value_in_range(cls, v: Optional[float]) -> Optional[float]:
        """Ensure threshold values are between 0 and 100 if provided."""
        if v is not None and (v < 0 or v > 100):
            raise ValueError(f'Value must be between 0 and 100, got {v}')
        return v

    @model_validator(mode='after')
    def has_at_least_one_threshold(self):
        """Ensure at least one threshold is defined."""
        if not any([
            self.minAffinity is not None,
            self.minTrust is not None,
            self.minChemistry is not None,
            self.maxTension is not None
        ]):
            raise ValueError('Intimacy level must have at least one threshold defined')
        return self


class IntimacySchema(BaseModel):
    """
    Container for intimacy level schemas.

    Matches the structure:
    GameWorld.meta.intimacy_schema = { "levels": [IntimacyLevelSchema, ...] }
    """

    levels: List[IntimacyLevelSchema] = Field(default_factory=list)

    @model_validator(mode='after')
    def validate_unique_ids(self):
        """Ensure all intimacy level IDs are unique."""
        ids = [level.id for level in self.levels]
        duplicates = [id for id in ids if ids.count(id) > 1]
        if duplicates:
            raise ValueError(f'Duplicate intimacy level IDs found: {set(duplicates)}')
        return self


class GeneralMoodSchema(BaseModel):
    """
    General mood definition using valence/arousal ranges.

    Example:
    {
        "id": "excited",
        "valence_min": 50,
        "valence_max": 100,
        "arousal_min": 50,
        "arousal_max": 100
    }
    """

    id: str
    valence_min: float = Field(ge=0, le=100)
    valence_max: float = Field(ge=0, le=100)
    arousal_min: float = Field(ge=0, le=100)
    arousal_max: float = Field(ge=0, le=100)

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure mood ID is not empty or whitespace-only."""
        if not v or not v.strip():
            raise ValueError('Mood ID cannot be empty')
        return v.strip()

    @model_validator(mode='after')
    def validate_ranges(self):
        """Ensure max >= min for valence and arousal."""
        if self.valence_max < self.valence_min:
            raise ValueError(
                f'valence_max ({self.valence_max}) must be >= valence_min ({self.valence_min})'
            )
        if self.arousal_max < self.arousal_min:
            raise ValueError(
                f'arousal_max ({self.arousal_max}) must be >= arousal_min ({self.arousal_min})'
            )
        return self


class IntimateMoodSchema(BaseModel):
    """
    Intimate mood definition using relationship axes.

    Example:
    {
        "id": "playful",
        "chemistry_min": 0,
        "chemistry_max": 60,
        "trust_min": 0,
        "trust_max": 100,
        "tension_min": 0,
        "tension_max": 100
    }
    """

    id: str
    chemistry_min: float = Field(default=0, ge=0, le=100)
    chemistry_max: float = Field(default=100, ge=0, le=100)
    trust_min: float = Field(default=0, ge=0, le=100)
    trust_max: float = Field(default=100, ge=0, le=100)
    tension_min: float = Field(default=0, ge=0, le=100)
    tension_max: float = Field(default=100, ge=0, le=100)

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure mood ID is not empty or whitespace-only."""
        if not v or not v.strip():
            raise ValueError('Mood ID cannot be empty')
        return v.strip()

    @model_validator(mode='after')
    def validate_ranges(self):
        """Ensure max >= min for all axes."""
        if self.chemistry_max < self.chemistry_min:
            raise ValueError('chemistry_max must be >= chemistry_min')
        if self.trust_max < self.trust_min:
            raise ValueError('trust_max must be >= trust_min')
        if self.tension_max < self.tension_min:
            raise ValueError('tension_max must be >= tension_min')
        return self


class MoodSchemaConfig(BaseModel):
    """
    Container for mood schemas (supports both legacy and domain-based formats).

    Domain-based format (new):
    {
        "general": {"moods": [GeneralMoodSchema, ...]},
        "intimate": {"moods": [IntimateMoodSchema, ...]}
    }

    Legacy format:
    {
        "moods": [GeneralMoodSchema, ...]
    }
    """

    # Legacy format
    moods: Optional[List[GeneralMoodSchema]] = None

    # Domain-based format
    general: Optional[Dict[str, List[GeneralMoodSchema]]] = None
    intimate: Optional[Dict[str, List[IntimateMoodSchema]]] = None

    @model_validator(mode='after')
    def has_at_least_one_format(self):
        """Ensure at least one format is provided."""
        if self.moods is None and self.general is None and self.intimate is None:
            raise ValueError(
                'Mood schema must have either legacy "moods" or domain-based "general"/"intimate"'
            )
        return self

    @model_validator(mode='after')
    def validate_no_duplicate_ids(self):
        """Ensure no duplicate mood IDs across all formats."""
        all_ids = []

        # Collect IDs from legacy format
        if self.moods:
            all_ids.extend([m.id for m in self.moods])

        # Collect IDs from domain-based format
        if self.general and 'moods' in self.general:
            all_ids.extend([m.id for m in self.general['moods']])
        if self.intimate and 'moods' in self.intimate:
            all_ids.extend([m.id for m in self.intimate['moods']])

        duplicates = [id for id in all_ids if all_ids.count(id) > 1]
        if duplicates:
            raise ValueError(f'Duplicate mood IDs found: {set(duplicates)}')
        return self


class ReputationBandSchema(BaseModel):
    """
    Schema entry for a single reputation band.

    Example:
    {
        "id": "enemy",
        "min": 0,
        "max": 20,
        "label": "Enemy"
    }
    """

    id: str
    min: float = Field(ge=0, le=100)
    max: float = Field(ge=0, le=100)
    label: Optional[str] = None

    @field_validator('id')
    @classmethod
    def id_not_empty(cls, v: str) -> str:
        """Ensure reputation band ID is not empty or whitespace-only."""
        if not v or not v.strip():
            raise ValueError('Reputation band ID cannot be empty')
        return v.strip()

    @model_validator(mode='after')
    def validate_min_max(self):
        """Ensure max >= min."""
        if self.max < self.min:
            raise ValueError(f'max ({self.max}) must be >= min ({self.min})')
        return self


class ReputationSchemaConfig(BaseModel):
    """
    Container for reputation bands, can be target-type-specific.

    Example:
    {
        "bands": [ReputationBandSchema, ...]
    }
    """

    bands: List[ReputationBandSchema] = Field(min_length=1)

    @field_validator('bands')
    @classmethod
    def bands_not_empty(cls, v: List[ReputationBandSchema]) -> List[ReputationBandSchema]:
        """Ensure at least one reputation band is defined."""
        if not v:
            raise ValueError('Reputation schema must have at least one band')
        return v

    @model_validator(mode='after')
    def validate_unique_ids(self):
        """Ensure all reputation band IDs are unique."""
        ids = [band.id for band in self.bands]
        duplicates = [id for id in ids if ids.count(id) > 1]
        if duplicates:
            raise ValueError(f'Duplicate reputation band IDs found: {set(duplicates)}')
        return self


class WorldMetaSchemas(BaseModel):
    """
    World-level relationship and intimacy schemas inside GameWorld.meta.

    Only validates known fields and ignores any extra keys so that other
    systems (UI config, generation config, etc.) can evolve independently.
    """

    relationship_schemas: Dict[str, List[RelationshipTierSchema]] = Field(
        default_factory=dict
    )
    intimacy_schema: Optional[IntimacySchema] = None
    npc_mood_schema: Optional[MoodSchemaConfig] = None
    reputation_schemas: Optional[Dict[str, ReputationSchemaConfig]] = None
    # Key = target type ("default", "npc", "faction", "group", etc.)

    @model_validator(mode='after')
    def validate_relationship_schemas(self):
        """Validate relationship schemas for duplicate IDs and overlaps within each schema."""
        for schema_key, tiers in self.relationship_schemas.items():
            # Check for duplicate IDs
            ids = [t.id for t in tiers]
            duplicates = [id for id in ids if ids.count(id) > 1]
            if duplicates:
                raise ValueError(
                    f'Duplicate tier IDs in relationship schema "{schema_key}": '
                    f'{set(duplicates)}'
                )

            # Check for overlaps
            overlaps = detect_tier_overlaps(tiers)
            if overlaps:
                raise ValueError(
                    f'Overlapping tiers in relationship schema "{schema_key}": '
                    f'{"; ".join(overlaps)}'
                )
        return self

    class Config:
        extra = "ignore"

