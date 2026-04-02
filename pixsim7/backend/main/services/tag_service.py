# Backward-compatible re-export.
# This module is kept so existing imports continue to work unchanged.
# New code should import from pixsim7.backend.main.services.tag directly.
from pixsim7.backend.main.services.tag import TagService, TagRegistry, TagAssignment  # noqa: F401

__all__ = ["TagService", "TagRegistry", "TagAssignment"]
