"""
GenerationCreationService - Generation creation, validation, and canonicalization

Handles all generation creation logic including parameter validation, content rating
enforcement, prompt resolution, and ARQ job queueing.

Supports PromptVersion find-or-create: when a prompt is provided without an explicit
prompt_version_id, the service will find an existing PromptVersion by hash or create
a new one with prompt analysis.
"""
import logging
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from pixsim7.backend.main.domain import (
    Generation,
    GenerationStatus,
    OperationType,
    BillingState,
    User,
)
from pixsim7.backend.main.domain.prompt import PromptVersion
from pixsim7.backend.main.shared.errors import (
    QuotaError,
    InvalidOperationError,
    NoAccountAvailableError,
)
from pixsim7.backend.main.infrastructure.events.bus import event_bus, JOB_CREATED
from pixsim7.backend.main.services.user.user_service import UserService
from pixsim7.backend.main.shared.content_rating import RATING_ORDER
from pixsim7.backend.main.services.generation.cache import GenerationCacheService
from pixsim7.backend.main.services.generation.preferences_fetcher import fetch_world_meta, fetch_user_preferences
from pixsim7.backend.main.shared.debug import DebugLogger
from pixsim7.backend.main.shared.schemas.entity_ref import EntityRef
from pixsim7.backend.main.shared.asset_refs import extract_asset_id, extract_asset_ref
from pixsim7.backend.main.shared.composition_assets import coerce_composition_assets
from pixsim7.backend.main.domain import relation_types

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


# ============================================================================
# Role → Relation Type Mapping
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


