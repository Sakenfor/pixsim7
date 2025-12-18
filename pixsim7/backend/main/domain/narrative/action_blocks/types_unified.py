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
"""

from typing import Dict, Any, List, Optional, Union, Literal
from enum import Enum
from pydantic import BaseModel, Field, ConfigDict, AliasChoices

from pixsim7.backend.main.shared.schemas.entity_ref import (
    AssetRef,
    NpcRef,
    PoseRef,
    MoodRef,
    IntimacyLevelRef,
    ContentRatingRef,
    BranchIntentRef,
    LocationRef,
)


# ============================================================================
# ENUMS
# ============================================================================

class BranchIntent(str, Enum):
    """Branch intent types for narrative direction."""
    ESCALATE = "escalate"
    COOL_DOWN = "cool_down"
    SIDE_BRANCH = "side_branch"
    MAINTAIN = "maintain"
    RESOLVE = "resolve"


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
    """Content rating levels for filtering."""
    GENERAL = "general"
    SUGGESTIVE = "suggestive"
    INTIMATE = "intimate"
    EXPLICIT = "explicit"


class IntensityPattern(str, Enum):
    """Pattern of intensity change over time."""
    STEADY = "steady"
    BUILDING = "building"
    PULSING = "pulsing"
    DECLINING = "declining"


# ============================================================================
# COMPONENT SCHEMAS
# ============================================================================

class ReferenceImage(BaseModel):
    """Reference to an image asset for video generation."""

    # Specific asset reference
    asset: AssetRef = Field(
        default=None,
        validation_alias=AliasChoices("asset", "assetId"),
        description="Specific asset reference",
    )

    # Template query
    npc: NpcRef = Field(
        default=None,
        validation_alias=AliasChoices("npc", "npcId"),
        description="NPC reference for template matching",
    )
    tags: List[str] = Field(default_factory=list, description="Tags to match assets")

    # External URL
    url: Optional[str] = Field(None, description="External URL for prototyping")

    # Framing
    crop: Literal["full_body", "waist_up", "portrait"] = "full_body"

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
    referenceImage: ReferenceImage
    pose: str = Field(description="Abstract pose identifier for chaining")


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

class ActionBlockTags(BaseModel):
    """
    Unified semantic tags for action blocks.
    Uses typed refs for ontology-backed values where possible.
    """
    # Location (typed ref to ontology.yaml locations)
    location: Optional[str] = Field(
        None,
        description="Location tag (e.g., bench_park, bar_lounge)",
    )

    # Pose (typed ref to ontology.yaml poses)
    pose: Optional[str] = Field(
        None,
        description="Pose/position identifier",
    )

    # Intimacy level
    intimacy_level: Optional[str] = Field(
        None,
        description="Required intimacy level",
    )

    # Mood/emotional tone
    mood: Optional[str] = Field(
        None,
        description="Emotional tone",
    )

    # Content rating
    content_rating: ContentRating = Field(
        ContentRating.GENERAL,
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

    class Config:
        use_enum_values = True


# ============================================================================
# UNIFIED ACTION BLOCK
# ============================================================================

class ActionBlock(BaseModel):
    """
    Unified action block schema.

    Supports both single-state and transition blocks through optional fields.
    Enhanced features (camera, consistency, intensity) are always available
    as Optional fields - no more hasattr() checks needed.
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
    prompt: str = Field(description="Text prompt for video generation")
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
            return 2 + len(self.via)
        return 1 if self.referenceImage else 0

    def has_enhanced_features(self) -> bool:
        """Check if block uses any enhanced features."""
        return any([
            self.cameraMovement is not None,
            self.consistency is not None,
            self.intensityProgression is not None,
        ])


# ============================================================================
# SELECTION CONTEXT AND RESULT
# ============================================================================

class ActionSelectionContext(BaseModel):
    """Context for action block selection."""

    # Location and pose
    locationTag: Optional[str] = Field(None)
    pose: Optional[str] = Field(None)

    # Relationship context
    intimacy_level: Optional[str] = Field(None)
    mood: Optional[str] = Field(None)

    # Branching
    branchIntent: Optional[BranchIntent] = Field(None)
    previousBlockId: Optional[str] = Field(None)

    # Character references
    leadNpc: NpcRef = Field(
        ...,
        validation_alias=AliasChoices("leadNpc", "leadNpcId"),
    )
    partnerNpc: NpcRef = Field(
        default=None,
        validation_alias=AliasChoices("partnerNpc", "partnerNpcId"),
    )

    # Filters
    requiredTags: List[str] = Field(default_factory=list)
    excludeTags: List[str] = Field(default_factory=list)
    maxDuration: Optional[float] = Field(None)

    # Content filtering
    max_content_rating: ContentRating = Field(ContentRating.INTIMATE)
    world_id: Optional[str] = Field(None)

    # Legacy accessors
    @property
    def leadNpcId(self) -> int:
        return self.leadNpc.id if self.leadNpc else 0

    @property
    def partnerNpcId(self) -> Optional[int]:
        return self.partnerNpc.id if self.partnerNpc else None


class ActionSelectionResult(BaseModel):
    """Result from action block selection."""

    blocks: List[ActionBlock] = Field(default_factory=list)
    totalDuration: float = Field(0.0)

    # Resolution info
    resolvedImages: List[Dict[str, Any]] = Field(default_factory=list)

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
