"""
Prompt Block Services

Template composition, fit scoring, and dynamic slot planning utilities.
"""

from typing import TYPE_CHECKING

# Lazy re-export (PEP 562). ``template_service`` pulls in
# ``composition_role_inference`` / ``block_primitive_query``, which import
# ``CATEGORY_TO_COMPOSITION_ROLE`` from ``shared.composition``. The vocab bridge
# (triggered from ``shared.composition``'s own import-time registry load) imports
# the clean leaf ``block.primitive_loader`` via ``coverage`` — but an eager
# __init__ would drag ``template_service`` in too, re-entering ``shared.composition``
# while it is still mid-import and silently breaking primitive-concept bridging.
# Deferring these keeps ``from .block import primitive_loader`` cheap.
if TYPE_CHECKING:
    from .fit_scoring import compute_block_asset_fit
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

_LAZY_EXPORTS = {
    "compute_block_asset_fit": (".fit_scoring", "compute_block_asset_fit"),
    "BlockTemplateService": (".template_service", "BlockTemplateService"),
    "CharacterBindingExpander": (".character_expander", "CharacterBindingExpander"),
    "ComposerContextInput": (".dynamic_slot_planner", "ComposerContextInput"),
    "ComposerPlanRequest": (".dynamic_slot_planner", "ComposerPlanRequest"),
    "ComposerSlotDecision": (".dynamic_slot_planner", "ComposerSlotDecision"),
    "ComposerSlotPlan": (".dynamic_slot_planner", "ComposerSlotPlan"),
    "DynamicSlotPlanner": (".dynamic_slot_planner", "DynamicSlotPlanner"),
    "build_dynamic_slot_plan": (".dynamic_slot_planner", "build_dynamic_slot_plan"),
}


def __getattr__(name: str):
    spec = _LAZY_EXPORTS.get(name)
    if spec is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    import importlib

    module_path, attr = spec
    module = importlib.import_module(module_path, __name__)
    return getattr(module, attr)


__all__ = [
    "compute_block_asset_fit",
    "BlockTemplateService",
    "CharacterBindingExpander",
    "ComposerContextInput",
    "ComposerPlanRequest",
    "ComposerSlotDecision",
    "ComposerSlotPlan",
    "DynamicSlotPlanner",
    "build_dynamic_slot_plan",
]
