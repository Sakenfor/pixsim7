"""
Asset/composition input parsing, lineage metadata extraction, and role mapping.

Contains constants for composition field vocabularies, role-to-relation-type
mapping, and all logic for extracting structured input references from
generation parameters.
"""
import logging
from typing import Optional, Dict, Any, List

from pixsim7.backend.main.domain import OperationType
from pixsim7.backend.main.domain.assets import relation_types
from pixsim7.backend.main.shared.asset_refs import extract_asset_id, extract_asset_ref
from pixsim7.backend.main.shared.composition_assets import coerce_composition_assets

logger = logging.getLogger(__name__)


# ============================================================================
# Composition Metadata Field Constants
# ============================================================================
# Fields extracted from composition assets for lineage and metadata tracking
#
# Fields are categorized by whether they map to vocabulary types (validatable)
# or are free-form values. See: shared/ontology/vocabularies/config.py

# Mapping from composition field names to vocabulary types
# These fields can be validated against the vocab registry
# Format: field_name -> vocab_type (as defined in VOCAB_CONFIGS)
COMPOSITION_VOCAB_FIELDS = {
    "role": "roles",              # role:main_character, role:companion
    "pose_id": "poses",           # pose:standing_neutral, pose:sitting
    "location_id": "locations",   # location:park_bench, location:bedroom
    "influence_region": "influence_regions",  # region:foreground, region:background
    "camera_view_id": "camera",  # camera:angle_pov, camera:angle_front
    "camera_framing_id": "camera",  # camera:framing_closeup, camera:framing_centered
}

# Free-form composition fields (no vocab validation)
# These are workflow/structural fields without vocab backing
COMPOSITION_FREEFORM_FIELDS = [
    "intent",          # Workflow intent: "generate", "preserve", "modify", "add", "remove"
    "priority",        # Numeric priority for composition ordering
    "layer",           # Z-order layer index
    "ref_name",        # Prompt variable binding name (e.g., "{{character}}")
    "influence_type",  # Influence type: "content", "style", "structure", "mask"
    "character_id",    # External character reference (game-specific)
    "expression_id",   # Expression reference (could become vocab)
    "surface_type",    # Surface type hint (could become vocab)
    "prop_id",         # Prop reference (could become vocab)
    "tags",            # Free-form tags list
]

# Core lineage fields - minimal set for structured lineage building
# Used in _extract_composition_metadata() for trimmed lineage records
LINEAGE_FIELDS = [
    "role",
    "intent",
    "influence_type",
    "influence_region",
    "ref_name",
    "priority",
    "layer",
]

# Extended composition metadata fields - all fields for Generation.inputs
# Derived from vocab + freeform fields for backward compatibility
COMPOSITION_META_FIELDS = (
    list(COMPOSITION_VOCAB_FIELDS.keys()) + COMPOSITION_FREEFORM_FIELDS
)


# ============================================================================
# Role -> Relation Type Mapping
# ============================================================================
# Maps input roles (used in Generation.inputs) to relation_type constants

