"""
Shared enums for PixSim7 domain models
"""
from enum import Enum


class MediaType(str, Enum):
    """Asset media type"""
    VIDEO = "video"
    IMAGE = "image"
    AUDIO = "audio"
    MODEL_3D = "3d_model"


class SyncStatus(str, Enum):
    """Asset synchronization status"""
    REMOTE = "remote"           # Only exists on provider
    DOWNLOADING = "downloading" # Download in progress
    DOWNLOADED = "downloaded"   # Local copy exists
    ERROR = "error"            # Download failed


class GenerationStatus(str, Enum):
    """Generation execution status"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class OperationType(str, Enum):
    """Video generation operation types"""
    TEXT_TO_VIDEO = "text_to_video"
    IMAGE_TO_VIDEO = "image_to_video"
    IMAGE_TO_IMAGE = "image_to_image"
    VIDEO_EXTEND = "video_extend"
    VIDEO_TRANSITION = "video_transition"
    FUSION = "fusion"


class AccountStatus(str, Enum):
    """Provider account status"""
    ACTIVE = "active"
    EXHAUSTED = "exhausted"
    ERROR = "error"
    DISABLED = "disabled"
    RATE_LIMITED = "rate_limited"


class VideoStatus(str, Enum):
    """Universal video status across providers"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    FILTERED = "filtered"  # Content policy violation
    CANCELLED = "cancelled"


class ContentDomain(str, Enum):
    """Content domain for specialized metadata"""
    GENERAL = "general"
    ADULT = "adult"
    MEDICAL = "medical"
    SPORTS = "sports"
    FASHION = "fashion"
    EDUCATION = "education"
