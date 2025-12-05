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
    {
        "type": "image" | "video" | "prompt",
        "media_type": "image" | "video",
        "remote_url": str,
        "provider_asset_id": str,
        "relation_type": Optional[str],
        "operation_type": Optional[str],
        "media_metadata": Optional[dict],
        ...
    }

    For transition videos (create_mode == \"transition\"), this will mark
    source images as TRANSITION_INPUT and attach prompts/durations to
    media_metadata so lineage helpers can inspect them.
    """
    normalized = normalize_metadata(extra_metadata)

    # Extract flattened source image URLs (handles customer_paths.* as needed)
    urls, _ = extract_source_image_urls(normalized)

    # Detect operation/create_mode hints (e.g., transition, fusion, i2v).
    create_mode = normalized.get("create_mode")
    customer_paths = normalized.get("customer_paths") or {}

    # Transition-specific fields (best-effort)
    prompts = (
        customer_paths.get("prompts")
        or normalized.get("prompts")
        or []
    )
    translate_prompts = (
        customer_paths.get("translate_prompts")
        or normalized.get("translate_prompts")
        or []
    )
    durations = (
        customer_paths.get("durations")
        or normalized.get("durations")
        or []
    )

    # First/last frame thumbnails (useful for UI/lineage metadata)
    first_frame_url = (
        customer_paths.get("customer_first_frame_url")
        or normalized.get("customer_first_frame_url")
        or normalized.get("first_frame")
    )
    last_frame_url = (
        customer_paths.get("customer_last_frame_url")
        or normalized.get("customer_last_frame_url")
        or normalized.get("last_frame")
    )

    # Common transition metadata blob we can hang off each source image.
    transition_meta: Dict[str, Any] = {}
    if create_mode:
        transition_meta["create_mode"] = create_mode
    if prompts:
        transition_meta["prompts"] = prompts
    if translate_prompts:
        transition_meta["translate_prompts"] = translate_prompts
    if durations:
        transition_meta["durations"] = durations
    if first_frame_url:
        transition_meta["first_frame_url"] = first_frame_url
    if last_frame_url:
        transition_meta["last_frame_url"] = last_frame_url

    # Fusion-specific fields (best-effort)
    fusion_name_list = (
        customer_paths.get("fusion_name_list")
        or normalized.get("fusion_name_list")
        or []
    )
    fusion_type_list = (
        customer_paths.get("fusion_type_list")
        or normalized.get("fusion_type_list")
        or []
    )
    original_prompt = (
        customer_paths.get("original_prompt")
        or normalized.get("original_prompt")
    )

    fusion_meta: Dict[str, Any] = {}
    if create_mode:
        fusion_meta["create_mode"] = create_mode
    if fusion_name_list:
        fusion_meta["fusion_name_list"] = fusion_name_list
    if fusion_type_list:
        fusion_meta["fusion_type_list"] = fusion_type_list
    if original_prompt:
        fusion_meta["original_prompt"] = original_prompt

    items: List[Dict[str, Any]] = []

    # VIDEO_EXTEND: add source video as embedded parent if available.
    if create_mode == "extend":
        parent_video_url = (
            customer_paths.get("customer_video_url")
            or normalized.get("customer_video_url")
        )
        parent_video_path = (
            customer_paths.get("customer_video_path")
            or normalized.get("customer_video_path")
        )
        parent_duration = (
            customer_paths.get("customer_video_duration")
            or normalized.get("customer_video_duration")
        )
        parent_last_frame_url = (
            customer_paths.get("customer_video_last_frame_url")
            or normalized.get("customer_video_last_frame_url")
        )
        original_video_id = (
            normalized.get("original_video_id")
            or customer_paths.get("original_video_id")
        )

        if parent_video_url or original_video_id:
            parent_meta: Dict[str, Any] = {
                "create_mode": create_mode,
                "original_video_id": original_video_id,
                "customer_video_url": parent_video_url,
                "customer_video_path": parent_video_path,
                "customer_video_duration": parent_duration,
                "customer_video_last_frame_url": parent_last_frame_url,
                "source_video_id": original_video_id or provider_video_id,
            }

            items.append(
                {
                    "type": "video",
                    "media_type": "video",
                    "remote_url": parent_video_url or "",
                    "provider_asset_id": str(original_video_id or f"{provider_video_id}_src_video"),
                    "relation_type": "SOURCE_VIDEO",
                    "operation_type": "video_extend",
                    "media_metadata": {"pixverse_extend": parent_meta},
                }
            )

    for idx, u in enumerate(urls):
        item: Dict[str, Any] = {
            "type": "image",
            "media_type": "image",
            "remote_url": u,
            # Synthesize a provider asset id for inputs when unknown
            "provider_asset_id": f"{provider_video_id}_src_{idx}",
        }

        # If this looks like a transition, mark relation/operation hints
        # so lineage creation can classify correctly.
        if create_mode == "transition":
            # Relation type maps to relation_types.TRANSITION_INPUT
            item["relation_type"] = "TRANSITION_INPUT"
            # Operation type matches OperationType.VIDEO_TRANSITION.value
            item["operation_type"] = "video_transition"

            if transition_meta:
                # Attach per-image transition metadata; include index so
                # downstream consumers can reconstruct ordering if needed.
                item["media_metadata"] = {
                    "pixverse_transition": {
                        **transition_meta,
                        "image_index": idx,
                        "source_video_id": provider_video_id,
                    }
                }
        elif create_mode == "fusion":
            # Fusion videos compose multiple reference images into a single clip.
            # We mark these as fusion references and attach the fusion metadata.
            # Relation type maps to fusion-specific relation types where possible.
            fusion_name = fusion_name_list[idx] if idx < len(fusion_name_list) else None
            fusion_type = fusion_type_list[idx] if idx < len(fusion_type_list) else None

            if fusion_type == "subject":
                relation_type = "FUSION_CHARACTER"
            elif fusion_type == "background":
                relation_type = "FUSION_BACKGROUND"
            else:
                relation_type = "FUSION_REFERENCE"

            item["relation_type"] = relation_type
            # Operation type matches OperationType.FUSION.value
            item["operation_type"] = "fusion"

            fusion_payload: Dict[str, Any] = {
                **fusion_meta,
                "image_index": idx,
                "fusion_name": fusion_name,
                "fusion_entry_type": fusion_type,
                "source_video_id": provider_video_id,
            }

            # Attach fusion metadata alongside any existing media_metadata.
            existing_meta = item.get("media_metadata") or {}
            existing_meta.setdefault("pixverse_fusion", fusion_payload)
            item["media_metadata"] = existing_meta

        items.append(item)

    # Optional: include top-level prompt if present (non-media embedded asset)
    prompt = normalized.get("prompt") or normalized.get("text")
    if prompt:
        items.append({
            "type": "prompt",
            "prompt": prompt,
        })

    return items
