"""
Pixverse embedded asset extractor

Utilities to normalize Pixverse video payloads (customer_paths, etc.)
into a standard list of embedded asset dicts we can register as Assets.

This is adapted from pixsim6/backend/assets/metadata.py but simplified and
isolated to our pixsim7 structure and naming.
"""
from __future__ import annotations

from typing import Optional, Tuple, List, Dict, Any
import copy


def extract_source_image_urls(extra_metadata: Optional[dict]) -> tuple[list[str], Optional[str]]:
    """
    Extract source image URLs from Pixverse extra metadata structures.

    Supports shapes:
    - extra_metadata['customer_img_url']
    - extra_metadata['image_url']
    - extra_metadata['customer_paths']['customer_img_url']
    - extra_metadata['customer_paths']['customer_img_urls'] (list for transitions)

    Returns (image_urls, customer_img_path)
    """
    if not extra_metadata or not isinstance(extra_metadata, dict):
        return ([], None)

    image_urls: List[str] = []
    customer_img_path = None

    if extra_metadata.get("customer_img_url"):
        image_urls.append(extra_metadata["customer_img_url"])
    if extra_metadata.get("image_url"):
        image_urls.append(extra_metadata["image_url"])

    customer_img_path = extra_metadata.get("customer_img_path")

    customer_paths = extra_metadata.get("customer_paths")
    if customer_paths and isinstance(customer_paths, dict):
        if customer_paths.get("customer_img_url"):
            image_urls.append(customer_paths["customer_img_url"])
        if customer_paths.get("customer_img_urls"):
            urls = customer_paths["customer_img_urls"]
            if isinstance(urls, list):
                image_urls.extend(urls)
        if not customer_img_path and customer_paths.get("customer_img_path"):
            customer_img_path = customer_paths["customer_img_path"]

    # de-dup
    seen = set()
    unique = []
    for u in image_urls:
        if u and u not in seen:
            seen.add(u)
            unique.append(u)

    return (unique, customer_img_path)


def normalize_metadata(extra_metadata: Optional[dict]) -> dict:
    """Return a normalized copy of extra_metadata without mutating input."""
    if not extra_metadata:
        return {}
    normalized = copy.deepcopy(extra_metadata)
    customer_paths = normalized.get("customer_paths")
    if customer_paths and isinstance(customer_paths, dict):
        if not normalized.get("customer_img_url") and customer_paths.get("customer_img_url"):
            normalized["customer_img_url"] = customer_paths["customer_img_url"]
        if not normalized.get("customer_img_path") and customer_paths.get("customer_img_path"):
            normalized["customer_img_path"] = customer_paths["customer_img_path"]
        if customer_paths.get("customer_img_urls"):
            normalized["customer_img_urls"] = customer_paths["customer_img_urls"]
    return normalized


def build_embedded_from_pixverse_metadata(
    provider_video_id: str,
    extra_metadata: Optional[dict]
) -> List[Dict[str, Any]]:
    """
    Build a standard embedded list from Pixverse-style metadata.

    Output items use our internal schema expected by AssetService:
    {"type": "image"|"video"|"prompt", "media_type": "image"|"video", "remote_url": str, "provider_asset_id": str, ...}
    """
    normalized = normalize_metadata(extra_metadata)
    urls, _ = extract_source_image_urls(normalized)
    items: List[Dict[str, Any]] = []
    for idx, u in enumerate(urls):
        items.append({
            "type": "image",
            "media_type": "image",
            "remote_url": u,
            # Synthesize a provider asset id for inputs when unknown
            "provider_asset_id": f"{provider_video_id}_src_{idx}",
        })
    # Optional: include prompt if present
    prompt = normalized.get("prompt") or normalized.get("text")
    if prompt:
        items.append({
            "type": "prompt",
            "prompt": prompt,
        })
    return items
