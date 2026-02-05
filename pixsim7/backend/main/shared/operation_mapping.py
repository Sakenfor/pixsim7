"""
Operation mapping registry

Provides a single source of truth for how structured generation_type
values map to backend OperationType enums. This is used by the unified
generations API and can also be exposed to frontends for tooling.

=============================================================================
ADDING A NEW OPERATION TYPE - CHECKLIST
=============================================================================
When adding a new operation type, you MUST update ALL of these locations:

Backend:
  [ ] 1. enums.py - Add to OperationType enum
  [ ] 2. operation_mapping.py - Add to _CANONICAL_ALIASES
  [ ] 3. operation_mapping.py - Add to OPERATION_REGISTRY (below)
  [ ] 4. (automatic) generation_schemas.py validates dynamically against CANONICAL_GENERATION_TYPES
  [ ] 5. creation_service.py - Add validation in _validate_structured_params()
  [ ] 6. creation_service.py - Add canonicalization in _canonicalize_structured_params() if needed
  [ ] 7. provider_service.py - Handle media type classification if image operation
  [ ] 8. pixverse_operations.py - Add routing in execute() and implementation method
  [ ] 9. pixverse.py - Add to supported_operations list
  [ ] 10. operations_service.py - Add to PROVIDER_LIMITS

Frontend:
  [ ] 11. controlCenter.ts - Add to GenerateAssetRequest.operationType type
  [ ] 12. controlCenter.ts - Add case in mapOperationToGenerationType()
  [ ] 13. controlCenterStore.ts - Add to operationType union (if different)
  [ ] 14. quickGenerateLogic.ts - Add validation if operation has required inputs

Run validate_operation_coverage() after changes to verify completeness.

=============================================================================
"""
from typing import Dict, List, Set, Any
from dataclasses import dataclass

from pixsim7.backend.main.domain.enums import OperationType


# =============================================================================
# OPERATION REGISTRY - Single Source of Truth
# =============================================================================

@dataclass
class OperationSpec:
  """Specification for a generation operation."""

  operation_type: OperationType
  output_media: str  # "image" or "video"
  required_inputs: List[str]  # Required input fields
  generation_type_aliases: List[str]  # All generation_type strings that map to this


# Registry of all supported operations with their specifications.
#
# NOTE: generation_type_aliases lists canonical aliases only.
OPERATION_REGISTRY: Dict[OperationType, OperationSpec] = {
  OperationType.TEXT_TO_IMAGE: OperationSpec(
    operation_type=OperationType.TEXT_TO_IMAGE,
    output_media="image",
    required_inputs=["prompt"],
    generation_type_aliases=["text_to_image"],  # Canonical
  ),
  OperationType.IMAGE_TO_IMAGE: OperationSpec(
    operation_type=OperationType.IMAGE_TO_IMAGE,
    output_media="image",
    required_inputs=["composition_assets"],
    generation_type_aliases=["image_to_image"],  # Canonical
  ),
  OperationType.TEXT_TO_VIDEO: OperationSpec(
    operation_type=OperationType.TEXT_TO_VIDEO,
    output_media="video",
    required_inputs=["prompt"],
    generation_type_aliases=["text_to_video"],  # Canonical
  ),
  OperationType.IMAGE_TO_VIDEO: OperationSpec(
    operation_type=OperationType.IMAGE_TO_VIDEO,
    output_media="video",
    required_inputs=["composition_assets"],
    generation_type_aliases=["image_to_video"],  # Canonical
  ),
  OperationType.VIDEO_EXTEND: OperationSpec(
    operation_type=OperationType.VIDEO_EXTEND,
    output_media="video",
    required_inputs=["composition_assets"],
    generation_type_aliases=["video_extend"],  # Canonical
  ),
  OperationType.VIDEO_TRANSITION: OperationSpec(
    operation_type=OperationType.VIDEO_TRANSITION,
    output_media="video",
    required_inputs=["composition_assets", "prompts"],
    generation_type_aliases=["video_transition"],  # Canonical
  ),
  OperationType.FUSION: OperationSpec(
    operation_type=OperationType.FUSION,
    output_media="video",
    required_inputs=["composition_assets"],
    generation_type_aliases=["fusion"],  # Canonical
  ),
}

# =============================================================================
# LINEAGE-ONLY OPERATIONS
# =============================================================================
# These operations are NOT provider generations. They're used purely for
# AssetLineage.operation_type to track how assets are related.
#
# Examples:
# - FRAME_EXTRACTION: Image extracted from video locally (ffmpeg)
# - IMAGE_EDIT: Multi-image edit/combine operation (lineage tracking)
# - IMAGE_COMPOSITE: Layer-based composition (lineage tracking)
#
# These are excluded from OPERATION_REGISTRY since they don't participate
# in the generation flow (no provider routing, no generation_type alias).
LINEAGE_ONLY_OPERATIONS: Set[OperationType] = {
  OperationType.FRAME_EXTRACTION,
  OperationType.IMAGE_EDIT,
  OperationType.IMAGE_COMPOSITE,
}


