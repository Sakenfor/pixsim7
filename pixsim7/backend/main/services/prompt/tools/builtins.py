"""Builtin prompt tool preset registry and handlers."""
from __future__ import annotations

from typing import Any, Mapping

from .types import PromptToolPresetRecord


def _normalize_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    return ""


def _coerce_int(
    value: Any,
    *,
    default: int,
    minimum: int,
    maximum: int,
) -> int:
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        numeric = default
    return max(minimum, min(maximum, numeric))


def _coerce_bool(value: Any, *, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "y", "on"}:
            return True
        if normalized in {"0", "false", "no", "n", "off"}:
            return False
    return default


def _as_mapping(value: Any) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return value
    return {}


def _normalize_asset_id(value: Any) -> str | int | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value.is_integer():
            return int(value)
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.startswith("asset:"):
            return text
        if text.isdigit():
            try:
                return int(text)
            except ValueError:  # pragma: no cover - defensive
                return text
        return text
    return None


def _to_asset_ref(asset_id: str | int) -> str:
    if isinstance(asset_id, str):
        text = asset_id.strip()
        if text.startswith("asset:"):
            return text
        return f"asset:{text}"
    return f"asset:{asset_id}"


def _style_shift_handler(
    prompt_text: str,
    params: Mapping[str, Any],
    run_context: Mapping[str, Any],
) -> Mapping[str, Any]:
    del run_context
    style = _normalize_text(params.get("style")) or "cinematic"
    tone = _normalize_text(params.get("tone")) or "clear"
    strength = _coerce_int(
        params.get("strength"),
        default=6,
        minimum=1,
        maximum=10,
    )

    base_prompt = _normalize_text(prompt_text)
    directive = (
        "Style shift: rewrite in a "
        f"{style} style with a {tone} tone (strength {strength}/10)."
    )
    merged = directive if not base_prompt else f"{base_prompt}\n\n{directive}"

    warnings: list[str] = []
    if not base_prompt:
        warnings.append("Input prompt was empty; emitted style guidance only.")

    return {
        "prompt_text": merged,
        "warnings": warnings,
        "provenance": {"model_id": "builtin/style-shift-v1"},
    }


def _extract_reference_assets(run_context: Mapping[str, Any]) -> list[dict[str, str]]:
    raw_assets = run_context.get("composition_assets")
    if not isinstance(raw_assets, list):
        return []

    assets: list[dict[str, str]] = []
    for index, item in enumerate(raw_assets):
        if not isinstance(item, Mapping):
            continue
        asset_id_raw = item.get("asset_id") or item.get("id")
        asset_id = _normalize_text(asset_id_raw) or f"asset-{index + 1}"
        label = (
            _normalize_text(item.get("label"))
            or _normalize_text(item.get("name"))
            or asset_id
        )
        descriptor = (
            _normalize_text(item.get("description"))
            or _normalize_text(item.get("caption"))
            or _normalize_text(item.get("prompt_text"))
        )
        assets.append(
            {
                "asset_id": asset_id,
                "label": label,
                "descriptor": descriptor,
            }
        )
    return assets


def _extract_mask_asset_id(run_context: Mapping[str, Any]) -> str | int | None:
    raw_mask_asset = run_context.get("mask_asset")
    if isinstance(raw_mask_asset, Mapping):
        for key in ("asset_id", "id", "asset_ref"):
            value = _normalize_asset_id(raw_mask_asset.get(key))
            if value is not None:
                return value
        return None
    return _normalize_asset_id(raw_mask_asset)


def _extract_primary_asset_id(run_context: Mapping[str, Any]) -> str | int | None:
    return _normalize_asset_id(run_context.get("primary_asset_id"))


def _extract_mask_region_summaries(run_context: Mapping[str, Any]) -> list[dict[str, str]]:
    raw_regions = run_context.get("mask_regions")
    if not isinstance(raw_regions, list):
        return []

    regions: list[dict[str, str]] = []
    for index, item in enumerate(raw_regions):
        if not isinstance(item, Mapping):
            continue
        region_id = _normalize_text(item.get("id")) or f"region-{index + 1}"
        label = (
            _normalize_text(item.get("label"))
            or _normalize_text(item.get("note"))
            or _normalize_text(item.get("type"))
            or region_id
        )
        regions.append({"id": region_id, "label": label})
    return regions