ROLE_TO_RELATION_TYPE = {
    # IMAGE_TO_VIDEO roles
    "source_image": relation_types.SOURCE_IMAGE,
    "seed_image": relation_types.SOURCE_IMAGE,
    "image": relation_types.SOURCE_IMAGE,

    # VIDEO_EXTEND roles
    "source_video": relation_types.SOURCE_VIDEO,
    "video": relation_types.SOURCE_VIDEO,

    # VIDEO_TRANSITION roles
    "transition_input": relation_types.TRANSITION_INPUT,
    "from_image": relation_types.TRANSITION_INPUT,
    "to_image": relation_types.TRANSITION_INPUT,

    # Paused frame
    "paused_frame": relation_types.PAUSED_FRAME,

    # Keyframe (Sora storyboard)
    "keyframe": relation_types.KEYFRAME,

    # Reference images
    "reference_image": relation_types.REFERENCE_IMAGE,
    "reference": relation_types.REFERENCE,

    # Composition roles
    "main_character": relation_types.COMPOSITION_MAIN_CHARACTER,
    "companion": relation_types.COMPOSITION_COMPANION,
    "environment": relation_types.COMPOSITION_ENVIRONMENT,
    "prop": relation_types.COMPOSITION_PROP,
    "style_reference": relation_types.COMPOSITION_STYLE_REFERENCE,
    "effect": relation_types.COMPOSITION_EFFECT,

    # Provider-specific collapsed roles
    "subject": relation_types.COMPOSITION_MAIN_CHARACTER,
    "background": relation_types.COMPOSITION_ENVIRONMENT,

    # Legacy fusion role hints (treated as composition)
    "fusion_character": relation_types.COMPOSITION_MAIN_CHARACTER,
    "fusion_background": relation_types.COMPOSITION_ENVIRONMENT,
    "fusion_reference": relation_types.COMPOSITION_STYLE_REFERENCE,

    # Generic
    "source": relation_types.SOURCE,

    # Scene-based (legacy, maps to generic)
    "from_scene": relation_types.SOURCE_IMAGE,
    "to_scene": relation_types.TRANSITION_INPUT,
}


def validate_composition_vocab_fields(
    item: Dict[str, Any],
    strict: bool = False,
) -> List[str]:
    """
    Validate vocab-backed fields in a composition asset item.

    Checks that vocab-backed field values exist in the vocabulary registry.
    Non-vocab fields are ignored.

    Args:
        item: Composition asset dict with fields to validate
        strict: If True, raise InvalidOperationError on unknown vocab values.
                If False (default), return list of warnings.

    Returns:
        List of warning messages for unknown vocab values (empty if all valid)

    Raises:
        InvalidOperationError: If strict=True and unknown vocab value found
    """
    warnings = []

    try:
        from pixsim7.backend.main.shared.ontology.vocabularies import get_registry
        registry = get_registry()
    except Exception as e:
        logger.debug(f"Could not load vocab registry for validation: {e}")
        return warnings  # Skip validation if registry unavailable

    for field_name, vocab_type in COMPOSITION_VOCAB_FIELDS.items():
        value = item.get(field_name)
        if value is None:
            continue

        # Normalize value to canonical format (type:id)
        if isinstance(value, str):
            # Handle both "type:id" and bare "id" formats
            if ":" in value:
                # Already canonical format, extract the id part
                parts = value.split(":", 1)
                concept_id = parts[1] if len(parts) > 1 else value
            else:
                concept_id = value
        elif isinstance(value, dict) and "id" in value:
            concept_id = value["id"]
        else:
            continue  # Can't validate non-string, non-dict values

        # Check if concept exists in registry
        if not registry.is_known_concept(vocab_type, concept_id):
            msg = f"Unknown {vocab_type} value '{value}' in field '{field_name}'"
            warnings.append(msg)

            if strict:
                from pixsim7.backend.main.shared.errors import InvalidOperationError
                raise InvalidOperationError(msg)

    return warnings


def get_relation_type_for_role(role: str) -> str:
    """Map a role string to a relation_type constant."""
    return ROLE_TO_RELATION_TYPE.get(role, relation_types.DERIVATION)


def _extract_composition_metadata(
    composition_assets: List[Any],
) -> Optional[List[Dict[str, Any]]]:
    """
    Extract lineage-relevant metadata from composition assets.

    Trims to only the fields needed for structured lineage building:
    - asset reference (for parent resolution)
    - role, intent (for relation_type mapping)
    - influence_type, influence_region (for lineage enrichment)
    - ref_name (for prompt binding correlation)
    - sequence_order (implicit from list position)

    Does NOT include large fields like tags, ontology IDs, or geometry.

    Args:
        composition_assets: Raw composition asset list from request

    Returns:
        Trimmed list of dicts for lineage building, or None if empty
    """
    if not composition_assets:
        return None

    metadata: List[Dict[str, Any]] = []

    for i, item in enumerate(composition_assets):
        if hasattr(item, "model_dump"):
            item = item.model_dump()

        if not isinstance(item, dict):
            continue

        # Extract asset reference
        asset_value = (
            item.get("asset")
            or item.get("asset_id")
            or item.get("assetId")
            or item.get("url")
        )
        if not asset_value:
            continue

        entry: Dict[str, Any] = {
            "asset": extract_asset_ref(asset_value) or asset_value,
            "sequence_order": i,
        }

        # Extract lineage-relevant fields only
        for key in LINEAGE_FIELDS:
            if item.get(key) is not None:
                entry[key] = item[key]

        metadata.append(entry)

    return metadata if metadata else None


