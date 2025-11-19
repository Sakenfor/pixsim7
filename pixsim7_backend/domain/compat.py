"""
Backward Compatibility Layer for Legacy Job API

This module provides compatibility aliases for code that still references
the old Job/GenerationArtifact models. These are deprecated and will be
removed in a future version.

**DEPRECATED:** Use `Generation` directly instead.

Migration guide:
- `Job` → `Generation`
- `GenerationArtifact` → `Generation`

See: claude-tasks/15-unified-generation-request-path-and-job-deprecation.md
"""
import warnings

# Import the canonical model
from .generation import Generation

# Issue deprecation warnings when this module is imported
warnings.warn(
    "Importing from pixsim7_backend.domain.compat is deprecated. "
    "Use 'from pixsim7_backend.domain import Generation' instead. "
    "The Job and GenerationArtifact aliases will be removed in a future version. "
    "See: claude-tasks/15-unified-generation-request-path-and-job-deprecation.md",
    DeprecationWarning,
    stacklevel=2,
)

# Simple aliases (these just reference Generation)
Job = Generation
GenerationArtifact = Generation

__all__ = ["Job", "GenerationArtifact"]
