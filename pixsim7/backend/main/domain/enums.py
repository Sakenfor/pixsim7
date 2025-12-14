"""
Shared enums for PixSim7 domain models
"""
from enum import Enum
from typing import Type

from sqlalchemy import Column, Enum as SAEnum


def enum_column(enum_cls: Type[Enum], name: str, index: bool = False) -> Column:
    """Create SQLAlchemy Enum column that properly maps str,Enum values.

    Uses values_callable to ensure lowercase enum values are used for storage.
    The enum name is prefixed with underscore to avoid conflicts with any
    cached enum types that may have been created with wrong values.

    Args:
        enum_cls: The Python Enum class (must inherit from str, Enum)
        name: The database enum type name
        index: Whether to create an index on this column
    """
    return Column(
        SAEnum(
            enum_cls,
            name=f"_{name}",  # Prefix to avoid cache conflicts with old types
            native_enum=False,
            create_constraint=False,
            values_callable=lambda x: [e.value for e in x],
        ),
        index=index,
    )


def normalize_enum(v, enum_cls: Type[Enum]):
    """Normalize enum value - handles both uppercase DB values and enum instances.

    Use this in Pydantic field_validators or SQLAlchemy model validators to
    handle legacy uppercase enum values stored in the database.

    Args:
        v: The value to normalize (can be enum instance, string, or None)
        enum_cls: The target enum class

    Returns:
        The enum member, or the original value if already correct type or None
    """
    if v is None or isinstance(v, enum_cls):
        return v
    if isinstance(v, str):
        return enum_cls(v.lower())
    return v


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
    """Content generation operation types"""
    TEXT_TO_IMAGE = "text_to_image"
    IMAGE_TO_IMAGE = "image_to_image"
    TEXT_TO_VIDEO = "text_to_video"
    IMAGE_TO_VIDEO = "image_to_video"
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


class ProviderStatus(str, Enum):
    """Universal provider operation status (for images, videos, and all generation types)"""
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


class BillingState(str, Enum):
    """Generation billing state"""
    PENDING = "pending"    # Not yet charged (generation in progress)
    CHARGED = "charged"    # Credits successfully deducted
    SKIPPED = "skipped"    # No charge (failed/cancelled generation)
    FAILED = "failed"      # Deduction attempted but failed
