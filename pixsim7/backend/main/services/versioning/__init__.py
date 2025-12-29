"""
Shared versioning abstractions for git-like entity versioning.

This module provides base classes and utilities that can be used by any
entity that needs git-like versioning (prompts, assets, etc.).

Key concepts:
- VersionFamily: Groups related versions (like a git repo)
- VersionedEntity: An entity with version metadata (like a git commit)
- VersioningService: Operations on versioned entities (timeline, ancestry, etc.)
"""

from pixsim7.backend.main.services.versioning.base import (
    VersionFamilyProtocol,
    VersionedEntityProtocol,
    VersionContext,
    TimelineEntry,
    VersioningServiceBase,
)
from pixsim7.backend.main.services.versioning.utils import (
    format_timedelta,
    compute_version_stats,
)

__all__ = [
    # Protocols
    "VersionFamilyProtocol",
    "VersionedEntityProtocol",
    # Data classes
    "VersionContext",
    "TimelineEntry",
    # Base service
    "VersioningServiceBase",
    # Utilities
    "format_timedelta",
    "compute_version_stats",
]
