"""
Generation domain package - Generation lifecycle and action blocks.

Contains:
- Generation model (unified generation record)
- ActionBlockDB model (reusable prompt components)
- BlockImageFit model (fit scoring between blocks and images)

Usage:
    from pixsim7.backend.main.domain.generation import Generation
    from pixsim7.backend.main.domain.generation import ActionBlockDB
    from pixsim7.backend.main.domain.generation import BlockImageFit
"""
from .models import Generation
from .action_block import ActionBlockDB
from .block_image_fit import BlockImageFit

__all__ = [
    "Generation",
    "ActionBlockDB",
    "BlockImageFit",
]
