"""
Pixverse Pricing Calculator

Cost calculation for Pixverse video generation.
Supports both WebAPI and OpenAPI with different pricing structures.

Pattern: 8-second videos cost exactly 2x the 5-second price.

Usage:
    from pixverse.pricing import calculate_cost, get_pricing_table

    # WebAPI pricing
    cost = calculate_cost("1080p", 8, api_method="web-api")  # Returns 160 credits

    # OpenAPI pricing
    cost = calculate_cost("1080p", 8, api_method="open-api", model="v5")  # Returns 240 credits
"""
from typing import Dict, Optional

from .models import ImageModel, VideoModel

# ============================================================================
# WebAPI Pricing (JWT Token-based)
# ============================================================================

# Per-second WebAPI base credits. Models without per-spec pricing inherit this.
# Cost = base * duration (no scaling factor — credits are stored per second).
WEBAPI_BASE_COSTS: Dict[str, int] = {
    "360p": 4,
    "540p": 6,
    "720p": 8,
    "1080p": 16,
}

# Per-model WebAPI overrides — derived from VideoModelSpec.pricing so the
# spec is the single source of truth. Add overrides by setting ``pricing=``
# on the spec; this dict is rebuilt automatically.
WEBAPI_MODEL_BASE_COSTS: Dict[str, Dict[str, int]] = {
    spec.id: dict(spec.pricing) for spec in VideoModel.ALL if spec.pricing
}

# ============================================================================
# OpenAPI Pricing (API Key-based)
# OpenAPI uses separate credits from WebAPI
# Keyed by pricing_tier from VideoModelSpec
# ============================================================================

OPENAPI_BASE_COSTS: Dict[str, Dict[str, int]] = {
    "v5": {"360p": 9, "540p": 9, "720p": 12, "1080p": 24},
}

# All credit tables above are per-second. Cost = rate * duration.
# Multi-shot / native-audio addons are flat (added once per call).

# ============================================================================
# Feature Pricing (Additional Costs)
# ============================================================================

# Auto Sound (10 credits for WebAPI, unknown for OpenAPI)
AUTO_SOUND_WEBAPI_COST = 10
AUTO_SOUND_OPENAPI_COST = None  # Unknown - set when confirmed

# Auto Speech (45 credits for WebAPI, unknown for OpenAPI)
AUTO_SPEECH_WEBAPI_COST = 45
AUTO_SPEECH_OPENAPI_COST = None  # Unknown - set when confirmed

# Multi-shot (v5.5+ only): +10 for ≤5s, +20 for >5s
MULTI_SHOT_COST_SHORT = 10  # 1-5 seconds
MULTI_SHOT_COST_LONG = 20   # 6-10 seconds

# Native audio (v5.5+ only): flat +10 credits regardless of duration
NATIVE_AUDIO_COST = 10

# Transition: Cost per additional image beyond first 2
# Formula: base_cost + (num_images - 2) * 20
# Example: 360p 3 images = 20 + (3-2)*20 = 40 credits
TRANSITION_COST_PER_IMAGE = 20

# ============================================================================
# Image Generation Pricing (Image-to-Image)
# ============================================================================

# Credits per model and quality — derived from ImageModelSpec.pricing
IMAGE_CREDITS: Dict[str, Dict[str, int]] = {
    spec.id: dict(spec.pricing) for spec in ImageModel.ALL if spec.pricing
}

def normalize_quality(kind: str, quality: str) -> str:
    """
    Normalize quality strings per Pixverse kind.

    - Image: prefers "2k"/"4k" labels
    - Video: prefers resolution labels ("1440p"/"2160p") if 2k/4k provided
    """
    if not quality:
        return quality

    normalized = str(quality).lower()
    if kind == "image":
        return {
            "1440p": "2k",
            "2160p": "4k",
        }.get(normalized, normalized)
    if kind == "video":
        return {
            "2k": "1440p",
            "4k": "2160p",
        }.get(normalized, normalized)
    return normalized


