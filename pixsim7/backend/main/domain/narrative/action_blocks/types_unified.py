"""
Unified Action Block type definitions.

This module provides a single, unified ActionBlock schema that combines
all features from v1 and v2 into optional fields. This eliminates the
need for hasattr() checks and ENHANCED_TYPES_AVAILABLE flags.

Migration from v1/v2:
- v1 SingleStateBlock → ActionBlock with kind="single_state"
- v1 TransitionBlock → ActionBlock with kind="transition"
- v2 EnhancedSingleStateBlock → ActionBlock with cameraMovement, consistency, etc.
- v2 EnhancedTransitionBlock → ActionBlock with cameraMovement, consistency, etc.

All enhanced features (cameraMovement, consistency, intensityProgression) are
now Optional fields on the unified ActionBlock.

Extensibility:
- ConceptRef types for ontology-backed fields (pose, mood, location, etc.)
- extensions dict for plugin metadata without schema changes
"""

from typing import Dict, Any, List, Optional, Union, Literal
from enum import Enum
from pydantic import (
    BaseModel,
    Field,
    ConfigDict,
    AliasChoices,
    field_validator,
    model_validator,
)

from pixsim7.backend.main.shared.schemas.entity_ref import (
    AssetRef,
    NpcRef,
)
from pixsim7.backend.main.domain.ontology import (
    ConceptRef,
    PoseConceptRef,
    MoodConceptRef,
    LocationConceptRef,
    IntimacyLevelConceptRef,
    BranchIntentConceptRef,
)
from pixsim7.backend.main.shared.composition import normalize_composition_role


# ============================================================================
# ENUMS
# ============================================================================

class BranchIntent(str, Enum):
    """Branch intent types for narrative direction.

    Canonical IDs aligned with ontology.yaml branch_intents.
    Values use ontology prefix format: branch:<id>
    """
    ESCALATE = "branch:escalate"
    COOL_DOWN = "branch:cool_down"
    SIDE_BRANCH = "branch:side_branch"
    MAINTAIN = "branch:maintain"
    RESOLVE = "branch:resolve"


class CameraMovementType(str, Enum):
    """Camera movement types for video generation."""
    STATIC = "static"
    ROTATION = "rotation"
    DOLLY = "dolly"
    TRACKING = "tracking"
    HANDHELD = "handheld"


class CameraSpeed(str, Enum):
    """Camera movement speed."""
    SLOW = "slow"
    MEDIUM = "medium"
    FAST = "fast"


class CameraPath(str, Enum):
    """Camera movement path."""
    CIRCULAR = "circular"
    ARC = "arc"
    LINEAR = "linear"


class ContentRating(str, Enum):
    """Content rating levels for filtering.

    Canonical scale aligned with social_context_builder.py and generation pipeline.
    Maps to ontology IDs: rating:sfw, rating:romantic, rating:mature_implied, rating:restricted
    """
    SFW = "sfw"
    ROMANTIC = "romantic"
    MATURE_IMPLIED = "mature_implied"
    RESTRICTED = "restricted"


class IntensityPattern(str, Enum):
    """Pattern of intensity change over time."""
    STEADY = "steady"
    BUILDING = "building"
    PULSING = "pulsing"
    DECLINING = "declining"


# ============================================================================
# ID CANONICALIZATION HELPERS
# ============================================================================

def _canonicalize_id(value: Optional[str], prefix: str) -> Optional[str]:
    """Ensure ID has proper prefix if not None."""
    if value is None or not value:
        return None
    expected = f"{prefix}:"
    if value.startswith(expected):
        return value
    return f"{expected}{value}"


def _canonicalize_pose(value: Optional[str]) -> Optional[str]:
    """Canonicalize pose ID."""
    return _canonicalize_id(value, "pose")


def _canonicalize_location(value: Optional[str]) -> Optional[str]:
    """Canonicalize location ID."""
    return _canonicalize_id(value, "location")


def _canonicalize_intimacy(value: Optional[str]) -> Optional[str]:
    """Canonicalize intimacy level ID."""
    return _canonicalize_id(value, "intimacy")


def _canonicalize_mood(value: Optional[str]) -> Optional[str]:
    """Canonicalize mood ID."""
    return _canonicalize_id(value, "mood")


