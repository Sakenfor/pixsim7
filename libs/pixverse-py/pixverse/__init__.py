"""
Pixverse Python SDK
Official Python client for Pixverse AI video generation

Example:
    >>> from pixverse import PixverseClient
    >>> client = PixverseClient(email="user@gmail.com", password="...")
    >>> video = client.create(prompt="a cat dancing in the rain")
    >>> print(video.url)
"""

from .client import PixverseClient
from .accounts import Account, AccountPool
from .models import (
    Video,
    Image,
    BaseVideoOptions,
    GenerationOptions,
    TransitionOptions,
    VideoModel,
    VideoModelSpec,
    ImageModel,
    ImageModelSpec,
    CameraMovement,
    ASPECT_RATIOS_ALL,
    ASPECT_RATIOS_LEGACY,
    is_pixverse_model,
    get_video_operation_fields,
    get_model_capabilities,
    filter_options_for_model,
)
from .exceptions import (
    PixverseError,
    AuthenticationError,
    RateLimitError,
    GenerationError,
    VideoNotFoundError,
    ContentModerationError,
)
from .pricing import (
    calculate_cost,
    get_pricing_table,
    calculate_transition_cost,
    calculate_feature_cost,
    normalize_quality,
)
from .video_utils import infer_video_dimensions, get_quality_from_dimensions, get_aspect_ratio

__version__ = "1.0.0"
__all__ = [
    # Client
    "PixverseClient",

    # Account management
    "Account",
    "AccountPool",

    # Models
    "Video",
    "Image",
    "BaseVideoOptions",
    "GenerationOptions",
    "TransitionOptions",
    "VideoModel",
    "VideoModelSpec",
    "ImageModel",
    "ImageModelSpec",
    "CameraMovement",
    "ASPECT_RATIOS_ALL",
    "ASPECT_RATIOS_LEGACY",
    "is_pixverse_model",
    "get_video_operation_fields",
    "get_model_capabilities",
    "filter_options_for_model",

    # Exceptions
    "PixverseError",
    "AuthenticationError",
    "RateLimitError",
    "GenerationError",
    "VideoNotFoundError",
    "ContentModerationError",

    # Pricing
    "calculate_cost",
    "get_pricing_table",
    "calculate_transition_cost",
    "calculate_feature_cost",
    "normalize_quality",

    # Video Utilities
    "infer_video_dimensions",
    "get_quality_from_dimensions",
    "get_aspect_ratio",
]
