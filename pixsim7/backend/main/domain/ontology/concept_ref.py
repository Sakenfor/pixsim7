"""ConceptRef - Reference type for ontology concepts.

Unlike EntityRef (which uses integer IDs for database entities), ConceptRef
uses string IDs for ontology-backed vocabulary (poses, moods, locations, etc.).

Usage in DTOs:
    from pydantic import BaseModel
    from pixsim7.backend.main.domain.ontology import PoseConceptRef, MoodConceptRef

    class ActionBlockTags(BaseModel):
        pose: Optional[PoseConceptRef] = None
        mood: Optional[MoodConceptRef] = None

Accepts (via BeforeValidator):
    - ConceptRef instance
    - {"kind": "pose", "id": "standing_neutral"}
    - {"kind": "pose", "id": "standing_neutral", "meta": {"label": "Standing"}}
    - "pose:standing_neutral"
    - "standing_neutral" (raw string, uses the type alias's default kind)
    - None
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Union, Annotated, Iterable, List

from pydantic import BaseModel, Field, BeforeValidator, WithJsonSchema


class ConceptRef(BaseModel):
    """Reference to an ontology concept.

    Attributes:
        kind: Concept kind (e.g., 'pose', 'mood', 'location', 'intimacy', 'rating', 'branch')
        id: Concept ID (string identifier from ontology)
        meta: Optional metadata for context-specific information
    """

    kind: str = Field(..., description="Concept kind (e.g., 'pose', 'mood', 'location')")
    id: str = Field(..., description="Concept ID from ontology")
    meta: Optional[Dict[str, Any]] = Field(
        default=None, description="Optional metadata"
    )

    model_config = {
        "frozen": True,  # Immutable for safety
        "json_schema_extra": {
            "examples": [
                {"kind": "pose", "id": "standing_neutral"},
                {"kind": "mood", "id": "playful", "meta": {"intensity": 5}},
            ]
        },
    }

    @classmethod
    def parse_flexible(
        cls,
        value: Union[Dict[str, Any], str, "ConceptRef", None],
        default_kind: Optional[str] = None,
    ) -> Optional["ConceptRef"]:
        """Parse ConceptRef from various input formats.

        Args:
            value: Input in any supported format:
                - ConceptRef instance (returned as-is)
                - Dict with 'kind' and 'id' keys
                - String in "kind:id" format (e.g., "pose:standing_neutral")
                - String without colon (uses default_kind)
                - None (returns None)
            default_kind: Kind to use for raw string format

        Returns:
            ConceptRef instance or None if value is None

        Raises:
            ValueError: If format is invalid or default_kind required but not provided
        """
        if value is None:
            return None

        if isinstance(value, ConceptRef):
            return value

        if isinstance(value, str):
            if not value.strip():
                return None

            if ":" in value:
                # "kind:id" format
                parts = value.split(":", 1)
                return cls(kind=parts[0], id=parts[1])

            # Raw ID without prefix
            if not default_kind:
                raise ValueError(
                    f"Cannot parse raw string '{value}' without default_kind. "
                    "Use a typed field (e.g., PoseConceptRef) or provide explicit kind."
                )
            return cls(kind=default_kind, id=value)

        if isinstance(value, dict):
            concept_kind = value.get("kind")
            concept_id = value.get("id")
            if concept_kind is not None and concept_id is not None:
                return cls(
                    kind=concept_kind,
                    id=str(concept_id),
                    meta=value.get("meta"),
                )
            raise ValueError(
                f"Invalid ConceptRef dict: missing 'kind' or 'id'. Got: {value}"
            )

        raise ValueError(f"Cannot parse ConceptRef from {type(value).__name__}: {value}")

    def to_canonical(self) -> str:
        """Serialize to 'kind:id' canonical format."""
        return f"{self.kind}:{self.id}"

    def to_string(self) -> str:
        """Alias for to_canonical()."""
        return self.to_canonical()

    def __str__(self) -> str:
        return self.to_canonical()

    def __repr__(self) -> str:
        meta_str = f", meta={self.meta}" if self.meta else ""
        return f"ConceptRef({self.kind}:{self.id}{meta_str})"

    def __hash__(self) -> int:
        return hash((self.kind, self.id))


def _make_concept_ref_validator(concept_kind: str):
    """Create a validator that converts various formats to ConceptRef."""

    def validate(value: Any) -> Optional[ConceptRef]:
        if value is None:
            return None

        # Handle string that might already have a different prefix
        if isinstance(value, str) and ":" in value:
            parts = value.split(":", 1)
            # If the prefix matches our expected kind, parse normally
            if parts[0] == concept_kind:
                return ConceptRef(kind=concept_kind, id=parts[1])
            # If different prefix, still parse it (for flexibility)
            return ConceptRef(kind=parts[0], id=parts[1])

        return ConceptRef.parse_flexible(value, default_kind=concept_kind)

    return validate


def _make_concept_ref_schema(concept_kind: str) -> WithJsonSchema:
    """Create JSON schema extension with x-concept-kind for OpenAPI codegen."""
    return WithJsonSchema(
        {
            "anyOf": [
                {"$ref": "#/components/schemas/ConceptRef"},
                {"type": "string"},
                {"type": "null"},
            ],
            "x-concept-kind": concept_kind,
            "description": f"Reference to a {concept_kind} concept from ontology. "
                          f"Accepts '{concept_kind}:id' string or ConceptRef object.",
        }
    )


def _make_concept_ref_type(concept_kind: str):
    """Create a ConceptRef type alias with validation and schema extension."""
    return Annotated[
        Optional[ConceptRef],
        BeforeValidator(_make_concept_ref_validator(concept_kind)),
        _make_concept_ref_schema(concept_kind),
    ]


# ===================
# Type Aliases for Ontology Concepts
# ===================

# Pose concepts (pose:standing_neutral, pose:sitting_close, etc.)
PoseConceptRef = _make_concept_ref_type("pose")

# Mood concepts (mood:playful, mood:tender, etc.)
MoodConceptRef = _make_concept_ref_type("mood")

# Location concepts (location:bench_park, location:bedroom, etc.)
LocationConceptRef = _make_concept_ref_type("location")

# Intimacy level concepts (intimacy:none, intimacy:light_flirt, etc.)
IntimacyLevelConceptRef = _make_concept_ref_type("intimacy")

# Content rating concepts (rating:sfw, rating:romantic, etc.)
ContentRatingConceptRef = _make_concept_ref_type("rating")

# Branch intent concepts (branch:escalate, branch:cool_down, etc.)
BranchIntentConceptRef = _make_concept_ref_type("branch")

# Composition role concepts (role:main_character, role:environment, etc.)
# Used for typed role references in composition pipeline.
# Plugin roles are fetched via /api/v1/concepts/roles at runtime.
RoleConceptRef = _make_concept_ref_type("role")

# Body part concepts (part:face, part:hands, part:torso, part:chest, etc.)
# Combines anatomy_parts and anatomy_regions from ontology.yaml into unified kind.
PartConceptRef = _make_concept_ref_type("part")

# DEPRECATED: Body region concepts merged into 'part' kind.
# Kept as alias for backward compatibility with existing code.
# New code should use PartConceptRef.
BodyRegionConceptRef = PartConceptRef  # Deprecated alias

# Influence region concepts (influence_region:foreground, influence_region:background, etc.)
# Built-in regions for image composition masking.
InfluenceRegionConceptRef = _make_concept_ref_type("influence_region")


# ===================
# Factory Function
# ===================

def concept_ref_field(concept_kind: str) -> type:
    """Create an annotated type for ConceptRef fields with automatic parsing.

    Use this for concept kinds not covered by the pre-defined aliases.
    Includes x-concept-kind in JSON schema for OpenAPI codegen.

    Usage:
        class MyDTO(BaseModel):
            custom_concept: Optional[concept_ref_field("custom")] = None

    Args:
        concept_kind: The concept kind string for this reference

    Returns:
        Annotated type alias for Optional[ConceptRef] with schema extension
    """
    return _make_concept_ref_type(concept_kind)


# ===================
# Utility Functions
# ===================

def canonicalize_concept_id(value: Optional[str], kind: str) -> Optional[str]:
    """Ensure a concept ID has proper prefix.

    Args:
        value: Raw concept ID (may or may not have prefix)
        kind: Expected concept kind

    Returns:
        Canonical ID in "kind:id" format, or None if value is None/empty
    """
    if value is None or not value.strip():
        return None

    expected_prefix = f"{kind}:"
    if value.startswith(expected_prefix):
        return value
    return f"{expected_prefix}{value}"


def parse_concept_id(canonical_id: str) -> tuple[str, str]:
    """Parse a canonical concept ID into (kind, id) tuple.

    Args:
        canonical_id: ID in "kind:id" format

    Returns:
        Tuple of (kind, id)

    Raises:
        ValueError: If format is invalid
    """
    if ":" not in canonical_id:
        raise ValueError(f"Invalid canonical concept ID: '{canonical_id}'. Expected 'kind:id' format.")
    parts = canonical_id.split(":", 1)
    return (parts[0], parts[1])


def strip_concept_prefix(canonical_id: str, expected_kind: Optional[str] = None) -> str:
    """Strip the kind prefix from a canonical concept ID.

    Args:
        canonical_id: ID in "kind:id" format
        expected_kind: If provided, validates the kind matches

    Returns:
        Just the ID portion without prefix

    Raises:
        ValueError: If expected_kind provided and doesn't match
    """
    if ":" not in canonical_id:
        return canonical_id

    kind, id_part = parse_concept_id(canonical_id)
    if expected_kind and kind != expected_kind:
        raise ValueError(f"Expected kind '{expected_kind}' but got '{kind}'")
    return id_part


def normalize_concept_refs(
    values: Optional[Iterable[Union[Dict[str, Any], str, "ConceptRef"]]],
    *,
    validate: bool = True,
) -> List[str]:
    """Normalize a list of concept refs to canonical strings.

    Accepts ConceptRef instances, dicts, or strings and returns a list of
    canonical "kind:id" strings. Optionally validates against the registry.
    """
    if not values:
        return []

    registry = None
    if validate:
        from pixsim7.backend.main.domain.ontology.registry import get_ontology_registry
        registry = get_ontology_registry()

    normalized: List[str] = []
    for value in values:
        ref = ConceptRef.parse_flexible(value)
        if ref is None:
            continue
        if registry is not None:
            registry.validate_concept(ref.kind, ref.id)
        normalized.append(ref.to_canonical())

    return normalized


__all__ = [
    "ConceptRef",
    # Type aliases
    "PoseConceptRef",
    "MoodConceptRef",
    "LocationConceptRef",
    "IntimacyLevelConceptRef",
    "ContentRatingConceptRef",
    "BranchIntentConceptRef",
    "RoleConceptRef",
    "PartConceptRef",
    "BodyRegionConceptRef",  # Deprecated alias for PartConceptRef
    "InfluenceRegionConceptRef",
    # Factory
    "concept_ref_field",
    # Utilities
    "canonicalize_concept_id",
    "parse_concept_id",
    "strip_concept_prefix",
    "normalize_concept_refs",
]
