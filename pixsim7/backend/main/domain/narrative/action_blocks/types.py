"""
Action Block type definitions for visual generation.
"""

from typing import Dict, Any, List, Optional, Union, Literal
from enum import Enum
from pydantic import BaseModel, Field, ConfigDict


class BranchIntent(str, Enum):
    """
    Branch intent types that align with narrative suggested intents.
    These control the narrative direction when selecting next blocks.
    """
    ESCALATE = "escalate"           # Increase intimacy/intensity
    COOL_DOWN = "cool_down"          # Reduce tension/intensity
    SIDE_BRANCH = "side_branch"      # Divergent event (interruption, etc.)
    MAINTAIN = "maintain"            # Keep current intensity level
    RESOLVE = "resolve"              # Resolve tension/conflict


class ReferenceImage(BaseModel):
    """
    Reference to an image asset for video generation.
    Can be either a specific asset or a template query.
    """
    # Option 1: Specific asset reference (world-specific)
    assetId: Optional[int] = Field(None, description="Specific asset ID if locked")

    # Option 2: Template query (global library)
    npcId: Optional[int] = Field(None, description="NPC ID for template matching")
    tags: List[str] = Field(default_factory=list, description="Tags to match assets")

    # Option 3: External URL (for prototyping/import)
    url: Optional[str] = Field(None, description="External URL for prototyping")

    # Framing information
    crop: Literal["full_body", "waist_up", "portrait"] = "full_body"

    def is_resolved(self) -> bool:
        """Check if this reference points to a specific asset."""
        return self.assetId is not None or self.url is not None

    def is_template(self) -> bool:
        """Check if this is a template that needs resolution."""
        return self.assetId is None and self.url is None


class ActionBlockTags(BaseModel):
    """
    Semantic tags for filtering and matching action blocks.
    """
    # Location and physical context
    location: Optional[str] = Field(None, description="Location tag: bench_park, bar, sofa, etc.")
    pose: Optional[str] = Field(None, description="Pose/position: sitting_close, standing_near, lying_down")

    # Emotional and relational context
    intimacy_level: Optional[str] = Field(None, description="Required intimacy: light_flirt, deep_flirt, intimate, very_intimate")
    mood: Optional[str] = Field(None, description="Emotional tone: playful, tender, passionate, conflicted")

    # Environmental context
    time_of_day: Optional[str] = Field(None, description="Time: morning, afternoon, evening, night")
    indoors: Optional[bool] = Field(None, description="Indoor vs outdoor setting")

    # Action characteristics
    branch_type: Optional[BranchIntent] = Field(None, description="What branch intent this serves")
    intensity: Optional[int] = Field(None, description="Action intensity 1-10")

    # Custom tags
    custom: List[str] = Field(default_factory=list, description="Additional custom tags")


class TransitionEndpoint(BaseModel):
    """
    Start or end point of a transition.
    """
    referenceImage: ReferenceImage
    pose: str = Field(description="Abstract pose identifier for chaining")


class BaseActionBlock(BaseModel):
    """
    Base class for all action blocks.
    """
    id: str = Field(description="Unique identifier for this block")
    tags: ActionBlockTags = Field(default_factory=ActionBlockTags)

    # Prompt information
    prompt: str = Field(description="Text prompt for video generation, with {{variables}}")
    negativePrompt: Optional[str] = Field(None, description="What to avoid in generation")
    style: Optional[str] = Field("soft_cinema", description="Visual style hint")

    # Duration
    durationSec: float = Field(6.0, ge=3.0, le=12.0, description="Target duration in seconds")

    # Compatibility for chaining
    compatibleNext: List[str] = Field(default_factory=list, description="Block IDs that can follow")
    compatiblePrev: List[str] = Field(default_factory=list, description="Block IDs that can precede")

    # Metadata
    description: Optional[str] = Field(None, description="Human-readable description")
    worldOverride: Optional[str] = Field(None, description="World ID if this is a world-specific override")

    class Config:
        use_enum_values = True


class SingleStateBlock(BaseActionBlock):
    """
    Action block for motion from a single reference image.
    Generates movement/action starting from one still.
    """
    kind: Literal["single_state"] = "single_state"

    # Reference image
    referenceImage: ReferenceImage
    isImageToVideo: bool = Field(True, description="Whether this uses image-to-video generation")

    # Pose tracking for chaining
    startPose: str = Field(description="Abstract starting pose")
    endPose: str = Field(description="Abstract ending pose")


class TransitionBlock(BaseActionBlock):
    """
    Action block for transitions between multiple reference images.
    Morphs smoothly between 2-7 stills to show movement.
    """
    model_config = ConfigDict(populate_by_name=True)

    kind: Literal["transition"] = "transition"

    # Endpoints
    from_: TransitionEndpoint = Field(alias="from", description="Starting point")
    to: TransitionEndpoint = Field(description="Ending point")

    # Optional intermediate frames (0-5 additional)
    via: List[TransitionEndpoint] = Field(
        default_factory=list,
        max_items=5,
        description="Intermediate poses/frames"
    )

    def total_images(self) -> int:
        """Get total number of reference images."""
        return 2 + len(self.via)  # from + to + via images


# Union type for all action blocks
ActionBlock = Union[SingleStateBlock, TransitionBlock]


class ActionSelectionContext(BaseModel):
    """
    Context provided to the action engine for selecting blocks.
    This is a simplified version of the full narrative context.
    """
    # Location and pose
    locationTag: Optional[str] = Field(None, description="Current location tag")
    pose: Optional[str] = Field(None, description="Current or desired pose")

    # Relationship context (from narrative engine)
    intimacy_level: Optional[str] = Field(None, description="Computed intimacy level")
    mood: Optional[str] = Field(None, description="Current emotional mood")

    # Branching intent
    branchIntent: Optional[BranchIntent] = Field(None, description="Desired narrative direction")
    previousBlockId: Optional[str] = Field(None, description="Previous block for chaining")

    # Character references
    leadNpcId: int = Field(description="Primary NPC/lead character")
    partnerNpcId: Optional[int] = Field(None, description="Partner/secondary character if applicable")

    # Optional filters
    requiredTags: List[str] = Field(default_factory=list, description="Tags that must be present")
    excludeTags: List[str] = Field(default_factory=list, description="Tags to exclude")
    maxDuration: Optional[float] = Field(None, description="Maximum total duration if chaining")


class ActionSelectionResult(BaseModel):
    """
    Result from the action engine selector.
    """
    blocks: List[ActionBlock] = Field(description="Selected block(s) in sequence")
    totalDuration: float = Field(description="Total duration of all blocks")

    # Resolution info
    resolvedImages: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Resolved asset references with IDs and URLs"
    )

    # Metadata
    compatibilityScore: float = Field(
        1.0,
        ge=0.0,
        le=1.0,
        description="How well the selection matches the context (1.0 = perfect)"
    )
    fallbackReason: Optional[str] = Field(
        None,
        description="If compatibility < 1.0, explains what was relaxed"
    )

    # Ready for generation
    prompts: List[str] = Field(
        default_factory=list,
        description="Fully resolved prompts ready for video generation"
    )
    segments: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="MediaSegment-compatible objects for scene integration"
    )