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
  [ ] 2. operation_mapping.py - Add to GENERATION_TYPE_OPERATION_MAP
  [ ] 3. operation_mapping.py - Add to OPERATION_REGISTRY (below)
  [ ] 4. generation_schemas.py - Add to generation_type regex pattern
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

Plugins (optional):
  - Plugins that want semantic aliases (e.g. "npc_response_v2") should
    call register_generation_alias() at startup instead of hard-coding
    new generation_type strings in core code.
=============================================================================
"""
from typing import Dict, List, Set, Any, Optional
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
# NOTE: generation_type_aliases should contain only the "core" aliases
# that are safe to serialize in generic configs. Plugins can register
# additional aliases at runtime via register_generation_alias().
OPERATION_REGISTRY: Dict[OperationType, OperationSpec] = {
  OperationType.TEXT_TO_IMAGE: OperationSpec(
    operation_type=OperationType.TEXT_TO_IMAGE,
    output_media="image",
    required_inputs=["prompt"],
    generation_type_aliases=["text_to_image"],
  ),
  OperationType.IMAGE_TO_IMAGE: OperationSpec(
    operation_type=OperationType.IMAGE_TO_IMAGE,
    output_media="image",
    required_inputs=["image_url|image_urls"],  # Either one
    generation_type_aliases=["image_edit"],
  ),
  OperationType.TEXT_TO_VIDEO: OperationSpec(
    operation_type=OperationType.TEXT_TO_VIDEO,
    output_media="video",
    required_inputs=["prompt"],
    generation_type_aliases=["variation", "dialogue", "environment"],
  ),
  OperationType.IMAGE_TO_VIDEO: OperationSpec(
    operation_type=OperationType.IMAGE_TO_VIDEO,
    output_media="video",
    required_inputs=["image_url"],
    generation_type_aliases=["npc_response"],
  ),
  OperationType.VIDEO_EXTEND: OperationSpec(
    operation_type=OperationType.VIDEO_EXTEND,
    output_media="video",
    required_inputs=["video_url|original_video_id"],  # Either one
    generation_type_aliases=["video_extend"],
  ),
  OperationType.VIDEO_TRANSITION: OperationSpec(
    operation_type=OperationType.VIDEO_TRANSITION,
    output_media="video",
    required_inputs=["image_urls", "prompts"],
    generation_type_aliases=["transition"],
  ),
  OperationType.FUSION: OperationSpec(
    operation_type=OperationType.FUSION,
    output_media="video",
    required_inputs=["fusion_assets"],
    generation_type_aliases=["fusion"],
  ),
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

# Canonical mapping from structured generation_type (JSON/config)
# to internal OperationType enum.
#
# This is derived from OPERATION_REGISTRY but kept explicit for clarity,
# backward compatibility, and so that older configs continue to work
# even if plugins add new aliases at runtime.
GENERATION_TYPE_OPERATION_MAP: Dict[str, OperationType] = {
  # Text to image generation (Quick Generate)
  "text_to_image": OperationType.TEXT_TO_IMAGE,

  # Scene transitions between images
  "transition": OperationType.VIDEO_TRANSITION,

  # Generic "prompt to video" variations (Control Center)
  "variation": OperationType.TEXT_TO_VIDEO,
  "dialogue": OperationType.TEXT_TO_VIDEO,
  "environment": OperationType.TEXT_TO_VIDEO,

  # Image → video NPC response clips (legacy/game-oriented alias for IMAGE_TO_VIDEO)
  "npc_response": OperationType.IMAGE_TO_VIDEO,

  # Image → image edits / transformations
  "image_edit": OperationType.IMAGE_TO_IMAGE,

  # Video extension (Quick Generate)
  "video_extend": OperationType.VIDEO_EXTEND,

  # Fusion / character-consistent video
  "fusion": OperationType.FUSION,
}


# Optional metadata for dynamically registered aliases. This lets plugins
# declare their own semantic names (e.g. "npc_response_v2") without
# hard-coding them into the core map, while still keeping everything
# introspectable for tooling and audits.
ALIAS_METADATA: Dict[str, Dict[str, Any]] = {}


def register_generation_alias(
  alias: str,
  operation_type: OperationType,
  owner: Optional[str] = None,
) -> None:
  """
  Register a new generation_type alias at runtime.

  Intended for plugins or higher-level systems that want to introduce
  their own semantic names (e.g. "npc_response_v2") while still
  routing through canonical OperationType values.

  This function:
  - Adds alias → OperationType to GENERATION_TYPE_OPERATION_MAP if missing.
  - Adds alias to the OperationSpec.generation_type_aliases list.
  - Records optional owner metadata for introspection.

  It is a no-op if the alias already maps to the same OperationType.
  If the alias exists with a *different* OperationType, an AssertionError
  is raised to avoid silent drift.
  """

  existing = GENERATION_TYPE_OPERATION_MAP.get(alias)
  if existing is not None and existing != operation_type:
    raise AssertionError(
      f"generation_type alias '{alias}' is already mapped to "
      f"{existing.value}, cannot remap to {operation_type.value}"
    )

  # Update the primary mapping if needed
  if existing is None:
    GENERATION_TYPE_OPERATION_MAP[alias] = operation_type

  # Ensure the alias is tracked in the OperationSpec
  spec = OPERATION_REGISTRY.get(operation_type)
  if spec is not None and alias not in spec.generation_type_aliases:
    spec.generation_type_aliases.append(alias)

  # Record metadata for tooling/audits
  ALIAS_METADATA[alias] = {
    "operation_type": operation_type.value,
    "owner": owner,
  }


def resolve_operation_type(generation_type: str) -> OperationType:
  """
  Resolve OperationType for a given generation_type string.

  Falls back to TEXT_TO_VIDEO if the generation_type is unknown.
  """

  return GENERATION_TYPE_OPERATION_MAP.get(generation_type, OperationType.TEXT_TO_VIDEO)


def list_generation_operation_metadata() -> List[dict]:
  """
  Return metadata for all known generation_type → operation_type mappings.

  This is intended for tooling and UI consumers so they do not need
  to duplicate backend mappings.
  """

  items: List[dict] = []
  for gen_type, op_type in GENERATION_TYPE_OPERATION_MAP.items():
    items.append(
      {
        "generation_type": gen_type,
        "operation_type": op_type.value,
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
  registered_ops = set(OPERATION_REGISTRY.keys())
  all_ops = set(OperationType)
  missing_from_registry = all_ops - registered_ops
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

