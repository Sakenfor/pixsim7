from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterable, List

from pixsim7.backend.main.services.prompt.block.tag_dictionary import normalize_block_tags
from pixsim7.backend.main.shared.ontology.vocabularies import get_registry


class BlockFamilyContractValidationError(ValueError):
    """Raised when a block violates a registered prompt_block_families contract."""


def load_prompt_block_family_schemas() -> Dict[str, Dict[str, Any]]:
    """Return registry-backed prompt block family schemas keyed by family id."""
    registry = get_registry(strict_mode=False)
    out: Dict[str, Dict[str, Any]] = {}
    for item in registry.all_prompt_block_families():
        family_id = str(getattr(item, "id", "") or "").strip()
        if not family_id:
            continue
        data = getattr(item, "data", {}) or {}
        if isinstance(data, dict):
            out[family_id] = dict(data)
    return out


def load_prompt_block_tag_keys() -> frozenset[str]:
    """Return canonical prompt block tag keys from the registry.

    Returns the set of canonical tag key names (not aliases) registered in
    prompt_block_tags.  Used for validation of ``tag:<key>`` references in
    manifest query fields.  Returns an empty frozenset when the registry is
    unavailable so callers can skip validation gracefully.
    """
    registry = get_registry(strict_mode=False)
    keys: set[str] = set()
    for item in registry.all_prompt_block_tags():
        tag_key = str(getattr(item, "id", "") or "").strip()
        if tag_key:
            keys.add(tag_key)
    return frozenset(keys)


def validate_block_family_contract(
    *,
    block: Dict[str, Any],
    path: Path | str,
    index: int,
    family_schemas: Dict[str, Dict[str, Any]],
) -> None:
    """Validate a block against a registered prompt_block_families contract.

    Validation is applied when a block declares `sequence_family`.
    Unknown/unregistered families are rejected to keep block authoring aligned
    with registry-backed family contracts.
    """
    raw_tags = block.get("tags") or {}
    if not isinstance(raw_tags, dict):
        return

    normalized = normalize_block_tags(raw_tags, apply_value_aliases=True)
    tags = normalized.get("normalized_tags") or {}
    if not isinstance(tags, dict):
        return

    sequence_family = tags.get("sequence_family")
    if sequence_family is None:
        return
    if not isinstance(sequence_family, str) or not sequence_family.strip():
        raise BlockFamilyContractValidationError(
            f"{path}: blocks[{index}].tags.sequence_family must be a non-empty string"
        )
    family_id = sequence_family.strip()

    family_schema = family_schemas.get(family_id)
    if not isinstance(family_schema, dict):
        known_families = ", ".join(sorted(family_schemas.keys()))
        raise BlockFamilyContractValidationError(
            f"{path}: blocks[{index}] ({block.get('block_id', '<unknown>')}): "
            f"unknown sequence_family '{family_id}'"
            + (f" (register in prompt_block_families; known: {known_families})" if known_families else "")
        )

    family_tag_key = str(family_schema.get("family_tag_key") or "sequence_family")
    axis_tag_key = str(family_schema.get("axis_tag_key") or "beat_axis")
    required_base_tags = family_schema.get("required_base_tags") or []
    if not isinstance(required_base_tags, list):
        required_base_tags = []

    block_id = block.get("block_id", "<unknown>")
    for required_key in required_base_tags:
        key = str(required_key)
        value = tags.get(key)
        missing = value is None or (isinstance(value, str) and not value.strip())
        if missing:
            raise BlockFamilyContractValidationError(
                f"{path}: blocks[{index}] ({block_id}): family '{family_id}' requires tag '{key}'"
            )

    axis_value = tags.get(axis_tag_key)
    if axis_value is None:
        return
    if not isinstance(axis_value, str) or not axis_value.strip():
        raise BlockFamilyContractValidationError(
            f"{path}: blocks[{index}] ({block_id}): "
            f"family '{family_id}' tag '{axis_tag_key}' must be a non-empty string"
        )
    axis_id = axis_value.strip()

    axes = family_schema.get("axes") or {}
    if not isinstance(axes, dict):
        axes = {}
    axis_schema = axes.get(axis_id)
    if not isinstance(axis_schema, dict):
        valid_axes = ", ".join(sorted(str(k) for k in axes.keys()))
        raise BlockFamilyContractValidationError(
            f"{path}: blocks[{index}] ({block_id}): family '{family_id}' has unknown axis '{axis_id}'"
            + (f" (valid: {valid_axes})" if valid_axes else "")
        )

    if tags.get(family_tag_key) != family_id:
        raise BlockFamilyContractValidationError(
            f"{path}: blocks[{index}] ({block_id}): family contract expects '{family_tag_key}: {family_id}'"
        )

    required_axis_tags = axis_schema.get("required_tags") or []
    if not isinstance(required_axis_tags, list):
        required_axis_tags = []
    for required_key in required_axis_tags:
        key = str(required_key)
        value = tags.get(key)
        missing = value is None or (isinstance(value, str) and not value.strip())
        if missing:
            raise BlockFamilyContractValidationError(
                f"{path}: blocks[{index}] ({block_id}): family '{family_id}' axis '{axis_id}' requires tag '{key}'"
            )

    expected_values = axis_schema.get("expected_values") or {}
    if not isinstance(expected_values, dict):
        expected_values = {}
    for tag_key, allowed_raw in expected_values.items():
        if tag_key not in tags:
            continue
        allowed_list = allowed_raw if isinstance(allowed_raw, list) else [allowed_raw]
        allowed = {str(v) for v in allowed_list}
        actual_value = tags.get(tag_key)
        actual_values = actual_value if isinstance(actual_value, list) else [actual_value]
        for actual in actual_values:
            if actual is None:
                continue
            if not isinstance(actual, str):
                raise BlockFamilyContractValidationError(
                    f"{path}: blocks[{index}] ({block_id}): family '{family_id}' axis '{axis_id}' "
                    f"tag '{tag_key}' must use string values"
                )
            if actual not in allowed:
                allowed_display = ", ".join(sorted(allowed))
                raise BlockFamilyContractValidationError(
                    f"{path}: blocks[{index}] ({block_id}): family '{family_id}' axis '{axis_id}' "
                    f"tag '{tag_key}' has invalid value '{actual}' (expected one of: {allowed_display})"
                )


