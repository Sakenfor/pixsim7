"""
Pixverse API Models

This module defines the data models and enums for Pixverse AI video and image generation.
It serves as the source of truth for available models, parameters, and operation-specific fields.
"""
from typing import Optional, Literal
from pydantic import BaseModel, Field


# ============================================================================
# Video Models
# ============================================================================

class VideoModel:
    """
    Available Pixverse video generation models

    Attributes:
        ALL: List of all available video models
        DEFAULT: Default model to use when none is specified
    """
    V3_5 = "v3.5"
    V4 = "v4"
    V5 = "v5"
    V5_5 = "v5.5"

    ALL = [V3_5, V4, V5, V5_5]
    DEFAULT = V5  # Default to v5 for balance of quality and speed


# ============================================================================
# Image Models
# ============================================================================

class ImageModel:
    """
    Available Pixverse image generation models

    Attributes:
        ALL: List of all available image models
        QUALITIES: Mapping of models to their supported quality presets
        ASPECT_RATIOS: List of supported aspect ratios for image generation
    """
    STANDARD = "standard"
    PRO = "pro"
    ULTRA = "ultra"

    ALL = [STANDARD, PRO, ULTRA]

    # Quality presets supported by each model
    QUALITIES = {
        STANDARD: ["360p", "540p", "720p"],
        PRO: ["540p", "720p", "1080p"],
        ULTRA: ["720p", "1080p"],
    }

    # Supported aspect ratios for image generation
    ASPECT_RATIOS = ["16:9", "9:16", "1:1"]


# ============================================================================
# Camera Movement Presets
# ============================================================================

class CameraMovement:
    """
    Camera movement presets for image-to-video generation

    Note: Camera movements only apply to image_to_video operations
    where there's a source image to animate with camera motion.
    """
    ZOOM_IN = "zoom_in"
    ZOOM_OUT = "zoom_out"
    PAN_LEFT = "pan_left"
    PAN_RIGHT = "pan_right"
    TILT_UP = "tilt_up"
    TILT_DOWN = "tilt_down"
    DOLLY_IN = "dolly_in"
    DOLLY_OUT = "dolly_out"
    ORBIT_LEFT = "orbit_left"
    ORBIT_RIGHT = "orbit_right"

    ALL = [
        ZOOM_IN, ZOOM_OUT,
        PAN_LEFT, PAN_RIGHT,
        TILT_UP, TILT_DOWN,
        DOLLY_IN, DOLLY_OUT,
        ORBIT_LEFT, ORBIT_RIGHT,
    ]


# ============================================================================
# Generation Options
# ============================================================================

class GenerationOptions(BaseModel):
    """
    Comprehensive options for Pixverse video generation

    This is the canonical schema for video generation parameters.
    Different operations (text_to_video, image_to_video, video_extend)
    use different subsets of these fields.

    Use get_video_operation_fields(operation) to determine which fields
    apply to a specific operation.
    """
    # Core generation parameters
    model: Optional[str] = Field(default=VideoModel.DEFAULT, description="Video model version (v3.5, v4, v5, v5.5)")
    quality: Optional[str] = Field(default="720p", description="Output resolution (360p, 540p, 720p, 1080p)")
    duration: Optional[int] = Field(default=5, description="Video duration in seconds (1-20)", ge=1, le=20)

    # Visual parameters
    aspect_ratio: Optional[str] = Field(default="16:9", description="Frame aspect ratio (16:9, 9:16, 1:1)")
    seed: Optional[int] = Field(default=0, description="Deterministic seed (0 for random)")

    # Style and motion parameters
    motion_mode: Optional[Literal["cinematic", "dynamic", "steady"]] = Field(default=None, description="Camera/motion style")
    negative_prompt: Optional[str] = Field(default=None, description="Elements to discourage in generation")
    camera_movement: Optional[str] = Field(default=None, description="Camera movement preset (image_to_video only)")
    style: Optional[str] = Field(default=None, description="High-level style (e.g., anime, photoreal)")
    template_id: Optional[str] = Field(default=None, description="Pixverse template reference")

    # Advanced v5.5+ features
    multi_shot: Optional[bool] = Field(default=False, description="Enable multi-shot video generation (v5.5+ only)")
    audio: Optional[bool] = Field(default=False, description="Enable native audio generation (v5.5+ only)")

    # Credits and processing options
    off_peak: Optional[bool] = Field(default=False, description="Queue for off-peak processing (subscription accounts)")


