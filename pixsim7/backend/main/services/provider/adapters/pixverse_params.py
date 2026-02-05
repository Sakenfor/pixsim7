"""
Pixverse parameter mapping utilities.

Extracted from pixverse.py to reduce main adapter size.
"""
from typing import Any, Dict
from pixsim7.backend.main.domain import OperationType

# Import pixverse-py SDK models (optional)
try:
    from pixverse.models import VideoModel, ImageModel  # type: ignore
except ImportError:
    VideoModel = ImageModel = None  # type: ignore

from pixsim7.backend.main.services.generation.pixverse_pricing import (
    get_image_credit_change,
    estimate_video_credit_change,
)
from pixsim7.backend.main.services.provider.adapters.pixverse_url_resolver import normalize_url
from pixsim7.backend.main.shared.composition_assets import composition_assets_to_refs


# Operation type sets for Pixverse
VIDEO_OPERATIONS = frozenset({
    OperationType.TEXT_TO_VIDEO,
    OperationType.IMAGE_TO_VIDEO,
    OperationType.VIDEO_EXTEND,
    OperationType.VIDEO_TRANSITION,
    OperationType.FUSION,
})

IMAGE_OPERATIONS = frozenset({
    OperationType.TEXT_TO_IMAGE,
    OperationType.IMAGE_TO_IMAGE,
})


# Quality normalization: Pixverse API expects resolution format (e.g., "1440p")
# but the SDK/UI may use marketing format (e.g., "2k", "4k")
_QUALITY_NORMALIZATION = {
    "2k": "1440p",
    "4k": "2160p",
}


def normalize_quality(quality: str) -> str:
    """Normalize quality value to Pixverse API format.

    Converts marketing formats like "2k"/"4k" to resolution formats "1440p"/"2160p".
    Passes through already-correct formats unchanged.
    """
    return _QUALITY_NORMALIZATION.get(quality.lower(), quality)


def normalize_transition_durations(
    durations: Any,
    expected_count: int | None = None,
) -> list[int]:
    """
    Coerce transition durations to Pixverse's expected 1-8 second ints.
    Accepts either a single int/float or list of numbers.
    """
    if durations is None:
        return []

    if isinstance(durations, (int, float)):
        raw_values = [durations]
    elif isinstance(durations, (list, tuple)):
        raw_values = list(durations)
    else:
        return []

    if not raw_values:
        return []

    count = expected_count if expected_count is not None else len(raw_values)
    if count <= 0:
        count = len(raw_values)

    sanitized: list[int] = []
    for idx in range(count):
        if idx < len(raw_values):
            candidate = raw_values[idx]
        else:
            candidate = raw_values[-1]

        try:
            numeric = int(round(float(candidate)))
        except (TypeError, ValueError):
            numeric = 5

        numeric = max(1, min(8, numeric))
        sanitized.append(numeric)

    return sanitized