def _resolve_discount_multiplier(
    model: Optional[str],
    discounts: Optional[Dict[str, float]],
) -> float:
    """Look up a discount multiplier for ``model``, case-insensitive."""
    if not discounts or not model:
        return 1.0
    direct = discounts.get(model)
    if isinstance(direct, (int, float)):
        return float(direct)
    key = str(model).strip().lower()
    if key:
        normalized = discounts.get(key)
        if isinstance(normalized, (int, float)):
            return float(normalized)
    return 1.0


def calculate_image_cost(model: str, quality: str) -> Optional[int]:
    """
    Calculate estimated cost for Pixverse image generation.

    Args:
        model: Image model name (e.g., "seedream-4.0", "gemini-3.0")
        quality: Quality preset (e.g., "1080p", "2k", "4k")

    Returns:
        Credit cost or None if model/quality combination is unknown.
    """
    spec = ImageModel.get(model)
    if spec is None:
        return None
    return spec.cost(normalize_quality("image", quality))


def calculate_cost(
    quality: str,
    duration: int,
    api_method: str = "web-api",
    model: Optional[str] = None,
    multi_shot: bool = False,
    audio: bool = False,
    discounts: Optional[Dict[str, float]] = None,
) -> int:
    """
    Calculate estimated cost for Pixverse video generation.

    Args:
        quality: Quality level (e.g. 360p, 540p, 720p, 1080p, 480p for grok-imagine)
        duration: Duration in seconds (1-15 depending on model)
        api_method: API method ("web-api", "open-api", or "auto")
        model: Model version (v5, v5-fast, v5.5, v5.6, v6, pixverse-c1, grok-imagine)
        multi_shot: Enable multi-shot (v5.5+ only, +10 for 5s, +20 for 8s/10s)
        audio: Enable native audio (v5.5+ only, +10 flat)
        discounts: Optional model->multiplier map for active promotions,
                   e.g. {"v6": 0.7}. Sourced from account credits API.

    Returns:
        Estimated cost in credits

    Examples:
        >>> calculate_cost("360p", 5, "web-api")
        20
        >>> calculate_cost("1080p", 10, "web-api")
        160
        >>> calculate_cost("360p", 5, "web-api", model="v6", discounts={"v6": 0.7})
        14
    """
    # Normalize inputs
    quality = normalize_quality("video", quality).lower()
    api_method = api_method.lower()

    # Auto defaults to web-api
    if api_method == "auto":
        api_method = "web-api"

    # Resolve model spec; falls back to default for unknown models.
    spec = VideoModel.get(model) if model else None

    # Get base cost based on API method
    if api_method == "open-api":
        tier = spec.pricing_tier if spec else "v5"
        base_cost = OPENAPI_BASE_COSTS[tier].get(quality, OPENAPI_BASE_COSTS["v5"]["360p"])
    else:
        # web-api (and any unknown method) — spec overrides win, defaults otherwise.
        if spec is not None:
            base_cost = spec.webapi_base_cost(quality, WEBAPI_BASE_COSTS)
        else:
            base_cost = WEBAPI_BASE_COSTS.get(quality)
        if base_cost is None:
            base_cost = WEBAPI_BASE_COSTS["360p"]

    # Apply promotional discount if active for this model (case-insensitive).
    multiplier = _resolve_discount_multiplier(model, discounts)

    # Linear: base costs are per-second.
    cost = int(base_cost * multiplier * duration)

    # Add multi_shot cost (v5.5+ feature)
    if multi_shot:
        cost += MULTI_SHOT_COST_LONG if duration > 5 else MULTI_SHOT_COST_SHORT

    # Add native audio cost (v5.5+ feature).
    # v6 / pixverse-c1 bill audio per-second (spec.native_audio_per_second,
    # e.g. 1 credit/sec so 360p+audio = 5/sec); older models use the flat
    # NATIVE_AUDIO_COST surcharge.
    if audio:
        per_second = spec.native_audio_per_second if spec else 0
        if per_second:
            cost += int(per_second * duration)
        else:
            cost += NATIVE_AUDIO_COST

    return cost


