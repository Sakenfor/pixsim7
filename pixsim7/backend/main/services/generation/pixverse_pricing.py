"""
Pixverse pricing helpers

Provides a single source of truth for Pixverse credit estimates so that
provider adapters, cost extraction, and UI endpoints stay in sync.
"""
from __future__ import annotations

from typing import Optional

try:  # pragma: no cover - optional dependency
    from pixverse.pricing import calculate_cost as pixverse_calculate_cost  # type: ignore
except Exception:  # pragma: no cover
    pixverse_calculate_cost = None  # type: ignore


# Static credit table for Pixverse image models
_PIXVERSE_IMAGE_CREDITS: dict[str, dict[str, int]] = {
    # Qwen image model: 5 / 10 credits for 720p / 1080p
    "qwen-image": {
        "720p": 5,
        "1080p": 10,
    },
    # Nano Banana Pro (API name: gemini-3.0): 50 / 50 / 90 credits for 1080p / 2k / 4k
    "nano-banana-pro": {
        "1080p": 50,
        "2k": 50,
        "4k": 90,
    },
    "gemini-3.0": {  # Alias for nano-banana-pro
        "1080p": 50,
        "2k": 50,
        "4k": 90,
    },
    # Nano Banana (API name: gemini-2.5-flash): 1080p only - 15 credits
    "nano-banana": {
        "1080p": 15,
    },
    "gemini-2.5-flash": {  # Alias for nano-banana
        "1080p": 15,
    },
    # Seedream: 10 credits for 1080p / 2k / 4k
    "seedream-4.0": {
        "1080p": 10,
        "2k": 10,
        "4k": 10,
    },
}


def get_image_credit_change(model: str, quality: str) -> Optional[int]:
    """Return static credit delta for Pixverse image generation."""
    # Case-insensitive lookup
    model_lower = model.lower()
    quality_lower = quality.lower()
    for m, qualities in _PIXVERSE_IMAGE_CREDITS.items():
        if m.lower() == model_lower:
            for q, credits in qualities.items():
                if q.lower() == quality_lower:
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