def _as_string_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if isinstance(v, str) and str(v).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _normalize_slot_tag_group_for_family_validation(group: Any) -> Dict[str, Any]:
    if not isinstance(group, dict):
        return {}
    normalized = normalize_block_tags(group, apply_value_aliases=True)
    tags = normalized.get("normalized_tags") or {}
    return tags if isinstance(tags, dict) else {}


def _iter_slot_groups(slot_tags: Any) -> Iterable[tuple[str, Dict[str, Any]]]:
    if not isinstance(slot_tags, dict):
        return []
    groups: List[tuple[str, Dict[str, Any]]] = []
    for group_name in ("all", "any", "not"):
        group = slot_tags.get(group_name)
        normalized_group = _normalize_slot_tag_group_for_family_validation(group)
        if normalized_group:
            groups.append((group_name, normalized_group))
    return groups


def validate_template_slot_family_contract(
    *,
    slot: Dict[str, Any],
    path: Path | str,
    template_index: int,
    template_slug: str,
    slot_index: int,
    family_schemas: Dict[str, Dict[str, Any]],
) -> None:
    """Validate family-related slot tag constraints against registered schemas.

    This is intentionally a sanity check for slot constraints:
    - validates declared `sequence_family` values are registered
    - validates `beat_axis` values when scoped to a single family in a tag group
    - validates constrained values for axis `expected_values` keys in that same group

    It does not require slots to include all axis-required tags.
    """
    slot_tags = slot.get("tags")
    if not isinstance(slot_tags, dict):
        return

    slot_label = str(slot.get("label") or "").strip()
    slot_ref = (
        f"{path}: templates[{template_index}] ({template_slug}) slots[{slot_index}]"
        + (f" ({slot_label})" if slot_label else "")
    )

    for group_name, group in _iter_slot_groups(slot_tags):
        family_values = _as_string_list(group.get("sequence_family"))
        if not family_values:
            continue

        for family_id in family_values:
            if family_id not in family_schemas:
                known_families = ", ".join(sorted(family_schemas.keys()))
                raise BlockFamilyContractValidationError(
                    f"{slot_ref}: tags.{group_name}.sequence_family has unknown value '{family_id}'"
                    + (f" (register in prompt_block_families; known: {known_families})" if known_families else "")
                )

        # Axis-aware validation is only deterministic when the group scopes to one family.
        if len(family_values) != 1:
            continue
        family_id = family_values[0]
        family_schema = family_schemas.get(family_id) or {}
        axes = family_schema.get("axes") or {}
        if not isinstance(axes, dict):
            axes = {}
        axis_tag_key = str(family_schema.get("axis_tag_key") or "beat_axis")

        axis_values = _as_string_list(group.get(axis_tag_key))
        if not axis_values:
            continue

        for axis_id in axis_values:
            axis_schema = axes.get(axis_id)
            if not isinstance(axis_schema, dict):
                valid_axes = ", ".join(sorted(str(k) for k in axes.keys()))
                raise BlockFamilyContractValidationError(
                    f"{slot_ref}: tags.{group_name}.{axis_tag_key} has invalid value '{axis_id}' for family '{family_id}'"
                    + (f" (valid: {valid_axes})" if valid_axes else "")
                )

            expected_values = axis_schema.get("expected_values") or {}
            if not isinstance(expected_values, dict):
                continue
            for tag_key, allowed_raw in expected_values.items():
                if tag_key not in group:
                    continue
                allowed_list = allowed_raw if isinstance(allowed_raw, list) else [allowed_raw]
                allowed = {str(v) for v in allowed_list}
                constrained_values = _as_string_list(group.get(tag_key))
                for constrained in constrained_values:
                    if constrained not in allowed:
                        allowed_display = ", ".join(sorted(allowed))
                        raise BlockFamilyContractValidationError(
                            f"{slot_ref}: tags.{group_name}.{tag_key} value '{constrained}' is invalid "
                            f"for family '{family_id}' axis '{axis_id}' (expected one of: {allowed_display})"
                        )


def validate_template_slots_family_contracts(
    *,
    slots: List[Dict[str, Any]],
    path: Path | str,
    template_index: int,
    template_slug: str,
    family_schemas: Dict[str, Dict[str, Any]],
) -> None:
    """Validate family-related slot constraints for a normalized template slot list."""
    for slot_index, slot in enumerate(slots):
        if not isinstance(slot, dict):
            continue
        validate_template_slot_family_contract(
            slot=slot,
            path=path,
            template_index=template_index,
            template_slug=template_slug,
            slot_index=slot_index,
            family_schemas=family_schemas,
        )