def calculate_transition_cost(
    quality: str,
    num_images: int,
    api_method: str = "web-api",
    model: Optional[str] = None,
) -> int:
    """
    Calculate cost for transition video generation.

    Transition pricing: Base cost for quality + additional cost per image beyond first 2.
    Formula: base_cost(quality) + max(0, num_images - 2) * 20

    Args:
        quality: Quality level (360p, 540p, 720p, 1080p)
        num_images: Number of images in transition (minimum 2)
        api_method: API method ("web-api" or "open-api")
        model: Model version (v5, v5-fast, v5.5, v5.6)

    Returns:
        Estimated cost in credits

    Examples:
        >>> calculate_transition_cost("360p", 2, "web-api")
        20
        >>> calculate_transition_cost("360p", 3, "web-api")
        40
        >>> calculate_transition_cost("540p", 4, "web-api")
        70  # 30 + (4-2)*20
    """
    if num_images < 2:
        num_images = 2  # Minimum 2 images for transition

    # Get base cost for the quality (using 5s duration as base)
    base_cost = calculate_cost(
        quality=quality,
        duration=5,
        api_method=api_method,
        model=model,
    )

    # Add cost for additional images beyond first 2
    additional_images = max(0, num_images - 2)
    transition_cost = base_cost + (additional_images * TRANSITION_COST_PER_IMAGE)

    return transition_cost


def calculate_feature_cost(
    feature: str,
    api_method: str = "web-api"
) -> Optional[int]:
    """
    Calculate cost for additional features (auto_sound, auto_speech).

    Args:
        feature: Feature name ("auto_sound" or "auto_speech")
        api_method: API method ("web-api" or "open-api")

    Returns:
        Cost in credits, or None if unknown

    Examples:
        >>> calculate_feature_cost("auto_sound", "web-api")
        10
        >>> calculate_feature_cost("auto_speech", "web-api")
        45
    """
    normalized_api_method = (api_method or "auto").lower()
    if normalized_api_method == "auto":
        normalized_api_method = "web-api"

    feature = feature.lower()

    if feature == "auto_sound":
        return AUTO_SOUND_WEBAPI_COST if normalized_api_method == "web-api" else AUTO_SOUND_OPENAPI_COST
    elif feature == "auto_speech":
        return AUTO_SPEECH_WEBAPI_COST if normalized_api_method == "web-api" else AUTO_SPEECH_OPENAPI_COST

    return None


def get_pricing_table(
    api_method: str = "web-api",
    model: str = "v5",
    durations: Optional[list] = None
) -> Dict[str, Dict[int, int]]:
    """
    Get full pricing table for all quality/duration combinations.

    Args:
        api_method: API method ("web-api" or "open-api")
        model: Model version (only relevant for open-api)
        durations: List of durations to include (default: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

    Returns:
        Dict mapping quality -> duration -> cost

    Example:
        {
            "360p": {1: 4, 2: 8, 5: 20, 10: 40},
            "540p": {1: 6, 2: 12, 5: 30, 10: 60},
            ...
        }
    """
    if durations is None:
        durations = list(range(1, 11))  # 1-10 seconds
    table = {}
    for quality in ["360p", "540p", "720p", "1080p"]:
        table[quality] = {}
        for duration in durations:
            table[quality][duration] = calculate_cost(quality, duration, api_method, model)
    return table


