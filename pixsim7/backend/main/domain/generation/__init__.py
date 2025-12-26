"""
Generation domain package - Generation lifecycle.

Contains:
- Generation model (unified generation record)
- BlockImageFit model (fit scoring between blocks and images)

Note: PromptBlock has moved to domain.prompt.
Import it from: from pixsim7.backend.main.domain.prompt import PromptBlock
"""
from .models import Generation
from .block_image_fit import BlockImageFit

__all__ = [
    "Generation",
    "BlockImageFit",
]
