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

from pixsim7.backend.main.shared.asset_refs import extract_asset_id


def extract_flat_provider_params(canonical_params: dict) -> dict:
    """
    Extract flat provider-specific params from a Generation record's
    canonical_params.  The stored shape varies:

    1. **Nested (raw_params):**
       ``{ "generation_config": { "style": { "<provider>": {flat params} }, ... } }``

    2. **Already-flat (canonical_params after canonicalize_params):**
       ``{ "model": "v3.5", "quality": "720p", "seed": 123, ... }``

    We want ONLY the flat provider params (model, quality, seed, etc.) that
    the frontend can feed back into buildGenerationConfig / generateAsset.
    """
    gen_config = canonical_params.get("generation_config") or canonical_params.get("config") or {}
    if not isinstance(gen_config, dict):
        gen_config = {}

    # If there's no generation_config wrapper, canonical_params is already flat
    # (this is the shape produced by canonicalize_params() and stored on
    # Generation.canonical_params).  Return provider-relevant keys directly.
    if not gen_config:
        # Filter out internal/structural keys that aren't provider params
        _INTERNAL_KEYS = frozenset({
            "scene_context", "player_context", "social_context",
            "composition_metadata", "derived_analysis",
            "content_rating", "pacing",
        })
        return {k: v for k, v in canonical_params.items()
                if v is not None and k not in _INTERNAL_KEYS}

    style = gen_config.get("style") or {}
    if not isinstance(style, dict):
        style = {}

    flat: dict = {}
    # Merge all provider-specific settings blocks (usually just one, e.g. "pixverse")
    for _provider_id, provider_style in style.items():
        if isinstance(provider_style, dict):
            flat.update(provider_style)

    # Pick explicit top-level scalars (seed, negative_prompt)
    for key in ("seed", "negative_prompt", "aspect_ratio", "aspectRatio", "resolution", "output_resolution", "outputResolution"):
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

    # Extract asset-related top-level config keys that buildGenerationConfig
    # places outside style.<provider> (they are CANONICAL_CONFIG_KEYS on the
    # frontend).  Without these the regenerate flow loses source assets.
    _ASSET_CONFIG_KEYS = (
        "composition_assets",
        "source_asset_id", "sourceAssetId",
        "source_asset_ids", "sourceAssetIds",
        "image_url", "image_urls",
        "video_url",
    )
    for key in _ASSET_CONFIG_KEYS:
        val = gen_config.get(key)
        if val is not None and key not in flat:
            flat[key] = val

    return flat


def extract_source_asset_ids(inputs: list) -> List[int]:
    """
    Pull integer asset IDs from "asset:123" refs in Generation.inputs.
    """
    ids: List[int] = []
    for inp in inputs or []:
        if not isinstance(inp, dict):
            continue
        asset_id = extract_asset_id(inp.get("asset"))
        if asset_id is not None:
            ids.append(asset_id)
    return ids


# Keys that get stripped from the stamped `params` blob before it lands on
# `asset.media_metadata["generation_context"]`.  They are either:
#   * rebuildable at read time (composition_assets ← source_asset_ids), or
#   * ephemeral (CDN URLs that expire), or
#   * duplicated at a higher level (source_asset_id* ← ctx["source_asset_ids"]).
# Provider-specific knobs (model, quality, seed, motion_mode, etc.) stay — the
# frontend's Regenerate / Load-to-Quick-Gen flow feeds them back into the
# generation widget.
_STAMP_DROP_FROM_PARAMS = frozenset({
    "composition_assets",
    "image_url",
    "image_urls",
    "video_url",
    "source_asset_id",
    "sourceAssetId",
    "source_asset_ids",
    "sourceAssetIds",
})


def _slim_stamped_params(params: Dict[str, Any]) -> Dict[str, Any]:
    """Strip the redundant-or-ephemeral keys before stamping onto an asset.

    The bulk of the 5-10KB per-asset bloat comes from ``composition_assets``
    (full asset descriptors) and stale CDN URLs; both are recoverable.
    """
    if not isinstance(params, dict):
        return params
    return {k: v for k, v in params.items() if k not in _STAMP_DROP_FROM_PARAMS}


def build_generation_context(
    *,
    operation_type: str,
    provider_id: str,
    prompt: Optional[str],
    params: Dict[str, Any],
    source_asset_ids: List[int],
    prompt_version_id: Optional[str] = None,
    reproducible_hash: Optional[str] = None,
    artificial_extend: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Assemble the generation_context dict with a consistent shape.

    This is the canonical shape stored in asset.media_metadata["generation_context"].
    The ``params`` blob is slimmed (see ``_STAMP_DROP_FROM_PARAMS``) so per-asset
    metadata stays small at scale.

    ``operation_type`` / ``provider_id`` / ``prompt`` / ``prompt_version_id`` /
    ``reproducible_hash`` are accepted for backward-compat but NOT stamped
    into the ctx: those fields already live on the ``Asset`` row (columns
    are indexed + queried) and the blob copies were dead weight / stamp-only.
    Readers now go through the column.  Kwargs stay on the signature so
    callers don't break.
    """
    _ = (
        operation_type,
        provider_id,
        prompt,
        prompt_version_id,
        reproducible_hash,
    )  # consumed via columns

    ctx: Dict[str, Any] = {
        "params": _slim_stamped_params(params),
        "source_asset_ids": source_asset_ids,
    }
    if artificial_extend:
        ctx["artificial_extend"] = artificial_extend
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

    preferred_account_id = getattr(generation, "preferred_account_id", None)
    if preferred_account_id is not None:
        flat_params.setdefault("preferred_account_id", preferred_account_id)

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

    # Passthrough: artificial_extend marker (set by i2v-last-frame flow)
    artificial_extend = None
    if isinstance(canonical_params, dict):
        ae = canonical_params.get("artificial_extend")
        if isinstance(ae, dict):
            artificial_extend = ae

    return build_generation_context(
        operation_type=operation_type,
        provider_id=provider_id,
        prompt=prompt,
        params=flat_params,
        source_asset_ids=source_asset_ids,
        prompt_version_id=prompt_version_id,
        reproducible_hash=reproducible_hash,
        artificial_extend=artificial_extend,
    )
