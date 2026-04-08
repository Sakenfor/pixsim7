"""
Generation domain package - Generation lifecycle.

Contains:
- Generation model (unified generation record)
- GenerationBatchItemManifest model (batch/run provenance)
- GenerationChain model (sequential orchestration plan)
- ChainExecution model (chain execution tracking)
- BlockImageFit model (fit scoring between blocks and images)
"""
from .models import Generation, GenerationBatchItemManifest
from .chain import GenerationChain, ChainExecution
from .block_image_fit import BlockImageFit

__all__ = [
    "Generation",
    "GenerationBatchItemManifest",
    "GenerationChain",
    "ChainExecution",
    "BlockImageFit",
]