# ============================================================================
# COMPONENT SCHEMAS
# ============================================================================

class ReferenceImage(BaseModel):
    """Reference to an image asset for video generation."""

    # Specific asset reference (Optional - None means template query)
    asset: Optional[AssetRef] = Field(
        default=None,
        validation_alias=AliasChoices("asset", "assetId"),
        description="Specific asset reference",
    )

    # Template query
    npc: Optional[NpcRef] = Field(
        default=None,
        validation_alias=AliasChoices("npc", "npcId"),
        description="NPC reference for template matching",
    )
    tags: List[str] = Field(default_factory=list, description="Tags to match assets")

    # Composition role hints
    role: Optional[str] = Field(
        default=None,
        description="Composition role id (e.g., main_character, environment)",
    )
    intent: Optional[str] = Field(
        default=None,
        pattern="^(generate|preserve|modify|add|remove)$",
        description="How this image should be applied in composition",
    )
    priority: Optional[int] = Field(
        default=None,
        description="Priority for role conflict resolution (higher wins)",
    )
    layer: Optional[int] = Field(
        default=None,
        description="Composition layer (0=background, higher=foreground)",
    )

    # Ontology-aligned hints
    character_id: Optional[str] = None
    location_id: LocationConceptRef = None
    pose_id: PoseConceptRef = None
    expression_id: Optional[str] = None
    camera_view_id: Optional[str] = None
    camera_framing_id: Optional[str] = None
    surface_type: Optional[str] = None
    prop_id: Optional[str] = None

    # External URL
    url: Optional[str] = Field(None, description="External URL for prototyping")

    # Framing
    crop: Literal["full_body", "waist_up", "portrait"] = "full_body"

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return normalize_composition_role(str(v))

    def is_resolved(self) -> bool:
        """Check if this reference points to a specific asset."""
        return self.asset is not None or self.url is not None

    def is_template(self) -> bool:
        """Check if this is a template that needs resolution."""
        return self.asset is None and self.url is None

    # Legacy accessors
    @property
    def assetId(self) -> Optional[int]:
        return self.asset.id if self.asset else None

    @property
    def npcId(self) -> Optional[int]:
        return self.npc.id if self.npc else None


class TransitionEndpoint(BaseModel):
    """Start or end point of a transition."""
    referenceImage: Optional[ReferenceImage] = Field(
        None,
        description="Primary reference image for this endpoint",
    )
    referenceImages: List[ReferenceImage] = Field(
        default_factory=list,
        description="Optional list of reference images for composition",
    )
    pose: str = Field(description="Abstract pose identifier for chaining")

    @field_validator("pose", mode="before")
    @classmethod
    def canonicalize_pose(cls, v: Optional[str]) -> str:
        """Ensure pose has proper prefix."""
        if not v:
            return ""
        return _canonicalize_pose(v) or ""


class CameraMovement(BaseModel):
    """Camera movement specification for a clip."""
    type: CameraMovementType = Field(CameraMovementType.STATIC)
    speed: Optional[CameraSpeed] = None
    path: Optional[CameraPath] = None
    focus: str = Field("subjects", description="What to keep in frame/focus")


class ConsistencyFlags(BaseModel):
    """What elements should remain consistent throughout the clip."""
    maintainPose: bool = Field(False, description="Character maintains original pose")
    preserveLighting: bool = Field(True, description="Lighting remains consistent")
    preserveClothing: bool = Field(True, description="Clothing state remains consistent")
    preservePosition: bool = Field(False, description="Characters stay in same positions")


class IntensityProgression(BaseModel):
    """Optional intensity progression over the clip duration."""
    start: int = Field(ge=1, le=10, description="Starting intensity")
    peak: int = Field(ge=1, le=10, description="Peak intensity")
    end: int = Field(ge=1, le=10, description="Ending intensity")
    pattern: IntensityPattern = Field(IntensityPattern.STEADY)


# ============================================================================
# UNIFIED TAGS
# ============================================================================

def _validate_extension_keys(extensions: Dict[str, Any]) -> Dict[str, Any]:
    """Validate extension keys follow namespacing convention."""
    for key in extensions.keys():
        if "." not in key:
            raise ValueError(
                f"Extension key '{key}' must be namespaced as '<plugin_id>.<key>'. "
                f"Example: 'my_plugin.custom_data'"
            )
    return extensions


