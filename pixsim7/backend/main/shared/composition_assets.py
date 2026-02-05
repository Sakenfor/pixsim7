"""
Composition asset helpers.

Central utilities for coercing and extracting references from composition_assets.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from pixsim7.backend.main.shared.asset_refs import extract_asset_id, extract_asset_ref


def normalize_media_type(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    raw = str(value).strip().lower()
    if raw in {"image", "img", "images"}:
        return "image"
    if raw in {"video", "vid", "videos"}:
        return "video"
    return raw


def _split_asset_or_url(value: Any) -> Tuple[Optional[str], Optional[str]]:
    if value is None:
        return (None, None)
    ref = extract_asset_ref(value, allow_url_asset_id=True)
    if ref:
        if isinstance(ref, str) and ref.startswith("asset:"):
            return (ref, None)
        if isinstance(ref, str) and ref.startswith(("http://", "https://")):
            return (None, ref)
    if isinstance(value, str):
        return (None, value)
    return (None, None)


def coerce_composition_assets(
    values: Any,
    *,
    default_media_type: Optional[str] = None,
    default_role: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Coerce arbitrary input values into a list of composition_asset dicts.

    Accepts:
    - list of CompositionAsset-like dicts
    - list of asset refs / URLs / IDs
    - single asset ref / URL / ID
    """
    if values is None:
        return []

    if not isinstance(values, list):
        values = [values]

    normalized: List[Dict[str, Any]] = []
    for item in values:
        if hasattr(item, "model_dump"):
            item = item.model_dump()

        if isinstance(item, dict):
            entry = dict(item)
            asset_value = (
                entry.get("asset")
                or entry.get("asset_id")
                or entry.get("assetId")
                or entry.get("asset_ref")
            )
            url_value = entry.get("url")

            asset_ref, url_ref = _split_asset_or_url(asset_value)
            if not url_ref and url_value:
                url_ref = url_value

            if asset_ref:
                entry["asset"] = asset_ref
            if url_ref:
                entry["url"] = url_ref

            media_type = (
                entry.get("media_type")
                or entry.get("mediaType")
                or entry.get("media")
            )
            if not media_type and default_media_type:
                entry["media_type"] = default_media_type
            else:
                entry["media_type"] = normalize_media_type(media_type)

            if default_role and not entry.get("role"):
                entry["role"] = default_role

            if entry.get("asset") or entry.get("url") or entry.get("provider_params"):
                normalized.append(entry)
            continue

        asset_ref, url_ref = _split_asset_or_url(item)
        if not asset_ref and not url_ref:
            continue

        entry: Dict[str, Any] = {}
        if asset_ref:
            entry["asset"] = asset_ref
        if url_ref:
            entry["url"] = url_ref
        if default_media_type:
            entry["media_type"] = default_media_type
        if default_role:
            entry["role"] = default_role
        normalized.append(entry)

    return normalized


def composition_assets_to_refs(
    composition_assets: Any,
    *,
    media_type: Optional[str] = None,
) -> List[str]:
    """
    Extract asset refs or URLs from composition assets.
    """
    refs: List[str] = []
    items = coerce_composition_assets(composition_assets)
    for item in items:
        item_media = normalize_media_type(item.get("media_type"))
        if media_type and item_media and item_media != media_type:
            continue
        asset_value = item.get("asset")
        url_value = item.get("url")
        ref = extract_asset_ref(asset_value, allow_url_asset_id=True)
        if ref:
            refs.append(ref)
            continue
        if isinstance(url_value, str) and url_value:
            refs.append(url_value)
    return refs


def composition_assets_to_asset_ids(
    composition_assets: Any,
    *,
    media_type: Optional[str] = None,
) -> List[int]:
    """
    Extract numeric asset IDs from composition assets.
    """
    ids: List[int] = []
    items = coerce_composition_assets(composition_assets)
    for item in items:
        item_media = normalize_media_type(item.get("media_type"))
        if media_type and item_media and item_media != media_type:
            continue
        asset_id = extract_asset_id(item.get("asset"))
        if asset_id is not None:
            ids.append(asset_id)
    return ids
