"""
Prompt Block Services

Block management, extraction, composition, and concept registry.
Re-exports from action_blocks for backward compatibility during migration.
"""

# Re-export from old location during migration
from pixsim7.backend.main.services.action_blocks.action_block_service import ActionBlockService as PromptBlockService
from pixsim7.backend.main.services.action_blocks.composition_engine import BlockCompositionEngine
from pixsim7.backend.main.services.action_blocks.ai_extractor import AIActionBlockExtractor as AIBlockExtractor
from pixsim7.backend.main.services.action_blocks.concept_registry_service import ConceptRegistry
from pixsim7.backend.main.services.action_blocks.extraction_config_service import (
    ExtractionConfigService,
    ExtractionConfig,
)
from pixsim7.backend.main.services.action_blocks.fit_scoring import compute_block_asset_fit
from pixsim7.backend.main.services.action_blocks.tagging import normalize_tags

__all__ = [
    "PromptBlockService",
    "BlockCompositionEngine",
    "AIBlockExtractor",
    "ConceptRegistry",
    "ExtractionConfigService",
    "ExtractionConfig",
    "compute_block_asset_fit",
    "normalize_tags",
]
