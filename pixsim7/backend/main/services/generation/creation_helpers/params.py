"""
Parameter canonicalization, legacy param warnings, and structured param validation.

Handles the transformation of raw API parameters into canonical form that
provider adapters can consume, plus validation of operation-specific fields.
"""
import logging
from typing import Dict, Any

from pixsim7.backend.main.domain import OperationType
from pixsim7.backend.main.shared.errors import InvalidOperationError
from pixsim7.backend.main.shared.asset_refs import extract_asset_id
from pixsim7.backend.main.shared.composition_assets import coerce_composition_assets

from pixsim7.backend.main.services.generation.creation_helpers.inputs import (
    _extract_composition_metadata,
)

logger = logging.getLogger(__name__)


def canonicalize_params(
    params: Dict[str, Any],
    operation_type: OperationType,
    provider_id: str,
) -> Dict[str, Any]:
    """
    Canonicalize structured parameters from unified generations API.

    Extracts useful fields from generation_config to top-level canonical fields
    so that provider adapters (e.g., PixverseProvider.map_parameters) can work
    with a consistent interface.

    Features:
    - Preserves full generation_config for introspection/dev tools
    - Extracts canonical top-level fields for provider adapters
    - Provider-specific settings are in style.<provider_id> (e.g., style.pixverse)

    Note: Only structured params are supported. Legacy flat params were removed in
    Task 128 (Drop Legacy Generation Payloads).
    """
    canonical: Dict[str, Any] = {}

    # Get generation_config (may be at top level or nested)
    gen_config = params.get("generation_config", {})
    if not isinstance(gen_config, dict):
        gen_config = {}

    # Extract core fields from generation_config
    # These are provider-agnostic fields that all adapters understand

    # Duration: duration.target -> canonical duration
    duration_config = gen_config.get("duration", {})
    if isinstance(duration_config, dict):
        duration_target = duration_config.get("target")
        if duration_target is not None:
            canonical["duration"] = duration_target
    elif isinstance(duration_config, (int, float)):
        canonical["duration"] = duration_config

    # Constraints: constraints.rating -> canonical content_rating
    constraints = gen_config.get("constraints", {})
    if isinstance(constraints, dict):
        rating = constraints.get("rating")
        if rating:
            canonical["content_rating"] = rating

    # Style: style.pacing -> canonical pacing hint
    style = gen_config.get("style", {})
    if isinstance(style, dict):
        pacing = style.get("pacing")
        if pacing:
            canonical["pacing"] = pacing

        # Extract provider-specific settings from style.<provider_id>
        # Convention: style.pixverse = { model, quality, off_peak, audio, ... }
        provider_style = style.get(provider_id, {})
        if isinstance(provider_style, dict):
            # Map provider-specific fields to canonical top-level fields
            # These are the fields PixverseProvider.map_parameters expects
            for field in [
                "model", "quality", "off_peak", "audio", "multi_shot",
                "aspect_ratio", "seed", "camera_movement", "negative_prompt",
                "motion_mode", "style", "template_id",
                "api_method", "pixverse_api_mode", "use_openapi",
                # Remaker-specific prompt-editor controls
                "task_type", "image_resolution",
            ]:
                if field in provider_style:
                    canonical[field] = provider_style[field]

    # Extract prompt from generation_config or params root
    prompt = gen_config.get("prompt") or params.get("prompt")
    if prompt:
        canonical["prompt"] = prompt

    # Extract operation-specific fields from generation_config
    if operation_type == OperationType.IMAGE_TO_VIDEO:
        composition_assets = gen_config.get("composition_assets") or params.get("composition_assets")
        if composition_assets:
            composition_assets = coerce_composition_assets(
                composition_assets,
                default_media_type="image",
                default_role="source_image",
            )
        else:
            legacy_value = (
                gen_config.get("source_asset_id")
                or params.get("source_asset_id")
                or gen_config.get("image_url")
                or params.get("image_url")
            )
            composition_assets = coerce_composition_assets(
                legacy_value,
                default_media_type="image",
                default_role="source_image",
            )
        if composition_assets:
            canonical["composition_assets"] = composition_assets

    elif operation_type == OperationType.IMAGE_TO_IMAGE:
        # Canonical composition assets for multi-image edits
        composition_assets = gen_config.get("composition_assets") or params.get("composition_assets")

        # Debug logging for IMAGE_TO_IMAGE canonicalization
        logger.info(
            "canonicalize_i2i_debug",
            extra={
                "has_composition_assets": bool(composition_assets),
                "composition_assets_count": len(composition_assets) if composition_assets else 0,
                "gen_config_keys": list(gen_config.keys()) if gen_config else [],
                "params_keys": list(params.keys()),
                "gen_config_composition_assets": bool(gen_config.get("composition_assets") if gen_config else False),
                "params_composition_assets": bool(params.get("composition_assets")),
                "gen_config_source_asset_id": gen_config.get("source_asset_id") if gen_config else None,
                "gen_config_source_asset_ids": gen_config.get("source_asset_ids") if gen_config else None,
                "params_source_asset_id": params.get("source_asset_id"),
            }
        )

        if composition_assets:
            composition_assets = coerce_composition_assets(
                composition_assets,
                default_media_type="image",
                default_role="composition_reference",
            )
        else:
            legacy_values = (
                gen_config.get("source_asset_ids")
                or params.get("source_asset_ids")
                or gen_config.get("source_asset_id")
                or params.get("source_asset_id")
                or gen_config.get("image_urls")
                or params.get("image_urls")
            )
            composition_assets = coerce_composition_assets(
                legacy_values,
                default_media_type="image",
                default_role="composition_reference",
            )
        if composition_assets:
            canonical["composition_assets"] = composition_assets

            # Extract trimmed metadata for structured lineage building
            composition_metadata = _extract_composition_metadata(composition_assets)
            if composition_metadata:
                canonical["composition_metadata"] = composition_metadata

        # Optional: inpainting-style image edits may provide an explicit mask.
        # Provider adapters can opt into using these fields without changing
        # the core OperationType contract.
        mask_url = (
            gen_config.get("mask_url")
            or params.get("mask_url")
            or gen_config.get("mask_source")
            or params.get("mask_source")
            or gen_config.get("mask")
            or params.get("mask")
        )
        if mask_url:
            canonical["mask_url"] = mask_url

        file_extension = gen_config.get("file_extension") or params.get("file_extension")
        if file_extension:
            canonical["file_extension"] = file_extension

    elif operation_type == OperationType.VIDEO_EXTEND:
        composition_assets = gen_config.get("composition_assets") or params.get("composition_assets")
        if composition_assets:
            composition_assets = coerce_composition_assets(
                composition_assets,
                default_media_type="video",
                default_role="source_video",
            )
        else:
            legacy_value = (
                gen_config.get("source_asset_id")
                or params.get("source_asset_id")
                or gen_config.get("video_url")
                or params.get("video_url")
            )
            composition_assets = coerce_composition_assets(
                legacy_value,
                default_media_type="video",
                default_role="source_video",
            )

        original_video_id = gen_config.get("original_video_id") or params.get("original_video_id")
        if original_video_id:
            if composition_assets:
                entry = dict(composition_assets[0])
                provider_params = dict(entry.get("provider_params") or {})
                provider_params.setdefault("original_video_id", original_video_id)
                entry["provider_params"] = provider_params
                composition_assets[0] = entry
            else:
                composition_assets = [{
                    "media_type": "video",
                    "role": "source_video",
                    "provider_params": {"original_video_id": original_video_id},
                }]

        if composition_assets:
            canonical["composition_assets"] = composition_assets

    elif operation_type == OperationType.VIDEO_TRANSITION:
        composition_assets = gen_config.get("composition_assets") or params.get("composition_assets")
        if composition_assets:
            composition_assets = coerce_composition_assets(
                composition_assets,
                default_media_type="image",
                default_role="transition_input",
            )
        else:
            legacy_values = (
                gen_config.get("source_asset_ids")
                or params.get("source_asset_ids")
                or gen_config.get("image_urls")
                or params.get("image_urls")
            )
            composition_assets = coerce_composition_assets(
                legacy_values,
                default_media_type="image",
                default_role="transition_input",
            )
        if composition_assets:
            canonical["composition_assets"] = composition_assets

        prompts = gen_config.get("prompts") or params.get("prompts")
        if prompts:
            canonical["prompts"] = prompts

    elif operation_type == OperationType.FUSION:
        composition_assets = gen_config.get("composition_assets") or params.get("composition_assets")
        if composition_assets:
            composition_assets = coerce_composition_assets(
                composition_assets,
                default_media_type="image",
                default_role="composition_reference",
            )
            canonical["composition_assets"] = composition_assets

            # Extract trimmed metadata for structured lineage building
            composition_metadata = _extract_composition_metadata(composition_assets)
            if composition_metadata:
                canonical["composition_metadata"] = composition_metadata

    # Preserve scene_context and other structured fields if present
    for context_key in ["scene_context", "player_context", "social_context"]:
        if context_key in params:
            canonical[context_key] = params[context_key]

    # Warn when legacy URL params are present alongside asset IDs
    # This indicates incomplete frontend migration to the asset ID pattern
    warn_legacy_asset_params(canonical, operation_type)

    logger.info(
        f"Canonicalized structured params for {provider_id}: "
        f"model={canonical.get('model')}, quality={canonical.get('quality')}, "
        f"duration={canonical.get('duration')}, off_peak={canonical.get('off_peak')}"
    )

    return canonical


