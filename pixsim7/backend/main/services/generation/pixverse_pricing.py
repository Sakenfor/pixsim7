"""
Pixverse pricing helpers

Thin wrapper around pixverse-py pricing module.
Provides a single source of truth for Pixverse credit estimates.
"""
from __future__ import annotations

import math
from typing import Any, Optional

# Import from pixverse-py SDK
try:  # pragma: no cover - optional dependency
    from pixverse.pricing import (
        calculate_cost as pixverse_calculate_cost,
        calculate_image_cost as pixverse_calculate_image_cost,
        IMAGE_CREDITS as _SDK_IMAGE_CREDITS,
        normalize_quality as pixverse_normalize_quality,
        WEBAPI_BASE_COSTS as _SDK_WEBAPI_BASE_COSTS,
        WEBAPI_MODEL_BASE_COSTS as _SDK_WEBAPI_MODEL_BASE_COSTS,
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
    _SDK_WEBAPI_MODEL_BASE_COSTS = None  # type: ignore
    _SDK_OPENAPI_BASE_COSTS = None  # type: ignore
    _SDK_MULTI_SHOT_SHORT = 10  # type: ignore
    _SDK_MULTI_SHOT_LONG = 20  # type: ignore
    _SDK_NATIVE_AUDIO = 10  # type: ignore

# Last-resort fallbacks (only used if the SDK import fails entirely).
# Image per-model pricing is NOT duplicated here — it lives solely on
# ImageModelSpec.pricing in the SDK (single source of truth). If the SDK
# import fails, image credit estimates degrade to None rather than risk
# serving a hand-copied table that silently drifts.
_FALLBACK_WEBAPI_BASE_COSTS: dict[str, int] = {
    "360p": 4,
    "540p": 6,
    "720p": 8,
    "1080p": 16,
}

# Models that bill native audio as a fraction of the video base rate (+25%)
# instead of the flat NATIVE_AUDIO_COST. Mirrors
# ``VideoModelSpec.native_audio_base_fraction`` and is only consulted on the
# SDK-unavailable fallback path below.
_AUDIO_BASE_FRACTION_MODELS: dict[str, float] = {"v6": 0.25, "pixverse-c1": 0.25}


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

    # SDK-derived table only; no hand-copied fallback (degrades to None).
    if not _SDK_IMAGE_CREDITS:
        return None
    model_lower = model.lower()
    for m, qualities in _SDK_IMAGE_CREDITS.items():
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

    Per-model pricing overrides live on ``VideoModelSpec.pricing`` in the
    SDK; this wrapper just delegates to ``calculate_cost`` and provides a
    minimal default-table fallback if the SDK import failed.

    Args:
        discounts: Optional model->multiplier map for active promotions,
                   e.g. {"v6": 0.7}. Passed through to SDK calculate_cost.

    Returns:
        Integer credit delta or None if the helper is unavailable.
    """
    if pixverse_calculate_cost is not None:
        try:
            return int(pixverse_calculate_cost(
                quality=quality,
                duration=int(duration),
                api_method="web-api",
                model=model,
                multi_shot=multi_shot,
                audio=audio,
                discounts=discounts,
            ))
        except Exception:
            pass

    # Last-resort fallback: SDK unavailable. Use the default table only;
    # per-model overrides are not reachable here by design.
    normalized_quality = str(quality or "").strip().lower()
    if normalized_quality == "2k":
        normalized_quality = "1440p"
    elif normalized_quality == "4k":
        normalized_quality = "2160p"
    base_table = dict(_SDK_WEBAPI_BASE_COSTS or _FALLBACK_WEBAPI_BASE_COSTS)
    base_cost = base_table.get(normalized_quality, base_table.get("360p", 4))

    multiplier = 1.0
    if discounts and isinstance(model, str):
        direct = discounts.get(model)
        if isinstance(direct, (int, float)):
            multiplier = float(direct)
        else:
            normalized = discounts.get(model.strip().lower())
            if isinstance(normalized, (int, float)):
                multiplier = float(normalized)

    credits = int(base_cost * multiplier * int(duration))
    if multi_shot:
        credits += int(_SDK_MULTI_SHOT_LONG if int(duration) > 5 else _SDK_MULTI_SHOT_SHORT)
    if audio:
        fraction = _AUDIO_BASE_FRACTION_MODELS.get(str(model or "").strip().lower())
        if fraction:
            credits += math.ceil(fraction * base_cost * int(duration))
        else:
            credits += int(_SDK_NATIVE_AUDIO)
    return int(credits)


_DEFAULT_PRICING_KEY = "__default__"


def get_client_pricing_payload() -> Optional[dict[str, Any]]:
    """Serialize pricing constants for the frontend optimistic estimator.

    Pre-resolves a single ``model_pricing`` map (model -> quality ->
    credits-per-second) so the client doesn't need to overlay defaults
    against per-model overrides. The synthetic ``__default__`` entry is
    used when the model isn't recognized.

    Server estimates remain authoritative and reconcile async.
    """
    webapi_defaults = dict(_SDK_WEBAPI_BASE_COSTS or _FALLBACK_WEBAPI_BASE_COSTS)
    overrides = dict(_SDK_WEBAPI_MODEL_BASE_COSTS or {})

    model_pricing: dict[str, dict[str, int]] = {_DEFAULT_PRICING_KEY: dict(webapi_defaults)}
    # model_id -> audio surcharge as a fraction of the per-second video base
    # rate (omitted = flat native_audio).
    audio_fraction: dict[str, float] = {}
    try:
        from pixverse.models import VideoModel  # type: ignore

        for spec in VideoModel.ALL:
            model_id = str(spec)
            if spec.pricing:
                model_pricing[model_id] = dict(spec.pricing)
            else:
                model_pricing[model_id] = dict(webapi_defaults)
            frac = float(getattr(spec, "native_audio_base_fraction", 0.0) or 0.0)
            if frac:
                audio_fraction[model_id] = frac
    except Exception:
        # SDK unavailable — fall back to the known per-second audio models.
        audio_fraction = dict(_AUDIO_BASE_FRACTION_MODELS)
        # SDK unavailable — fall back to overrides dict directly.
        for model_id, qualities in overrides.items():
            model_pricing[model_id] = dict(qualities)

    # Merge any overrides not represented by a spec (defensive).
    for model_id, qualities in overrides.items():
        existing = model_pricing.setdefault(model_id, dict(webapi_defaults))
        existing.update(dict(qualities))

    # SDK-derived only; empty if the SDK import failed (no hand-copied table).
    image_credits: dict[str, dict[str, int]] = {
        model_id: dict(qualities)
        for model_id, qualities in (_SDK_IMAGE_CREDITS or {}).items()
    }

    return {
        "provider": "pixverse",
        "base_duration_seconds": 1,
        "model_pricing": model_pricing,
        "openapi_base_costs": {
            tier: dict(qualities)
            for tier, qualities in (_SDK_OPENAPI_BASE_COSTS or {}).items()
        },
        "multi_shot_short": int(_SDK_MULTI_SHOT_SHORT),
        "multi_shot_long": int(_SDK_MULTI_SHOT_LONG),
        "native_audio": int(_SDK_NATIVE_AUDIO),
        "native_audio_base_fraction": audio_fraction,
        "image_credits": image_credits,
        "quality_aliases": {"2k": "1440p", "4k": "2160p"},
    }


__all__ = [
    "get_image_credit_change",
    "estimate_video_credit_change",
    "get_client_pricing_payload",
    "pixverse_calculate_cost",
]
