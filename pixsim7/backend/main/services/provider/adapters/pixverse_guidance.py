"""
Pixverse guidance plan formatter.

Consumes ``GuidancePlanV1.references`` and produces composition_asset entries,
an image index map, and legend text for prompt injection.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from pixsim7.backend.main.shared.schemas.guidance_plan import GuidancePlanV1

logger = logging.getLogger(__name__)


@dataclass
class GuidanceFormatterResult:
    """Output of :func:`format_references_for_pixverse`."""

    composition_assets: List[Dict[str, Any]]
    """Merged composition assets (existing + guidance-derived)."""

    image_index_map: Dict[str, int]
    """binding_key -> provider image index (1-based)."""

    legend_text: Optional[str]
    """Human-readable legend, e.g. 'Reference guide: image #1 is woman, ...'"""

    debug_metadata: Dict[str, Any] = field(default_factory=dict)


def format_references_for_pixverse(
    plan: GuidancePlanV1,
    existing_composition_assets: Optional[List[Dict[str, Any]]] = None,
) -> GuidanceFormatterResult:
    """Convert guidance plan references into Pixverse composition assets.

    Parameters
    ----------
    plan:
        Validated guidance plan.
    existing_composition_assets:
        Composition assets already present from the generation config.
        Guidance-derived assets are *appended* after these.

    Returns
    -------
    GuidanceFormatterResult
        Contains merged composition_assets, image_index_map, and legend_text.
    """
    existing = list(existing_composition_assets or [])
    starting_index = len(existing) + 1  # 1-based for legend

    if not plan.references:
        return GuidanceFormatterResult(
            composition_assets=existing,
            image_index_map={},
            legend_text=None,
            debug_metadata={"skipped": "no_references"},
        )

    # Sort references by priority (lower = earlier index), then by key for stability
    sorted_refs = sorted(
        plan.references.items(),
        key=lambda kv: (kv[1].priority if kv[1].priority is not None else 999, kv[0]),
    )

    new_assets: List[Dict[str, Any]] = []
    image_index_map: Dict[str, int] = {}
    legend_parts: List[str] = []

    for i, (binding_key, ref) in enumerate(sorted_refs):
        idx = starting_index + i
        image_index_map[binding_key] = idx

        # Build composition asset entry
        asset_entry: Dict[str, Any] = {
            "asset": ref.asset_id,
            "role": _ref_kind_to_role(ref.kind),
            "ref_name": binding_key,
            "influence_type": "reference",
            "provider_params": {
                "guidance_binding_key": binding_key,
                "guidance_kind": ref.kind,
            },
        }
        if ref.view:
            asset_entry["camera_view_id"] = ref.view
        if ref.pose:
            asset_entry["pose_id"] = ref.pose

        new_assets.append(asset_entry)

        # Legend entry
        label = ref.label or binding_key
        legend_parts.append(f"image #{idx} is {label}")

    legend_text: Optional[str] = None
    if legend_parts:
        legend_text = "Reference guide: " + ", ".join(legend_parts) + "."

    merged = existing + new_assets

    return GuidanceFormatterResult(
        composition_assets=merged,
        image_index_map=image_index_map,
        legend_text=legend_text,
        debug_metadata={
            "existing_count": len(existing),
            "guidance_count": len(new_assets),
            "starting_index": starting_index,
            "binding_keys": list(image_index_map.keys()),
        },
    )


def _ref_kind_to_role(kind: str) -> str:
    """Map guidance reference kind to a composition role id."""
    mapping = {
        "identity": "entities:main_character",
        "style": "materials:rendering",
        "pose": "entities:subject",
        "garment": "materials:wardrobe",
    }
    return mapping.get(kind, "entities:subject")
