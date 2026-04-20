"""
Pixverse pricing helpers

Thin wrapper around pixverse-py pricing module.
Provides a single source of truth for Pixverse credit estimates.
"""
from __future__ import annotations

from typing import Any, Optional

# Import from pixverse-py SDK
try:  # pragma: no cover - optional dependency
    from pixverse.pricing import (
        calculate_cost as pixverse_calculate_cost,
        calculate_image_cost as pixverse_calculate_image_cost,
        IMAGE_CREDITS as _SDK_IMAGE_CREDITS,
        normalize_quality as pixverse_normalize_quality,
        WEBAPI_BASE_COSTS as _SDK_WEBAPI_BASE_COSTS,
        OPENAPI_BASE_COSTS as _SDK_OPENAPI_BASE_COSTS,
        MULTI_SHOT_COST_SHORT as _SDK_MULTI_SHOT_SHORT,
        MULTI_SHOT_COST_LONG as _SDK_MULTI_SHOT_LONG,
        NATIVE_AUDIO_COST as _SDK_NATIVE_AUDIO,
    )
except Exception:  # pragma: no cover
    pixverse_calculate_cost = None  # type: ignore
    pixverse_calculate_image_cost = None  # type: ignore
    _SDK_IMAGE_CREDITS = None  # type: ignore
    pixverse_normalize_quality = None  # type: ignore
    _SDK_WEBAPI_BASE_COSTS = None  # type: ignore
    _SDK_OPENAPI_BASE_COSTS = None  # type: ignore
    _SDK_MULTI_SHOT_SHORT = 10  # type: ignore
    _SDK_MULTI_SHOT_LONG = 20  # type: ignore
    _SDK_NATIVE_AUDIO = 10  # type: ignore

# Fallback credit table (only used if SDK not available)
# Uses both *p format (1440p, 2160p) and legacy labels (2k, 4k) for compatibility
_FALLBACK_IMAGE_CREDITS: dict[str, dict[str, int]] = {
    "qwen-image": {"720p": 5, "1080p": 10},
    "gemini-3.0": {"1080p": 50, "1440p": 50, "2160p": 90, "2k": 50, "4k": 90},
    "gemini-2.5-flash": {"1080p": 15},
    "seedream-4.0": {"1080p": 10, "1440p": 10, "2160p": 10, "2k": 10, "4k": 10},
    "seedream-4.5": {"1440p": 10, "2160p": 10, "2k": 10, "4k": 10},
}


def get_image_credit_change(model: str, quality: str) -> Optional[int]:
    """Return static credit delta for Pixverse image generation."""
    if pixverse_normalize_quality is not None:
        quality_normalized = pixverse_normalize_quality("image", quality)
    else:
        quality_normalized = quality.lower()

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
    discounts: Optional[dict[str, float]] = None,
) -> Optional[int]:
    """
    Estimate Pixverse video credits using pixverse-py helper when available.

    Args:
        discounts: Optional model->multiplier map for active promotions,
                   e.g. {"v6": 0.7}. Passed through to SDK calculate_cost.

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
            multi_shot=multi_shot,
            audio=audio,
            discounts=discounts,
        )
        return int(credits)
    except Exception:  # pragma: no cover - defensive
        return None


def get_client_pricing_payload() -> Optional[dict[str, Any]]:
    """Serialize pricing constants for the frontend optimistic estimator.

    Mirrors the small deterministic formula in pixverse.pricing.calculate_cost
    so the client can render credit estimates synchronously. Server estimates
    remain authoritative and reconcile async.
    """
    if _SDK_WEBAPI_BASE_COSTS is None:
        return None

    image_credits: dict[str, dict[str, int]] = {}
    if _SDK_IMAGE_CREDITS:
        for model_id, qualities in _SDK_IMAGE_CREDITS.items():
            image_credits[model_id] = dict(qualities)
    else:
        for model_id, qualities in _FALLBACK_IMAGE_CREDITS.items():
            image_credits[model_id] = dict(qualities)

    return {
        "provider": "pixverse",
        "base_duration_seconds": 5,
        "webapi_base_costs": dict(_SDK_WEBAPI_BASE_COSTS),
        "openapi_base_costs": {
            tier: dict(qualities)
            for tier, qualities in (_SDK_OPENAPI_BASE_COSTS or {}).items()
        },
        "multi_shot_short": int(_SDK_MULTI_SHOT_SHORT),
        "multi_shot_long": int(_SDK_MULTI_SHOT_LONG),
        "native_audio": int(_SDK_NATIVE_AUDIO),
        "image_credits": image_credits,
        "quality_aliases": {"2k": "1440p", "4k": "2160p"},
    }


__all__ = [
    "get_image_credit_change",
    "estimate_video_credit_change",
    "get_client_pricing_payload",
    "pixverse_calculate_cost",
]
