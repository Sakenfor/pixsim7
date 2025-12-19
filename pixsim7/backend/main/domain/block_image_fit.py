"""
DEPRECATED: Legacy block_image_fit module shim.

Moved to pixsim7.backend.main.domain.generation.block_image_fit.
This module re-exports from there for backward compatibility.

Migration:
    # Old (deprecated):
    from pixsim7.backend.main.domain.block_image_fit import BlockImageFit

    # New (preferred):
    from pixsim7.backend.main.domain.generation import BlockImageFit
"""
from pixsim7.backend.main.domain.generation.block_image_fit import BlockImageFit

__all__ = ["BlockImageFit"]