if __name__ == "__main__":
    # Test the cost calculation
    print("=" * 60)
    print("PIXVERSE PRICING TABLES (1-10 seconds)")
    print("=" * 60)

    # WebAPI pricing - show key durations
    print("\n[WebAPI Pricing] (JWT Token-based)")
    print("-" * 60)
    print(f"{'Quality':<8} | {'1s':>4} | {'2s':>4} | {'5s':>4} | {'8s':>4} | {'10s':>4}")
    print("-" * 60)
    for quality in ["360p", "540p", "720p", "1080p"]:
        costs = [calculate_cost(quality, d, "web-api") for d in [1, 2, 5, 8, 10]]
        print(f"{quality:<8} | {costs[0]:>4} | {costs[1]:>4} | {costs[2]:>4} | {costs[3]:>4} | {costs[4]:>4}")

    # OpenAPI V5 pricing
    print("\n[OpenAPI Pricing - V5] (API Key-based)")
    print("-" * 60)
    print(f"{'Quality':<8} | {'1s':>4} | {'2s':>4} | {'5s':>4} | {'8s':>4} | {'10s':>4}")
    print("-" * 60)
    for quality in ["360p", "540p", "720p", "1080p"]:
        costs = [calculate_cost(quality, d, "open-api", "v5") for d in [1, 2, 5, 8, 10]]
        print(f"{quality:<8} | {costs[0]:>4} | {costs[1]:>4} | {costs[2]:>4} | {costs[3]:>4} | {costs[4]:>4}")

    print("\n" + "=" * 60)
    print("Test Cases - Linear Duration Pricing:")
    print("-" * 60)
    # WebAPI: 360p = 4 credits/sec
    print(f"WebAPI 360p 1s = {calculate_cost('360p', 1, 'web-api')} (expected: 4)")
    print(f"WebAPI 360p 2s = {calculate_cost('360p', 2, 'web-api')} (expected: 8)")
    print(f"WebAPI 360p 5s = {calculate_cost('360p', 5, 'web-api')} (expected: 20)")
    print(f"WebAPI 360p 10s = {calculate_cost('360p', 10, 'web-api')} (expected: 40)")
    # WebAPI: 1080p = 16 credits/sec
    print(f"WebAPI 1080p 1s = {calculate_cost('1080p', 1, 'web-api')} (expected: 16)")
    print(f"WebAPI 1080p 5s = {calculate_cost('1080p', 5, 'web-api')} (expected: 80)")
    print(f"WebAPI 1080p 10s = {calculate_cost('1080p', 10, 'web-api')} (expected: 160)")

    print("\n" + "=" * 60)
    print("Test Cases - Transition:")
    print("-" * 60)
    print(f"WebAPI 360p 2 images = {calculate_transition_cost('360p', 2, 'web-api')} (expected: 20)")
    print(f"WebAPI 360p 3 images = {calculate_transition_cost('360p', 3, 'web-api')} (expected: 40)")
    print(f"WebAPI 540p 2 images = {calculate_transition_cost('540p', 2, 'web-api')} (expected: 30)")
    print(f"WebAPI 540p 4 images = {calculate_transition_cost('540p', 4, 'web-api')} (expected: 70)")

    print("\n" + "=" * 60)
    print("Test Cases - V5.5 Features (multi_shot, audio):")
    print("-" * 60)
    print(f"WebAPI 360p 5s = {calculate_cost('360p', 5, 'web-api')} (expected: 20)")
    print(f"WebAPI 360p 5s + multi_shot = {calculate_cost('360p', 5, 'web-api', multi_shot=True)} (expected: 30)")
    print(f"WebAPI 360p 5s + audio = {calculate_cost('360p', 5, 'web-api', audio=True)} (expected: 30)")
    print(f"WebAPI 360p 6s + multi_shot = {calculate_cost('360p', 6, 'web-api', multi_shot=True)} (expected: 44)")  # 24 + 20
    print(f"WebAPI 360p 10s = {calculate_cost('360p', 10, 'web-api')} (expected: 40)")
    print(f"WebAPI 360p 10s + multi_shot = {calculate_cost('360p', 10, 'web-api', multi_shot=True)} (expected: 60)")
    print(f"WebAPI 360p 10s + multi_shot + audio = {calculate_cost('360p', 10, 'web-api', multi_shot=True, audio=True)} (expected: 70)")
    print("=" * 60)