def _execute_masked_transform(
    prompt_text: str,
    params: Mapping[str, Any],
    run_context: Mapping[str, Any],
    *,
    preset_id: str,
    model_id: str,
    primitive_tags: tuple[str, ...],
) -> Mapping[str, Any]:
    """Shared masked-edit flow used by edit builtins."""
    instruction = (
        _normalize_text(params.get("instruction"))
        or _normalize_text(params.get("transform"))
        or "transform the selected region"
    )
    strength = _coerce_int(
        params.get("strength"),
        default=7,
        minimum=1,
        maximum=10,
    )
    preserve_identity = _coerce_bool(params.get("preserve_identity"), default=True)
    preserve_background = _coerce_bool(params.get("preserve_background"), default=True)

    primary_asset_id = _extract_primary_asset_id(run_context)
    mask_asset_id = _extract_mask_asset_id(run_context)
    mask_regions = _extract_mask_region_summaries(run_context)

    directive_lines: list[str] = [
        f"Masked transform instruction: {instruction}.",
        f"Edit strength: {strength}/10.",
    ]
    if preserve_identity:
        directive_lines.append("Preserve subject identity and pose.")
    if preserve_background:
        directive_lines.append("Preserve background and lighting outside the masked region.")
    if mask_asset_id is not None:
        directive_lines.append(f"Restrict edits to mask asset {_to_asset_ref(mask_asset_id)}.")
    elif mask_regions:
        region_labels = ", ".join(region["label"] for region in mask_regions[:3])
        suffix = f" ({region_labels})" if region_labels else ""
        directive_lines.append(
            f"Restrict edits to {len(mask_regions)} selected mask region(s){suffix}."
        )
    if primary_asset_id is not None:
        directive_lines.append(f"Use source asset {primary_asset_id} as the visual base.")

    directive_block = "Masked edit guidance:\n" + "\n".join(
        f"- {line}" for line in directive_lines
    )
    base_prompt = _normalize_text(prompt_text)
    merged_prompt = directive_block if not base_prompt else f"{base_prompt}\n\n{directive_block}"

    guidance_payload: dict[str, Any] = {
        "instruction": instruction,
        "strength": strength,
        "preserve_identity": preserve_identity,
        "preserve_background": preserve_background,
    }
    if primary_asset_id is not None:
        guidance_payload["primary_asset_id"] = primary_asset_id
    if mask_asset_id is not None:
        guidance_payload["mask"] = {
            "format": "asset_ref",
            "data": _to_asset_ref(mask_asset_id),
        }
    elif mask_regions:
        guidance_payload["mask_regions"] = [
            {
                "id": region["id"],
                "label": region["label"],
            }
            for region in mask_regions
        ]

    composition_assets_patch: list[dict[str, Any]] = []
    if primary_asset_id is not None:
        composition_assets_patch.append(
            {
                "asset_id": primary_asset_id,
                "operation": "masked_transform_source",
                "role": "primary",
            }
        )
    if mask_asset_id is not None:
        composition_assets_patch.append(
            {
                "asset_id": mask_asset_id,
                "operation": "masked_transform_mask",
                "role": "mask",
            }
        )

    warnings: list[str] = []
    if not base_prompt:
        warnings.append("Input prompt was empty; emitted masked-edit guidance only.")
    if mask_asset_id is None and not mask_regions:
        warnings.append(
            "No mask signal found in run_context; transform may apply to the full frame."
        )

    return {
        "prompt_text": merged_prompt,
        "block_overlay": [
            {
                "role": "instruction",
                "text": f"Masked transform: {instruction}",
                "preset_id": preset_id,
                "primitive_tags": list(primitive_tags),
            }
        ],
        "guidance_patch": {"masked_transform": guidance_payload},
        "composition_assets_patch": composition_assets_patch,
        "warnings": warnings,
        "provenance": {"model_id": model_id},
    }