def warn_legacy_asset_params(
    canonical: Dict[str, Any],
    operation_type: OperationType,
) -> None:
    """
    Log warning/error for legacy URL params usage.

    This helps track migration progress from legacy URL/ID params to
    composition_assets as the canonical input list.

    Legacy params (deprecated):
    - image_url, video_url, image_urls
    - source_asset_id, source_asset_ids
    - original_video_id

    New params (preferred):
    - composition_assets

    Logging levels:
    - WARNING: When legacy params are present alongside asset IDs (drift)
    - ERROR: When legacy params are used alone (should migrate to asset IDs)
    """
    from typing import Any as _Any

    # Define legacy keys per operation type
    legacy_keys_by_op = {
        OperationType.IMAGE_TO_VIDEO: ["image_url", "source_asset_id"],
        OperationType.IMAGE_TO_IMAGE: ["image_url", "image_urls", "source_asset_ids"],
        OperationType.VIDEO_EXTEND: ["video_url", "original_video_id", "source_asset_id"],
        OperationType.VIDEO_TRANSITION: ["image_urls", "source_asset_ids"],
    }

    legacy_keys = legacy_keys_by_op.get(operation_type, [])
    if not legacy_keys:
        return

    # Check if we have composition assets
    has_composition_assets = bool(canonical.get("composition_assets"))

    # Check for legacy params
    found_legacy = [key for key in legacy_keys if canonical.get(key)]
    if not found_legacy:
        return

    def _is_asset_ref_value(value: _Any) -> bool:
        if value is None:
            return False
        if isinstance(value, list):
            return bool(value) and all(extract_asset_id(v) is not None for v in value)
        return extract_asset_id(value) is not None

    def _is_url_value(value: _Any) -> bool:
        if value is None:
            return False
        if isinstance(value, list):
            return any(_is_url_value(v) for v in value)
        if isinstance(value, str):
            return value.startswith(("http://", "https://", "file://", "upload/"))
        return False

    if found_legacy:
        legacy_values = [canonical.get(key) for key in found_legacy]
        if all(_is_asset_ref_value(value) for value in legacy_values) and not any(
            _is_url_value(value) for value in legacy_values
        ):
            # These are asset refs, not legacy URL params.
            return

    if has_composition_assets:
        # Log warning - both legacy and new params present (drift)
        logger.warning(
            "legacy_asset_params_with_composition_assets",
            extra={
                "operation_type": operation_type.value,
                "legacy_params_found": found_legacy,
                "has_composition_assets": has_composition_assets,
                "detail": (
                    "Received both legacy input params and composition_assets. "
                    "Backend will prefer composition_assets. "
                    "Consider updating frontend to remove legacy params."
                ),
            }
        )
    else:
        # Log error - legacy params used alone (deprecated usage)
        logger.error(
            "legacy_asset_params_without_asset_id",
            extra={
                "operation_type": operation_type.value,
                "legacy_params_found": found_legacy,
                "detail": (
                    "DEPRECATED: Using legacy input params without composition_assets. "
                    "This pattern is deprecated and will stop working in a future release. "
                    "Please migrate to composition_assets."
                ),
            }
        )


