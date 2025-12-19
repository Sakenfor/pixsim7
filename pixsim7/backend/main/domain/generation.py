"""
DEPRECATED: Legacy generation module shim.

Moved to pixsim7.backend.main.domain.generation.models.
This module re-exports from there for backward compatibility.

Migration:
    # Old (deprecated):
    from pixsim7.backend.main.domain.generation import Generation

    # New (preferred):
    from pixsim7.backend.main.domain.generation import Generation
"""
from pixsim7.backend.main.domain.generation.models import Generation

__all__ = ["Generation"]
