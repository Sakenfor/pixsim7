"""
Pixverse operation parameter specifications for dynamic UI forms.

Extracted from pixverse.py to reduce main adapter size.
"""
from typing import Any

# Import pixverse-py SDK models (optional)
try:
    from pixverse import get_video_operation_fields  # type: ignore[attr-defined]
    from pixverse.models import (  # type: ignore
        VideoModel,
        ImageModel,
        CameraMovement,
    )
except ImportError:
    VideoModel = ImageModel = CameraMovement = None  # type: ignore
    get_video_operation_fields = None  # type: ignore


def build_operation_parameter_spec() -> dict:
    """
    Build Pixverse-specific parameter specification for dynamic UI forms.

    The spec is primarily derived from the pixverse-py SDK models so that:
    - New video models (e.g., v5.5+) are surfaced automatically.
    - Image models / qualities / aspect ratios stay in sync with the SDK.

    If the SDK is unavailable at import time, we fall back to a static
    specification compatible with older behavior.
    """
    # ==== Derive enums from SDK when available ====
    # Video models (v3.5, v4, v5, v5.5, ...)
    video_model_enum: list[str]
    default_video_model: str
    if VideoModel is not None and getattr(VideoModel, "ALL", None):
        video_model_enum = list(VideoModel.ALL)
        default_video_model = getattr(VideoModel, "DEFAULT", video_model_enum[0])
    else:
        # Fallback to previous behavior
        video_model_enum = ["v5"]
        default_video_model = "v5"

    # Image models and qualities
    image_model_enum: list[str] = []
    image_quality_enum: list[str] = []
    image_aspect_enum: list[str] = []
    if ImageModel is not None:
        image_model_enum = list(getattr(ImageModel, "ALL", []))
        # Union of all known qualities across models
        qualities = getattr(ImageModel, "QUALITIES", None)
        if isinstance(qualities, dict):
            for qs in qualities.values():
                for q in qs:
                    if q not in image_quality_enum:
                        image_quality_enum.append(q)
        # Union of all aspect ratios across models (ASPECT_RATIOS is now a dict)
        aspect_ratios = getattr(ImageModel, "ASPECT_RATIOS", None)
        if isinstance(aspect_ratios, dict):
            for ars in aspect_ratios.values():
                for ar in ars:
                    if ar not in image_aspect_enum:
                        image_aspect_enum.append(ar)
        elif isinstance(aspect_ratios, list):
            image_aspect_enum = list(aspect_ratios)
        else:
            image_aspect_enum = ["16:9", "9:16", "1:1"]

    # Per-model aspect ratio options (from SDK) - must be defined before aspect_ratio spec
    image_aspect_per_model = {}
    if ImageModel is not None:
        sdk_aspects = getattr(ImageModel, "ASPECT_RATIOS", {})
        if isinstance(sdk_aspects, dict):
            image_aspect_per_model = sdk_aspects

    # Video quality presets – derive from pricing tables when possible
    video_quality_enum: list[str] = []
    try:
        from pixverse.pricing import WEBAPI_BASE_COSTS  # type: ignore

        video_quality_enum = list(WEBAPI_BASE_COSTS.keys())
    except Exception:
        # Conservative default; SDK docs list 360p/540p/720p/1080p
        video_quality_enum = ["360p", "540p", "720p", "1080p"]

    # ==== Common field specs ====
    # Per-model prompt limits (some models support longer prompts)
    prompt_per_model_max_length = {
        "seedream-4.5": 4096,
    }
    base_prompt = {
        "name": "prompt", "type": "string", "required": True, "default": None,
        "enum": None, "description": "Primary text prompt", "group": "core",
        "max_length": 2048,
        "metadata": {
            "per_model_max_length": prompt_per_model_max_length,
        },
    }
    image_prompt = {
        **base_prompt,
        "max_length": 5000,
        "metadata": {
            "per_model_max_length": prompt_per_model_max_length,
        },
    }
    quality = {
        "name": "quality", "type": "enum", "required": False, "default": "720p",
        "enum": video_quality_enum, "description": "Output resolution preset", "group": "render"
    }
    duration_metadata: dict[str, Any] = {
        "kind": "duration_presets",
        "source": "pixverse",
        "presets": list(range(1, 11)),  # 1-10 seconds
        "note": "Pixverse video clips support 1-10 seconds.",
    }
    duration = {
        "name": "duration", "type": "number", "required": False, "default": 5,
        "enum": None, "description": "Video duration in seconds", "group": "render", "min": 1, "max": 10,
        "metadata": duration_metadata,
    }
    seed = {
        "name": "seed",
        "type": "integer",
        "required": False,
        "default": None,
        "enum": None,
        "description": "Deterministic seed (leave blank for random)",
        "group": "advanced",
    }
    aspect_ratio = {
        "name": "aspect_ratio", "type": "enum", "required": False, "default": "16:9",
        "enum": image_aspect_enum or ["16:9", "9:16", "1:1"],
        "description": "Frame aspect ratio",
        "group": "render",
        "metadata": {
            "per_model_options": image_aspect_per_model,
        } if image_aspect_per_model else None,
    }
    negative_prompt = {
        "name": "negative_prompt", "type": "string", "required": False, "default": None,
        "enum": None, "description": "Elements to discourage in generation", "group": "advanced"
    }
    model = {
        "name": "model", "type": "enum", "required": False,
        "default": default_video_model,
        "enum": video_model_enum,
        "description": "Pixverse video model version",
        "group": "core",
    }
    motion_mode = {
        "name": "motion_mode", "type": "enum", "required": False, "default": None,
        "enum": ["normal", "fast"], "description": "Motion speed (OpenAPI only)", "group": "advanced"
    }
    style = {
        "name": "style", "type": "string", "required": False, "default": None,
        "enum": None, "description": "High-level style (e.g. anime, photoreal)", "group": "style"
    }
    template_id = {
        "name": "template_id", "type": "string", "required": False, "default": None,
        "enum": None, "description": "Pixverse template reference", "group": "advanced"
    }
    image_url = {
        "name": "image_url", "type": "string", "required": True, "default": None,
        "enum": None, "description": "Source image URL for image-to-video", "group": "source"
    }
    video_url = {
        "name": "video_url", "type": "string", "required": True, "default": None,
        "enum": None, "description": "Original video URL for extension", "group": "source"
    }
    original_video_id = {
        "name": "original_video_id", "type": "string", "required": False, "default": None,
        "enum": None, "description": "Original provider video id", "group": "source"
    }
    image_urls = {
        "name": "image_urls", "type": "array", "required": True, "default": None,
        "enum": None, "description": "Images for transition sequence", "group": "source",
        "metadata": {
            "min_items": 2,
            "max_items": 7,
            "note": "Pixverse transitions support 2-7 images.",
        },
    }
    prompts = {
        "name": "prompts", "type": "array", "required": True, "default": None,
        "enum": None, "description": "Prompt list corresponding to transition images", "group": "core"
    }
    composition_assets_base = {
        "name": "composition_assets", "type": "array", "required": True, "default": None,
        "enum": None, "description": "Assets used for multi-image composition", "group": "source"
    }
    composition_assets_image = {
        **composition_assets_base,
        "metadata": {
            "max_items": 7,
            "per_model_max_items": {
                "seedream-4.0": 6,
                "seedream-4.5": 7,
            },
            "note": "Max images for multi-image composition.",
        },
    }
    composition_assets_fusion = {
        **composition_assets_base,
        "metadata": {
            "max_items": 3,
            "note": "Pixverse fusion supports up to 3 images.",
        },
    }
    # Camera movements (only for image_to_video - requires image input)
    # Derived from SDK's CameraMovement.ALL, with "none" as default
    camera_movement_enum: list[str] = ["none"]
    if CameraMovement is not None and getattr(CameraMovement, "ALL", None):
        camera_movement_enum.extend(list(CameraMovement.ALL))
    else:
        # Fallback if SDK doesn't have CameraMovement yet
        camera_movement_enum.extend(["zoom_in", "zoom_out"])

    camera_movement = {
        "name": "camera_movement",
        "type": "enum",
        "required": False,
        "default": "none",
        "enum": camera_movement_enum,
        "description": "Camera movement preset (image_to_video only)",
        "group": "style",
    }
    # Image generation model options (from pixverse-py ImageModel)
    image_model = {
        "name": "model",
        "type": "enum",
        "required": False,
        "default": image_model_enum[0] if image_model_enum else None,
        "enum": image_model_enum or None,
        "description": "Image generation model",
        "group": "core",
    }
    # Per-model quality options for image generation (from SDK)
    image_quality_per_model = {}
    if ImageModel is not None:
        sdk_qualities = getattr(ImageModel, "QUALITIES", {})
        # Normalize case: SDK uses "2K"/"4K", UI expects "2k"/"4k"
        for model_name, qs in sdk_qualities.items():
            image_quality_per_model[model_name] = [q.lower() for q in qs]
    # Fallback if SDK not available
    # Note: We show "2k"/"4k" in UI but normalize to "1440p"/"2160p" in map_parameters
    if not image_quality_per_model:
        image_quality_per_model = {
            "qwen-image": ["720p", "1080p"],
            "gemini-3.0": ["1080p", "2k", "4k"],
            "gemini-2.5-flash": ["1080p"],
            "seedream-4.0": ["1080p", "2k", "4k"],
            "seedream-4.5": ["2k", "4k"],
        }
    image_quality = {
        "name": "quality",
        "type": "enum",
        "required": False,
        "default": "1080p",
        "enum": image_quality_enum or ["720p", "1080p", "2k", "4k"],
        "description": "Image quality preset",
        "group": "render",
        "metadata": {
            "per_model_options": image_quality_per_model,
        },
    }
    strength = {
        "name": "strength", "type": "number", "required": False, "default": 0.7,
        "enum": None, "description": "Transformation strength (0.0-1.0)", "group": "style", "min": 0.0, "max": 1.0
    }
    # v5.5+ only features (exposed as advanced toggles)
    # Derive advanced models list from SDK when available
    advanced_models: list[str] = []
    if VideoModel is not None and getattr(VideoModel, "ADVANCED_MODELS", None):
        advanced_models = list(VideoModel.ADVANCED_MODELS)
    else:
        advanced_models = ["v5.5", "v5.6"]  # Fallback

    multi_shot = {
        "name": "multi_shot",
        "type": "boolean",
        "required": False,
        "default": False,
        "enum": None,
        "description": "Multi-shot video generation (v5.5+ only)",
        "group": "advanced",
        "metadata": {
            "applies_to_models": advanced_models,
        },
    }
    audio = {
        "name": "audio",
        "type": "boolean",
        "required": False,
        "default": False,
        "enum": None,
        "description": "Native audio generation (v5.5+ only)",
        "group": "advanced",
        "metadata": {
            "applies_to_models": advanced_models,
        },
    }
    # Off-peak mode (subscription accounts - reduces credit cost)
    off_peak = {
        "name": "off_peak",
        "type": "boolean",
        "required": False,
        "default": False,
        "enum": None,
        "description": "Queue for off-peak processing (subscription accounts, reduces credits)",
        "group": "advanced",
    }
    # Map GenerationOptions field names to spec objects so we can build
    # per-operation parameter lists based on SDK-provided metadata.
    video_field_specs: dict[str, dict[str, Any]] = {
        "model": model,
        "quality": quality,
        "duration": duration,
        "aspect_ratio": aspect_ratio,
        "seed": seed,
        "motion_mode": motion_mode,
        "negative_prompt": negative_prompt,
        "camera_movement": camera_movement,
        "style": style,
        "template_id": template_id,
        "multi_shot": multi_shot,
        "audio": audio,
        "off_peak": off_peak,
    }

    def _fields_for(operation: str, fallback: list[str]) -> list[dict[str, Any]]:
        """
        Resolve GenerationOptions fields for a given operation using
        pixverse-py's get_video_operation_fields when available, falling
        back to the local list for backward compatibility.

        Note: Certain fields from the fallback (like aspect_ratio) are always
        included if present, even if the SDK doesn't return them.
        """
        # Fields we always want if they're in the fallback, regardless of SDK
        always_include = {"aspect_ratio", "audio", "off_peak"}

        field_names: list[str] = fallback
        if get_video_operation_fields is not None:
            try:
                sdk_fields = list(get_video_operation_fields(operation))
                # Merge SDK fields with always-include fields from fallback
                extra_fields = [f for f in fallback if f in always_include and f not in sdk_fields]
                field_names = sdk_fields + extra_fields
            except Exception:
                # If the SDK raises for a new/unknown operation, stick to fallback.
                field_names = fallback
        return [video_field_specs[name] for name in field_names if name in video_field_specs]

    transition_duration = {
        **duration,
        "metadata": {
            "kind": "duration_presets",
            "source": "pixverse",
            "presets": list(range(1, 9)),  # 1-8 seconds
            "note": "Transitions support 1-8 seconds per segment between images.",
        },
        "min": 1,
        "max": 8,
        "description": "Transition duration per image segment (1-8 seconds)",
    }

    spec = {
        # Image generation uses ImageModel / QUALITIES / ASPECT_RATIOS from SDK
        "text_to_image": {
            "parameters": [
                image_prompt,
                image_model,
                image_quality,
                aspect_ratio,
                seed,
                style,
                negative_prompt,
            ]
        },
        "image_to_image": {
            "parameters": [
                image_prompt,
                composition_assets_image,
                image_model,
                image_quality,
                aspect_ratio,
                seed,
                style,
                negative_prompt,
            ]
        },
        # Text-only video: can choose aspect ratio explicitly
        "text_to_video": {
            "parameters": [base_prompt]
            + _fields_for(
                "text_to_video",
                [
                    "model",
                    "quality",
                    "duration",
                    "aspect_ratio",
                    "seed",
                    "motion_mode",
                    "style",
                    "negative_prompt",
                    "template_id",
                    "multi_shot",
                    "audio",
                    "off_peak",
                ],
            )
        },
        # Image-to-video: aspect ratio can override source image framing
        "image_to_video": {
            "parameters": [base_prompt, image_url]
            + _fields_for(
                "image_to_video",
                [
                    "model",
                    "quality",
                    "duration",
                    "aspect_ratio",
                    "seed",
                    "camera_movement",
                    "motion_mode",
                    "style",
                    "negative_prompt",
                    "multi_shot",
                    "audio",
                    "off_peak",
                ],
            )
        },
        "video_extend": {
            "parameters": [base_prompt, video_url, original_video_id]
            + _fields_for(
                "video_extend",
                [
                    "model",
                    "quality",
                    "duration",
                    "aspect_ratio",
                    "seed",
                    "multi_shot",
                    "audio",
                    "off_peak",
                ],
            )
        },
        # video_transition: aspect ratio is determined by source images
        "video_transition": {"parameters": [image_urls, prompts, model, quality, transition_duration]},
        "fusion": {"parameters": [base_prompt, composition_assets_fusion, model, quality, duration, aspect_ratio, seed]},
    }
    return spec