def _reference_merge_handler(
    prompt_text: str,
    params: Mapping[str, Any],
    run_context: Mapping[str, Any],
) -> Mapping[str, Any]:
    del params
    base_prompt = _normalize_text(prompt_text)
    assets = _extract_reference_assets(run_context)

    warnings: list[str] = []
    if not assets:
        warnings.append("No composition assets were provided in run_context.")

    merged_lines: list[str] = []
    composition_assets_patch: list[dict[str, Any]] = []
    for item in assets:
        descriptor = item["descriptor"]
        if descriptor:
            merged_lines.append(f"- {item['label']}: {descriptor}")
        else:
            merged_lines.append(f"- {item['label']}")
        composition_assets_patch.append(
            {
                "asset_id": item["asset_id"],
                "operation": "reference_merge",
            }
        )

    reference_block = ""
    if merged_lines:
        reference_block = "Reference assets:\n" + "\n".join(merged_lines)
    merged_prompt = base_prompt
    if reference_block:
        merged_prompt = reference_block if not merged_prompt else f"{merged_prompt}\n\n{reference_block}"

    guidance_patch = (
        {
            "reference_merge": {
                "asset_count": len(composition_assets_patch),
                "mode": "append_context",
            }
        }
        if composition_assets_patch
        else None
    )

    return {
        "prompt_text": merged_prompt,
        "composition_assets_patch": composition_assets_patch,
        "guidance_patch": guidance_patch,
        "warnings": warnings,
        "provenance": {"model_id": "builtin/reference-merge-v1"},
    }


def _masked_transform_handler(
    prompt_text: str,
    params: Mapping[str, Any],
    run_context: Mapping[str, Any],
) -> Mapping[str, Any]:
    return _execute_masked_transform(
        prompt_text,
        params,
        run_context,
        preset_id="edit/masked-transform",
        model_id="builtin/masked-transform-v1",
        primitive_tags=("edit.masked_transform", "intent.modify_region"),
    )


def _change_clothes_handler(
    prompt_text: str,
    params: Mapping[str, Any],
    run_context: Mapping[str, Any],
) -> Mapping[str, Any]:
    garment = _normalize_text(params.get("target_garment")) or "clothing"
    new_clothes = (
        _normalize_text(params.get("new_clothes"))
        or _normalize_text(params.get("style"))
        or "a refined outfit"
    )
    material = _normalize_text(params.get("material"))
    color = _normalize_text(params.get("color"))
    descriptors = [new_clothes]
    if material:
        descriptors.append(material)
    if color:
        descriptors.append(color)
    instruction = f"change the {garment} to {' '.join(descriptors)}"

    merged_params = dict(params)
    merged_params.setdefault("instruction", instruction)
    merged_params.setdefault("strength", 7)
    merged_params.setdefault("preserve_identity", True)
    merged_params.setdefault("preserve_background", True)
    return _execute_masked_transform(
        prompt_text,
        merged_params,
        run_context,
        preset_id="edit/change-clothes",
        model_id="builtin/change-clothes-v1",
        primitive_tags=(
            "edit.change_clothes",
            "character.garment",
            "intent.modify_region",
        ),
    )


def _fix_anatomy_handler(
    prompt_text: str,
    params: Mapping[str, Any],
    run_context: Mapping[str, Any],
) -> Mapping[str, Any]:
    focus = _normalize_text(params.get("focus")) or "hands and fingers"
    quality = _normalize_text(params.get("quality")) or "realistic"
    instruction = (
        f"fix {focus} anatomy with {quality} proportions, connected joints, and natural pose flow"
    )

    merged_params = dict(params)
    merged_params.setdefault("instruction", instruction)
    merged_params.setdefault("strength", 6)
    merged_params.setdefault("preserve_identity", True)
    merged_params.setdefault("preserve_background", True)
    return _execute_masked_transform(
        prompt_text,
        merged_params,
        run_context,
        preset_id="edit/fix-anatomy",
        model_id="builtin/fix-anatomy-v1",
        primitive_tags=(
            "edit.fix_anatomy",
            "quality.anatomy",
            "intent.correct_region",
        ),
    )


def _remove_object_handler(
    prompt_text: str,
    params: Mapping[str, Any],
    run_context: Mapping[str, Any],
) -> Mapping[str, Any]:
    target = (
        _normalize_text(params.get("object"))
        or _normalize_text(params.get("target"))
        or "selected object"
    )
    cleanup = _normalize_text(params.get("cleanup")) or "fill the area naturally"
    instruction = f"remove {target} and {cleanup}"

    merged_params = dict(params)
    merged_params.setdefault("instruction", instruction)
    merged_params.setdefault("strength", 7)
    merged_params.setdefault("preserve_identity", True)
    merged_params.setdefault("preserve_background", True)
    return _execute_masked_transform(
        prompt_text,
        merged_params,
        run_context,
        preset_id="edit/remove-object",
        model_id="builtin/remove-object-v1",
        primitive_tags=(
            "edit.remove_object",
            "cleanup.inpaint",
            "intent.remove_region",
        ),
    )