def validate_structured_params(
    operation_type: OperationType,
    gen_config: Dict[str, Any],
    params: Dict[str, Any],
) -> None:
    """
    Validate operation-specific required fields for structured params.

    Raises InvalidOperationError for missing or invalid required fields.

    Args:
        operation_type: The operation type being validated
        gen_config: The generation_config dict
        params: The full params dict (may have fields at root level)
    """
    # Helper to check if a field exists in either gen_config or root params
    def has_field(field_name: str) -> bool:
        return bool(gen_config.get(field_name) or params.get(field_name))

    def get_field(field_name: str):
        return gen_config.get(field_name) or params.get(field_name)

    # Prompt requirement for most content-generating operations
    if operation_type in {
        OperationType.TEXT_TO_IMAGE,
        OperationType.IMAGE_TO_IMAGE,
        OperationType.TEXT_TO_VIDEO,
        OperationType.IMAGE_TO_VIDEO,
    }:
        prompt = gen_config.get("prompt") or params.get("prompt")
        if not prompt or not str(prompt).strip():
            raise InvalidOperationError(
                f"{operation_type.value} operation requires a non-empty 'prompt'"
            )

    # IMAGE_TO_VIDEO requires composition_assets
    if operation_type == OperationType.IMAGE_TO_VIDEO:
        composition_assets = get_field("composition_assets")
        if not composition_assets or not isinstance(composition_assets, list) or len(composition_assets) == 0:
            raise InvalidOperationError(
                "IMAGE_TO_VIDEO operation requires 'composition_assets' list with at least 1 entry"
            )

    # IMAGE_TO_IMAGE requires composition_assets
    elif operation_type == OperationType.IMAGE_TO_IMAGE:
        composition_assets = get_field("composition_assets")
        if not composition_assets or not isinstance(composition_assets, list):
            raise InvalidOperationError(
                "IMAGE_TO_IMAGE operation requires 'composition_assets' list"
            )
        if len(composition_assets) == 0:
            raise InvalidOperationError(
                "IMAGE_TO_IMAGE 'composition_assets' must be a non-empty list"
            )

    # VIDEO_EXTEND requires composition_assets
    elif operation_type == OperationType.VIDEO_EXTEND:
        composition_assets = get_field("composition_assets")
        if not composition_assets or not isinstance(composition_assets, list) or len(composition_assets) == 0:
            raise InvalidOperationError(
                "VIDEO_EXTEND operation requires 'composition_assets' list with at least 1 entry"
            )

    # VIDEO_TRANSITION requires composition_assets and prompts with correct counts
    elif operation_type == OperationType.VIDEO_TRANSITION:
        composition_assets = get_field("composition_assets")
        prompts = get_field("prompts")

        if not composition_assets or not isinstance(composition_assets, list) or len(composition_assets) < 2:
            raise InvalidOperationError(
                "VIDEO_TRANSITION operation requires 'composition_assets' list with at least 2 images"
            )

        if not prompts or not isinstance(prompts, list):
            raise InvalidOperationError(
                "VIDEO_TRANSITION operation requires 'prompts' list"
            )

        expected_prompts = len(composition_assets) - 1
        if len(prompts) != expected_prompts:
            raise InvalidOperationError(
                f"VIDEO_TRANSITION requires exactly {expected_prompts} prompt(s) "
                f"for {len(composition_assets)} images, but got {len(prompts)}"
            )

    elif operation_type == OperationType.FUSION:
        composition_assets = get_field("composition_assets")
        if not composition_assets or not isinstance(composition_assets, list):
            raise InvalidOperationError(
                "FUSION operation requires 'composition_assets' list"
            )
        if len(composition_assets) == 0:
            raise InvalidOperationError(
                "FUSION 'composition_assets' must be a non-empty list"
            )
