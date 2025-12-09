"""
Derivation schemas for data-driven cross-package derivations.

These schemas allow stat packages to declare how they can derive values
from other packages using semantic types, without hardcoding specific
axis names or package dependencies.

Two-phase derivation:
1. Formulas: Compute numeric axis values from semantic sources
   Example: valence = positive_sentiment * 0.7

2. Transforms: Derive categorical/label values from computed axes
   Example: label = "excited" if valence >= 70 and arousal >= 70

Example:
    The mood package can declare it derives from "positive_sentiment" and
    "arousal_source" semantic types. At runtime, if a relationships package
    provides axes with those semantic types (e.g., affinity, chemistry),
    the derivation happens automatically.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Literal, Any, Union
from pydantic import BaseModel, Field, model_validator


class DerivationFormula(BaseModel):
    """
    Formula for deriving a single output axis from semantic source types.

    The formula references semantic types (not axis names), so it works
    with any package that provides axes of those types.

    Example:
        DerivationFormula(
            source_semantic_types={"pos": "positive_sentiment", "neg": "negative_sentiment"},
            weights={"pos": 1.0, "neg": -0.5},
            output_axis="valence",
            transform="weighted_avg",
        )

    This would find all axes with semantic_type="positive_sentiment" and
    "negative_sentiment", combine them using weighted average, and output
    to the "valence" axis.
    """

    source_semantic_types: Dict[str, str] = Field(
        description="Map of key -> semantic_type to find source axes"
    )
    weights: Dict[str, float] = Field(
        description="Weight for each source key in the formula"
    )
    output_axis: str = Field(
        description="Name of the output axis to populate"
    )
    transform: Literal["weighted_avg", "sum", "max", "min", "first"] = Field(
        default="weighted_avg",
        description="How to compute the output from weighted sources"
    )
    multi_source_strategy: Literal["weighted_avg", "max", "min", "sum", "first"] = Field(
        default="weighted_avg",
        description="How to combine multiple axes of the same semantic type"
    )
    normalize: bool = Field(
        default=True,
        description="Whether to normalize output to 0-100 range"
    )
    offset: float = Field(
        default=0.0,
        description="Constant offset to add to result"
    )

    @model_validator(mode='after')
    def validate_weights_match_sources(self):
        """Ensure weights keys match source_semantic_types keys."""
        source_keys = set(self.source_semantic_types.keys())
        weight_keys = set(self.weights.keys())
        if source_keys != weight_keys:
            missing_weights = source_keys - weight_keys
            extra_weights = weight_keys - source_keys
            msg = []
            if missing_weights:
                msg.append(f"missing weights for: {missing_weights}")
            if extra_weights:
                msg.append(f"extra weights without sources: {extra_weights}")
            raise ValueError(f"Weights/sources mismatch: {'; '.join(msg)}")
        return self


# ===================
# Transform Rules
# ===================


class ConditionSpec(BaseModel):
    """
    Specification for a single axis condition.

    Supports various comparison operators:
    - gte: greater than or equal
    - gt: greater than
    - lte: less than or equal
    - lt: less than
    - eq: equal
    - between: value in range [min, max]

    Example:
        {"gte": 70}  # value >= 70
        {"lt": 40}   # value < 40
        {"between": [40, 60]}  # 40 <= value <= 60
    """
    gte: Optional[float] = Field(default=None, description="Greater than or equal")
    gt: Optional[float] = Field(default=None, description="Greater than")
    lte: Optional[float] = Field(default=None, description="Less than or equal")
    lt: Optional[float] = Field(default=None, description="Less than")
    eq: Optional[float] = Field(default=None, description="Equal to")
    between: Optional[List[float]] = Field(
        default=None,
        description="Value in range [min, max] inclusive"
    )

    def matches(self, value: float) -> bool:
        """Check if a value matches this condition."""
        if self.gte is not None and value < self.gte:
            return False
        if self.gt is not None and value <= self.gt:
            return False
        if self.lte is not None and value > self.lte:
            return False
        if self.lt is not None and value >= self.lt:
            return False
        if self.eq is not None and value != self.eq:
            return False
        if self.between is not None:
            if len(self.between) >= 2:
                if value < self.between[0] or value > self.between[1]:
                    return False
        return True


class TransformCondition(BaseModel):
    """
    A single condition -> value mapping for transforms.

    The 'when' dict maps axis names to ConditionSpec. All conditions
    must be satisfied for the 'then' value to be used.

    Example:
        TransformCondition(
            when={"valence": ConditionSpec(gte=70), "arousal": ConditionSpec(gte=70)},
            then="excited"
        )
    """
    when: Dict[str, ConditionSpec] = Field(
        description="Map of axis_name -> condition. All must match."
    )
    then: Any = Field(
        description="Value to use when all conditions match"
    )

    def matches(self, axis_values: Dict[str, float]) -> bool:
        """Check if axis values satisfy all conditions."""
        for axis_name, condition in self.when.items():
            value = axis_values.get(axis_name, 0.0)
            if not condition.matches(value):
                return False
        return True


class TransformRule(BaseModel):
    """
    Rule for transforming computed axis values into derived outputs.

    Transforms run after formulas compute the axis values. They allow
    deriving categorical/label values from numeric axes.

    Example:
        TransformRule(
            output_key="label",
            conditions=[
                TransformCondition(
                    when={"valence": ConditionSpec(gte=70), "arousal": ConditionSpec(gte=70)},
                    then="excited"
                ),
                TransformCondition(
                    when={"valence": ConditionSpec(gte=60), "arousal": ConditionSpec(lt=40)},
                    then="calm"
                ),
            ],
            default="neutral"
        )
    """
    output_key: str = Field(
        description="Key for the output value (e.g., 'label', 'style')"
    )
    conditions: List[TransformCondition] = Field(
        description="Ordered conditions - first match wins"
    )
    default: Any = Field(
        description="Fallback value if no conditions match"
    )

    def compute(self, axis_values: Dict[str, float]) -> Any:
        """Compute the output value from axis values."""
        for condition in self.conditions:
            if condition.matches(axis_values):
                return condition.then
        return self.default


class DerivationCapability(BaseModel):
    """
    Declares a package's ability to derive values from semantic sources.

    A package can have multiple derivation capabilities, each producing
    different derived stat values from different combinations of semantic
    source types.

    Two-phase processing:
    1. Formulas compute numeric axis values from semantic sources
    2. Transforms derive categorical values (labels, enums) from axis values

    Example:
        # Mood package can derive mood from social relationships
        DerivationCapability(
            id="mood_from_social",
            from_semantic_types=["positive_sentiment", "arousal_source"],
            to_stat_definition="mood",
            formulas=[
                DerivationFormula(...),  # For valence
                DerivationFormula(...),  # For arousal
            ],
            transforms=[
                TransformRule(
                    output_key="label",
                    conditions=[
                        TransformCondition(when={"valence": ConditionSpec(gte=70), ...}, then="excited"),
                    ],
                    default="neutral"
                ),
            ],
            priority=50,
        )
    """

    id: str = Field(
        description="Unique ID for this derivation capability"
    )
    from_semantic_types: List[str] = Field(
        description="Required semantic types that must be available for this derivation"
    )
    to_stat_definition: str = Field(
        description="The stat definition ID this produces (e.g., 'mood')"
    )
    formulas: List[DerivationFormula] = Field(
        default_factory=list,
        description="Formulas for computing each output axis"
    )
    transforms: List[TransformRule] = Field(
        default_factory=list,
        description="Transform rules for deriving categorical values from axis values"
    )
    priority: int = Field(
        default=50,
        description="Priority for derivation order (lower = runs first)"
    )
    description: Optional[str] = Field(
        default=None,
        description="Human-readable description of what this derives"
    )
    enabled_by_default: bool = Field(
        default=True,
        description="Whether this derivation runs by default (can be overridden per-world)"
    )

    @model_validator(mode='after')
    def validate_has_formulas_or_transforms(self):
        """Ensure at least one formula or transform is defined."""
        if not self.formulas and not self.transforms:
            raise ValueError("DerivationCapability must have at least one formula or transform")
        return self

    @model_validator(mode='after')
    def validate_formula_sources_in_from_types(self):
        """Ensure all formula sources reference declared from_semantic_types."""
        allowed = set(self.from_semantic_types)
        for formula in self.formulas:
            used = set(formula.source_semantic_types.values())
            invalid = used - allowed
            if invalid:
                raise ValueError(
                    f"Formula for '{formula.output_axis}' uses semantic types {invalid} "
                    f"not declared in from_semantic_types: {allowed}"
                )
        return self


# ===================
# Standard Semantic Types
# ===================

# These are conventions, not enforced - packages can use custom types too

SEMANTIC_TYPES = {
    # Sentiment / Emotion valence sources
    "positive_sentiment": "Positive feeling toward something (affinity, liking, approval)",
    "negative_sentiment": "Negative feeling toward something (dislike, tension, hostility)",

    # Arousal / Energy sources
    "arousal_source": "Source of activation/energy (chemistry, excitement, stimulation)",
    "calming_source": "Source of calm/relaxation (comfort, peace, security)",

    # Resource types
    "energy_resource": "Depletable energy (stamina, energy level)",
    "health_resource": "Health/vitality resource",
    "stress_indicator": "Stress or pressure level",

    # Personality traits (Big Five)
    "extraversion_trait": "Social energy, outgoingness",
    "openness_trait": "Curiosity, creativity, openness to experience",
    "agreeableness_trait": "Cooperation, empathy, prosocial tendency",
    "conscientiousness_trait": "Organization, discipline, reliability",
    "neuroticism_trait": "Emotional instability, anxiety tendency",

    # Drive/Need types
    "social_drive": "Need for social interaction",
    "achievement_drive": "Need for accomplishment",
    "autonomy_drive": "Need for independence/control",
    "safety_drive": "Need for security/safety",
    "novelty_drive": "Need for new experiences",

    # Trust/Reliability
    "trust_indicator": "Trust or reliability measure",
    "familiarity_indicator": "How well-known something/someone is",
}
