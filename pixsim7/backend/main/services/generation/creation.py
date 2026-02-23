"""
GenerationCreationService - Generation creation, validation, and canonicalization

Handles all generation creation logic including parameter validation, content rating
enforcement, prompt resolution, and ARQ job queueing.

Supports PromptVersion find-or-create: when a prompt is provided without an explicit
prompt_version_id, the service will find an existing PromptVersion by hash or create
a new one with prompt analysis.

Implementation is split across creation_helpers/ for maintainability:
- inputs: Asset/composition input parsing, lineage metadata, role mapping
- params: Parameter canonicalization, legacy warnings, structured validation
- prompts: Prompt resolution, variable substitution
- rating: Content rating validation and clamping
- credits: Credit estimation and sufficiency checks
- cache: Cache key computation
"""
import logging
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from pixsim7.backend.main.domain import (
    Generation,
    GenerationStatus,
    OperationType,
    BillingState,
    User,
    ProviderAccount,
)
from pixsim7.backend.main.domain.prompt import PromptVersion
from pixsim7.backend.main.shared.errors import (
    QuotaError,
    InvalidOperationError,
    NoAccountAvailableError,
)
from pixsim7.backend.main.infrastructure.events.bus import event_bus, JOB_CREATED
from pixsim7.backend.main.services.user.user_service import UserService
from pixsim7.backend.main.services.generation.cache import GenerationCacheService
from pixsim7.backend.main.services.generation.preferences_fetcher import fetch_world_meta, fetch_user_preferences
from pixsim7.backend.main.shared.debug import DebugLogger
from pixsim7.backend.main.infrastructure.queue import (
    set_generation_wait_metadata,
    enqueue_generation_fresh_job,
    enqueue_generation_retry_job,
    release_generation_enqueue_lease,
    GENERATION_RETRY_QUEUE_NAME,
)

# Import helper modules
from pixsim7.backend.main.services.generation.creation_helpers.inputs import (
    # Constants (re-exported for backward compatibility)
    COMPOSITION_VOCAB_FIELDS,
    COMPOSITION_FREEFORM_FIELDS,
    LINEAGE_FIELDS,
    COMPOSITION_META_FIELDS,
    ROLE_TO_RELATION_TYPE,
    # Public functions (re-exported for backward compatibility)
    validate_composition_vocab_fields,
    get_relation_type_for_role,
    _extract_composition_metadata,
    # Extracted class method implementations
    extract_inputs as _extract_inputs_impl,
    parse_asset_input as _parse_asset_input_impl,
    extract_composition_inputs as _extract_composition_inputs_impl,
    extract_asset_from_scene as _extract_asset_from_scene_impl,
)
from pixsim7.backend.main.services.generation.creation_helpers.params import (
    canonicalize_params as _canonicalize_params_impl,
    warn_legacy_asset_params as _warn_legacy_asset_params_impl,
    validate_structured_params as _validate_structured_params_impl,
)
from pixsim7.backend.main.services.generation.creation_helpers.prompts import (
    resolve_prompt as _resolve_prompt_impl,
    resolve_prompt_config as _resolve_prompt_config_impl,
    substitute_variables as _substitute_variables_impl,
)
from pixsim7.backend.main.services.generation.creation_helpers.rating import (
    validate_content_rating as _validate_content_rating_impl,
)
from pixsim7.backend.main.services.generation.creation_helpers.credits import (
    estimate_credits as _estimate_credits_impl,
    check_sufficient_credits as _check_sufficient_credits_impl,
)
from pixsim7.backend.main.services.generation.creation_helpers.cache import (
    compute_generation_cache_key as _compute_generation_cache_key_impl,
)

logger = logging.getLogger(__name__)

