"""
Generation API endpoints - unified generation pipeline

Handles generation requests from frontend Generation Nodes with:
- Structured generation config (strategy, constraints, style, etc.)
- Prompt versioning integration
- Social context (from Task 09)
- Validation and health checks
"""
from fastapi import APIRouter, HTTPException, Query, Request
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime

from pixsim7.backend.main.api.dependencies import (
    CurrentUser,
    GenerationGatewaySvc,
    GenerationTrackingSvc,
    DatabaseSession,
)
from pixsim7.backend.main.shared.schemas.generation_schemas import (
    CreateGenerationRequest,
    GenerationResponse,
    GenerationListResponse,
)
from pixsim7.backend.main.services.generation.social_context_builder import (
    build_generation_social_context,
)
from pixsim7.backend.main.domain.enums import GenerationStatus, OperationType
from pixsim7.backend.main.shared.errors import (
    ResourceNotFoundError,
    ValidationError as DomainValidationError,
    QuotaExceededError,
    InvalidOperationError,
)
from pixsim7.backend.main.shared.operation_mapping import (
    resolve_operation_type_from_config,
    list_generation_operation_metadata,
)
from pixsim7.backend.main.shared.rate_limit import job_create_limiter, get_client_identifier
import logging
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter()


def _as_mapping(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    return {}


def _as_mapping_list(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    rows: List[Dict[str, Any]] = []
    for item in value:
        if isinstance(item, dict):
            rows.append(dict(item))
            continue
        model_dump = getattr(item, "model_dump", None)
        if callable(model_dump):
            dumped = model_dump()
            if isinstance(dumped, dict):
                rows.append(dict(dumped))
    return rows


def _normalize_asset_ref(asset_value: Any) -> Optional[str]:
    if asset_value is None or isinstance(asset_value, bool):
        return None
    if isinstance(asset_value, int):
        return f"asset:{asset_value}" if asset_value > 0 else None
    if isinstance(asset_value, float):
        if asset_value.is_integer() and asset_value > 0:
            return f"asset:{int(asset_value)}"
        return None
    if isinstance(asset_value, str):
        text = asset_value.strip()
        if not text:
            return None
        return text if text.startswith("asset:") else f"asset:{text}"
    return None


def _extract_asset_key(entry: Dict[str, Any]) -> Optional[str]:
    for key in ("asset", "asset_id", "asset_ref", "assetId", "id"):
        if key not in entry:
            continue
        normalized = _normalize_asset_ref(entry.get(key))
        if normalized:
            return normalized
    return None


def _merge_prompt_tool_composition_assets(
    existing: Any,
    patch_rows: Any,
) -> Optional[List[Dict[str, Any]]]:
    existing_rows = _as_mapping_list(existing)
    patch_list = _as_mapping_list(patch_rows)
    if not patch_list:
        return existing_rows or None

    merged = [dict(row) for row in existing_rows]
    index_by_asset: Dict[str, int] = {}
    for idx, row in enumerate(merged):
        asset_key = _extract_asset_key(row)
        if asset_key:
            index_by_asset[asset_key] = idx

    for patch_row in patch_list:
        row = dict(patch_row)
        asset_key = _extract_asset_key(row)
        if not asset_key:
            continue
        row.setdefault("asset", asset_key)
        row.setdefault("role", row.get("role") or "reference")
        operation = row.get("operation")
        if isinstance(operation, str) and operation:
            row.setdefault(
                "influence_type",
                "mask" if "mask" in operation else "reference",
            )

        existing_idx = index_by_asset.get(asset_key)
        if existing_idx is None:
            if row.get("layer") is None:
                row["layer"] = len(merged)
            merged.append(row)
            index_by_asset[asset_key] = len(merged) - 1
            continue

        prior = merged[existing_idx]
        merged[existing_idx] = {
            **prior,
            **row,
            "asset": prior.get("asset") or row.get("asset"),
        }

    return merged or None


def _apply_prompt_tool_guidance_patch(
    guidance_plan: Any,
    guidance_patch: Any,
) -> Optional[Dict[str, Any]]:
    base_plan = _as_mapping(guidance_plan)
    patch = _as_mapping(guidance_patch)
    if not base_plan and not patch:
        return None

    normalized_plan: Dict[str, Any] = {
        **base_plan,
        "version": 1,
    }
    if not patch:
        return normalized_plan

    masked_transform = _as_mapping(patch.get("masked_transform"))
    if masked_transform:
        masks = _as_mapping(normalized_plan.get("masks"))
        mask_payload = _as_mapping(masked_transform.get("mask"))
        mask_format = mask_payload.get("format")
        mask_data = mask_payload.get("data")
        if (
            isinstance(mask_format, str)
            and mask_format in {"url", "base64", "asset_ref"}
            and isinstance(mask_data, str)
            and mask_data.strip()
        ):
            masks["edit_mask"] = {
                "format": mask_format,
                "data": mask_data.strip(),
            }
            normalized_plan["masks"] = masks

        constraints = _as_mapping(normalized_plan.get("constraints"))
        strength_raw = masked_transform.get("strength")
        if isinstance(strength_raw, (int, float)):
            strength = max(1.0, min(10.0, float(strength_raw))) / 10.0
            constraints.setdefault("style_strength", round(strength, 2))
        preserve_identity = masked_transform.get("preserve_identity")
        if isinstance(preserve_identity, bool):
            constraints.setdefault(
                "identity_strength",
                1.0 if preserve_identity else 0.6,
            )
        preserve_background = masked_transform.get("preserve_background")
        if isinstance(preserve_background, bool):
            constraints.setdefault("lock_camera", preserve_background)
        if constraints:
            normalized_plan["constraints"] = constraints

    # Keep raw prompt-tool patch available for downstream formatting/analytics.
    normalized_plan["prompt_tool_patch"] = patch
    return normalized_plan


async def _get_generation_wait_reasons(
    generation_ids: List[int],
) -> Dict[int, str]:
    """Return wait_reason from Redis wait metadata for pending generations."""
    if not generation_ids:
        return {}
    try:
        from pixsim7.backend.main.infrastructure.redis import get_arq_pool
        from pixsim7.backend.main.infrastructure.queue import get_generation_wait_metadata

        arq_pool = await get_arq_pool()
        reasons: Dict[int, str] = {}
        for gid in generation_ids:
            meta = await get_generation_wait_metadata(arq_pool, gid)
            if isinstance(meta, dict) and meta.get("reason"):
                reasons[gid] = str(meta["reason"])
        return reasons
    except Exception:
        return {}


class _SubmissionMetadata:
    """Combined submission metadata for a batch of generation IDs (single query)."""

    def __init__(self):
        self.payloads: Dict[int, Dict[str, Any]] = {}
        self.provider_job_ids: Dict[int, Optional[str]] = {}
        self.attempt_counts: Dict[int, int] = {}


async def _get_submission_metadata(
    db: DatabaseSession,
    generation_ids: List[int],
) -> _SubmissionMetadata:
    """Fetch payload, provider_job_id, and attempt count in a single query."""
    from sqlmodel import select
    from sqlalchemy import func
    from pixsim7.backend.main.domain.providers import ProviderSubmission

    meta = _SubmissionMetadata()
    if not generation_ids:
        return meta

    # One query: latest submission per generation (payload + job_id)
    result = await db.execute(
        select(
            ProviderSubmission.generation_id,
            ProviderSubmission.payload,
            ProviderSubmission.provider_job_id,
        )
        .where(ProviderSubmission.generation_id.in_(generation_ids))
        .where(ProviderSubmission.analysis_id.is_(None))
        .order_by(
            ProviderSubmission.generation_id.asc(),
            ProviderSubmission.retry_attempt.desc(),
            ProviderSubmission.id.desc(),
        )
    )

    for generation_id, payload, provider_job_id in result.fetchall():
        if generation_id not in meta.payloads and isinstance(payload, dict):
            meta.payloads[generation_id] = payload
        if generation_id not in meta.provider_job_ids:
            meta.provider_job_ids[generation_id] = provider_job_id
        # Count all rows per generation
        meta.attempt_counts[generation_id] = meta.attempt_counts.get(generation_id, 0) + 1

    return meta


# ===== CREATE GENERATION =====

@router.post("/generations", response_model=GenerationResponse, status_code=201)
async def create_generation(
    request: CreateGenerationRequest,
    req: Request,
    user: CurrentUser,
    generation_gateway: GenerationGatewaySvc,
):
    """
    Create a new generation from a Generation Node configuration

    This endpoint handles structured generation requests with:
    - Generation strategy (once, per_playthrough, per_player, always)
    - Style rules (mood, pacing, transition type)
    - Duration constraints
    - Content rating and constraints
    - Fallback configuration
    - Prompt versioning
    - Social context (intimacy, relationship state)

    Rate limited: 10 requests per 60 seconds per user/IP
    """
    # Rate limit check
    identifier = await get_client_identifier(req)
    await job_create_limiter.check(identifier)

    proxy = await generation_gateway.proxy(
        req,
        "POST",
        "/api/v1/generations",
        json=request.model_dump(mode="json"),
    )
    if proxy.called:
        return GenerationResponse.model_validate(proxy.data)

    try:
        generation_service = generation_gateway.local
        # Build or enrich social context if world_id and session_id available
        social_context_dict = None
        if request.social_context:
            social_context_dict = request.social_context.model_dump()
        elif request.player_context and request.player_context.playthrough_id:
            # Try to build social context from session if available
            # This requires knowing the world_id and npc_id, which may come from scene context
            # For now, just use provided social context
            pass

        generation_type = request.config.generation_type
        operation_type = resolve_operation_type_from_config(request.config)

        # Roll block template from config.run_context (server-side template resolution)
        existing_run_context = (request.config.model_extra or {}).get("run_context") or {}
        run_context = existing_run_context if isinstance(existing_run_context, dict) else {}

        # Prompt-tool lane normalization:
        # 1) fold run_context.guidance_patch -> run_context.guidance_plan
        # 2) fold run_context.composition_assets_patch -> config.composition_assets
        guidance_plan_from_patch = _apply_prompt_tool_guidance_patch(
            run_context.get("guidance_plan"),
            run_context.get("guidance_patch"),
        )
        if guidance_plan_from_patch:
            run_context["guidance_plan"] = guidance_plan_from_patch
            if request.config.__pydantic_extra__ is None:
                request.config.__pydantic_extra__ = {}
            request.config.__pydantic_extra__["run_context"] = run_context

        merged_composition_assets = _merge_prompt_tool_composition_assets(
            request.config.composition_assets,
            run_context.get("composition_assets_patch"),
        )
        if merged_composition_assets is not None:
            from pixsim7.backend.main.shared.schemas.composition_schemas import CompositionAsset

            validated_assets: List[CompositionAsset] = []
            for row in merged_composition_assets:
                try:
                    validated_assets.append(CompositionAsset.model_validate(row))
                except Exception:
                    continue
            request.config.composition_assets = validated_assets

        raw_block_template_id = run_context.get("block_template_id")
        block_template_id: Optional[UUID] = None
        if raw_block_template_id:
            try:
                block_template_id = raw_block_template_id if isinstance(raw_block_template_id, UUID) else UUID(str(raw_block_template_id))
            except (TypeError, ValueError):
                block_template_id = None
        character_bindings = run_context.get("character_bindings")
        if not isinstance(character_bindings, dict):
            character_bindings = None

        if block_template_id:
            from pixsim7.backend.main.services.prompt.block.template_service import BlockTemplateService
            template_service = BlockTemplateService(generation_service.db)
            roll_result = await template_service.roll_template(
                block_template_id,
                character_bindings=character_bindings,
                current_user_id=user.id,
            )
            if roll_result.get("success") and roll_result.get("assembled_prompt"):
                request.config.prompt = roll_result["assembled_prompt"]
                # Stash roll metadata in run_context for manifest tracking
                updated_run_context = dict(run_context)
                updated_run_context["block_template_id"] = str(block_template_id)
                updated_run_context["roll_seed"] = roll_result.get("metadata", {}).get("seed")
                # Prefer the service-provided selection list, fall back to slot_results if needed.
                selected_block_ids = roll_result.get("metadata", {}).get("selected_block_ids") or [
                    sr.get("selected_block_id")
                    for sr in (roll_result.get("slot_results") or [])
                    if isinstance(sr, dict) and sr.get("selected_block_id")
                ]
                updated_run_context["selected_block_ids"] = [str(v) for v in selected_block_ids if v is not None]
                updated_run_context["slot_results"] = roll_result.get("slot_results") or []
                updated_run_context["assembled_prompt"] = roll_result["assembled_prompt"]
                if request.config.__pydantic_extra__ is None:
                    request.config.__pydantic_extra__ = {}
                request.config.__pydantic_extra__["run_context"] = updated_run_context

        # === Guidance plan extraction & validation ===
        effective_run_context = (
            (request.config.__pydantic_extra__ or {}).get("run_context") or run_context
        )
        if not isinstance(effective_run_context, dict):
            effective_run_context = run_context

        raw_guidance_plan = effective_run_context.get("guidance_plan")
        if isinstance(raw_guidance_plan, dict):
            from pixsim7.backend.main.shared.schemas.guidance_plan import GuidancePlanV1
            from pixsim7.backend.main.services.guidance import validate_guidance_plan

            try:
                parsed_plan = GuidancePlanV1.model_validate(raw_guidance_plan)
            except Exception as exc:
                logger.warning(
                    "guidance_plan_parse_failed",
                    error=str(exc),
                )
                raise ValueError(f"Invalid guidance_plan: {exc}")

            gv = validate_guidance_plan(parsed_plan)
            if gv.errors:
                logger.warning(
                    "guidance_plan_validation_errors",
                    extra={"errors": gv.errors},
                )
                raise ValueError(
                    "Invalid guidance_plan: " + "; ".join(gv.errors)
                )
            if gv.warnings:
                logger.info(
                    "guidance_plan_validation_warnings",
                    extra={"warnings": gv.warnings},
                )
            # Stash validated plan back (round-tripped through Pydantic)
            updated_run_context = dict(
                effective_run_context
            )
            updated_run_context["guidance_plan"] = parsed_plan.model_dump()
            if request.config.__pydantic_extra__ is None:
                request.config.__pydantic_extra__ = {}
            request.config.__pydantic_extra__["run_context"] = updated_run_context

        # Build canonical params from generation config after any server-side mutations
        canonical_params = {
            "generation_config": request.config.model_dump() if request.config else {},
            "scene_context": {
                "from_scene": request.from_scene.model_dump() if request.from_scene else None,
                "to_scene": request.to_scene.model_dump() if request.to_scene else None,
            },
            "player_context": request.player_context.model_dump() if request.player_context else None,
            "social_context": social_context_dict,
        }

        # Build prompt config if template_id or prompt_version_id provided
        prompt_config = None
        if request.prompt_version_id:
            prompt_config = {
                "versionId": str(request.prompt_version_id),
                "variables": request.template_variables or {},
                "autoSelectLatest": False,
            }
        elif request.template_id:
            # Template ID maps to a prompt family
            prompt_config = {
                "familyId": request.template_id,
                "variables": request.template_variables or {},
                "autoSelectLatest": True,
            }

        # Validate preferred_account_id belongs to the target provider
        # (prevents cross-provider account bleed from stale frontend state)
        validated_preferred_account_id = request.preferred_account_id
        if validated_preferred_account_id is not None:
            from pixsim7.backend.main.domain.providers import ProviderAccount
            pref_acct = await generation_service.db.get(ProviderAccount, validated_preferred_account_id)
            if pref_acct and pref_acct.provider_id != request.provider_id:
                logger.warning(
                    "preferred_account_provider_mismatch_cleared",
                    preferred_account_id=validated_preferred_account_id,
                    account_provider=pref_acct.provider_id,
                    generation_provider=request.provider_id,
                )
                validated_preferred_account_id = None

        # Create generation via unified service
        generation = await generation_service.create_generation(
            user=user,
            operation_type=operation_type,
            provider_id=request.provider_id,
            params=canonical_params,
            workspace_id=request.workspace.id if request.workspace else None,
            name=request.name or f"{generation_type} generation",
            description=request.description,
            priority=request.priority,
            scheduled_at=request.scheduled_at,
            parent_generation_id=request.parent_generation.id if request.parent_generation else None,
            prompt_version_id=request.prompt_version_id,
            force_new=request.force_new,
            analyzer_id=request.analyzer_id,
            preferred_account_id=validated_preferred_account_id,
        )

        # Update generation with prompt_config if we have one
        if prompt_config:
            generation.prompt_config = prompt_config
            generation.prompt_source_type = "versioned"
            await generation_service.db.commit()
            await generation_service.db.refresh(generation)

        return GenerationResponse.model_validate(generation)

    except QuotaExceededError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except DomainValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create generation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create generation: {str(e)}")


class GenerationOperationMetadataItem(BaseModel):
    """Metadata entry describing a single generation_type mapping."""
    generation_type: str = Field(..., description="Structured generation type identifier")
    operation_type: OperationType = Field(..., description="Backend OperationType value")
    owner: Optional[str] = Field(
        None,
        description="Plugin ID that owns this alias, or null for canonical core aliases",
    )
    is_semantic_alias: bool = Field(
        False,
        description="True if this is a semantic/plugin-owned alias rather than a canonical core name",
    )


class GenerationBatchSummaryResponse(BaseModel):
    """Summary metadata for a tracked generation batch/run."""

    batch_id: UUID
    created_at: datetime
    item_count: int
    first_item_index: int
    last_item_index: int


class GenerationBatchListResponse(BaseModel):
    """Paginated list response for generation batches."""

    batches: List[GenerationBatchSummaryResponse]
    total: int
    limit: int
    offset: int


class GenerationBatchItemResponse(BaseModel):
    """Single output item belonging to a tracked generation batch."""

    asset_id: int
    item_index: int
    generation_id: Optional[int] = None
    prompt_version_id: Optional[UUID] = None
    block_template_id: Optional[UUID] = None
    template_slug: Optional[str] = None
    roll_seed: Optional[int] = None
    selected_block_ids: List[str] = Field(default_factory=list)
    slot_results: List[Dict[str, Any]] = Field(default_factory=list)
    assembled_prompt: Optional[str] = None
    mode: Optional[str] = None
    strategy: Optional[str] = None
    input_asset_ids: List[int] = Field(default_factory=list)
    manifest_metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class GenerationBatchDetailResponse(BaseModel):
    """Full batch payload for later review/rating workflows."""

    batch: GenerationBatchSummaryResponse
    items: List[GenerationBatchItemResponse]


def _coerce_input_asset_ids(value: Any) -> List[int]:
    if not isinstance(value, list):
        return []
    coerced: List[int] = []
    for item in value:
        try:
            coerced.append(int(item))
        except (TypeError, ValueError):
            continue
    return coerced


def _to_batch_item_response(manifest: Any) -> GenerationBatchItemResponse:
    metadata = manifest.manifest_metadata if isinstance(manifest.manifest_metadata, dict) else {}
    mode_raw = metadata.get("mode")
    strategy_raw = metadata.get("strategy")
    return GenerationBatchItemResponse(
        asset_id=manifest.asset_id,
        item_index=manifest.item_index,
        generation_id=manifest.generation_id,
        prompt_version_id=manifest.prompt_version_id,
        block_template_id=manifest.block_template_id,
        template_slug=manifest.template_slug,
        roll_seed=manifest.roll_seed,
        selected_block_ids=list(manifest.selected_block_ids or []),
        slot_results=list(manifest.slot_results or []),
        assembled_prompt=manifest.assembled_prompt,
        mode=str(mode_raw) if mode_raw is not None else None,
        strategy=str(strategy_raw) if strategy_raw is not None else None,
        input_asset_ids=_coerce_input_asset_ids(metadata.get("input_asset_ids")),
        manifest_metadata=metadata,
        created_at=manifest.created_at,
    )


@router.get("/generation-operations", response_model=list[GenerationOperationMetadataItem])
async def list_generation_operations() -> list[GenerationOperationMetadataItem]:
    """
    List known generation_type → OperationType mappings.

    This endpoint provides a single source of truth that frontends and tooling
    can use to avoid duplicating mapping logic.
    """
    items = list_generation_operation_metadata()
    return [GenerationOperationMetadataItem(**item) for item in items]


# ===== SIMPLE IMAGE-TO-VIDEO GENERATION (THIN CLIENT HELPER) =====

class SimpleImageToVideoRequest(BaseModel):
  """Minimal request for quick image-to-video generations.

  This is designed for thin clients (e.g., Chrome extension) that only have
  an image URL and a freeform prompt, and don't need full GenerationNodeConfig.

  The endpoint converts the flat request to structured format internally before
  calling the service layer, keeping the service layer structured-only.
  """
  provider_id: str = Field(..., min_length=1, max_length=50)
  prompt: str = Field(..., min_length=1, max_length=4096)
  image_url: str = Field(..., min_length=1, max_length=2048)
  name: Optional[str] = Field(None, max_length=255)
  priority: int = Field(7, ge=0, le=10)


@router.post("/generations/simple-image-to-video", response_model=GenerationResponse, status_code=201)
async def create_simple_image_to_video(
    request: SimpleImageToVideoRequest,
    req: Request,
    user: CurrentUser,
    generation_gateway: GenerationGatewaySvc,
):
  """Create a simple IMAGE_TO_VIDEO generation from raw prompt + image URL.

  This convenience endpoint converts flat parameters to structured format:
  - Wraps prompt/image_url into a minimal GenerationNodeConfig
  - Uses default style/duration/constraints for quick generation
  - Calls the unified service layer with structured params

  It is primarily intended for tooling like the Chrome extension's Quick Generate.
  """
  # Rate limit check (reuse same limiter)
  identifier = await get_client_identifier(req)
  await job_create_limiter.check(identifier)

  proxy = await generation_gateway.proxy(
    req,
    "POST",
    "/api/v1/generations/simple-image-to-video",
    json=request.model_dump(mode="json"),
  )
  if proxy.called:
    return GenerationResponse.model_validate(proxy.data)

  try:
    generation_service = generation_gateway.local
    # Convert flat request to structured generation_config format
    # This keeps the service layer structured-only
    params = {
      "generation_config": {
        "generationType": "image_to_video",
        "purpose": "adaptive",
        "prompt": request.prompt,
        "image_url": request.image_url,
        "style": {
          "pacing": "medium",
        },
        "duration": {
          "target": 5,  # Default short duration for quick generation
        },
        "constraints": {},
        "strategy": "always",  # Quick generate always creates new
        "fallback": {
          "mode": "skip",
        },
        "enabled": True,
        "version": 1,
      },
      "scene_context": {
        "from_scene": None,
        "to_scene": None,
      },
      "player_context": None,
      "social_context": None,
    }

    generation = await generation_service.create_generation(
      user=user,
      operation_type=OperationType.IMAGE_TO_VIDEO,
      provider_id=request.provider_id,
      params=params,
      workspace_id=None,
      name=request.name or f"Quick image-to-video",
      description=None,
      priority=request.priority,
      scheduled_at=None,
      parent_generation_id=None,
      prompt_version_id=None,
      force_new=True,  # Quick generate always creates new
    )

    return GenerationResponse.model_validate(generation)

  except QuotaExceededError as e:
    raise HTTPException(status_code=429, detail=str(e))
  except DomainValidationError as e:
    raise HTTPException(status_code=400, detail=str(e))
  except Exception as e:
    logger.error(f"Failed to create simple image-to-video generation: {e}", exc_info=True)
    raise HTTPException(status_code=500, detail=f"Failed to create generation: {str(e)}")


# ===== GET GENERATION =====

@router.get("/generations/{generation_id}", response_model=GenerationResponse)
async def get_generation(
    generation_id: int,
    req: Request,
    user: CurrentUser,
    generation_gateway: GenerationGatewaySvc,
    db: DatabaseSession,
):
    """
    Get generation by ID

    Returns full generation details including:
    - Status and lifecycle timestamps
    - Canonical parameters and inputs
    - Prompt configuration
    - Result asset (if completed)
    """
    from sqlmodel import select
    from pixsim7.backend.main.domain.providers import ProviderAccount

    try:
        proxy = await generation_gateway.proxy(
            req,
            "GET",
            f"/api/v1/generations/{generation_id}",
        )
        if proxy.called:
            return GenerationResponse.model_validate(proxy.data)

        generation_service = generation_gateway.local
        generation = await generation_service.get_generation_for_user(generation_id, user)
        response = GenerationResponse.model_validate(generation)
        sub_meta = await _get_submission_metadata(db, [generation.id])
        response.latest_submission_payload = sub_meta.payloads.get(generation.id)
        response.latest_submission_provider_job_id = sub_meta.provider_job_ids.get(generation.id)
        response.attempt_count = sub_meta.attempt_counts.get(generation.id, 0)

        # Populate wait_reason for pending generations
        if generation.status == "pending":
            wait_reasons = await _get_generation_wait_reasons([generation.id])
            response.wait_reason = wait_reasons.get(generation.id)

        # Populate account_email for UI display (same as list endpoint)
        if generation.account_id:
            result = await db.execute(
                select(ProviderAccount.email)
                .where(ProviderAccount.id == generation.account_id)
            )
            email = result.scalar_one_or_none()
            if email:
                response.account_email = email

        return response
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to get generation {generation_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get generation: {str(e)}")


# ===== LIST GENERATIONS =====

@router.get("/generations", response_model=GenerationListResponse)
async def list_generations(
    req: Request,
    user: CurrentUser,
    generation_gateway: GenerationGatewaySvc,
    db: DatabaseSession,
    workspace_id: Optional[int] = Query(None),
    status: Optional[GenerationStatus] = Query(None),
    operation_type: Optional[OperationType] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """
    List generations for current user

    Filters:
    - workspace_id: Filter by workspace
    - status: Filter by status (pending, processing, completed, failed, cancelled)
    - operation_type: Filter by operation type
    - limit/offset: Pagination

    Returns generations ordered by priority and creation time.
    """
    from sqlmodel import select
    from pixsim7.backend.main.domain.providers import ProviderAccount

    try:
        proxy = await generation_gateway.proxy(
            req,
            "GET",
            "/api/v1/generations",
            params={
                k: v
                for k, v in {
                    "workspace_id": workspace_id,
                    "status": status.value if status else None,
                    "operation_type": operation_type.value if operation_type else None,
                    "limit": limit,
                    "offset": offset,
                }.items()
                if v is not None
            },
        )
        if proxy.called:
            return GenerationListResponse.model_validate(proxy.data)

        generation_service = generation_gateway.local
        generations = await generation_service.list_generations(
            user=user,
            workspace_id=workspace_id,
            status=status,
            operation_type=operation_type,
            limit=limit,
            offset=offset,
        )

        total = await generation_service.count_generations(
            user=user,
            workspace_id=workspace_id,
            status=status,
            operation_type=operation_type,
        )

        # Build account email lookup for UI display
        account_ids = {g.account_id for g in generations if g.account_id}
        account_emails = {}
        if account_ids:
            result = await db.execute(
                select(ProviderAccount.id, ProviderAccount.email)
                .where(ProviderAccount.id.in_(account_ids))
            )
            account_emails = {row[0]: row[1] for row in result.fetchall()}

        # Single query for all submission metadata (replaces 3 separate queries)
        submission_meta = await _get_submission_metadata(db, [g.id for g in generations])

        # Fetch wait reasons for pending generations
        pending_ids = [g.id for g in generations if g.status == "pending"]
        wait_reasons = await _get_generation_wait_reasons(pending_ids)

        # Convert to response with account_email populated
        responses = []
        for g in generations:
            resp = GenerationResponse.model_validate(g)
            if g.account_id and g.account_id in account_emails:
                resp.account_email = account_emails[g.account_id]
            resp.latest_submission_payload = submission_meta.payloads.get(g.id)
            resp.latest_submission_provider_job_id = submission_meta.provider_job_ids.get(g.id)
            resp.attempt_count = submission_meta.attempt_counts.get(g.id, 0)
            resp.wait_reason = wait_reasons.get(g.id)
            responses.append(resp)

        return GenerationListResponse(
            generations=responses,
            total=total,
            limit=limit,
            offset=offset,
        )
    except Exception as e:
        logger.error(f"Failed to list generations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list generations: {str(e)}")


# ===== LIST/GET GENERATION BATCHES =====

@router.get("/generation-batches", response_model=GenerationBatchListResponse)
async def list_generation_batches(
    req: Request,
    user: CurrentUser,
    generation_gateway: GenerationGatewaySvc,
    db: DatabaseSession,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """
    List tracked generation batches for the current user.

    Batches are grouped by manifest batch_id and sorted by newest batch activity.
    """
    from sqlalchemy import func
    from sqlmodel import select
    from pixsim7.backend.main.domain import Asset, GenerationBatchItemManifest

    try:
        proxy = await generation_gateway.proxy(
            req,
            "GET",
            "/api/v1/generation-batches",
            params={
                "limit": limit,
                "offset": offset,
            },
        )
        if proxy.called:
            return GenerationBatchListResponse.model_validate(proxy.data)

        created_at_expr = func.max(GenerationBatchItemManifest.created_at)
        count_expr = func.count(GenerationBatchItemManifest.asset_id)
        first_item_expr = func.min(GenerationBatchItemManifest.item_index)
        last_item_expr = func.max(GenerationBatchItemManifest.item_index)

        grouped_stmt = (
            select(
                GenerationBatchItemManifest.batch_id,
                created_at_expr.label("created_at"),
                count_expr.label("item_count"),
                first_item_expr.label("first_item_index"),
                last_item_expr.label("last_item_index"),
            )
            .join(Asset, Asset.id == GenerationBatchItemManifest.asset_id)
            .where(Asset.user_id == user.id)
            .group_by(GenerationBatchItemManifest.batch_id)
        )

        total_stmt = select(func.count()).select_from(grouped_stmt.subquery())
        total_result = await db.execute(total_stmt)
        total = int(total_result.scalar_one() or 0)

        rows_result = await db.execute(
            grouped_stmt
            .order_by(created_at_expr.desc(), GenerationBatchItemManifest.batch_id.desc())
            .limit(limit)
            .offset(offset)
        )

        batches: List[GenerationBatchSummaryResponse] = []
        for row in rows_result.fetchall():
            batches.append(
                GenerationBatchSummaryResponse(
                    batch_id=row[0],
                    created_at=row[1],
                    item_count=int(row[2] or 0),
                    first_item_index=int(row[3] or 0),
                    last_item_index=int(row[4] or 0),
                )
            )

        return GenerationBatchListResponse(
            batches=batches,
            total=total,
            limit=limit,
            offset=offset,
        )
    except Exception as e:
        logger.error(f"Failed to list generation batches: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list generation batches: {str(e)}")


@router.get("/generation-batches/{batch_id}", response_model=GenerationBatchDetailResponse)
async def get_generation_batch(
    batch_id: UUID,
    req: Request,
    user: CurrentUser,
    generation_gateway: GenerationGatewaySvc,
    db: DatabaseSession,
):
    """Get ordered manifest items for a single batch_id owned by current user."""
    from sqlmodel import select
    from pixsim7.backend.main.domain import Asset, GenerationBatchItemManifest

    try:
        proxy = await generation_gateway.proxy(
            req,
            "GET",
            f"/api/v1/generation-batches/{batch_id}",
        )
        if proxy.called:
            return GenerationBatchDetailResponse.model_validate(proxy.data)

        result = await db.execute(
            select(GenerationBatchItemManifest)
            .join(Asset, Asset.id == GenerationBatchItemManifest.asset_id)
            .where(GenerationBatchItemManifest.batch_id == batch_id)
            .where(Asset.user_id == user.id)
            .order_by(
                GenerationBatchItemManifest.item_index.asc(),
                GenerationBatchItemManifest.created_at.asc(),
                GenerationBatchItemManifest.asset_id.asc(),
            )
        )
        manifests = list(result.scalars().all())
        if not manifests:
            raise HTTPException(status_code=404, detail=f"Generation batch {batch_id} not found")

        items = [_to_batch_item_response(manifest) for manifest in manifests]
        created_at = max(item.created_at for item in items)
        first_item_index = min(item.item_index for item in items)
        last_item_index = max(item.item_index for item in items)

        return GenerationBatchDetailResponse(
            batch=GenerationBatchSummaryResponse(
                batch_id=batch_id,
                created_at=created_at,
                item_count=len(items),
                first_item_index=first_item_index,
                last_item_index=last_item_index,
            ),
            items=items,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get generation batch {batch_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get generation batch: {str(e)}")


# ===== GENERATION LIFECYCLE ACTIONS (cancel / pause / resume) =====

async def _generation_lifecycle_action(
    action: str,
    generation_id: int,
    req: Request,
    user,
    generation_gateway,
) -> GenerationResponse:
    """Shared handler for cancel/pause/resume — proxy + service call + error mapping."""
    try:
        proxy = await generation_gateway.proxy(
            req, "POST", f"/api/v1/generations/{generation_id}/{action}",
        )
        if proxy.called:
            return GenerationResponse.model_validate(proxy.data)

        service_method = getattr(generation_gateway.local, f"{action}_generation")
        generation = await service_method(generation_id, user)
        return GenerationResponse.model_validate(generation)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to {action} generation {generation_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to {action} generation: {str(e)}")


@router.post("/generations/{generation_id}/cancel", response_model=GenerationResponse)
async def cancel_generation(
    generation_id: int, req: Request, user: CurrentUser, generation_gateway: GenerationGatewaySvc,
):
    """Cancel a pending or processing generation."""
    return await _generation_lifecycle_action("cancel", generation_id, req, user, generation_gateway)


@router.post("/generations/{generation_id}/pause", response_model=GenerationResponse)
async def pause_generation(
    generation_id: int, req: Request, user: CurrentUser, generation_gateway: GenerationGatewaySvc,
):
    """Pause a pending generation."""
    return await _generation_lifecycle_action("pause", generation_id, req, user, generation_gateway)


@router.post("/generations/{generation_id}/resume", response_model=GenerationResponse)
async def resume_generation(
    generation_id: int, req: Request, user: CurrentUser, generation_gateway: GenerationGatewaySvc,
):
    """Resume a paused generation."""
    return await _generation_lifecycle_action("resume", generation_id, req, user, generation_gateway)


# ===== RETRY GENERATION =====

@router.post("/generations/{generation_id}/retry", response_model=GenerationResponse)
async def retry_generation(
    generation_id: int,
    req: Request,
    user: CurrentUser,
    generation_gateway: GenerationGatewaySvc,
    db: DatabaseSession,
):
    """
    Retry a failed generation

    Re-queues the same generation with the same parameters and increments its retry_count.
    Useful for generations that failed due to:
    - Content filtering (romantic/erotic content that might pass on retry)
    - Temporary provider errors
    - Rate limits

    Only the generation owner or admin can retry.
    Maximum retry attempts per generation are limited by server configuration
    (settings.auto_retry_max_attempts, default: 20).
    """
    from datetime import datetime, timezone
    from pixsim7.backend.main.shared.config import settings

    try:
        proxy = await generation_gateway.proxy(
            req,
            "POST",
            f"/api/v1/generations/{generation_id}/retry",
        )
        if proxy.called:
            return GenerationResponse.model_validate(proxy.data)

        generation_service = generation_gateway.local
        # Authorization + existence check
        generation = await generation_service.get_generation_for_user(generation_id, user)

        # Only allow retry for failed or cancelled generations
        if generation.status not in {GenerationStatus.FAILED, GenerationStatus.CANCELLED}:
            raise InvalidOperationError(
                f"Can only retry failed or cancelled generations, not {generation.status.value}"
            )

        # Enforce max retries (checked against retry_count — the error-retry
        # counter, not attempt_id which includes non-error transitions)
        from pixsim7.backend.main.services.generation.generation_settings import get_generation_settings
        gen_settings = get_generation_settings()
        if (generation.retry_count or 0) >= gen_settings.auto_retry_max_attempts:
            raise InvalidOperationError(
                f"Maximum retries ({gen_settings.auto_retry_max_attempts}) exceeded"
            )

        # Increment retry_count and reset lifecycle fields in one operation
        # (avoids double-commit from separate increment_retry call)
        generation.retry_count += 1
        generation.status = GenerationStatus.PENDING
        generation.started_at = None
        generation.completed_at = None
        generation.error_message = None  # Clear previous error
        generation.updated_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(generation)

        # Enqueue the same generation for processing
        from pixsim7.backend.main.infrastructure.redis import get_arq_pool
        from pixsim7.backend.main.infrastructure.queue import enqueue_generation_fresh_job

        arq_pool = await get_arq_pool()
        await enqueue_generation_fresh_job(arq_pool, generation.id)

        logger.info(
            "manual_retry_requeued",
            generation_id=generation.id,
            retry_attempt=generation.retry_count,
            max_attempts=gen_settings.auto_retry_max_attempts,
        )

        return GenerationResponse.model_validate(generation)

    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to retry generation {generation_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retry generation: {str(e)}")


# ===== PATCH GENERATION PROMPT =====


class PatchGenerationPromptRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=50000, description="New prompt text")


@router.patch("/generations/{generation_id}/prompt", response_model=GenerationResponse)
async def patch_generation_prompt(
    generation_id: int,
    request: PatchGenerationPromptRequest,
    user: CurrentUser,
    generation_gateway: GenerationGatewaySvc,
    db: DatabaseSession,
):
    """
    Update the prompt on an existing generation.

    Updates final_prompt and the prompt key inside raw_params / canonical_params.
    Only the generation owner or admin can patch.
    """
    from datetime import timezone

    try:
        generation_service = generation_gateway.local
        generation = await generation_service.get_generation_for_user(generation_id, user)

        new_prompt = request.prompt.strip()
        generation.final_prompt = new_prompt

        # Patch prompt inside raw_params and canonical_params
        if generation.raw_params is not None:
            updated_raw = {**generation.raw_params, "prompt": new_prompt}
            generation.raw_params = updated_raw
        if generation.canonical_params is not None:
            updated_canonical = {**generation.canonical_params, "prompt": new_prompt}
            generation.canonical_params = updated_canonical

        # Clear resolved_params so the worker re-resolves with the new prompt
        generation.resolved_params = None
        generation.updated_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(generation)

        logger.info(
            "generation_prompt_patched",
            generation_id=generation.id,
            prompt_length=len(new_prompt),
        )

        return GenerationResponse.model_validate(generation)

    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to patch generation {generation_id} prompt: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to patch prompt: {str(e)}")


# ===== DELETE GENERATION =====

@router.delete("/generations/{generation_id}", status_code=204)
async def delete_generation(
    generation_id: int,
    req: Request,
    user: CurrentUser,
    generation_gateway: GenerationGatewaySvc,
):
    """
    Delete a generation

    Permanently removes a generation from the database.
    Only terminal generations (completed, failed, cancelled) can be deleted.
    Active generations must be cancelled first.

    Only the generation owner or admin can delete.
    """
    try:
        proxy = await generation_gateway.proxy(
            req,
            "DELETE",
            f"/api/v1/generations/{generation_id}",
        )
        if proxy.called:
            return None

        generation_service = generation_gateway.local
        await generation_service.delete_generation(generation_id, user)
        return None
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except InvalidOperationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to delete generation {generation_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete generation: {str(e)}")


# ===== VALIDATE GENERATION CONFIG =====

@router.post("/generations/validate")
async def validate_generation_config(
    request: CreateGenerationRequest,
    user: CurrentUser,
):
    """
    Validate a generation configuration without creating it

    Returns validation errors, warnings, and suggestions.
    Useful for editor-time validation of Generation Nodes.
    """
    errors = []
    warnings = []
    suggestions = []

    try:
        if not request.config:
            errors.append("Generation config is required")
            return {
                "valid": False,
                "errors": errors,
                "warnings": warnings,
                "suggestions": suggestions,
            }

        config = request.config

        # Validate duration constraints
        if config.duration:
            if config.duration.min and config.duration.max and config.duration.min > config.duration.max:
                errors.append("Duration min cannot be greater than max")
            if config.duration.target and config.duration.min and config.duration.target < config.duration.min:
                errors.append("Duration target cannot be less than min")
            if config.duration.target and config.duration.max and config.duration.target > config.duration.max:
                errors.append("Duration target cannot be greater than max")

            # Warnings for unusual durations
            if config.duration.max and config.duration.max > 60:
                warnings.append("Duration max > 60s may be expensive")

        # Validate strategy + cost warnings
        if config.strategy == "always":
            warnings.append("Strategy 'always' regenerates on every playthrough - may be expensive")
            if config.duration.max and config.duration.max > 30:
                errors.append("Strategy 'always' with duration > 30s is not recommended")

        # Validate fallback configuration
        if config.fallback:
            if config.fallback.mode == "default_content" and not config.fallback.default_content_id:
                errors.append("Fallback mode 'default_content' requires default_content_id")
            if config.fallback.mode == "retry" and (not config.fallback.max_retries or config.fallback.max_retries < 1):
                errors.append("Fallback mode 'retry' requires max_retries >= 1")
            if config.fallback.timeout_ms and config.fallback.timeout_ms < 1000:
                errors.append("Fallback timeout must be at least 1000ms")

        # Validate constraints
        if config.constraints:
            if config.constraints.required_elements and config.constraints.avoid_elements:
                intersection = set(config.constraints.required_elements) & set(config.constraints.avoid_elements)
                if intersection:
                    errors.append(f"Elements cannot be both required and avoided: {', '.join(intersection)}")

        # Suggestions
        if not config.template_id and not request.prompt_version_id:
            suggestions.append("Consider specifying a template_id or prompt_version_id for consistent prompts")

        if config.strategy == "once" and not config.seed_source:
            suggestions.append("Strategy 'once' without seed_source may produce non-deterministic results")

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "suggestions": suggestions,
        }

    except Exception as e:
        logger.error(f"Validation error: {e}", exc_info=True)
        return {
            "valid": False,
            "errors": [f"Validation failed: {str(e)}"],
            "warnings": warnings,
            "suggestions": suggestions,
        }


# ===== BUILD SOCIAL CONTEXT =====

@router.post("/generations/social-context/build")
async def build_social_context(
    world_id: int = Query(..., description="World ID for schema lookup"),
    session_id: Optional[int] = Query(None, description="Game session ID for relationship state"),
    npc_id: Optional[str] = Query(None, description="NPC ID for relationship lookup"),
    user_max_rating: Optional[str] = Query(None, description="User's maximum content rating"),
    db: DatabaseSession = None,
    user: CurrentUser = None,
):
    """
    Build GenerationSocialContext from relationship state

    This helper endpoint builds social context from:
    - Relationship metrics (affinity, trust, chemistry, tension)
    - World schemas (relationship tiers, intimacy levels)
    - World and user content rating preferences

    Useful for frontend/game-core to get social context before creating a generation.

    Returns GenerationSocialContext dict with:
    - intimacyLevelId: Computed intimacy level ID
    - relationshipTierId: Computed relationship tier ID
    - intimacyBand: Simplified intimacy band
    - contentRating: Content rating (clamped by world/user)
    - worldMaxRating: World's max rating
    - userMaxRating: User's max rating (if provided)
    - relationshipValues: Raw relationship values used
    """
    try:
        context = await build_generation_social_context(
            db=db,
            world_id=world_id,
            session_id=session_id,
            npc_id=npc_id,
            user_max_rating=user_max_rating,
        )
        return context
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to build social context: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to build social context: {str(e)}")


# ===== PHASE 7: TELEMETRY ENDPOINTS =====

@router.get("/generations/telemetry/providers")
async def get_provider_health_metrics(
    user: CurrentUser
):
    """
    Get health metrics for all providers (Phase 7)

    Returns aggregated metrics including:
    - Success rates
    - Latency percentiles (p50, p95, p99)
    - Total costs and token usage
    - Error counts

    Useful for monitoring provider performance and debugging.
    """
    try:
        telemetry = GenerationTelemetryService()
        health_data = await telemetry.get_all_provider_health()
        return {"providers": health_data}
    except Exception as e:
        logger.error(f"Failed to get provider health: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get provider health: {str(e)}")


@router.get("/generations/telemetry/providers/{provider_id}")
async def get_provider_health(
    provider_id: str,
    user: CurrentUser
):
    """
    Get health metrics for a specific provider (Phase 7)

    Returns:
    - total_generations: Total number of generations
    - completed/failed: Success and failure counts
    - success_rate: Success rate (0.0 - 1.0)
    - latency_p50/p95/p99: Latency percentiles in seconds
    - total_tokens: Total tokens used
    - total_cost_usd: Total estimated cost
    - avg_cost_per_generation: Average cost per generation
    """
    try:
        telemetry = GenerationTelemetryService()
        health = await telemetry.get_provider_health(provider_id)
        return health
    except Exception as e:
        logger.error(f"Failed to get provider health for {provider_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get provider health: {str(e)}")


@router.get("/generations/telemetry/operations/{operation_type}")
async def get_operation_metrics(
    operation_type: OperationType,
    user: CurrentUser
):
    """
    Get metrics for a specific operation type (Phase 7)

    Returns similar structure to provider health, aggregated by operation type.
    """
    try:
        telemetry = GenerationTelemetryService()
        metrics = await telemetry.get_operation_metrics(operation_type)
        return metrics
    except Exception as e:
        logger.error(f"Failed to get operation metrics for {operation_type.value}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get operation metrics: {str(e)}")


@router.get("/generations/cache/stats")
async def get_cache_stats(
    user: CurrentUser
):
    """
    Get generation cache statistics (Phase 6)

    Returns:
    - total_cached_generations: Number of cached generations
    - redis_connected: Redis connection status
    """
    try:
        cache = GenerationCacheService()
        stats = await cache.get_cache_stats()
        return stats
    except Exception as e:
        logger.error(f"Failed to get cache stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get cache stats: {str(e)}")


# ===== CACHE MANAGEMENT ENDPOINTS =====

@router.delete("/generations/cache/{cache_key}")
async def invalidate_cache_key(
    cache_key: str,
    user: CurrentUser
):
    """
    Invalidate specific cache key

    Args:
        cache_key: Cache key to invalidate (e.g., from cache check response)

    Returns:
        Success status and whether key was deleted
    """
    try:
        cache = GenerationCacheService()
        deleted = await cache.invalidate_cache(cache_key)
        return {"success": True, "deleted": deleted, "cache_key": cache_key}
    except Exception as e:
        logger.error(f"Failed to invalidate cache key {cache_key}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to invalidate cache: {str(e)}")


@router.post("/generations/cache/check")
async def check_cache(
    request: Request,
    user: CurrentUser
):
    """
    Check if generation would be cached (without creating it)

    Request body should match CacheCheckRequest schema.

    Returns CacheCheckResponse with:
    - cached: boolean
    - generation_id: ID if cached
    - cache_key: computed cache key
    - ttl_seconds: remaining TTL if cached
    """
    try:
        from pixsim7.backend.main.shared.schemas.telemetry_schemas import CacheCheckRequest, CacheCheckResponse
        from pixsim7.backend.main.domain.enums import OperationType as OpType

        body = await request.json()
        check_req = CacheCheckRequest(**body)

        cache = GenerationCacheService()

        # Compute cache key
        cache_key = await cache.compute_cache_key(
            operation_type=OpType(check_req.operation_type),
            purpose=check_req.purpose,
            canonical_params=check_req.canonical_params,
            strategy=check_req.strategy,
            playthrough_id=check_req.playthrough_id,
            player_id=check_req.player_id,
            version=check_req.version,
        )

        # Check if cached
        generation_id = await cache.get_cached_generation(cache_key)

        # Get TTL if cached
        ttl_seconds = None
        if generation_id:
            from pixsim7.backend.main.infrastructure.redis import get_redis
            redis_client = await get_redis()
            ttl_seconds = await redis_client.ttl(cache_key)

        return CacheCheckResponse(
            cached=generation_id is not None,
            generation_id=generation_id,
            cache_key=cache_key,
            ttl_seconds=ttl_seconds if ttl_seconds and ttl_seconds > 0 else None,
        )

    except Exception as e:
        logger.error(f"Failed to check cache: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to check cache: {str(e)}")


# ===== REDIS HEALTH CHECK =====

@router.get("/health/redis")
async def redis_health_check():
    """
    Check Redis connection health

    Returns:
    - connected: boolean
    - latency_ms: ping latency in milliseconds
    """
    try:
        from pixsim7.backend.main.infrastructure.redis import get_redis
        import time

        redis_client = await get_redis()

        # Measure ping latency
        start = time.time()
        await redis_client.ping()
        latency_ms = (time.time() - start) * 1000

        return {
            "connected": True,
            "latency_ms": round(latency_ms, 2),
            "status": "healthy"
        }

    except Exception as e:
        logger.error(f"Redis health check failed: {e}")
        return {
            "connected": False,
            "latency_ms": None,
            "status": "unhealthy",
            "error": str(e)
        }


# ===== GENERATION TRACKING SCHEMAS =====


class ProviderSubmissionSummary(BaseModel):
    """Lightweight summary of a provider submission attempt."""

    submission_id: int
    provider_id: str
    provider_job_id: Optional[str] = None
    retry_attempt: int
    status: str
    submitted_at: Optional[str] = None
    responded_at: Optional[str] = None
    duration_ms: Optional[int] = None


class GenerationTrackingSummary(BaseModel):
    """Lightweight summary of a generation's lifecycle state."""

    id: int
    status: Optional[str] = None
    operation_type: Optional[str] = None
    provider_id: Optional[str] = None
    asset_id: Optional[int] = None
    priority: int = 5
    retry_count: int = 0
    error_message: Optional[str] = None
    error_code: Optional[str] = None
    final_prompt: Optional[str] = None
    prompt_source_type: Optional[str] = None
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    duration_seconds: Optional[float] = None


class ManifestSummary(BaseModel):
    """Lightweight summary of a generation batch item manifest."""

    asset_id: int
    batch_id: Optional[str] = None
    item_index: int = 0
    generation_id: Optional[int] = None
    block_template_id: Optional[str] = None
    template_slug: Optional[str] = None
    roll_seed: Optional[int] = None
    selected_block_ids: List[str] = Field(default_factory=list)
    slot_results: List[Dict[str, Any]] = Field(default_factory=list)
    assembled_prompt: Optional[str] = None
    prompt_version_id: Optional[str] = None
    mode: Optional[str] = None
    strategy: Optional[str] = None
    input_asset_ids: List[int] = Field(default_factory=list)
    created_at: Optional[str] = None


class AssetTrackingResponse(BaseModel):
    """Unified tracking view for a single asset."""

    asset_id: int
    generation: Optional[GenerationTrackingSummary] = None
    manifest: Optional[ManifestSummary] = None
    latest_submission: Optional[ProviderSubmissionSummary] = None
    consistency_warnings: List[str] = Field(default_factory=list)


class RunTrackingItemResponse(BaseModel):
    """Single item in a run tracking view (manifest + generation + submission)."""

    asset_id: int
    batch_id: Optional[str] = None
    item_index: int = 0
    generation_id: Optional[int] = None
    block_template_id: Optional[str] = None
    template_slug: Optional[str] = None
    roll_seed: Optional[int] = None
    selected_block_ids: List[str] = Field(default_factory=list)
    slot_results: List[Dict[str, Any]] = Field(default_factory=list)
    assembled_prompt: Optional[str] = None
    prompt_version_id: Optional[str] = None
    mode: Optional[str] = None
    strategy: Optional[str] = None
    input_asset_ids: List[int] = Field(default_factory=list)
    created_at: Optional[str] = None
    generation_status: Optional[str] = None
    generation_provider_id: Optional[str] = None
    generation_operation_type: Optional[str] = None
    latest_submission: Optional[ProviderSubmissionSummary] = None
    item_warnings: List[str] = Field(default_factory=list)


class RunSummary(BaseModel):
    """Summary metadata for a generation run."""

    run_id: str
    item_count: int
    created_at: Optional[str] = None
    first_item_index: int
    last_item_index: int


class RunTrackingResponse(BaseModel):
    """Unified tracking view for an entire generation run."""

    run: RunSummary
    items: List[RunTrackingItemResponse]
    consistency_warnings: List[str] = Field(default_factory=list)


class GenerationTrackingDetailResponse(BaseModel):
    """Unified tracking view for a single generation."""

    generation: GenerationTrackingSummary
    manifest: Optional[ManifestSummary] = None
    latest_submission: Optional[ProviderSubmissionSummary] = None
    consistency_warnings: List[str] = Field(default_factory=list)


# ===== GENERATION TRACKING ENDPOINTS =====


@router.get(
    "/generation-tracking/assets/{asset_id}",
    response_model=AssetTrackingResponse,
)
async def get_asset_tracking(
    asset_id: int,
    req: Request,
    user: CurrentUser,
    generation_gateway: GenerationGatewaySvc,
    tracking_service: GenerationTrackingSvc,
):
    """
    Unified tracking view for a single asset.

    Returns merged generation lifecycle, manifest provenance, and latest
    provider submission for the given asset. Includes consistency warnings
    for any data mismatches across the three source models.

    Auth: scoped to current user via asset ownership.
    """
    try:
        proxy = await generation_gateway.proxy(
            req,
            "GET",
            f"/api/v1/generation-tracking/assets/{asset_id}",
        )
        if proxy.called:
            return AssetTrackingResponse.model_validate(proxy.data)

        result = await tracking_service.get_asset_tracking(asset_id, user)
        if result is None:
            raise HTTPException(status_code=404, detail=f"Asset {asset_id} not found")
        return AssetTrackingResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get asset tracking for {asset_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get asset tracking: {str(e)}")


@router.get(
    "/generation-tracking/runs/{run_id}",
    response_model=RunTrackingResponse,
)
async def get_run_tracking(
    run_id: UUID,
    req: Request,
    user: CurrentUser,
    generation_gateway: GenerationGatewaySvc,
    tracking_service: GenerationTrackingSvc,
):
    """
    Unified tracking view for an entire generation run (batch).

    Returns run summary, ordered items (each with manifest fields, generation
    status, and latest provider submission), and consistency warnings at both
    run-level and item-level.

    Auth: scoped to current user via asset ownership of batch items.
    """
    try:
        proxy = await generation_gateway.proxy(
            req,
            "GET",
            f"/api/v1/generation-tracking/runs/{run_id}",
        )
        if proxy.called:
            return RunTrackingResponse.model_validate(proxy.data)

        result = await tracking_service.get_run_tracking(run_id, user)
        if result is None:
            raise HTTPException(status_code=404, detail=f"Generation run {run_id} not found")
        return RunTrackingResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get run tracking for {run_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get run tracking: {str(e)}")


@router.get(
    "/generation-tracking/generations/{generation_id}",
    response_model=GenerationTrackingDetailResponse,
)
async def get_generation_tracking(
    generation_id: int,
    req: Request,
    user: CurrentUser,
    generation_gateway: GenerationGatewaySvc,
    tracking_service: GenerationTrackingSvc,
):
    """
    Unified tracking view for a single generation.

    Returns generation details, linked manifest (if any), latest provider
    submission summary, and consistency warnings. Useful as a single
    debugging endpoint.

    Auth: scoped to generation owner or admin.
    """
    try:
        proxy = await generation_gateway.proxy(
            req,
            "GET",
            f"/api/v1/generation-tracking/generations/{generation_id}",
        )
        if proxy.called:
            return GenerationTrackingDetailResponse.model_validate(proxy.data)

        result = await tracking_service.get_generation_tracking(generation_id, user)
        if result is None:
            raise HTTPException(status_code=404, detail=f"Generation {generation_id} not found")
        return GenerationTrackingDetailResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get generation tracking for {generation_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to get generation tracking: {str(e)}"
        )