class GenerationCreationService:
    """
    Generation creation service

    Handles:
    - Generation creation with quota checks
    - Parameter validation and canonicalization
    - Content rating validation/clamping
    - Prompt resolution and variable substitution
    - ARQ job queueing
    """

    def __init__(self, db: AsyncSession, user_service: UserService):
        self.db = db
        self.users = user_service
        self.cache = GenerationCacheService()

    async def find_or_create_prompt_version(
        self,
        prompt_text: str,
        author: Optional[str] = None,
        analyzer_id: Optional[str] = None,
        precomputed_analysis: Optional[Dict[str, Any]] = None,
        user_id: Optional[int] = None,
    ) -> Tuple[PromptVersion, bool]:
        """
        Find existing PromptVersion by hash or create new one with analysis.

        Delegates to PromptAnalysisService for the actual work.

        Args:
            prompt_text: The prompt text to find or create
            author: Optional author identifier
            analyzer_id: Analyzer ID (default: prompt:simple). Set to None
                when providing precomputed_analysis.
            precomputed_analysis: Pre-computed analysis from block composition.
                If provided, skips analyzer call. Must match analyzer output shape.
            user_id: Optional user ID for LLM credential resolution

        Returns:
            Tuple of (PromptVersion, created) where created is True if new
        """
        from pixsim7.backend.main.services.prompt.analysis import PromptAnalysisService

        service = PromptAnalysisService(self.db)
        return await service.analyze_and_attach_version(
            text=prompt_text,
            analyzer_id=analyzer_id,
            author=author,
            precomputed_analysis=precomputed_analysis,
            user_id=user_id,
        )

    async def create_generation(
        self,
        user: User,
        operation_type: OperationType,
        provider_id: str,
        params: Dict[str, Any],
        workspace_id: Optional[int] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        priority: int = 5,
        scheduled_at: Optional[datetime] = None,
        parent_generation_id: Optional[int] = None,
        prompt_version_id: Optional[UUID] = None,
        force_new: bool = False,
        analyzer_id: Optional[str] = None,
        preferred_account_id: Optional[int] = None,
    ) -> Generation:
        """
        Create new generation with canonicalization and prompt versioning

        Args:
            user: User creating the generation
            operation_type: Operation type
            provider_id: Target provider
            params: Raw generation parameters (from API request)
            workspace_id: Optional workspace
            name: Optional generation name
            description: Optional description
            priority: Generation priority (0=highest, 10=lowest)
            scheduled_at: Optional schedule time
            parent_generation_id: Optional parent generation (for retries)
            prompt_version_id: Optional prompt version to use

        Returns:
            Created generation

        Raises:
            QuotaError: User exceeded quotas
            InvalidOperationError: Invalid operation or parameters
        """
        # Check user quota
        await self.users.check_can_create_job(user)

        # Validate provider exists and supports operation
        from pixsim7.backend.main.domain.providers.registry import registry

        try:
            provider = registry.get(provider_id)
        except Exception:
            raise InvalidOperationError(f"Provider '{provider_id}' not found or not registered")

        # Check if provider supports the operation
        if operation_type not in provider.supported_operations:
            raise InvalidOperationError(
                f"Provider '{provider_id}' does not support operation '{operation_type.value}'. "
                f"Supported operations: {[op.value for op in provider.supported_operations]}"
            )

        # Validate parameters (basic validation)
        if not params:
            raise InvalidOperationError("Generation parameters are required")

        # Check if params use structured format (from unified generations API)
        # Structured format has keys: generation_config, scene_context, player_context, social_context
        is_structured = 'generation_config' in params or 'scene_context' in params

        # Reject legacy flat payloads - structured format is required
        if not is_structured:
            raise InvalidOperationError(
                "Structured generation_config is required. "
                "Legacy flat payload format (top-level prompt, quality, duration) is no longer supported. "
                "Please use the structured format with generation_config, scene_context, etc. "
                "See POST /api/v1/generations for the expected schema."
            )

        # Extract generation_config for strategy/purpose and introspection
        raw_gen_config = params.get("generation_config") or {}
        if not isinstance(raw_gen_config, dict):
            raw_gen_config = {}
        generation_config_for_cache = raw_gen_config

        logger.info(f"Structured params detected for {operation_type.value}")

        # Validate operation-specific required fields for structured params
        self._validate_structured_params(operation_type, raw_gen_config, params)

        # === PHASE 8: Content Rating Enforcement ===
        # Validate content rating against world/user constraints
        if params.get("social_context"):
            # Fetch world_meta from database
            player_context = params.get("player_context") or {}
            if not isinstance(player_context, dict):
                player_context = {}
            world_id = player_context.get("world_id")

            world_meta = None
            if world_id:
                world_meta = await fetch_world_meta(self.db, world_id)

            # Fetch user preferences from database
            user_preferences = await fetch_user_preferences(self.db, user.id)

            # Validate content rating
            is_valid, violation_msg, clamped_context = self._validate_content_rating(
                params,
                world_meta=world_meta,
                user_preferences=user_preferences
            )

            if not is_valid:
                # Unclampable violation - reject the request
                logger.error(f"Content rating violation: {violation_msg}")
                raise InvalidOperationError(f"Content rating violation: {violation_msg}")

            if clamped_context:
                # Apply clamped context and log for dev tools
                params = params.copy()
                params["social_context"] = clamped_context
                logger.info(f"Content rating clamped: {violation_msg}")
                # TODO: Emit event for dev tools to track violations
                # await event_bus.publish(CONTENT_RATING_CLAMPED, {
                #     "generation_id": ...,  # Will be available after creation
                #     "violation": violation_msg,
                #     "original_rating": clamped_context.get("_originalRating"),
                #     "clamped_rating": clamped_context.get("contentRating"),
                # })

        # Canonicalize params (using existing parameter mappers)
        canonical_params = await self._canonicalize_params(
            params, operation_type, provider_id
        )

        # Fetch user preferences for validation settings
        # (may already be fetched above for content rating, but fetch_user_preferences is idempotent)
        user_prefs = await fetch_user_preferences(self.db, user.id) or {}
        validate_vocabs = user_prefs.get("validateCompositionVocabs", False)

        # Derive inputs from params
        inputs = self._extract_inputs(params, operation_type, validate_vocabs=validate_vocabs)

        # Compute both hashes:
        # - dedup_hash includes seed (avoid collapsing explicit seed variations)
        # - reproducible_hash ignores seed (sibling grouping across variations)
        dedup_hash = Generation.compute_hash(
            canonical_params,
            inputs,
            include_seed=True,
        )
        reproducible_hash = Generation.compute_hash(
            canonical_params,
            inputs,
            include_seed=False,
        )

        # === PHASE 6: Caching & Deduplication ===
        # Initialize debug logger from user preferences
        debug = DebugLogger(user)

        # Skip dedup if force_new is True (for creating variations/versions)
        if not force_new:
            # Check for duplicate generation by hash
            debug.generation(f"Looking up dedup hash: {dedup_hash[:16]}...")
            existing_generation_id = await self.cache.find_by_hash(dedup_hash)
            debug.generation(f"Hash lookup result: {existing_generation_id}")
            if existing_generation_id:
                result = await self.db.execute(
                    select(Generation).where(Generation.id == existing_generation_id)
                )
                existing_generation = result.scalar_one_or_none()
                # Only return if exists and not in terminal failed state
                # Failed generations should be allowed to retry with new submission
                if existing_generation:
                    # Handle both enum and string status (SQLModel may return either)
                    from pixsim7.backend.main.services.generation.helpers import get_status_value
                    status_value = get_status_value(existing_generation.status)
                    debug.generation(f"Found generation {existing_generation.id}, status={status_value}")
                    if status_value != "failed":
                        debug.generation(f"Returning existing (not failed)")
                        logger.info(f"Deduplication: Returning existing generation {existing_generation.id} (status={status_value})")
                        return existing_generation
                    else:
                        debug.generation(f"Skipping failed generation, will create new")
                        logger.info(f"Deduplication: Skipping failed generation {existing_generation.id}, allowing retry")
        else:
            debug.generation(f"force_new=True, skipping dedup")

        # Check cache based on strategy (use raw generation_config)
        generation_config = generation_config_for_cache
        strategy = generation_config.get("strategy", "once")
        purpose = generation_config.get("purpose", "unknown")
        debug.generation(f"strategy={strategy}, purpose={purpose}, force_new={force_new}")

        # Pre-compute cache key if caching is enabled (reused for lookup and store)
        cache_key = None
        if strategy != "always" and not force_new:
            cache_key = await self._compute_generation_cache_key(
                user=user,
                operation_type=operation_type,
                purpose=purpose,
                canonical_params=canonical_params,
                strategy=strategy,
                params=params,
            )
            debug.generation(f"cache_key={cache_key[:50]}...")

            # Check cache
            cached_generation_id = await self.cache.get_cached_generation(cache_key)
            debug.generation(f"cached_generation_id={cached_generation_id}")
            if cached_generation_id:
                result = await self.db.execute(
                    select(Generation).where(Generation.id == cached_generation_id)
                )
                cached_generation = result.scalar_one_or_none()
                if cached_generation:
                    # Skip failed generations - allow retry with new params
                    from pixsim7.backend.main.services.generation.helpers import get_status_value
                    status_value = get_status_value(cached_generation.status)
                    if status_value == "failed":
                        debug.generation(f"Skipping failed cached generation {cached_generation_id}")
                        logger.info(f"Cache: Skipping failed generation {cached_generation_id}, allowing retry")
                        # Invalidate the cache entry
                        await self.cache.invalidate_cache(cache_key)
                    else:
                        logger.info(f"Cache HIT: Returning cached generation {cached_generation_id}")
                        debug.generation(f"Cache HIT! Returning cached generation {cached_generation_id}")
                        return cached_generation

        # === Estimate credits for billing ===
        estimated_credits = self._estimate_credits(
            operation_type=operation_type,
            provider_id=provider_id,
            canonical_params=canonical_params,
        )

        # Optional fail-fast: check if user has an account with sufficient credits
        # This is a soft check - actual credit deduction happens in status_poller
        if estimated_credits is not None and estimated_credits > 0:
            has_credits = await self._check_sufficient_credits(
                user_id=user.id,
                provider_id=provider_id,
                required_credits=estimated_credits,
            )
            if not has_credits:
                logger.warning(
                    "insufficient_credits_fail_fast",
                    extra={
                        "user_id": user.id,
                        "provider_id": provider_id,
                        "estimated_credits": estimated_credits,
                    }
                )
                raise QuotaError(
                    f"No account with sufficient credits ({estimated_credits}) "
                    f"available for provider '{provider_id}'"
                )

        # Resolve or create prompt version
        final_prompt = None
        if prompt_version_id:
            # Explicit version provided - resolve it
            final_prompt = await self._resolve_prompt(prompt_version_id, params)
        else:
            # No version provided - find or create from prompt text
            prompt_text = canonical_params.get("prompt")
            if prompt_text and isinstance(prompt_text, str) and prompt_text.strip():
                # Check if we have precomputed analysis from block composition
                # This avoids re-analyzing prompts that were built from blocks
                precomputed_analysis = canonical_params.get("derived_analysis")

                # Find or create PromptVersion by hash
                # If precomputed_analysis is present, skip analyzer
                prompt_version, created = await self.find_or_create_prompt_version(
                    prompt_text=prompt_text,
                    author=f"user:{user.id}",
                    analyzer_id=None if precomputed_analysis else analyzer_id,
                    precomputed_analysis=precomputed_analysis,
                    user_id=user.id,
                )
                prompt_version_id = prompt_version.id
                final_prompt = prompt_version.prompt_text

                if created:
                    source = "composition" if precomputed_analysis else "analyzer"
                    debug.generation(f"Created new PromptVersion {prompt_version_id} (source={source})")
                else:
                    debug.generation(f"Reusing existing PromptVersion {prompt_version_id}")

        # Create generation with billing fields
        # Note: credit_type is left None at creation - it will be determined
        # at billing time based on the account's available credits.
        generation = Generation(
            user_id=user.id,
            operation_type=operation_type,
            provider_id=provider_id,
            raw_params=params,
            canonical_params=canonical_params,
            inputs=inputs,
            reproducible_hash=reproducible_hash,
            prompt_version_id=prompt_version_id,
            final_prompt=final_prompt,
            workspace_id=workspace_id,
            name=name,
            description=description,
            priority=priority,
            scheduled_at=scheduled_at,
            parent_generation_id=parent_generation_id,
            preferred_account_id=preferred_account_id,
            status=GenerationStatus.PENDING,
            # Billing fields
            estimated_credits=estimated_credits,
            # credit_type=None - derived at billing time from account credits
            billing_state=BillingState.PENDING,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        self.db.add(generation)
        await self.db.commit()
        await self.db.refresh(generation)

        # Increment user's job count
        await self.users.increment_job_count(user)

        # === PHASE 6: Store hash for deduplication ===
        await self.cache.store_hash(dedup_hash, generation.id)

        # === PHASE 6: Cache generation if strategy permits ===
        if cache_key:
            # Note: We cache the generation ID immediately, even if not yet completed
            # This prevents duplicate requests during processing
            # Cache will be refreshed on completion in lifecycle service
            await self.cache.cache_generation(cache_key, generation.id, strategy)

        # Emit event for orchestration
        await event_bus.publish(JOB_CREATED, {
            "job_id": generation.id,  # Keep "job_id" for backward compatibility
            "generation_id": generation.id,
            "user_id": user.id,
            "operation_type": operation_type.value,
            "provider_id": provider_id,
            "params": canonical_params,  # Use canonical params for consistency
            "priority": priority,
        })

        # Queue generation for processing via ARQ
        try:
            debug.generation(f"Enqueuing generation {generation.id}...")
            from pixsim7.backend.main.infrastructure.redis import get_arq_pool
            arq_pool = await get_arq_pool()
            result = await arq_pool.enqueue_job(
                "process_generation",  # ARQ worker function (see workers/job_processor.py)
                generation_id=generation.id,
            )
            debug.generation(f"Enqueue result: {result}")
            logger.info(f"Generation {generation.id} queued for processing")
        except Exception as e:
            debug.generation(f"Failed to enqueue: {e}")
            logger.error(f"Failed to queue generation {generation.id}: {e}")
            # Don't fail generation creation if ARQ is down
            # Worker can pick it up later via scheduled polling

        return generation

    async def _compute_generation_cache_key(
        self,
        user: User,
        operation_type: OperationType,
        purpose: str,
        canonical_params: Dict[str, Any],
        strategy: str,
        params: Dict[str, Any],
    ) -> str:
        """
        Compute cache key for generation deduplication.

        Extracts player context from params and delegates to cache service.
        """
        player_context = params.get("player_context") or {}
        if not isinstance(player_context, dict):
            player_context = {}
        playthrough_id = player_context.get("playthrough_id")
        player_id = user.id

        return await self.cache.compute_cache_key(
            operation_type=operation_type,
            purpose=purpose,
            canonical_params=canonical_params,
            strategy=strategy,
            playthrough_id=playthrough_id,
            player_id=player_id,
            version=1,  # Can be incremented for cache invalidation
        )

    async def _canonicalize_params(
        self,
        params: Dict[str, Any],
        operation_type: OperationType,
        provider_id: str
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
                    "api_method", "pixverse_api_mode", "use_openapi"
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
        self._warn_legacy_asset_params(canonical, operation_type)

        logger.info(
            f"Canonicalized structured params for {provider_id}: "
            f"model={canonical.get('model')}, quality={canonical.get('quality')}, "
            f"duration={canonical.get('duration')}, off_peak={canonical.get('off_peak')}"
        )

        return canonical

    def _warn_legacy_asset_params(
        self,
        canonical: Dict[str, Any],
        operation_type: OperationType
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

        def _is_asset_ref_value(value: Any) -> bool:
            if value is None:
                return False
            if isinstance(value, list):
                return bool(value) and all(extract_asset_id(v) is not None for v in value)
            return extract_asset_id(value) is not None

        def _is_url_value(value: Any) -> bool:
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

    def _extract_inputs(
        self,
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
                inputs.extend(self._extract_composition_inputs(
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
                inputs.extend(self._extract_composition_inputs(
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
                inputs.extend(self._extract_composition_inputs(
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
                inputs.extend(self._extract_composition_inputs(
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
                inputs.extend(self._extract_composition_inputs(
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
                    scene_asset = self._extract_asset_from_scene(from_scene)
                    if scene_asset:
                        inputs.append({
                            "role": "transition_input",
                            "asset": scene_asset,
                            "sequence_order": 0,
                            "meta": {"scene_id": from_scene.get("id") if isinstance(from_scene, dict) else None}
                        })
                if to_scene:
                    scene_asset = self._extract_asset_from_scene(to_scene)
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
                scene_asset = self._extract_asset_from_scene(from_scene)
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

    def _parse_asset_input(
        self,
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

    def _extract_composition_inputs(
        self,
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

            asset_input = self._parse_asset_input(
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

    def _extract_asset_from_scene(self, scene: Any) -> Optional[str]:
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
            if value:
                if isinstance(value, int):
                    return f"asset:{value}"
                elif isinstance(value, str):
                    if value.startswith("asset:"):
                        return value
                    try:
                        asset_id = int(value)
                        return f"asset:{asset_id}"
                    except ValueError:
                        pass
                elif isinstance(value, dict) and value.get("type") == "asset":
                    return f"asset:{value['id']}"

        return None

    def _validate_structured_params(
        self,
        operation_type: OperationType,
        gen_config: Dict[str, Any],
        params: Dict[str, Any]
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

        def get_field(field_name: str) -> Any:
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

    def _validate_content_rating(
        self,
        params: Dict[str, Any],
        world_meta: Optional[Dict[str, Any]] = None,
        user_preferences: Optional[Dict[str, Any]] = None
    ) -> tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
        """
        Validate and optionally clamp content rating in generation request

        Enforces world and user content rating constraints according to Task 10 Phase 8.

        Args:
            params: Generation parameters (may contain social_context)
            world_meta: Optional world metadata with maxContentRating
            user_preferences: Optional user preferences with maxContentRating

        Returns:
            Tuple of (is_valid, violation_message, clamped_social_context)
            - is_valid: False if rating violation cannot be clamped
            - violation_message: Description of violation for logging
            - clamped_social_context: Modified social context with clamped rating (if clamping applied)
        """
        # Extract social context
        social_context = params.get("social_context")
        if not social_context:
            # No social context = no rating to validate
            return (True, None, None)

        content_rating = social_context.get("contentRating", "sfw")

        # Get constraints
        world_max_rating = None
        if world_meta:
            generation_config = world_meta.get("generation", {})
            world_max_rating = generation_config.get("maxContentRating")

        user_max_rating = None
        if user_preferences:
            user_max_rating = user_preferences.get("maxContentRating")

        # Validate content rating is in valid range
        if content_rating not in RATING_ORDER:
            return (False, f"Invalid content rating '{content_rating}' - must be one of {RATING_ORDER}", None)

        # Check world constraint
        if world_max_rating and world_max_rating in RATING_ORDER:
            if RATING_ORDER.index(content_rating) > RATING_ORDER.index(world_max_rating):
                # Violation: rating exceeds world maximum
                violation_msg = f"Content rating '{content_rating}' exceeds world maximum '{world_max_rating}'"

                # Clamp to world maximum
                clamped_context = social_context.copy()
                clamped_context["contentRating"] = world_max_rating
                clamped_context["_ratingClamped"] = True
                clamped_context["_originalRating"] = content_rating

                logger.warning(f"CONTENT_RATING_VIOLATION: {violation_msg} (clamped to '{world_max_rating}')")
                return (True, violation_msg, clamped_context)

        # Check user constraint (if stricter than world)
        if user_max_rating and user_max_rating in RATING_ORDER:
            if RATING_ORDER.index(content_rating) > RATING_ORDER.index(user_max_rating):
                # Violation: rating exceeds user maximum
                violation_msg = f"Content rating '{content_rating}' exceeds user maximum '{user_max_rating}'"

                # Clamp to user maximum
                clamped_context = social_context.copy()
                clamped_context["contentRating"] = user_max_rating
                clamped_context["_ratingClamped"] = True
                clamped_context["_originalRating"] = content_rating

                logger.warning(f"CONTENT_RATING_VIOLATION: {violation_msg} (clamped to '{user_max_rating}')")
                return (True, violation_msg, clamped_context)

        # No violations
        return (True, None, None)

    async def _resolve_prompt(
        self,
        prompt_version_id: UUID,
        params: Dict[str, Any]
    ) -> Optional[str]:
        """
        LEGACY: Resolve prompt from prompt version with variable substitution

        This is kept for backward compatibility. New code should use
        _resolve_prompt_config with structured prompt_config.

        Args:
            prompt_version_id: Prompt version to use
            params: Parameters for variable substitution

        Returns:
            Final prompt after substitution, or None if version not found
        """
        from pixsim7.backend.main.domain.prompt import PromptVersion

        result = await self.db.execute(
            select(PromptVersion).where(PromptVersion.id == prompt_version_id)
        )
        prompt_version = result.scalar_one_or_none()

        if not prompt_version:
            logger.warning(f"Prompt version {prompt_version_id} not found")
            return None

        # Simple variable substitution
        final_prompt = prompt_version.prompt_text

        # Replace {{variable}} with values from params
        for key, value in params.items():
            placeholder = f"{{{{{key}}}}}"
            if placeholder in final_prompt:
                final_prompt = final_prompt.replace(placeholder, str(value))

        return final_prompt

    async def _resolve_prompt_config(
        self,
        prompt_config: Dict[str, Any]
    ) -> tuple[Optional[str], Optional[UUID], str]:
        """
        Resolve prompt from structured prompt_config

        This is the new canonical way to resolve prompts, supporting:
        - Direct version ID reference
        - Family ID with auto-select latest
        - Variable substitution
        - Inline prompts (deprecated, for testing only)

        Args:
            prompt_config: Structured configuration:
                {
                    "versionId": "uuid",         // Specific version
                    "familyId": "uuid",          // Family with auto-select
                    "autoSelectLatest": true,    // Use latest version
                    "variables": {...},          // Template variables
                    "inlinePrompt": "..."        // DEPRECATED: inline prompt
                }

        Returns:
            Tuple of (final_prompt, prompt_version_id, source_type)
            source_type is one of: "versioned", "inline", "unknown"
        """
        from pixsim7.backend.main.domain.prompt import PromptVersion, PromptFamily

        # Check for inline prompt (deprecated path)
        if "inlinePrompt" in prompt_config and prompt_config["inlinePrompt"]:
            logger.warning("Using deprecated inline prompt - use versioned prompts instead")
            return prompt_config["inlinePrompt"], None, "inline"

        # Get variables for substitution
        variables = prompt_config.get("variables", {})

        # Path 1: Direct version ID
        if "versionId" in prompt_config and prompt_config["versionId"]:
            version_id = UUID(prompt_config["versionId"]) if isinstance(prompt_config["versionId"], str) else prompt_config["versionId"]

            result = await self.db.execute(
                select(PromptVersion).where(PromptVersion.id == version_id)
            )
            prompt_version = result.scalar_one_or_none()

            if not prompt_version:
                logger.error(f"Prompt version {version_id} not found")
                return None, None, "unknown"

            final_prompt = self._substitute_variables(prompt_version.prompt_text, variables)
            return final_prompt, prompt_version.id, "versioned"

        # Path 2: Family ID with auto-select latest
        if "familyId" in prompt_config and prompt_config["familyId"]:
            family_id = UUID(prompt_config["familyId"]) if isinstance(prompt_config["familyId"], str) else prompt_config["familyId"]
            auto_select = prompt_config.get("autoSelectLatest", True)

            if not auto_select:
                logger.warning(f"familyId provided but autoSelectLatest=false - no version specified")
                return None, None, "unknown"

            # Get latest version from family (highest version_number)
            result = await self.db.execute(
                select(PromptVersion)
                .where(PromptVersion.family_id == family_id)
                .order_by(PromptVersion.version_number.desc())
                .limit(1)
            )
            prompt_version = result.scalar_one_or_none()

            if not prompt_version:
                logger.error(f"No versions found for prompt family {family_id}")
                return None, None, "unknown"

            logger.info(f"Auto-selected prompt version {prompt_version.id} (v{prompt_version.version_number}) from family {family_id}")

            final_prompt = self._substitute_variables(prompt_version.prompt_text, variables)
            return final_prompt, prompt_version.id, "versioned"

        # No valid prompt source
        logger.warning("prompt_config has no versionId, familyId, or inlinePrompt")
        return None, None, "unknown"

    def _substitute_variables(self, prompt_text: str, variables: Dict[str, Any]) -> str:
        """
        Substitute template variables in prompt text

        Replaces {{variable_name}} with values from variables dict.
        Supports simple substitution and basic formatting.

        Args:
            prompt_text: Prompt text with {{variable}} placeholders
            variables: Dict of variable values

        Returns:
            Prompt text with variables substituted
        """
        final_prompt = prompt_text

        # Replace {{variable}} with values from variables dict
        for key, value in variables.items():
            placeholder = f"{{{{{key}}}}}"
            if placeholder in final_prompt:
                final_prompt = final_prompt.replace(placeholder, str(value))

        return final_prompt

    def _estimate_credits(
        self,
        operation_type: OperationType,
        provider_id: str,
        canonical_params: Dict[str, Any],
    ) -> Optional[int]:
        """
        Estimate credits required for a generation based on params.

        Delegates to the provider adapter for provider-specific pricing logic.

        Args:
            operation_type: Operation type
            provider_id: Provider identifier
            canonical_params: Canonicalized generation parameters

        Returns:
            Estimated credits or None if cannot be determined
        """
        from pixsim7.backend.main.domain.providers.registry import registry

        try:
            provider = registry.get(provider_id)
            return provider.estimate_credits(operation_type, canonical_params)
        except KeyError:
            logger.warning(
                "provider_not_found_for_credit_estimation",
                extra={"provider_id": provider_id}
            )
            return None

    async def _check_sufficient_credits(
        self,
        user_id: int,
        provider_id: str,
        required_credits: int,
    ) -> bool:
        """
        Check if user has access to an account with sufficient credits.

        This is a fail-fast check to reject generations that would fail
        due to insufficient credits. If credits are stale/unknown for all
        accounts, skip the fail-fast rejection and let the worker validate.

        Args:
            user_id: User ID
            provider_id: Provider identifier
            required_credits: Minimum credits required

        Returns:
            True if an account with sufficient credits exists, or credits are
            stale/unknown for all accounts.
        """
        from pixsim7.backend.main.services.account import AccountService

        account_service = AccountService(self.db)
        try:
            # Try to select an account with sufficient credits
            await account_service.select_account(
                provider_id=provider_id,
                user_id=user_id,
                required_credits=required_credits,
            )
            return True
        except NoAccountAvailableError:
            # If we have no accounts at all, this is a real failure.
            accounts = await account_service.list_accounts(
                provider_id=provider_id,
                user_id=user_id,
                include_shared=True,
            )
            if not accounts:
                return False

            # If credits haven't been synced recently for any account,
            # skip fail-fast so the worker can refresh and decide.
            from datetime import datetime, timezone, timedelta

            stale_cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
            has_recent_sync = False

            for account in accounts:
                metadata = account.provider_metadata or {}
                synced_at_raw = metadata.get("credits_synced_at")
                if not synced_at_raw:
                    continue
                try:
                    synced_at = datetime.fromisoformat(str(synced_at_raw).replace("Z", "+00:00"))
                except ValueError:
                    continue
                if synced_at >= stale_cutoff:
                    has_recent_sync = True
                    break

            if not has_recent_sync:
                logger.info(
                    "credits_unverified_skip_fail_fast",
                    extra={
                        "user_id": user_id,
                        "provider_id": provider_id,
                        "required_credits": required_credits,
                    },
                )
                return True

            return False