def parse_asset_input(
    value: Any,
    role: str,
    sequence_order: int,
    gen_config: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """
    Parse an asset reference from various formats into a standardized input entry.

    Supported formats:
    - EntityRef: {"type": "asset", "id": 123}
    - String ref: "asset:123"
    - URL with asset ID: Contains /assets/{id}/ pattern
    - Raw asset ID: 123

    Returns:
        Input dict with role, asset ref, sequence_order, and optional time/frame
        Returns None if value cannot be parsed to an asset ref
    """
    asset_ref = None
    url_value = None

    if value is None:
        return None

    try:
        if isinstance(value, str) and "://" in value:
            url_value = value
        asset_ref = extract_asset_ref(value, allow_url_asset_id=True)
    except Exception:
        pass

    # Build input entry
    input_entry: Dict[str, Any] = {
        "role": role,
        "sequence_order": sequence_order,
    }

    if asset_ref:
        input_entry["asset"] = asset_ref
    elif url_value:
        # Store URL even without asset ID for reference
        input_entry["url"] = url_value

    # Return None if we couldn't get either asset ref or URL
    if not asset_ref and not url_value:
        return None

    # Extract time/frame metadata from gen_config if available
    # Common fields: paused_at, start_time, end_time, frame
    paused_at = gen_config.get("paused_at") or gen_config.get("time")
    start_time = gen_config.get("start_time")
    end_time = gen_config.get("end_time")
    frame = gen_config.get("frame")

    if paused_at is not None or start_time is not None or end_time is not None:
        time_info = {}
        if paused_at is not None:
            time_info["start"] = paused_at
            time_info["end"] = paused_at
        else:
            if start_time is not None:
                time_info["start"] = start_time
            if end_time is not None:
                time_info["end"] = end_time
        if time_info:
            input_entry["time"] = time_info
            # Mark as paused_frame if this is a paused video
            if paused_at is not None and role == "source_image":
                input_entry["role"] = "paused_frame"

    if frame is not None:
        input_entry["frame"] = frame

    return input_entry


def extract_composition_inputs(
    composition_assets: List[Any],
    gen_config: Dict[str, Any],
    validate_vocab: bool = False,
) -> List[Dict[str, Any]]:
    """
    Extract input references from composition assets.

    Shared logic for IMAGE_TO_IMAGE and FUSION operations that both use
    composition_assets with roles, metadata, and influence hints.

    Args:
        composition_assets: List of composition asset items
        gen_config: Generation config dict for metadata extraction
        validate_vocab: If True, validate vocab-backed fields against registry
                       and log warnings for unknown values

    Returns:
        List of input dicts with role, asset ref, sequence_order, and meta
    """
    inputs = []

    for i, item in enumerate(composition_assets):
        if hasattr(item, "model_dump"):
            item = item.model_dump()

        role = "composition_reference"
        asset_value = None
        composition_meta: Dict[str, Any] = {}

        if isinstance(item, dict):
            role = item.get("role") or role
            asset_value = (
                item.get("asset")
                or item.get("asset_id")
                or item.get("assetId")
                or item.get("url")
            )
            for key in COMPOSITION_META_FIELDS:
                if item.get(key) is not None:
                    composition_meta[key] = item.get(key)

            # Optionally validate vocab-backed fields
            if validate_vocab:
                warnings = validate_composition_vocab_fields(item, strict=False)
                for warning in warnings:
                    logger.warning(f"Composition asset {i}: {warning}")
        else:
            asset_value = item

        asset_input = parse_asset_input(
            value=asset_value,
            role=role,
            sequence_order=i,
            gen_config=gen_config,
        )
        if asset_input:
            if composition_meta:
                asset_input.setdefault("meta", {})["composition"] = composition_meta
            inputs.append(asset_input)

    return inputs


def extract_asset_from_scene(scene: Any) -> Optional[str]:
    """
    Extract asset reference from a scene object.

    Looks for asset_id, asset, image_asset_id, video_asset_id in scene dict.

    Returns:
        Asset ref string like "asset:123" or None
    """
    if not isinstance(scene, dict):
        return None

    # Try various asset field names
    for field in ["asset_id", "asset", "image_asset_id", "video_asset_id", "assetId"]:
        value = scene.get(field)
        if not value:
            continue
        normalized = extract_asset_ref(value, allow_url_asset_id=True)
        if isinstance(normalized, str) and normalized.startswith("asset:"):
            return normalized

    return None


def extract_inputs(
    params: Dict[str, Any],
    operation_type: OperationType,
    validate_vocabs: bool = False,
) -> List[Dict[str, Any]]:
    """
    Extract input references from structured params.

    Extracts asset references and scene context information to create input
    references for lineage tracking, deduplication, and reproducibility.

    Input sources (in priority order):
    1. composition_assets (canonical input list)
    2. Legacy fields (image_url, video_url, image_urls, etc.)
    3. Scene context metadata (from_scene, to_scene)

    Asset refs can be:
    - EntityRef format: {"type": "asset", "id": 123} or "asset:123"
    - URL with asset ID: Contains /assets/{id}/ or asset_id=123
    - Raw asset ID: 123

    Args:
        params: Generation parameters
        operation_type: Operation type
        validate_vocabs: If True, validate vocab-backed composition fields
                        against the registry (user preference)

    Returns:
        List of input references like:
        [
            {
                "role": "source_image",
                "asset": "asset:123",
                "sequence_order": 0,
                "time": {"start": 10.5, "end": 10.5},  # optional
                "frame": 48,                           # optional
                "meta": {...}                          # optional
            }
        ]
    """
    inputs = []
    gen_config = params.get("generation_config", {})
    if not isinstance(gen_config, dict):
        gen_config = {}

    # ==========================
    # Extract asset-based inputs
    # ==========================

    if operation_type == OperationType.IMAGE_TO_VIDEO:
        composition_assets = gen_config.get("composition_assets") or params.get("composition_assets")
        if not composition_assets:
            composition_assets = (
                gen_config.get("source_asset_id")
                or params.get("source_asset_id")
                or gen_config.get("image_url")
                or params.get("image_url")
            )
        composition_assets = coerce_composition_assets(
            composition_assets,
            default_media_type="image",
            default_role="source_image",
        )
        if composition_assets:
            inputs.extend(extract_composition_inputs(
                composition_assets, gen_config,
                validate_vocab=validate_vocabs,
            ))

    elif operation_type == OperationType.IMAGE_TO_IMAGE:
        composition_assets = gen_config.get("composition_assets") or params.get("composition_assets")
        composition_assets = coerce_composition_assets(
            composition_assets,
            default_media_type="image",
            default_role="composition_reference",
        )
        if composition_assets:
            inputs.extend(extract_composition_inputs(
                composition_assets, gen_config,
                validate_vocab=validate_vocabs,
            ))

    elif operation_type == OperationType.VIDEO_EXTEND:
        composition_assets = gen_config.get("composition_assets") or params.get("composition_assets")
        if not composition_assets:
            composition_assets = (
                gen_config.get("source_asset_id")
                or params.get("source_asset_id")
                or gen_config.get("video_url")
                or params.get("video_url")
            )
        composition_assets = coerce_composition_assets(
            composition_assets,
            default_media_type="video",
            default_role="source_video",
        )
        if composition_assets:
            inputs.extend(extract_composition_inputs(
                composition_assets, gen_config,
                validate_vocab=validate_vocabs,
            ))

    elif operation_type == OperationType.VIDEO_TRANSITION:
        composition_assets = gen_config.get("composition_assets") or params.get("composition_assets")
        if not composition_assets:
            composition_assets = (
                gen_config.get("source_asset_ids")
                or params.get("source_asset_ids")
                or gen_config.get("image_urls")
                or params.get("image_urls")
            )
        composition_assets = coerce_composition_assets(
            composition_assets,
            default_media_type="image",
            default_role="transition_input",
        )
        if composition_assets:
            inputs.extend(extract_composition_inputs(
                composition_assets, gen_config,
                validate_vocab=validate_vocabs,
            ))

    elif operation_type == OperationType.FUSION:
        # Composition assets with specific roles
        composition_assets = gen_config.get("composition_assets") or params.get("composition_assets")
        composition_assets = coerce_composition_assets(
            composition_assets,
            default_media_type="image",
            default_role="composition_reference",
        )
        if composition_assets:
            inputs.extend(extract_composition_inputs(
                composition_assets, gen_config,
                validate_vocab=validate_vocabs,
            ))

    # ==========================
    # Extract scene-based inputs (fallback/supplement)
    # ==========================
    scene_context = params.get("scene_context", {})
    if not isinstance(scene_context, dict):
        scene_context = {}

    from_scene = scene_context.get("from_scene")
    to_scene = scene_context.get("to_scene")

    # For transitions, check scenes if no asset inputs found
    if operation_type == OperationType.VIDEO_TRANSITION:
        if not inputs:  # Only use scene context if no asset inputs
            if from_scene:
                scene_asset = extract_asset_from_scene(from_scene)
                if scene_asset:
                    inputs.append({
                        "role": "transition_input",
                        "asset": scene_asset,
                        "sequence_order": 0,
                        "meta": {"scene_id": from_scene.get("id") if isinstance(from_scene, dict) else None}
                    })
            if to_scene:
                scene_asset = extract_asset_from_scene(to_scene)
                if scene_asset:
                    inputs.append({
                        "role": "transition_input",
                        "asset": scene_asset,
                        "sequence_order": len(inputs),
                        "meta": {"scene_id": to_scene.get("id") if isinstance(to_scene, dict) else None}
                    })

    # For image_to_video, check from_scene if no asset inputs found
    elif operation_type == OperationType.IMAGE_TO_VIDEO:
        if not inputs and from_scene:
            scene_asset = extract_asset_from_scene(from_scene)
            if scene_asset:
                # Check for paused frame metadata
                paused_time = None
                paused_frame = None
                if isinstance(from_scene, dict):
                    paused_time = from_scene.get("paused_at") or from_scene.get("time")
                    paused_frame = from_scene.get("frame")

                role = "paused_frame" if paused_time is not None else "source_image"
                input_entry = {
                    "role": role,
                    "asset": scene_asset,
                    "sequence_order": 0,
                    "meta": {"scene_id": from_scene.get("id") if isinstance(from_scene, dict) else None}
                }
                if paused_time is not None:
                    input_entry["time"] = {"start": paused_time, "end": paused_time}
                if paused_frame is not None:
                    input_entry["frame"] = paused_frame
                inputs.append(input_entry)

    # Always include scene metadata for reproducibility (even without asset refs)
    if not inputs:
        if operation_type == OperationType.VIDEO_TRANSITION:
            if from_scene:
                inputs.append({
                    "role": "from_scene",
                    "scene_id": from_scene.get("id") if isinstance(from_scene, dict) else None,
                    "metadata": from_scene
                })
            if to_scene:
                inputs.append({
                    "role": "to_scene",
                    "scene_id": to_scene.get("id") if isinstance(to_scene, dict) else None,
                    "metadata": to_scene
                })
        elif operation_type == OperationType.IMAGE_TO_VIDEO:
            if from_scene:
                inputs.append({
                    "role": "seed_image",
                    "scene_id": from_scene.get("id") if isinstance(from_scene, dict) else None,
                    "metadata": from_scene
                })

    return inputs
