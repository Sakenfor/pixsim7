"""
Pixverse Python SDK

A Python SDK for interacting with Pixverse AI video and image generation services.

This SDK provides:
- Data models for video and image generation options
- Enums for supported models, qualities, and camera movements
- UI metadata helpers for building dynamic generation interfaces

For UI frameworks and adapters, use get_video_operation_fields() to determine
which parameters should be exposed for each operation type.
"""

from pixverse.models import (
    VideoModel,
    ImageModel,
    CameraMovement,
    GenerationOptions,
    TransitionOptions,
    get_video_operation_fields,
    get_model_capabilities,
    validate_operation_params,
    VIDEO_OPERATION_FIELDS,
)

__version__ = "1.0.0"

__all__ = [
    # Version
    "__version__",

    # Model enums
    "VideoModel",
    "ImageModel",
    "CameraMovement",

    # Data models
    "GenerationOptions",
    "TransitionOptions",

    # UI metadata helpers (primary API for adapters/UIs)
    "get_video_operation_fields",
    "get_model_capabilities",
    "validate_operation_params",
    "VIDEO_OPERATION_FIELDS",
]