class ActionBlockTags(BaseModel):
    """
    Unified semantic tags for action blocks.

    Uses typed refs for ontology-backed values where possible.
    Supports plugin extensions via the 'extensions' field.
    """
    # Location (canonicalized to location:xxx)
    location: Optional[str] = Field(
        None,
        description="Location tag (e.g., bench_park, bar_lounge)",
    )

    # Pose (canonicalized to pose:xxx)
    pose: Optional[str] = Field(
        None,
        description="Pose/position identifier",
    )

    # Intimacy level (canonicalized to intimacy:xxx)
    intimacy_level: Optional[str] = Field(
        None,
        description="Required intimacy level",
    )

    # Mood/emotional tone (canonicalized to mood:xxx)
    mood: Optional[str] = Field(
        None,
        description="Emotional tone",
    )

    # Content rating
    content_rating: ContentRating = Field(
        ContentRating.SFW,
        description="Content appropriateness level",
    )
    requires_age_verification: bool = Field(False)

    # Environmental context
    time_of_day: Optional[str] = Field(None)
    indoors: Optional[bool] = Field(None)

    # Action characteristics
    branch_type: Optional[BranchIntent] = Field(None)
    intensity: Optional[int] = Field(None, ge=1, le=10)

    # Custom tags for extensibility
    custom: List[str] = Field(default_factory=list)

    # Plugin extensions namespace
    # Keys must be namespaced as "<plugin_id>.<key>"
    extensions: Dict[str, Any] = Field(
        default_factory=dict,
        description="Plugin metadata namespace. Keys must be '<plugin_id>.<key>'",
    )

    model_config = ConfigDict(use_enum_values=True)

    @field_validator("location", mode="before")
    @classmethod
    def canonicalize_location(cls, v: Optional[str]) -> Optional[str]:
        return _canonicalize_location(v)

    @field_validator("pose", mode="before")
    @classmethod
    def canonicalize_pose(cls, v: Optional[str]) -> Optional[str]:
        return _canonicalize_pose(v)

    @field_validator("intimacy_level", mode="before")
    @classmethod
    def canonicalize_intimacy(cls, v: Optional[str]) -> Optional[str]:
        return _canonicalize_intimacy(v)

    @field_validator("mood", mode="before")
    @classmethod
    def canonicalize_mood(cls, v: Optional[str]) -> Optional[str]:
        return _canonicalize_mood(v)

    @field_validator("extensions", mode="after")
    @classmethod
    def validate_extensions(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        """Validate extension keys follow namespacing convention."""
        return _validate_extension_keys(v)

    def get_extension(self, plugin_id: str, key: str, default: Any = None) -> Any:
        """Get a plugin extension value."""
        full_key = f"{plugin_id}.{key}"
        return self.extensions.get(full_key, default)

    def set_extension(self, plugin_id: str, key: str, value: Any) -> None:
        """Set a plugin extension value. Note: ActionBlockTags is immutable by default."""
        full_key = f"{plugin_id}.{key}"
        self.extensions[full_key] = value


# ============================================================================
# UNIFIED ACTION BLOCK
# ============================================================================

class ActionBlock(BaseModel):
    """
    Unified action block schema.

    Supports both single-state and transition blocks through optional fields.
    Enhanced features (camera, consistency, intensity) are always available
    as Optional fields - no more hasattr() checks needed.

    Validation enforces:
    - single_state: referenceImage/referenceImages required, from_/to/via forbidden
    - transition: from_ and to required, top-level referenceImage(s) forbidden
    - prompt must not be empty
    - duration must be within bounds
    """
    model_config = ConfigDict(populate_by_name=True, use_enum_values=True)

    # === Identity ===
    id: str = Field(description="Unique identifier for this block")
    kind: Literal["single_state", "transition"] = Field(
        "single_state",
        description="Block type",
    )

    # === Tags ===
    tags: ActionBlockTags = Field(default_factory=ActionBlockTags)

    # === Single-state fields (used when kind="single_state") ===
    referenceImage: Optional[ReferenceImage] = Field(
        None,
        description="Reference image for single-state blocks",
    )
    referenceImages: List[ReferenceImage] = Field(
        default_factory=list,
        description="Optional list of reference images for multi-image composition",
    )
    isImageToVideo: bool = Field(
        True,
        description="Whether this uses image-to-video generation",
    )
    startPose: Optional[str] = Field(None, description="Abstract starting pose")
    endPose: Optional[str] = Field(None, description="Abstract ending pose")

    # === Transition fields (used when kind="transition") ===
    from_: Optional[TransitionEndpoint] = Field(
        None,
        alias="from",
        description="Starting point for transitions",
    )
    to: Optional[TransitionEndpoint] = Field(
        None,
        description="Ending point for transitions",
    )
    via: List[TransitionEndpoint] = Field(
        default_factory=list,
        max_length=5,
        description="Intermediate poses/frames",
    )

    # === Prompt ===
    prompt: str = Field(
        ...,
        min_length=1,
        description="Text prompt for video generation",
    )
    negativePrompt: Optional[str] = Field(None)
    style: Optional[str] = Field("soft_cinema")

    # === Enhanced features (always available, Optional) ===
    cameraMovement: Optional[CameraMovement] = Field(
        None,
        description="Camera movement specification",
    )
    consistency: Optional[ConsistencyFlags] = Field(
        None,
        description="Consistency flags for the clip",
    )
    intensityProgression: Optional[IntensityProgression] = Field(
        None,
        description="Intensity progression over duration",
    )

    # === Duration and chaining ===
    durationSec: float = Field(6.0, ge=3.0, le=12.0)
    compatibleNext: List[str] = Field(default_factory=list)
    compatiblePrev: List[str] = Field(default_factory=list)

    # === Metadata ===
    description: Optional[str] = Field(None)
    worldOverride: Optional[str] = Field(None)

    # === Plugin extensions ===
    # Keys must be namespaced as "<plugin_id>.<key>"
    extensions: Dict[str, Any] = Field(
        default_factory=dict,
        description="Plugin metadata namespace. Keys must be '<plugin_id>.<key>'",
    )

    # === Validators ===

    @field_validator("startPose", "endPose", mode="before")
    @classmethod
    def canonicalize_poses(cls, v: Optional[str]) -> Optional[str]:
        """Canonicalize pose IDs."""
        return _canonicalize_pose(v)

    @field_validator("extensions", mode="after")
    @classmethod
    def validate_extensions(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        """Validate extension keys follow namespacing convention."""
        return _validate_extension_keys(v)

    @model_validator(mode="after")
    def validate_kind_fields(self) -> "ActionBlock":
        """Validate fields based on kind."""
        if self.kind == "single_state":
            # Single-state: require referenceImage(s), forbid from_/to
            if self.referenceImage is None and not self.referenceImages:
                raise ValueError(
                    "single_state blocks require 'referenceImage' or 'referenceImages'"
                )
            if self.from_ is not None or self.to is not None:
                raise ValueError(
                    "single_state blocks cannot have 'from' or 'to' fields"
                )
        elif self.kind == "transition":
            # Transition: require from_ and to, forbid referenceImage
            if self.from_ is None or self.to is None:
                raise ValueError(
                    "transition blocks require both 'from' and 'to' fields"
                )
            if self.referenceImage is not None or self.referenceImages:
                raise ValueError(
                    "transition blocks cannot have 'referenceImage(s)' field"
                )

        return self

    # === Helpers ===
    def is_single_state(self) -> bool:
        """Check if this is a single-state block."""
        return self.kind == "single_state"

    def is_transition(self) -> bool:
        """Check if this is a transition block."""
        return self.kind == "transition"

    def total_images(self) -> int:
        """Get total number of reference images (for transitions)."""
        if self.kind == "transition" and self.from_ and self.to:
            total = 0
            endpoints = [self.from_, *self.via, self.to]
            for endpoint in endpoints:
                if endpoint.referenceImages:
                    total += len(endpoint.referenceImages)
                elif endpoint.referenceImage:
                    total += 1
            return total
        if self.referenceImages:
            return len(self.referenceImages)
        return 1 if self.referenceImage else 0

    def has_enhanced_features(self) -> bool:
        """Check if block uses any enhanced features."""
        return any([
            self.cameraMovement is not None,
            self.consistency is not None,
            self.intensityProgression is not None,
        ])

    def get_extension(self, plugin_id: str, key: str, default: Any = None) -> Any:
        """Get a plugin extension value from block-level extensions."""
        full_key = f"{plugin_id}.{key}"
        return self.extensions.get(full_key, default)

    def get_tag_extension(self, plugin_id: str, key: str, default: Any = None) -> Any:
        """Get a plugin extension value from tag-level extensions."""
        return self.tags.get_extension(plugin_id, key, default)

    def get_start_pose(self) -> Optional[str]:
        """Get starting pose regardless of kind."""
        if self.is_single_state():
            return self.startPose
        elif self.is_transition() and self.from_:
            return self.from_.pose
        return None

    def get_end_pose(self) -> Optional[str]:
        """Get ending pose regardless of kind."""
        if self.is_single_state():
            return self.endPose
        elif self.is_transition() and self.to:
            return self.to.pose
        return None


# ============================================================================
# SELECTION CONTEXT AND RESULT
# ============================================================================

class ActionSelectionContext(BaseModel):
    """Context for action block selection."""

    # Location and pose (canonicalized)
    locationTag: Optional[str] = Field(None)
    pose: Optional[str] = Field(None)

    # Relationship context (canonicalized)
    intimacy_level: Optional[str] = Field(None)
    mood: Optional[str] = Field(None)

    # Branching
    branchIntent: Optional[BranchIntent] = Field(None)
    previousBlockId: Optional[str] = Field(None)

    # Character references
    leadNpc: Optional[NpcRef] = Field(
        default=None,
        validation_alias=AliasChoices("leadNpc", "leadNpcId"),
    )
    partnerNpc: Optional[NpcRef] = Field(
        default=None,
        validation_alias=AliasChoices("partnerNpc", "partnerNpcId"),
    )

    # Filters
    requiredTags: List[str] = Field(default_factory=list)
    excludeTags: List[str] = Field(default_factory=list)
    maxDuration: Optional[float] = Field(None)

    # Content filtering
    max_content_rating: ContentRating = Field(ContentRating.MATURE_IMPLIED)
    world_id: Optional[str] = Field(None)

    model_config = ConfigDict(use_enum_values=True)

    # Canonicalize IDs
    @field_validator("locationTag", mode="before")
    @classmethod
    def canonicalize_location(cls, v: Optional[str]) -> Optional[str]:
        return _canonicalize_location(v)

    @field_validator("pose", mode="before")
    @classmethod
    def canonicalize_pose(cls, v: Optional[str]) -> Optional[str]:
        return _canonicalize_pose(v)

    @field_validator("intimacy_level", mode="before")
    @classmethod
    def canonicalize_intimacy(cls, v: Optional[str]) -> Optional[str]:
        return _canonicalize_intimacy(v)

    @field_validator("mood", mode="before")
    @classmethod
    def canonicalize_mood(cls, v: Optional[str]) -> Optional[str]:
        return _canonicalize_mood(v)

    # Legacy accessors
    @property
    def leadNpcId(self) -> Optional[int]:
        return self.leadNpc.id if self.leadNpc else None

    @property
    def partnerNpcId(self) -> Optional[int]:
        return self.partnerNpc.id if self.partnerNpc else None


class ActionSelectionResult(BaseModel):
    """Result from action block selection."""

    blocks: List[ActionBlock] = Field(default_factory=list)
    totalDuration: float = Field(0.0)

    # Resolution info
    resolvedImages: List[Dict[str, Any]] = Field(default_factory=list)
    compositionAssets: List[Dict[str, Any]] = Field(default_factory=list)

    # Metadata
    compatibilityScore: float = Field(1.0, ge=0.0, le=1.0)
    fallbackReason: Optional[str] = Field(None)

    # Ready for generation
    prompts: List[str] = Field(default_factory=list)
    segments: List[Dict[str, Any]] = Field(default_factory=list)


# ============================================================================
# BACKWARD COMPATIBILITY ALIASES
# ============================================================================

# These aliases allow gradual migration from v1/v2 types
SingleStateBlock = ActionBlock  # Use ActionBlock with kind="single_state"
TransitionBlock = ActionBlock   # Use ActionBlock with kind="transition"
EnhancedSingleStateBlock = ActionBlock
EnhancedTransitionBlock = ActionBlock