_BUILTIN_PRESETS: dict[str, PromptToolPresetRecord] = {
    "rewrite/style-shift": PromptToolPresetRecord(
        id="rewrite/style-shift",
        label="Style Shift",
        description="Apply deterministic style/tone rewrite guidance to prompt text.",
        source="builtin",
        category="rewrite",
        enabled=True,
        requires=("text",),
        defaults={"style": "cinematic", "tone": "clear", "strength": 6},
        owner_payload={"name": "PixSim Builtins"},
        handler=_style_shift_handler,
    ),
    "compose/reference-merge": PromptToolPresetRecord(
        id="compose/reference-merge",
        label="Reference Merge",
        description="Merge prompt text with composition asset references from run_context.",
        source="builtin",
        category="compose",
        enabled=True,
        requires=("text", "composition_assets"),
        defaults={},
        owner_payload={"name": "PixSim Builtins"},
        handler=_reference_merge_handler,
    ),
    "edit/masked-transform": PromptToolPresetRecord(
        id="edit/masked-transform",
        label="Masked Transform",
        description="Generate masked-edit guidance from viewer mask context.",
        source="builtin",
        category="edit",
        enabled=True,
        requires=("text", "mask_asset", "regions"),
        defaults={
            "instruction": "transform the selected region",
            "strength": 7,
            "preserve_identity": True,
            "preserve_background": True,
        },
        owner_payload={"name": "PixSim Builtins"},
        handler=_masked_transform_handler,
    ),
    "edit/change-clothes": PromptToolPresetRecord(
        id="edit/change-clothes",
        label="Change Clothes",
        description="Rewrite masked region instructions to swap clothing while preserving identity.",
        source="builtin",
        category="edit",
        enabled=True,
        requires=("text", "mask_asset", "regions"),
        defaults={
            "target_garment": "outfit",
            "new_clothes": "tailored jacket",
            "material": "matte fabric",
            "color": "deep red",
            "strength": 7,
            "preserve_identity": True,
            "preserve_background": True,
        },
        owner_payload={"name": "PixSim Builtins"},
        handler=_change_clothes_handler,
    ),
    "edit/fix-anatomy": PromptToolPresetRecord(
        id="edit/fix-anatomy",
        label="Fix Anatomy",
        description="Correct anatomy issues inside the selected region while preserving pose.",
        source="builtin",
        category="edit",
        enabled=True,
        requires=("text", "mask_asset", "regions"),
        defaults={
            "focus": "hands and fingers",
            "quality": "realistic",
            "strength": 6,
            "preserve_identity": True,
            "preserve_background": True,
        },
        owner_payload={"name": "PixSim Builtins"},
        handler=_fix_anatomy_handler,
    ),
    "edit/remove-object": PromptToolPresetRecord(
        id="edit/remove-object",
        label="Remove Object",
        description="Remove masked object and reconstruct background coherently.",
        source="builtin",
        category="edit",
        enabled=True,
        requires=("text", "mask_asset", "regions"),
        defaults={
            "object": "selected object",
            "cleanup": "fill the area naturally",
            "strength": 7,
            "preserve_identity": True,
            "preserve_background": True,
        },
        owner_payload={"name": "PixSim Builtins"},
        handler=_remove_object_handler,
    ),
}


def list_builtin_prompt_tools() -> list[PromptToolPresetRecord]:
    """List builtin prompt tool presets in stable ID order."""
    return [_BUILTIN_PRESETS[key] for key in sorted(_BUILTIN_PRESETS.keys())]


def get_builtin_prompt_tool(preset_id: str) -> PromptToolPresetRecord | None:
    """Resolve builtin prompt tool by preset ID."""
    return _BUILTIN_PRESETS.get(_normalize_text(preset_id))


def execute_builtin_prompt_tool(
    preset: PromptToolPresetRecord,
    *,
    prompt_text: str,
    params: Mapping[str, Any] | None,
    run_context: Mapping[str, Any] | None,
) -> Mapping[str, Any]:
    """Execute a builtin prompt tool preset."""
    handler = preset.handler
    if handler is None:
        return {"prompt_text": prompt_text}
    return handler(
        prompt_text,
        _as_mapping(params),
        _as_mapping(run_context),
    )
