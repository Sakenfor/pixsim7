"""Prompt tool execution response normalization helpers."""
from __future__ import annotations

from typing import Any, Mapping


def _normalize_warning_list(value: Any) -> list[str] | None:
    if not isinstance(value, list):
        return None
    warnings: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        text = item.strip()
        if text:
            warnings.append(text)
    return warnings or None


def _normalize_dict_list(value: Any) -> list[dict[str, Any]] | None:
    if not isinstance(value, list):
        return None
    rows = [dict(item) for item in value if isinstance(item, Mapping)]
    return rows or None


def normalize_prompt_tool_execution_result(
    *,
    raw_result: Mapping[str, Any] | None,
    preset_id: str,
    fallback_prompt_text: str,
) -> dict[str, Any]:
    """Normalize prompt tool execution output into the API response shape."""
    payload = raw_result if isinstance(raw_result, Mapping) else {}

    prompt_text_raw = payload.get("prompt_text")
    if isinstance(prompt_text_raw, str):
        prompt_text = prompt_text_raw
    elif isinstance(fallback_prompt_text, str):
        prompt_text = fallback_prompt_text
    else:
        prompt_text = ""

    normalized: dict[str, Any] = {"prompt_text": prompt_text}

    block_overlay = _normalize_dict_list(payload.get("block_overlay"))
    if block_overlay is not None:
        normalized["block_overlay"] = block_overlay

    guidance_patch = payload.get("guidance_patch")
    if isinstance(guidance_patch, Mapping):
        normalized["guidance_patch"] = dict(guidance_patch)

    composition_assets_patch = _normalize_dict_list(payload.get("composition_assets_patch"))
    if composition_assets_patch is not None:
        normalized["composition_assets_patch"] = composition_assets_patch

    warnings = _normalize_warning_list(payload.get("warnings"))
    if warnings is not None:
        normalized["warnings"] = warnings

    provenance = payload.get("provenance")
    provenance_map = dict(provenance) if isinstance(provenance, Mapping) else {}
    normalized_provenance: dict[str, Any] = {"preset_id": preset_id}
    for key in ("analyzer_id", "model_id"):
        value = provenance_map.get(key)
        if isinstance(value, str):
            text = value.strip()
            if text:
                normalized_provenance[key] = text
    normalized["provenance"] = normalized_provenance
    return normalized
