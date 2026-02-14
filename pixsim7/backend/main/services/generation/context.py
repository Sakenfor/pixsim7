"""
Generation Context Builder

Utilities for building the `generation_context` dict that gets stamped
onto `asset.media_metadata["generation_context"]` at creation time.

This makes assets self-describing: they carry the functional subset of
generation data needed for Regenerate / Extend / Load-to-Quick-Gen
without requiring a join to the Generation table.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional


def extract_flat_provider_params(canonical_params: dict) -> dict:
    """
    Extract flat provider-specific params from a Generation record's
    canonical_params.  The stored shape is typically:

        { "generation_config": { "style": { "<provider>": {flat params} }, ... } }

    We want ONLY the flat provider params (model, quality, seed, etc.) that
    the frontend can feed back into buildGenerationConfig / generateAsset.
    """
    gen_config = canonical_params.get("generation_config") or canonical_params.get("config") or {}
    if not isinstance(gen_config, dict):
        return {}

    style = gen_config.get("style") or {}
    if not isinstance(style, dict):
        style = {}

    flat: dict = {}
    # Merge all provider-specific settings blocks (usually just one, e.g. "pixverse")
    for _provider_id, provider_style in style.items():
        if isinstance(provider_style, dict):
            flat.update(provider_style)

    # Pick explicit top-level scalars (seed, negative_prompt)
    for key in ("seed", "negative_prompt"):
        val = gen_config.get(key)
        if val is not None and key not in flat:
            flat[key] = val

    # Unwrap duration from schema shape { "target": { "target": 5 } } → 5
    duration_block = gen_config.get("duration")
    if isinstance(duration_block, dict):
        target = duration_block.get("target")
        if isinstance(target, dict):
            flat["duration"] = target.get("target") or target.get("min")
        elif target is not None:
            flat["duration"] = target
    elif duration_block is not None:
        # Already a scalar
        flat.setdefault("duration", duration_block)

    return flat


def extract_source_asset_ids(inputs: list) -> List[int]:
    """
    Pull integer asset IDs from "asset:123" refs in Generation.inputs.
    """
    ids: List[int] = []
    for inp in inputs or []:
        asset_ref = inp.get("asset", "") if isinstance(inp, dict) else ""
        if isinstance(asset_ref, str) and asset_ref.startswith("asset:"):
            try:
                ids.append(int(asset_ref.split(":")[1]))
            except (ValueError, IndexError):
                pass
    return ids


def build_generation_context(
    *,
    operation_type: str,
    provider_id: str,
    prompt: Optional[str],
    params: Dict[str, Any],
    source_asset_ids: List[int],
    prompt_version_id: Optional[str] = None,
    reproducible_hash: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Assemble the generation_context dict with a consistent shape.

    This is the canonical shape stored in asset.media_metadata["generation_context"].
    """
    ctx: Dict[str, Any] = {
        "operation_type": operation_type,
        "provider_id": provider_id,
        "prompt": prompt,
        "params": params,
        "source_asset_ids": source_asset_ids,
    }
    if prompt_version_id:
        ctx["prompt_version_id"] = prompt_version_id
    if reproducible_hash:
        ctx["reproducible_hash"] = reproducible_hash
    return ctx


def build_generation_context_from_generation(generation) -> Dict[str, Any]:
    """
    Convenience wrapper that reads fields from a Generation domain object
    and assembles the generation_context dict.

    Works with both normal Generation records (app-generated) and the
    Generation model directly.
    """
    # Extract flat provider params from canonical_params
    canonical_params = getattr(generation, "canonical_params", None) or {}
    flat_params = extract_flat_provider_params(canonical_params)

    # Extract source asset IDs from inputs
    inputs = getattr(generation, "inputs", None) or []
    source_asset_ids = extract_source_asset_ids(inputs)

    # Get operation type as string
    operation_type = getattr(generation, "operation_type", None)
    if operation_type is not None and hasattr(operation_type, "value"):
        operation_type = operation_type.value
    operation_type = operation_type or "text_to_image"

    # Get provider_id
    provider_id = getattr(generation, "provider_id", None) or ""

    # Get prompt
    prompt = getattr(generation, "final_prompt", None)

    # Get prompt_version_id
    prompt_version_id = getattr(generation, "prompt_version_id", None)
    if prompt_version_id is not None:
        prompt_version_id = str(prompt_version_id)

    # Get reproducible_hash
    reproducible_hash = getattr(generation, "reproducible_hash", None)

    return build_generation_context(
        operation_type=operation_type,
        provider_id=provider_id,
        prompt=prompt,
        params=flat_params,
        source_asset_ids=source_asset_ids,
        prompt_version_id=prompt_version_id,
        reproducible_hash=reproducible_hash,
    )
