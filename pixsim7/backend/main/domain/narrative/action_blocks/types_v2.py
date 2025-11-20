"""
Enhanced Action Block type definitions v2 with camera and consistency support.
"""

from typing import Dict, Any, List, Optional, Union, Literal
from enum import Enum
from pydantic import BaseModel, Field

# Import base types from v1
from .types import (
    BranchIntent,
    ReferenceImage,
    TransitionEndpoint
)


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


class CameraMovement(BaseModel):
    """Camera movement specification for a clip."""
    type: CameraMovementType = Field(
        CameraMovementType.STATIC,
        description="Type of camera movement"
    )
    speed: Optional[CameraSpeed] = Field(
        None,
        description="Speed of movement (if not static)"
    )
    path: Optional[CameraPath] = Field(
        None,
        description="Path of movement (if applicable)"
    )
    focus: str = Field(
        "subjects",
        description="What to keep in frame/focus"
    )


class ConsistencyFlags(BaseModel):
    """What elements should remain consistent throughout the clip."""
    maintainPose: bool = Field(
        False,
        description="Character maintains original pose throughout"
    )
    preserveLighting: bool = Field(
        True,
        description="Lighting remains consistent"
    )
    preserveClothing: bool = Field(
        True,
        description="Clothing state remains consistent"
    )
    preservePosition: bool = Field(
        False,
        description="Characters stay in same positions"
    )


class IntensityProgression(BaseModel):
    """Optional intensity progression over the clip duration."""
    start: int = Field(ge=1, le=10, description="Starting intensity")
    peak: int = Field(ge=1, le=10, description="Peak intensity")
    end: int = Field(ge=1, le=10, description="Ending intensity")
    pattern: IntensityPattern = Field(
        IntensityPattern.STEADY,
        description="How intensity changes"
    )


class EnhancedActionBlockTags(BaseModel):
    """
    Enhanced semantic tags including content rating.
    """
    # Location and physical context
    location: Optional[str] = Field(None, description="Location tag")
    pose: Optional[str] = Field(None, description="Pose/position")

    # Emotional and relational context
    intimacy_level: Optional[str] = Field(None, description="Required intimacy")
    mood: Optional[str] = Field(None, description="Emotional tone")

    # Content rating and filtering
    content_rating: ContentRating = Field(
        ContentRating.GENERAL,
        description="Content appropriateness level"
    )
    requires_age_verification: bool = Field(
        False,
        description="Whether age verification is required"
    )

    # Environmental context
    time_of_day: Optional[str] = Field(None, description="Time setting")
    indoors: Optional[bool] = Field(None, description="Indoor vs outdoor")

    # Action characteristics
    branch_type: Optional[BranchIntent] = Field(None, description="Branch intent")
    intensity: Optional[int] = Field(None, ge=1, le=10, description="Action intensity")

    # Custom tags
    custom: List[str] = Field(default_factory=list, description="Additional tags")


class EnhancedSingleStateBlock(BaseModel):
    """
    Enhanced single-state action block with camera and consistency support.
    """
    id: str = Field(description="Unique identifier")
    kind: Literal["single_state"] = "single_state"
    tags: EnhancedActionBlockTags = Field(default_factory=EnhancedActionBlockTags)

    # Core action definition
    referenceImage: ReferenceImage
    isImageToVideo: bool = Field(True)
    startPose: str = Field(description="Abstract starting pose")
    endPose: str = Field(description="Abstract ending pose")

    # Prompt
    prompt: str = Field(description="Generation prompt with {{variables}}")
    negativePrompt: Optional[str] = None
    style: Optional[str] = Field("soft_cinema")

    # Camera and consistency
    cameraMovement: Optional[CameraMovement] = None
    consistency: Optional[ConsistencyFlags] = None

    # Optional intensity progression
    intensityProgression: Optional[IntensityProgression] = None

    # Duration and chaining
    durationSec: float = Field(6.0, ge=3.0, le=12.0)
    compatibleNext: List[str] = Field(default_factory=list)
    compatiblePrev: List[str] = Field(default_factory=list)

    # Metadata
    description: Optional[str] = None
    worldOverride: Optional[str] = None

    class Config:
        use_enum_values = True


class EnhancedTransitionBlock(BaseModel):
    """
    Enhanced transition block with camera and consistency support.
    """
    id: str = Field(description="Unique identifier")
    kind: Literal["transition"] = "transition"
    tags: EnhancedActionBlockTags = Field(default_factory=EnhancedActionBlockTags)

    # Transition endpoints
    from_: TransitionEndpoint = Field(alias="from")
    to: TransitionEndpoint
    via: List[TransitionEndpoint] = Field(default_factory=list, max_items=5)

    # Prompt
    prompt: str = Field(description="Generation prompt")
    negativePrompt: Optional[str] = None
    style: Optional[str] = Field("soft_cinema")

    # Camera and consistency
    cameraMovement: Optional[CameraMovement] = None
    consistency: Optional[ConsistencyFlags] = None

    # Optional intensity progression
    intensityProgression: Optional[IntensityProgression] = None

    # Duration and chaining
    durationSec: float = Field(7.0, ge=3.0, le=12.0)
    compatibleNext: List[str] = Field(default_factory=list)
    compatiblePrev: List[str] = Field(default_factory=list)

    # Metadata
    description: Optional[str] = None
    worldOverride: Optional[str] = None

    class Config:
        use_enum_values = True