class TransitionOptions(BaseModel):
    """Options for video transition generation"""
    quality: Optional[str] = Field(default="720p", description="Output resolution")
    duration: Optional[int] = Field(default=5, description="Transition duration in seconds")


# ============================================================================
# Video Operation Field Mappings
# ============================================================================

# Define which GenerationOptions fields apply to which video operations
# This is the authoritative mapping that UI frameworks and adapters should use
VIDEO_OPERATION_FIELDS = {
    "text_to_video": [
        "model",
        "quality",
        "duration",
        "aspect_ratio",  # Can specify aspect ratio explicitly for text-to-video
        "seed",
        "motion_mode",
        "style",
        "negative_prompt",
        "template_id",
        "multi_shot",  # v5.5+ only
        "audio",  # v5.5+ only
        "off_peak",
    ],
    "image_to_video": [
        "model",
        "quality",
        "duration",
        # NO aspect_ratio - follows source image aspect ratio
        "seed",
        "camera_movement",  # Only for image_to_video
        "motion_mode",
        "style",
        "negative_prompt",
        "multi_shot",  # v5.5+ only
        "audio",  # v5.5+ only
        "off_peak",
    ],
    "video_extend": [
        "model",
        "quality",
        "duration",
        # NO aspect_ratio - follows source video
        "seed",
        "multi_shot",  # v5.5+ only
        "audio",  # v5.5+ only
        "off_peak",
    ],
}


def get_video_operation_fields(operation: str) -> list[str]:
    """
    Get the list of GenerationOptions fields that apply to a specific video operation.

    This is the canonical way for adapters and UI frameworks to determine which
    parameters should be exposed for each operation type.

    Args:
        operation: The video operation name (e.g., "text_to_video", "image_to_video", "video_extend")

    Returns:
        List of field names from GenerationOptions that apply to this operation

    Raises:
        ValueError: If the operation is not recognized

    Example:
        >>> fields = get_video_operation_fields("text_to_video")
        >>> "aspect_ratio" in fields
        True
        >>> fields = get_video_operation_fields("image_to_video")
        >>> "aspect_ratio" in fields
        False
        >>> "camera_movement" in fields
        True
    """
    if operation not in VIDEO_OPERATION_FIELDS:
        raise ValueError(
            f"Unknown video operation: {operation}. "
            f"Supported operations: {', '.join(VIDEO_OPERATION_FIELDS.keys())}"
        )

    return VIDEO_OPERATION_FIELDS[operation].copy()  # Return a copy to prevent mutation


# ============================================================================
# Helper Functions for UI Metadata
# ============================================================================

def get_model_capabilities(model: str) -> dict[str, bool]:
    """
    Get capabilities for a specific video model.

    Args:
        model: Video model version (e.g., "v5", "v5.5")

    Returns:
        Dictionary of capability flags

    Example:
        >>> caps = get_model_capabilities("v5.5")
        >>> caps["multi_shot"]
        True
        >>> caps = get_model_capabilities("v5")
        >>> caps["multi_shot"]
        False
    """
    # v5.5+ supports multi_shot and audio
    supports_advanced = model in [VideoModel.V5_5]

    return {
        "multi_shot": supports_advanced,
        "audio": supports_advanced,
        "camera_movement": True,  # All models support camera movement for image_to_video
        "motion_mode": True,  # All models support motion modes
    }


def validate_operation_params(operation: str, params: dict) -> tuple[bool, Optional[str]]:
    """
    Validate that parameters are appropriate for the given operation.

    Args:
        operation: The video operation name
        params: Parameter dictionary to validate

    Returns:
        Tuple of (is_valid, error_message)

    Example:
        >>> valid, error = validate_operation_params("image_to_video", {"aspect_ratio": "16:9"})
        >>> valid
        False
        >>> "aspect_ratio" in error
        True
    """
    try:
        valid_fields = get_video_operation_fields(operation)
    except ValueError as e:
        return False, str(e)

    # Check for invalid fields
    invalid_fields = [k for k in params.keys() if k not in valid_fields and k not in ["prompt", "image_url", "video_url"]]

    if invalid_fields:
        return False, f"Invalid fields for {operation}: {', '.join(invalid_fields)}"

    return True, None
