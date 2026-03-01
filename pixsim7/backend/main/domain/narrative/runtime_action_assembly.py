"""Runtime assembly helpers for selected action blocks.

These helpers intentionally operate on the primitives-first runtime block shape
(plain dicts) and are independent from the legacy ActionEngine selector stack.
"""

from __future__ import annotations

from typing import Any, Dict, List


DEFAULT_DURATION_SEC = 6.0


def coerce_duration(value: Any, *, default: float = DEFAULT_DURATION_SEC) -> float:
    """Parse a duration value, returning a safe default on invalid inputs."""
    if isinstance(value, (int, float)):
        return float(value)
    if value is None:
        return float(default)
    text = str(value).strip()
    if not text:
        return float(default)
    try:
        return float(text)
    except (TypeError, ValueError):
        return float(default)


def prompts_from_blocks(blocks: List[Dict[str, Any]]) -> List[str]:
    """Extract non-empty prompts from runtime blocks."""
    prompts: List[str] = []
    for block in blocks:
        text = str(block.get("prompt") or "").strip()
        if text:
            prompts.append(text)
    return prompts


def segments_from_blocks(blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Create segment-like payloads from runtime blocks."""
    segments: List[Dict[str, Any]] = []
    for index, block in enumerate(blocks):
        block_id = block.get("block_id") or block.get("blockId") or block.get("id")
        duration = coerce_duration(block.get("durationSec"))
        segment = {
            "id": f"{block_id}_{index}" if block_id is not None else f"segment_{index}",
            "blockId": block_id,
            "duration": duration,
            "durationSec": duration,
            "prompt": block.get("prompt"),
            "role": block.get("role"),
            "category": block.get("category"),
            "metadata": {
                "blockId": block_id,
                "kind": block.get("kind", "single_state"),
                "source": block.get("source", "primitives"),
            },
        }
        segments.append(segment)
    return segments


def total_duration_from_blocks(blocks: List[Dict[str, Any]]) -> float:
    """Compute total duration for runtime blocks."""
    return sum(coerce_duration(block.get("durationSec")) for block in blocks)


def composition_assets_from_resolved_images(
    resolved_images: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Normalize resolved image records into composition-assets shape."""
    composition_assets: List[Dict[str, Any]] = []
    for image in resolved_images:
        asset_id = image.get("assetId") or image.get("asset_id")
        asset_ref = {"type": "asset", "id": asset_id} if asset_id else None
        candidate = {
            "asset": asset_ref,
            "url": image.get("url"),
            "role": image.get("role"),
            "intent": image.get("intent"),
            "priority": image.get("priority"),
            "layer": image.get("layer"),
            "character_id": image.get("character_id"),
            "location_id": image.get("location_id"),
            "pose_id": image.get("pose_id"),
            "expression_id": image.get("expression_id"),
            "camera_view_id": image.get("camera_view_id"),
            "camera_framing_id": image.get("camera_framing_id"),
            "surface_type": image.get("surface_type"),
            "prop_id": image.get("prop_id"),
            "tags": image.get("tags"),
        }
        composition_assets.append(
            {
                key: value
                for key, value in candidate.items()
                if value is not None and value != []
            }
        )
    return composition_assets

