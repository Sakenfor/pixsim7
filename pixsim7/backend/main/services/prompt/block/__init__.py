"""
Prompt Block Services

Template composition, fit scoring, and dynamic slot planning utilities.
"""

from .fit_scoring import compute_block_asset_fit
from .tagging import normalize_tags
from .template_service import BlockTemplateService
from .character_expander import CharacterBindingExpander
from .dynamic_slot_planner import (
    ComposerContextInput,
    ComposerPlanRequest,
    ComposerSlotDecision,
    ComposerSlotPlan,
    DynamicSlotPlanner,
    build_dynamic_slot_plan,
)

__all__ = [
    "compute_block_asset_fit",
    "normalize_tags",
    "BlockTemplateService",
    "CharacterBindingExpander",
    "ComposerContextInput",
    "ComposerPlanRequest",
    "ComposerSlotDecision",
    "ComposerSlotPlan",
    "DynamicSlotPlanner",
    "build_dynamic_slot_plan",
]
