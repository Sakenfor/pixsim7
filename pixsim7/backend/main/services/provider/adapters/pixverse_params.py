"""
Pixverse parameter mapping utilities.

Extracted from pixverse.py to reduce main adapter size.

NOTE: This module does NOT resolve asset refs to URLs. It passes through
composition_assets for prepare_execution_params() to resolve. This ensures
a single resolution path and avoids leaking raw asset refs like "asset:123"
into URL fields.
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
    # Derive model sets from SDK when available (ALL now returns specs, convert to IDs)
    if VideoModel is not None:
        video_models = set(VideoModel.ids()) if hasattr(VideoModel, "ids") else {str(m) for m in getattr(VideoModel, "ALL", [])}
    else:
        video_models = {"v3.5", "v4", "v5", "v5.5"}

    if ImageModel is not None:
        image_models = set(ImageModel.ids()) if hasattr(ImageModel, "ids") else {str(m) for m in getattr(ImageModel, "ALL", [])}
    else:
        image_models = {"qwen-image", "gemini-3.0", "gemini-2.5-flash", "seedream-4.0", "seedream-4.5"}

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
    # NOTE: For operations that need asset resolution, we pass through
    # composition_assets for prepare_execution_params() to resolve.
    # We only set image_url/image_urls here if they're already valid URLs.

    def _is_valid_url(v: Any) -> bool:
        return isinstance(v, str) and v.startswith(("http://", "https://"))

    if operation_type == OperationType.IMAGE_TO_VIDEO:
        # If image_url is provided and looks like a URL, use it
        image_url = params.get("image_url")
        if image_url and _is_valid_url(image_url):
            mapped["image_url"] = normalize_url(image_url) or image_url
        # Pass through composition_assets for resolution
        if params.get("composition_assets"):
            mapped["composition_assets"] = params["composition_assets"]

    elif operation_type in {OperationType.IMAGE_TO_IMAGE, OperationType.TEXT_TO_IMAGE}:
        # Image operations use image_urls list
        # Only set image_urls if they're already valid URLs
        image_urls = params.get("image_urls")
        image_url = params.get("image_url")

        if isinstance(image_urls, (list, tuple)):
            # Filter to only valid URLs - asset refs will be resolved from composition_assets
            url_only = [normalize_url(u) or u for u in image_urls if _is_valid_url(u)]
            if url_only:
                mapped["image_urls"] = url_only

        if "image_urls" not in mapped and image_url and _is_valid_url(image_url):
            mapped["image_urls"] = [normalize_url(image_url) or image_url]

        # Pass through composition_assets for resolution
        if params.get("composition_assets"):
            mapped["composition_assets"] = params["composition_assets"]

    elif operation_type == OperationType.VIDEO_EXTEND:
        # If video_url is a valid URL, use it
        video_url = params.get("video_url")
        if video_url and _is_valid_url(video_url):
            mapped["video_url"] = normalize_url(video_url) or video_url

        # Pass through original_video_id if provided
        if "original_video_id" in params and params["original_video_id"] is not None:
            mapped["original_video_id"] = params["original_video_id"]
        else:
            # Check composition_assets for original_video_id in provider_params
            composition_assets = params.get("composition_assets") or []
            if composition_assets:
                first = composition_assets[0]
                if hasattr(first, "model_dump"):
                    first = first.model_dump()
                if isinstance(first, dict):
                    provider_params = first.get("provider_params") or {}
                    if provider_params.get("original_video_id") is not None:
                        mapped["original_video_id"] = provider_params.get("original_video_id")

        # Pass through composition_assets for resolution
        if params.get("composition_assets"):
            mapped["composition_assets"] = params["composition_assets"]

    elif operation_type == OperationType.VIDEO_TRANSITION:
        # Only set image_urls if they're already valid URLs
        image_urls = params.get("image_urls")
        if isinstance(image_urls, (list, tuple)):
            url_only = [normalize_url(u) or u for u in image_urls if _is_valid_url(u)]
            if url_only:
                mapped["image_urls"] = url_only

        # Pass through composition_assets for resolution
        if params.get("composition_assets"):
            mapped["composition_assets"] = params["composition_assets"]

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