# Keep pinned jobs eligible quickly; release_account() will wake them early
# when capacity opens, so long fixed holds tend to underfill provider slots.
PINNED_CREATION_CAPACITY_DEFER_SECONDS = 2


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
            enqueued_deferred = False
            if (
                generation.preferred_account_id
                and (
                    generation.scheduled_at is None
                    or generation.scheduled_at <= datetime.now(timezone.utc)
                )
            ):
                pref_account = await self.db.get(ProviderAccount, generation.preferred_account_id)
                if (
                    pref_account
                    and pref_account.provider_id == generation.provider_id
                    and pref_account.status == "active"
                    and int(pref_account.max_concurrent_jobs or 0) > 0
                    and int(pref_account.current_processing_jobs or 0) >= int(pref_account.max_concurrent_jobs or 0)
                ):
                    now = datetime.now(timezone.utc)
                    generation.scheduled_at = now + timedelta(seconds=PINNED_CREATION_CAPACITY_DEFER_SECONDS)
                    generation.updated_at = now
                    await self.db.commit()
                    await self.db.refresh(generation)
                    try:
                        await set_generation_wait_metadata(
                            arq_pool,
                            generation.id,
                            reason="pinned_account_capacity_wait",
                            account_id=pref_account.id,
                            next_attempt_at=generation.scheduled_at,
                            source="creation",
                        )
                    except Exception:
                        # Fail open: the DB hold is still sufficient; metadata is
                        # for observability/dispatch hints only.
                        logger.debug(
                            "generation_wait_meta_set_failed",
                            generation_id=generation.id,
                            account_id=pref_account.id,
                            exc_info=True,
                        )
                    logger.info(
                        "generation_waiting_pinned_capacity_on_create",
                        generation_id=generation.id,
                        account_id=pref_account.id,
                        current_jobs=pref_account.current_processing_jobs,
                        max_jobs=pref_account.max_concurrent_jobs,
                        defer_seconds=PINNED_CREATION_CAPACITY_DEFER_SECONDS,
                        base_defer_seconds=PINNED_CREATION_CAPACITY_DEFER_SECONDS,
                        target_queue=None,
                    )
                    try:
                        enqueue_result = await enqueue_generation_retry_job(
                            arq_pool,
                            generation.id,
                            defer_seconds=PINNED_CREATION_CAPACITY_DEFER_SECONDS,
                        )
                        if enqueue_result.get("enqueued"):
                            await release_generation_enqueue_lease(arq_pool, generation.id)
                        logger.debug(
                            "generation_waiting_pinned_capacity_on_create_safety_enqueued",
                            generation_id=generation.id,
                            account_id=pref_account.id,
                            defer_seconds=PINNED_CREATION_CAPACITY_DEFER_SECONDS,
                            actual_defer_seconds=enqueue_result.get("actual_defer_seconds"),
                            enqueue_deduped=bool(enqueue_result.get("deduped")),
                            lease_released_for_early_wake=bool(enqueue_result.get("enqueued")),
                            target_queue=GENERATION_RETRY_QUEUE_NAME,
                        )
                    except Exception:
                        logger.debug(
                            "generation_waiting_pinned_capacity_on_create_safety_enqueue_failed",
                            generation_id=generation.id,
                            account_id=pref_account.id,
                            exc_info=True,
                        )
                    enqueued_deferred = True

            if not enqueued_deferred:
                result = await enqueue_generation_fresh_job(arq_pool, generation.id)
                logger.info(f"Generation {generation.id} queued for processing")
            else:
                result = None
                logger.info(f"Generation {generation.id} held before processing (pinned account at capacity)")
            debug.generation(f"Enqueue result: {result}")
        except Exception as e:
            debug.generation(f"Failed to enqueue: {e}")
            logger.error(f"Failed to queue generation {generation.id}: {e}")
            # Don't fail generation creation if ARQ is down
            # Worker can pick it up later via scheduled polling

        return generation

    # ====================================================================
    # Delegate methods - preserve original method signatures, delegate to
    # helper modules for implementation.
    # ====================================================================

    async def _compute_generation_cache_key(
        self,
        user: User,
        operation_type: OperationType,
        purpose: str,
        canonical_params: Dict[str, Any],
        strategy: str,
        params: Dict[str, Any],
    ) -> str:
        """Compute cache key for generation deduplication."""
        return await _compute_generation_cache_key_impl(
            cache_service=self.cache,
            user=user,
            operation_type=operation_type,
            purpose=purpose,
            canonical_params=canonical_params,
            strategy=strategy,
            params=params,
        )

    async def _canonicalize_params(
        self,
        params: Dict[str, Any],
        operation_type: OperationType,
        provider_id: str
    ) -> Dict[str, Any]:
        """Canonicalize structured parameters from unified generations API."""
        return _canonicalize_params_impl(params, operation_type, provider_id)

    def _warn_legacy_asset_params(
        self,
        canonical: Dict[str, Any],
        operation_type: OperationType
    ) -> None:
        """Log warning/error for legacy URL params usage."""
        _warn_legacy_asset_params_impl(canonical, operation_type)

    def _extract_inputs(
        self,
        params: Dict[str, Any],
        operation_type: OperationType,
        validate_vocabs: bool = False,
    ) -> List[Dict[str, Any]]:
        """Extract input references from structured params."""
        return _extract_inputs_impl(params, operation_type, validate_vocabs)

    def _parse_asset_input(
        self,
        value: Any,
        role: str,
        sequence_order: int,
        gen_config: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Parse an asset reference from various formats into a standardized input entry."""
        return _parse_asset_input_impl(value, role, sequence_order, gen_config)

    def _extract_composition_inputs(
        self,
        composition_assets: List[Any],
        gen_config: Dict[str, Any],
        validate_vocab: bool = False,
    ) -> List[Dict[str, Any]]:
        """Extract input references from composition assets."""
        return _extract_composition_inputs_impl(composition_assets, gen_config, validate_vocab)

    def _extract_asset_from_scene(self, scene: Any) -> Optional[str]:
        """Extract asset reference from a scene object."""
        return _extract_asset_from_scene_impl(scene)

    def _validate_structured_params(
        self,
        operation_type: OperationType,
        gen_config: Dict[str, Any],
        params: Dict[str, Any]
    ) -> None:
        """Validate operation-specific required fields for structured params."""
        _validate_structured_params_impl(operation_type, gen_config, params)

    def _validate_content_rating(
        self,
        params: Dict[str, Any],
        world_meta: Optional[Dict[str, Any]] = None,
        user_preferences: Optional[Dict[str, Any]] = None
    ) -> tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
        """Validate and optionally clamp content rating in generation request."""
        return _validate_content_rating_impl(params, world_meta, user_preferences)

    async def _resolve_prompt(
        self,
        prompt_version_id: UUID,
        params: Dict[str, Any]
    ) -> Optional[str]:
        """LEGACY: Resolve prompt from prompt version with variable substitution."""
        return await _resolve_prompt_impl(self.db, prompt_version_id, params)

    async def _resolve_prompt_config(
        self,
        prompt_config: Dict[str, Any]
    ) -> tuple[Optional[str], Optional[UUID], str]:
        """Resolve prompt from structured prompt_config."""
        return await _resolve_prompt_config_impl(self.db, prompt_config)

    def _substitute_variables(self, prompt_text: str, variables: Dict[str, Any]) -> str:
        """Substitute template variables in prompt text."""
        return _substitute_variables_impl(prompt_text, variables)

    def _estimate_credits(
        self,
        operation_type: OperationType,
        provider_id: str,
        canonical_params: Dict[str, Any],
    ) -> Optional[int]:
        """Estimate credits required for a generation based on params."""
        return _estimate_credits_impl(operation_type, provider_id, canonical_params)

    async def _check_sufficient_credits(
        self,
        user_id: int,
        provider_id: str,
        required_credits: int,
    ) -> bool:
        """Check if user has access to an account with sufficient credits."""
        return await _check_sufficient_credits_impl(
            self.db, user_id, provider_id, required_credits
        )