def get_image_operations() -> Set[OperationType]:
  """Return set of operations that produce images."""

  return {op for op, spec in OPERATION_REGISTRY.items() if spec.output_media == "image"}


def get_video_operations() -> Set[OperationType]:
  """Return set of operations that produce videos."""

  return {op for op, spec in OPERATION_REGISTRY.items() if spec.output_media == "video"}


# =============================================================================
# GENERATION TYPE MAPPING
# =============================================================================

# ═══════════════════════════════════════════════════════════════════════════════
# CANONICAL ALIASES - Core operations (1:1 with OperationType enum names)
# ═══════════════════════════════════════════════════════════════════════════════
_CANONICAL_ALIASES: Dict[str, OperationType] = {
  "text_to_image": OperationType.TEXT_TO_IMAGE,
  "text_to_video": OperationType.TEXT_TO_VIDEO,
  "image_to_video": OperationType.IMAGE_TO_VIDEO,
  "image_to_image": OperationType.IMAGE_TO_IMAGE,  # Canonical name for image transformations
  "video_extend": OperationType.VIDEO_EXTEND,
  "video_transition": OperationType.VIDEO_TRANSITION,
  "fusion": OperationType.FUSION,
}

# ═══════════════════════════════════════════════════════════════════════════════
# ═══════════════════════════════════════════════════════════════════════════════
CANONICAL_GENERATION_TYPES: Set[str] = set(_CANONICAL_ALIASES.keys())

# Combined map (used at runtime)
GENERATION_TYPE_OPERATION_MAP: Dict[str, OperationType] = {
  **_CANONICAL_ALIASES,
}


def resolve_operation_type(generation_type: str) -> OperationType:
  """
  Resolve OperationType for a given generation_type string.

  Raises ValueError if generation_type is unknown (no silent fallback).
  """

  result = GENERATION_TYPE_OPERATION_MAP.get(generation_type)
  if result is None:
    valid_types = sorted(GENERATION_TYPE_OPERATION_MAP.keys())
    raise ValueError(
      f"Unknown generation_type: '{generation_type}'. "
      f"Valid types: {valid_types}"
    )
  return result


def resolve_operation_type_or_default(
  generation_type: str,
  default: OperationType = OperationType.TEXT_TO_VIDEO
) -> OperationType:
  """Resolve with fallback (use sparingly - prefer explicit error)."""
  return GENERATION_TYPE_OPERATION_MAP.get(generation_type, default)


def resolve_operation_type_dynamic(config: Any) -> OperationType:
  """
  Resolve OperationType using heuristics based on config inputs.

  Intended for semantic/intent-driven flows where the operation is not fixed.
  """

  data = config.model_dump(by_alias=True) if hasattr(config, "model_dump") else dict(config or {})

  def _get_first(*keys):
    for key in keys:
      if key in data and data[key] is not None:
        return data[key]
    return None

  composition_assets = _get_first("composition_assets", "compositionAssets")
  image_urls = _get_first("image_urls", "imageUrls")
  video_url = _get_first("video_url", "videoUrl")
  original_video_id = _get_first("original_video_id", "originalVideoId")
  image_url = _get_first("image_url", "imageUrl")
  source_asset_id = _get_first("source_asset_id", "sourceAssetId")
  source_asset_ids = _get_first("source_asset_ids", "sourceAssetIds")

  prompts = data.get("prompts")

  if isinstance(composition_assets, list) and len(composition_assets) > 0:
    if isinstance(prompts, list) and len(prompts) == len(composition_assets) - 1:
      return OperationType.VIDEO_TRANSITION
    for item in composition_assets:
      if hasattr(item, "model_dump"):
        item = item.model_dump()
      if isinstance(item, dict):
        media_type = str(item.get("media_type") or "").lower()
        if media_type == "video":
          return OperationType.VIDEO_EXTEND
    return OperationType.IMAGE_TO_IMAGE

  if isinstance(image_urls, list) and len(image_urls) >= 2:
    return OperationType.VIDEO_TRANSITION
  if video_url or original_video_id:
    return OperationType.VIDEO_EXTEND
  if image_url or source_asset_id or (isinstance(source_asset_ids, list) and len(source_asset_ids) > 0):
    return OperationType.IMAGE_TO_VIDEO

  # Default to text_to_video for semantic/intent-driven generation
  return OperationType.TEXT_TO_VIDEO


