"""
Pixverse promotions normalization helpers.

Converts heterogeneous Pixverse promo payloads into a stable model_id -> bool
mapping used by account metadata and UI pricing hints.

Includes discount probing: for paid accounts, compare Pixverse's reported
credit_change against our base pricing to auto-discover the real multiplier
(e.g. 14/20 = 0.7x for v6 promo).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_PROMOTION_KEY_ALIASES: Dict[str, str] = {
    "is_v6_discount": "v6",
}

# Known discount multipliers per model promotion.
# These are observed values from Pixverse's actual pricing.
# Updated when promotions change (backend-authoritative, frontend reads from metadata).
KNOWN_PROMOTION_DISCOUNTS: Dict[str, float] = {
    "v6": 0.7,  # 30% off during v6 launch promo (observed 14cr vs 20cr base for 360p/5s)
}


def _coerce_promotion_active(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value > 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on", "active", "enabled"}
    if isinstance(value, dict):
        for key in ("active", "enabled", "is_active"):
            if key in value:
                return _coerce_promotion_active(value.get(key))
        return False
    return bool(value)


def normalize_pixverse_promotions(payload: Any) -> Dict[str, bool]:
    """Normalize Pixverse promotion payloads to model_id -> bool."""
    if not isinstance(payload, dict):
        return {}

    normalized: Dict[str, bool] = {}
    for raw_key, raw_value in payload.items():
        key = str(raw_key).strip().lower()
        if not key:
            continue

        model_id = _PROMOTION_KEY_ALIASES.get(key)
        if model_id is None and key.startswith("is_") and key.endswith("_discount"):
            model_id = key[len("is_") : -len("_discount")]
        if model_id is None and key.startswith("is_") and key.endswith("_promo"):
            model_id = key[len("is_") : -len("_promo")]
        if model_id is None:
            model_id = key

        normalized[model_id] = _coerce_promotion_active(raw_value)

    return normalized


def extract_pixverse_promotions(credits_payload: Any) -> Dict[str, bool]:
    """Extract + normalize promotions from Pixverse credits payload."""
    if not isinstance(credits_payload, dict):
        return {}

    nested_promotions = credits_payload.get("promotions")
    if isinstance(nested_promotions, dict):
        return normalize_pixverse_promotions(nested_promotions)

    fallback_flags: Dict[str, Any] = {}
    for raw_key, raw_value in credits_payload.items():
        key = str(raw_key).strip().lower()
        if key.startswith("is_") and (key.endswith("_discount") or key.endswith("_promo")):
            fallback_flags[key] = raw_value

    if fallback_flags:
        return normalize_pixverse_promotions(fallback_flags)

    return {}


def resolve_promotion_discounts(promotions: Dict[str, bool]) -> Dict[str, float]:
    """Resolve known discount multipliers for active promotions.

    Returns model_id -> multiplier for promotions that have a known discount.
    """
    return {
        model_id: KNOWN_PROMOTION_DISCOUNTS[model_id]
        for model_id, active in promotions.items()
        if active and model_id in KNOWN_PROMOTION_DISCOUNTS
    }


# ---------------------------------------------------------------------------
# Discount probing — derive multiplier from actual Pixverse pricing
# ---------------------------------------------------------------------------

# Reference params for probing: cheapest combo so we waste minimal credits
# if something goes wrong (though we never actually generate, just read cost).
_PROBE_QUALITY = "360p"
_PROBE_DURATION = 5


def _base_cost(quality: str, duration: int) -> Optional[int]:
    """Get our known base cost (no discount) for a quality/duration."""
    try:
        from pixverse.pricing import calculate_cost
        return calculate_cost(quality, duration, api_method="web-api")
    except Exception:
        return None


def probe_promotion_discounts(
    promotions: Dict[str, bool],
    estimate_fn: Any,
) -> Dict[str, float]:
    """
    For each active promotion model, call estimate_fn to get the actual
    Pixverse cost and compare against base pricing to discover the multiplier.

    Args:
        promotions: model_id -> active flag (from extract_pixverse_promotions)
        estimate_fn: callable(quality, duration, model) -> int|None
                     Should call Pixverse's credit estimation (e.g. via
                     the generation cost preview, or our own calculate_cost
                     with the account's actual pricing).

    Returns:
        model_id -> multiplier (e.g. {"v6": 0.7}) for active promotions
        where the discount could be determined. Empty if probing fails.
    """
    discovered: Dict[str, float] = {}
    base = _base_cost(_PROBE_QUALITY, _PROBE_DURATION)
    if base is None or base <= 0:
        return discovered

    for model_id, active in promotions.items():
        if not active:
            continue
        try:
            actual = estimate_fn(_PROBE_QUALITY, _PROBE_DURATION, model_id)
            if actual is None or not isinstance(actual, (int, float)) or actual <= 0:
                continue
            multiplier = round(actual / base, 2)
            if 0.01 <= multiplier < 1.0:
                discovered[model_id] = multiplier
                logger.info(
                    "promo_discount_probed model=%s base=%d actual=%d multiplier=%.2f",
                    model_id, base, actual, multiplier,
                )
        except Exception as exc:
            logger.debug("promo_discount_probe_failed model=%s error=%s", model_id, exc)

    return discovered

