"""
Prompt Block Services

Block management, extraction, composition, and concept registry.
"""

from .action_block_service import ActionBlockService, ActionBlockService as PromptBlockService
from .migration_service import ActionBlockMigrationService
from .composition_engine import BlockCompositionEngine
from .ai_extractor import AIActionBlockExtractor, AIActionBlockExtractor as AIBlockExtractor
from .concept_registry_service import ConceptRegistry
from .extraction_config_service import (
    ExtractionConfigService,
    ExtractionConfig,
)
from .fit_scoring import compute_block_asset_fit
from .tagging import normalize_tags

__all__ = [
    "ActionBlockService",
    "ActionBlockMigrationService",
    "AIActionBlockExtractor",
    "PromptBlockService",
    "BlockCompositionEngine",
    "AIBlockExtractor",
    "ConceptRegistry",
    "ExtractionConfigService",
    "ExtractionConfig",
    "compute_block_asset_fit",
    "normalize_tags",
]