def resolve_operation_type_from_config(config: Any) -> OperationType:
  """
  Resolve OperationType from a GenerationNodeConfig-like object.

  Resolution precedence:
    1) operation_override (explicit)
    2) dynamic resolver (resolution_mode == "dynamic")
    3) generation_type (strict canonical)
  """

  if config is None:
    raise ValueError("generation config is required")

  data = config.model_dump(by_alias=True) if hasattr(config, "model_dump") else dict(config)
  operation_override = data.get("operationOverride") or data.get("operation_override")
  resolution_mode = data.get("resolutionMode") or data.get("resolution_mode") or "strict"
  generation_type = data.get("generationType") or data.get("generation_type")

  if operation_override:
    return resolve_operation_type(operation_override)

  if resolution_mode == "override_only":
    raise ValueError("operationOverride is required when resolutionMode='override_only'")

  if resolution_mode == "dynamic":
    return resolve_operation_type_dynamic(data)

  if not generation_type:
    raise ValueError("generationType is required in strict mode")

  return resolve_operation_type(generation_type)


def list_generation_operation_metadata() -> List[dict]:
  """
  Return metadata for all known generation_type → operation_type mappings.

  This is intended for tooling and UI consumers so they do not need
  to duplicate backend mappings.

  Each entry includes:
  - generation_type: The alias string (e.g., "text_to_image")
  - operation_type: The canonical OperationType enum value
  - owner: None (canonical-only)
  - is_semantic_alias: False (canonical-only)
  """

  items: List[dict] = []
  for gen_type, op_type in GENERATION_TYPE_OPERATION_MAP.items():
    items.append(
      {
        "generation_type": gen_type,
        "operation_type": op_type.value,
        "owner": None,
        "is_semantic_alias": False,
      }
    )
  return items


# =============================================================================
# VALIDATION
# =============================================================================

def validate_operation_coverage() -> Dict[str, Any]:
  """
  Validate that all OperationType values are properly covered.

  Returns a dict with validation results:
  - passed: bool - True if all checks pass
  - errors: List[str] - Critical issues that will cause runtime failures
  - warnings: List[str] - Issues that may cause problems

  Call this at startup or in tests to catch drift early.
  """

  errors: List[str] = []
  warnings: List[str] = []

  # Check 1: All OperationType values should be in OPERATION_REGISTRY
  # (except LINEAGE_ONLY_OPERATIONS which are not provider generations)
  registered_ops = set(OPERATION_REGISTRY.keys())
  all_ops = set(OperationType)
  generation_ops = all_ops - LINEAGE_ONLY_OPERATIONS
  missing_from_registry = generation_ops - registered_ops
  if missing_from_registry:
    errors.append(
      "OperationType values missing from OPERATION_REGISTRY: "
      f"{[op.value for op in missing_from_registry]}"
    )

  # Check 2: All generation_type aliases in registry should be in GENERATION_TYPE_OPERATION_MAP
  for op, spec in OPERATION_REGISTRY.items():
    for alias in spec.generation_type_aliases:
      if alias not in GENERATION_TYPE_OPERATION_MAP:
        errors.append(
          f"generation_type alias '{alias}' for {op.value} "
          f"missing from GENERATION_TYPE_OPERATION_MAP"
        )

  # Check 3: All GENERATION_TYPE_OPERATION_MAP entries should map to registered ops
  for gen_type, op in GENERATION_TYPE_OPERATION_MAP.items():
    if op not in OPERATION_REGISTRY:
      warnings.append(
        f"generation_type '{gen_type}' maps to {op.value} "
        f"which is not in OPERATION_REGISTRY"
      )

  # Check 4: Verify output_media is valid
  valid_media = {"image", "video"}
  for op, spec in OPERATION_REGISTRY.items():
    if spec.output_media not in valid_media:
      errors.append(
        f"{op.value} has invalid output_media '{spec.output_media}', "
        f"must be one of {valid_media}"
      )

  return {
    "passed": len(errors) == 0,
    "errors": errors,
    "warnings": warnings,
    "registered_operations": [op.value for op in registered_ops],
    "generation_types": list(GENERATION_TYPE_OPERATION_MAP.keys()),
  }


def assert_operation_coverage() -> None:
  """
  Assert that operation coverage is complete. Raises AssertionError if not.

  Use this in tests or at application startup to fail fast on drift.
  """

  result = validate_operation_coverage()
  if not result["passed"]:
    error_msg = "Operation coverage validation failed:\n"
    for err in result["errors"]:
      error_msg += f"  - {err}\n"
    raise AssertionError(error_msg)
