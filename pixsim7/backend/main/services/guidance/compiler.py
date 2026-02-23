"""
Guidance plan compiler — merge partial plans into a single GuidancePlanV1.

The compiler handles contributions from multiple sources (template builder,
narrative runtime, user overrides) and produces one canonical plan with
deterministic merge semantics.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Tuple

from pixsim7.backend.main.shared.schemas.guidance_plan import (
    GuidanceConstraints,
    GuidancePlanV1,
    GuidanceProvenance,
    GuidanceReference,
)

logger = logging.getLogger(__name__)


def merge_guidance_plans(
    *partials: dict,
    max_regions_per_role: int = 8,
) -> Tuple[GuidancePlanV1, List[str]]:
    """Merge one or more partial guidance plan dicts into a canonical plan.

    Returns ``(merged_plan, warnings)`` where *warnings* lists non-fatal
    issues encountered during the merge.

    Merge semantics per section:
    - **references**: last-writer-wins by binding key; warn on asset_id change.
    - **regions**: append arrays by binding key; dedupe exact boxes; cap count.
    - **masks**: last-writer-wins by mask key.
    - **constraints**: shallow-merge booleans; warn on contradictions.
    - **provenance**: merge all sections; later values overwrite.
    """
    warnings: List[str] = []

    merged_refs: Dict[str, Dict[str, Any]] = {}
    merged_regions: Dict[str, List[Dict[str, Any]]] = {}
    merged_masks: Dict[str, Dict[str, Any]] = {}
    merged_constraints: Dict[str, Any] = {}
    merged_provenance: Dict[str, Any] = {}

    for partial in partials:
        if not isinstance(partial, dict):
            warnings.append(f"Skipping non-dict partial: {type(partial).__name__}")
            continue

        # --- references ---
        refs = partial.get("references")
        if isinstance(refs, dict):
            for key, ref in refs.items():
                if not isinstance(ref, dict):
                    continue
                if key in merged_refs:
                    old_id = merged_refs[key].get("asset_id")
                    new_id = ref.get("asset_id")
                    if old_id is not None and new_id is not None and str(old_id) != str(new_id):
                        warnings.append(
                            f"Reference '{key}' asset_id changed: {old_id} -> {new_id}"
                        )
                merged_refs[key] = ref

        # --- regions ---
        regions = partial.get("regions")
        if isinstance(regions, dict):
            for key, region_list in regions.items():
                if not isinstance(region_list, list):
                    continue
                existing = merged_regions.setdefault(key, [])
                existing_boxes = {tuple(r.get("box", [])) for r in existing if isinstance(r.get("box"), list)}
                for region in region_list:
                    if not isinstance(region, dict):
                        continue
                    box = region.get("box")
                    box_tuple = tuple(box) if isinstance(box, list) else None
                    if box_tuple and box_tuple in existing_boxes:
                        continue  # dedupe exact box
                    existing.append(region)
                    if box_tuple:
                        existing_boxes.add(box_tuple)
                # Cap per-role count
                if len(existing) > max_regions_per_role:
                    warnings.append(
                        f"Regions for '{key}' capped at {max_regions_per_role} "
                        f"(had {len(existing)})"
                    )
                    merged_regions[key] = existing[:max_regions_per_role]

        # --- masks ---
        masks = partial.get("masks")
        if isinstance(masks, dict):
            for key, mask in masks.items():
                if isinstance(mask, dict):
                    merged_masks[key] = mask

        # --- constraints ---
        constraints = partial.get("constraints")
        if isinstance(constraints, dict):
            for field, value in constraints.items():
                if field in merged_constraints and merged_constraints[field] != value:
                    warnings.append(
                        f"Constraint '{field}' conflict: "
                        f"{merged_constraints[field]} vs {value} (using latest)"
                    )
                merged_constraints[field] = value

        # --- provenance ---
        provenance = partial.get("provenance")
        if isinstance(provenance, dict):
            merged_provenance.update(provenance)

    # Build final plan dict
    plan_dict: Dict[str, Any] = {"version": 1}
    if merged_refs:
        plan_dict["references"] = merged_refs
    if merged_regions:
        plan_dict["regions"] = merged_regions
    if merged_masks:
        plan_dict["masks"] = merged_masks
    if merged_constraints:
        plan_dict["constraints"] = merged_constraints
    if merged_provenance:
        plan_dict["provenance"] = merged_provenance

    plan = GuidancePlanV1.model_validate(plan_dict)
    return plan, warnings
