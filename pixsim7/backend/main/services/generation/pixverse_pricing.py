"""
Pixverse pricing helpers

Thin wrapper around pixverse-py pricing module.
Provides a single source of truth for Pixverse credit estimates.
"""
from __future__ import annotations

from typing import Optional

# Import from pixverse-py SDK
try:  # pragma: no cover - optional dependency
    from pixverse.pricing import (
        calculate_cost as pixverse_calculate_cost,
        calculate_image_cost as pixverse_calculate_image_cost,
        IMAGE_CREDITS as _SDK_IMAGE_CREDITS,
    )
except Exception:  # pragma: no cover
    pixverse_calculate_cost = None  # type: ignore
    pixverse_calculate_image_cost = None  # type: ignore
    _SDK_IMAGE_CREDITS = None  # type: ignore

# Quality normalization: UI may use "2k"/"4k" but we store as "1440p"/"2160p"
_QUALITY_ALIASES = {
    "2k": "1440p",
    "4k": "2160p",
}

# Fallback credit table (only used if SDK not available)
# Uses normalized resolution format (1440p, 2160p) for consistency
_FALLBACK_IMAGE_CREDITS: dict[str, dict[str, int]] = {
    "qwen-image": {"720p": 5, "1080p": 10},
    "gemini-3.0": {"1080p": 50, "1440p": 50, "2160p": 90},
    "gemini-2.5-flash": {"1080p": 15},
    "seedream-4.0": {"1080p": 10, "1440p": 10, "2160p": 10},
    "seedream-4.5": {"1440p": 10, "2160p": 10},
}


def get_image_credit_change(model: str, quality: str) -> Optional[int]:
    """Return static credit delta for Pixverse image generation."""
    # Normalize quality (e.g., "2k" -> "1440p")
    quality_normalized = _QUALITY_ALIASES.get(quality.lower(), quality).lower()

    # Try SDK first
    if pixverse_calculate_image_cost is not None:
        result = pixverse_calculate_image_cost(model, quality_normalized)
        if result is not None:
            return result

    # Fallback to local table
    credits_table = _SDK_IMAGE_CREDITS if _SDK_IMAGE_CREDITS else _FALLBACK_IMAGE_CREDITS
    model_lower = model.lower()
    for m, qualities in credits_table.items():
        if m.lower() == model_lower:
            for q, credits in qualities.items():
                if q.lower() == quality_normalized:
                    return credits
    return None


def estimate_video_credit_change(
    *,
    quality: str,
    duration: int,
    model: str,
    motion_mode: Optional[str] = None,
    multi_shot: bool = False,
    audio: bool = False,
) -> Optional[int]:
    """
    Estimate Pixverse video credits using pixverse-py helper when available.

    Returns:
        Integer credit delta or None if the helper is unavailable.
    """
    if pixverse_calculate_cost is None:
        return None

    try:
        credits = pixverse_calculate_cost(
            quality=quality,
            duration=int(duration),
            api_method="web-api",
            model=model,
            motion_mode=motion_mode,
            multi_shot=multi_shot,
            audio=audio,
        )
        return int(credits)
    except Exception:  # pragma: no cover - defensive
        return None


__all__ = [
    "get_image_credit_change",
    "estimate_video_credit_change",
    "pixverse_calculate_cost",
]
