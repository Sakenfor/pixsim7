"""
Guidance plan validator — structural and semantic checks.

Returns errors (hard failures) and warnings (non-fatal advisories).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Set

from pixsim7.backend.main.shared.schemas.guidance_plan import GuidancePlanV1


@dataclass
class GuidanceValidationResult:
    """Outcome of ``validate_guidance_plan``."""

    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return len(self.errors) == 0


def validate_guidance_plan(
    plan: GuidancePlanV1,
    *,
    known_binding_keys: Optional[Set[str]] = None,
    known_asset_ids: Optional[Set[str]] = None,
) -> GuidanceValidationResult:
    """Validate a parsed ``GuidancePlanV1`` instance.

    Parameters
    ----------
    plan:
        The plan to validate.
    known_binding_keys:
        If provided, binding keys in ``references`` and ``regions`` are
        checked against this set. Unknown keys produce warnings.
    known_asset_ids:
        If provided, ``asset_id`` values in references are checked.
        Unknown IDs produce warnings (not errors — the asset may exist
        but the caller simply didn't pass the full set).
    """
    result = GuidanceValidationResult()

    # Version check
    if plan.version != 1:
        result.errors.append(f"Unsupported guidance plan version: {plan.version}")
        return result

    # --- references ---
    if plan.references:
        for key, ref in plan.references.items():
            if not key:
                result.errors.append("Empty binding key in references")
            if ref.asset_id is None or str(ref.asset_id) == "":
                result.errors.append(f"Reference '{key}' has empty asset_id")
            if known_binding_keys is not None and key not in known_binding_keys:
                result.warnings.append(
                    f"Reference binding key '{key}' not in known bindings"
                )
            if known_asset_ids is not None:
                aid = str(ref.asset_id)
                if aid not in known_asset_ids:
                    result.warnings.append(
                        f"Reference '{key}' asset_id '{aid}' not in known assets"
                    )

    # --- regions ---
    if plan.regions:
        for key, region_list in plan.regions.items():
            if not key:
                result.errors.append("Empty binding key in regions")
            if known_binding_keys is not None and key not in known_binding_keys:
                result.warnings.append(
                    f"Region binding key '{key}' not in known bindings"
                )
            for i, region in enumerate(region_list):
                if region.strength is not None and not (0.0 <= region.strength <= 1.0):
                    result.errors.append(
                        f"Region '{key}'[{i}] strength {region.strength} "
                        "outside [0, 1]"
                    )

    # --- masks ---
    if plan.masks:
        for key, mask in plan.masks.items():
            if not mask.data:
                result.errors.append(f"Mask '{key}' has empty data")

    # --- constraints ---
    if plan.constraints:
        c = plan.constraints
        # Contradictory constraints
        if c.lock_pose and c.lock_expression:
            result.warnings.append(
                "Both lock_pose and lock_expression are set — "
                "provider may only support one"
            )
        # Strength range (already enforced by Pydantic, but double-check raw)
        for attr in ("style_strength", "identity_strength"):
            val = getattr(c, attr, None)
            if val is not None and not (0.0 <= val <= 1.0):
                result.errors.append(
                    f"Constraint {attr} = {val} outside [0, 1]"
                )

    # Warn if plan is completely empty
    if not any([plan.references, plan.regions, plan.masks, plan.constraints]):
        result.warnings.append("Guidance plan has no sections — it will be a no-op")

    return result
