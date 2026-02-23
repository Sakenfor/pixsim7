"""
Chain step guidance inheritance — compile per-step guidance from inherited
sections and step-local overrides.

Inheritance defaults (from SEQUENTIAL_GENERATION_DESIGN.md §6.7):
- **references**: inherit by default (stable cast identity across steps)
- **regions**: do NOT inherit by default (layout changes after crop/refine)
- **masks**: do NOT inherit by default (step-specific editing intent)
- **constraints**: inherit by default (shallow-merge, later steps can tighten)
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from pixsim7.backend.main.shared.schemas.guidance_plan import GuidancePlanV1
from pixsim7.backend.main.services.guidance.compiler import merge_guidance_plans

logger = logging.getLogger(__name__)

# Section-level inheritance defaults
INHERIT_DEFAULTS: Dict[str, bool] = {
    "references": True,
    "regions": False,
    "masks": False,
    "constraints": True,
}


def compile_chain_step_guidance(
    previous_compiled: Optional[Dict[str, Any]],
    step_guidance: Optional[Dict[str, Any]],
    guidance_inherit: Optional[Dict[str, bool]] = None,
) -> Tuple[Optional[GuidancePlanV1], List[str]]:
    """Compile the effective guidance plan for a single chain step.

    Merges inherited sections from the previous step's compiled guidance
    with the current step's own guidance, respecting per-section inheritance
    flags.

    Args:
        previous_compiled: The previous step's compiled guidance plan dict
            (or None for the first step / no prior guidance).
        step_guidance: This step's own guidance plan dict (partial or full).
            Sections here always override inherited values.
        guidance_inherit: Per-section inheritance flags. Keys are section
            names (``references``, ``regions``, ``masks``, ``constraints``).
            Missing keys fall back to ``INHERIT_DEFAULTS``.

    Returns:
        ``(compiled_plan, warnings)`` — the merged plan (or None if empty)
        and a list of non-fatal warnings.
    """
    inherit_flags = {**INHERIT_DEFAULTS, **(guidance_inherit or {})}
    warnings: List[str] = []

    # Nothing to work with
    if not previous_compiled and not step_guidance:
        return None, []

    # Build the inherited base by filtering previous_compiled sections
    inherited_base: Dict[str, Any] = {"version": 1}

    if previous_compiled:
        for section in ("references", "regions", "masks", "constraints"):
            if inherit_flags.get(section, False) and section in previous_compiled:
                inherited_base[section] = previous_compiled[section]

    # If step has its own guidance, merge on top of inherited base
    if step_guidance:
        # Ensure version tag
        step_with_version = {"version": 1, **step_guidance}
        plan, merge_warnings = merge_guidance_plans(inherited_base, step_with_version)
        warnings.extend(merge_warnings)
    elif any(k in inherited_base for k in ("references", "regions", "masks", "constraints")):
        # Pure inheritance, no step-local guidance
        plan = GuidancePlanV1.model_validate(inherited_base)
    else:
        return None, warnings

    # Check if the plan is actually empty (no sections populated)
    if not any([plan.references, plan.regions, plan.masks, plan.constraints]):
        return None, warnings

    return plan, warnings
