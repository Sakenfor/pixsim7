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


def _as_mapping(value: Any) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return value
    return {}


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