def map_parameters(
    operation_type: OperationType,
    params: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Map generic parameters to Pixverse-specific format.

    Cleanly separates video operations from image operations with
    appropriate defaults for each.

    Args:
        operation_type: Operation type
        params: Generic parameters

    Returns:
        Pixverse-specific parameters
    """
    # Derive model sets from SDK when available
    video_models = set(getattr(VideoModel, "ALL", [])) if VideoModel else {"v3.5", "v4", "v5", "v5.5"}
    image_models = set(getattr(ImageModel, "ALL", [])) if ImageModel else {"qwen-image", "gemini-3.0", "gemini-2.5-flash", "seedream-4.0", "seedream-4.5"}

    is_video_op = operation_type in VIDEO_OPERATIONS
    is_image_op = operation_type in IMAGE_OPERATIONS

    mapped: Dict[str, Any] = {}

    # === Common parameters (all operations) ===
    if "prompt" in params and params["prompt"] is not None:
        mapped["prompt"] = params["prompt"]
    if "seed" in params and params["seed"] is not None and params["seed"] != "":
        mapped["seed"] = params["seed"]

    # === Model selection (video vs image) ===
    if "model" in params and params["model"] is not None:
        model = params["model"]
        # Validate model matches operation type
        if is_image_op and model in video_models:
            mapped["model"] = "qwen-image"  # Default image model
        elif is_video_op and model in image_models:
            mapped["model"] = "v5"  # Default video model
        else:
            mapped["model"] = model
    else:
        # Set appropriate default
        mapped["model"] = "v5" if is_video_op else "qwen-image"

    # === Quality (both, but different defaults) ===
    # Normalize quality values (e.g., "2k" -> "1440p", "4k" -> "2160p")
    if "quality" in params and params["quality"] is not None:
        mapped["quality"] = normalize_quality(params["quality"])
    else:
        mapped["quality"] = "360p" if is_video_op else "720p"

    # === Aspect ratio (both, but not for IMAGE_TO_VIDEO or VIDEO_EXTEND) ===
    # VIDEO_EXTEND inherits aspect ratio from source video
    if operation_type not in {OperationType.IMAGE_TO_VIDEO, OperationType.VIDEO_EXTEND}:
        if "aspect_ratio" in params and params["aspect_ratio"] is not None:
            mapped["aspect_ratio"] = params["aspect_ratio"]
        elif is_image_op:
            mapped["aspect_ratio"] = "16:9"  # Default for images

    # === Video-only parameters ===
    if is_video_op:
        if "duration" in params and params["duration"] is not None:
            mapped["duration"] = params["duration"]

        # Style/mode parameters (omit nulls and "none" sentinel)
        for field in ['motion_mode', 'negative_prompt', 'camera_movement', 'style', 'template_id']:
            value = params.get(field)
            if value is not None and value != "none":
                mapped[field] = value

        # Video options (multi_shot, audio, off_peak)
        for field in ['multi_shot', 'audio', 'off_peak']:
            value = params.get(field)
            if value is not None:
                mapped[field] = value

    # === Operation-specific parameters ===
    if operation_type == OperationType.IMAGE_TO_VIDEO:
        image_source = params.get("image_url")
        if not image_source:
            refs = composition_assets_to_refs(params.get("composition_assets"), media_type="image")
            if refs:
                image_source = refs[0]
        if image_source is not None:
            mapped["image_url"] = (
                normalize_url(image_source) or image_source
                if isinstance(image_source, str)
                else image_source
            )

    elif operation_type in {OperationType.IMAGE_TO_IMAGE, OperationType.TEXT_TO_IMAGE}:
        # Image operations use image_urls list
        image_urls = params.get("image_urls")
        image_url = params.get("image_url")
        if isinstance(image_urls, (list, tuple)):
            filtered = [value for value in image_urls if value]
            if filtered:
                mapped["image_urls"] = [
                    (normalize_url(url) or url) if isinstance(url, str) else url
                    for url in filtered
                ]
        if "image_urls" not in mapped and image_url is not None:
            if isinstance(image_url, str) and not image_url.strip():
                image_url = None
            if image_url is not None:
                mapped["image_urls"] = [
                    (
                        normalize_url(image_url) or image_url
                        if isinstance(image_url, str)
                        else image_url
                    )
                ]
        if "image_urls" not in mapped:
            refs = composition_assets_to_refs(params.get("composition_assets"), media_type="image")
            if refs:
                mapped["image_urls"] = refs

    elif operation_type == OperationType.VIDEO_EXTEND:
        video_source = params.get("video_url")
        if not video_source:
            refs = composition_assets_to_refs(params.get("composition_assets"), media_type="video")
            if refs:
                video_source = refs[0]
        if video_source is not None:
            mapped["video_url"] = (
                normalize_url(video_source) or video_source
                if isinstance(video_source, str)
                else video_source
            )

        if "original_video_id" in params and params["original_video_id"] is not None:
            mapped["original_video_id"] = params["original_video_id"]
        else:
            composition_assets = params.get("composition_assets") or []
            if composition_assets:
                first = composition_assets[0]
                if hasattr(first, "model_dump"):
                    first = first.model_dump()
                if isinstance(first, dict):
                    provider_params = first.get("provider_params") or {}
                    if provider_params.get("original_video_id") is not None:
                        mapped["original_video_id"] = provider_params.get("original_video_id")

    elif operation_type == OperationType.VIDEO_TRANSITION:
        image_urls = params.get("image_urls")
        if isinstance(image_urls, (list, tuple)):
            filtered = [value for value in image_urls if value]
            if filtered:
                mapped["image_urls"] = [
                    (normalize_url(url) or url) if isinstance(url, str) else url
                    for url in filtered
                ]
        if "image_urls" not in mapped:
            refs = composition_assets_to_refs(params.get("composition_assets"), media_type="image")
            if refs:
                mapped["image_urls"] = refs
        if "prompts" in params and params["prompts"] is not None:
            mapped["prompts"] = params["prompts"]
        durations = params.get("durations")
        if durations is not None:
            expected_segments = len(mapped.get("prompts") or []) or None
            sanitized = normalize_transition_durations(durations, expected_segments)
            if sanitized:
                mapped["durations"] = sanitized

    elif operation_type == OperationType.FUSION:
        if "composition_assets" in params and params["composition_assets"] is not None:
            mapped["composition_assets"] = params["composition_assets"]

    # credit_change hint: provide expected Pixverse credit delta based on
    # model/quality/duration. For image operations we use a static table;
    # for video operations we use pixverse_calculate_cost when available.
    credit_change: int | None = None
    model = mapped.get("model")
    quality = mapped.get("quality")

    if is_image_op and isinstance(model, str) and isinstance(quality, str):
        credit_change = get_image_credit_change(model, quality)
    elif is_video_op:
        duration = mapped.get("duration") or params.get("duration")
        if duration is not None and isinstance(duration, (int, float)):
            credit_change = estimate_video_credit_change(
                quality=quality or "360p",
                duration=int(duration),
                model=model or "v5",
                motion_mode=mapped.get("motion_mode"),
                multi_shot=bool(mapped.get("multi_shot")),
                audio=bool(mapped.get("audio")),
            )

    if credit_change is not None:
        mapped["credit_change"] = credit_change

    # Drop any remaining None values so we never send explicit nulls
    # to the Pixverse API. This keeps the mapping logic simple while
    # ensuring providers only see fields that are intentionally set.
    return {k: v for k, v in mapped.items() if v is not None}
