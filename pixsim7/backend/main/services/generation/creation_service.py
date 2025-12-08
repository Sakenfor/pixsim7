"""
GenerationCreationService - Generation creation, validation, and canonicalization

Handles all generation creation logic including parameter validation, content rating
enforcement, prompt resolution, and ARQ job queueing.

Supports PromptVersion find-or-create: when a prompt is provided without an explicit
prompt_version_id, the service will find an existing PromptVersion by hash or create
a new one with prompt analysis.
"""
import logging
import hashlib
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from pixsim7.backend.main.domain import (
    Generation,
    GenerationStatus,
    OperationType,
    User,
)
from pixsim7.backend.main.domain.prompt_versioning import PromptVersion
from pixsim7.backend.main.shared.errors import (
    QuotaError,
    InvalidOperationError,
)
from pixsim7.backend.main.infrastructure.events.bus import event_bus, JOB_CREATED
from pixsim7.backend.main.services.user.user_service import UserService
from pixsim7.backend.main.services.generation.social_context_builder import RATING_ORDER
from pixsim7.backend.main.services.generation.cache_service import GenerationCacheService
from pixsim7.backend.main.services.generation.preferences_fetcher import fetch_world_meta, fetch_user_preferences
from pixsim7.backend.main.services.prompt_dsl_adapter import analyze_prompt
from pixsim7.backend.main.shared.debug import DebugLogger

logger = logging.getLogger(__name__)


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
    ) -> Tuple[PromptVersion, bool]:
        """
        Find existing PromptVersion by hash or create new one with analysis.

        This implements the PromptVersion-as-source-of-truth pattern:
        - Same prompt text → same PromptVersion (by hash)
        - Analysis computed once per unique prompt
        - One-off prompts have family_id = NULL

        Args:
            prompt_text: The prompt text to find or create
            author: Optional author identifier

        Returns:
            Tuple of (PromptVersion, created) where created is True if new
        """
        # Normalize and hash the prompt
        normalized = prompt_text.strip()
        prompt_hash = hashlib.sha256(normalized.encode('utf-8')).hexdigest()

        # Try to find existing by hash
        result = await self.db.execute(
            select(PromptVersion).where(PromptVersion.prompt_hash == prompt_hash)
        )
        existing = result.scalar_one_or_none()

        if existing:
            logger.debug(f"Found existing PromptVersion {existing.id} for hash {prompt_hash[:16]}...")
            return existing, False

        # Create new PromptVersion with analysis
        logger.info(f"Creating new PromptVersion for hash {prompt_hash[:16]}...")

        # Analyze the prompt
        try:
            analysis = await analyze_prompt(normalized)
            prompt_analysis = {
                "prompt": analysis.get("prompt", normalized),
                "blocks": analysis.get("blocks", []),
                "tags": analysis.get("tags", []),
            }
        except Exception as e:
            logger.warning(f"Failed to analyze prompt: {e}")
            prompt_analysis = {
                "prompt": normalized,
                "blocks": [],
                "tags": [],
            }

        # Create new version (one-off, no family)
        new_version = PromptVersion(
            prompt_text=normalized,
            prompt_hash=prompt_hash,
            prompt_analysis=prompt_analysis,
            family_id=None,  # One-off prompt
            version_number=None,  # No version tracking for one-offs
            author=author,
            created_at=datetime.utcnow(),
        )

        self.db.add(new_version)
        await self.db.flush()  # Get the ID without committing

        logger.info(f"Created PromptVersion {new_version.id} with {len(prompt_analysis.get('blocks', []))} blocks")
        return new_version, True

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
        from pixsim7.backend.main.services.provider.registry import registry

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

        # Derive inputs from params
        inputs = self._extract_inputs(params, operation_type)

        # Compute reproducible hash
        reproducible_hash = Generation.compute_hash(canonical_params, inputs)

        # === PHASE 6: Caching & Deduplication ===
        # Initialize debug logger from user preferences
        debug = DebugLogger(user)

        # Skip dedup if force_new is True (for creating variations/versions)
        if not force_new:
            # Check for duplicate generation by hash
            debug.generation(f"Looking up hash: {reproducible_hash[:16]}...")
            existing_generation_id = await self.cache.find_by_hash(reproducible_hash)
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
                    status_value = existing_generation.status.value if hasattr(existing_generation.status, 'value') else str(existing_generation.status)
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
                    status_value = cached_generation.status.value if hasattr(cached_generation.status, 'value') else str(cached_generation.status)
                    if status_value == "failed":
                        debug.generation(f"Skipping failed cached generation {cached_generation_id}")
                        logger.info(f"Cache: Skipping failed generation {cached_generation_id}, allowing retry")
                        # Invalidate the cache entry
                        await self.cache.invalidate_cache(cache_key)
                    else:
                        logger.info(f"Cache HIT: Returning cached generation {cached_generation_id}")
                        debug.generation(f"Cache HIT! Returning cached generation {cached_generation_id}")
                        return cached_generation

        # Resolve or create prompt version
        final_prompt = None
        if prompt_version_id:
            # Explicit version provided - resolve it
            final_prompt = await self._resolve_prompt(prompt_version_id, params)
        else:
            # No version provided - find or create from prompt text
            prompt_text = canonical_params.get("prompt")
            if prompt_text and isinstance(prompt_text, str) and prompt_text.strip():
                # Find or create PromptVersion by hash
                prompt_version, created = await self.find_or_create_prompt_version(
                    prompt_text=prompt_text,
                    author=f"user:{user.id}",
                )
                prompt_version_id = prompt_version.id
                final_prompt = prompt_version.prompt_text

                if created:
                    debug.generation(f"Created new PromptVersion {prompt_version_id}")
                else:
                    debug.generation(f"Reusing existing PromptVersion {prompt_version_id}")

        # Create generation
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
            status=GenerationStatus.PENDING,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        self.db.add(generation)
        await self.db.commit()
        await self.db.refresh(generation)

        # Increment user's job count
        await self.users.increment_job_count(user)

        # === PHASE 6: Store hash for deduplication ===
        await self.cache.store_hash(reproducible_hash, generation.id)

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
                    "motion_mode", "style", "template_id"
                ]:
                    if field in provider_style:
                        canonical[field] = provider_style[field]

        # Extract prompt from generation_config or params root
        prompt = gen_config.get("prompt") or params.get("prompt")
        if prompt:
            canonical["prompt"] = prompt

        # Extract operation-specific fields from generation_config
        if operation_type == OperationType.IMAGE_TO_VIDEO:
            image_url = gen_config.get("image_url") or params.get("image_url")
            if image_url:
                canonical["image_url"] = image_url

        elif operation_type == OperationType.IMAGE_TO_IMAGE:
            # Image-to-image may use a single image_url or a list of image_urls.
            image_url = gen_config.get("image_url") or params.get("image_url")
            image_urls = gen_config.get("image_urls") or params.get("image_urls")
            if image_urls:
                canonical["image_urls"] = image_urls
            elif image_url:
                canonical["image_urls"] = [image_url]

        elif operation_type == OperationType.VIDEO_EXTEND:
            video_url = gen_config.get("video_url") or params.get("video_url")
            if video_url:
                canonical["video_url"] = video_url
            original_video_id = gen_config.get("original_video_id") or params.get("original_video_id")
            if original_video_id:
                canonical["original_video_id"] = original_video_id

        elif operation_type == OperationType.VIDEO_TRANSITION:
            image_urls = gen_config.get("image_urls") or params.get("image_urls")
            prompts = gen_config.get("prompts") or params.get("prompts")
            if image_urls:
                canonical["image_urls"] = image_urls
            if prompts:
                canonical["prompts"] = prompts

        elif operation_type == OperationType.FUSION:
            fusion_assets = gen_config.get("fusion_assets") or params.get("fusion_assets")
            if fusion_assets:
                canonical["fusion_assets"] = fusion_assets

        # Preserve scene_context and other structured fields if present
        for context_key in ["scene_context", "player_context", "social_context"]:
            if context_key in params:
                canonical[context_key] = params[context_key]

        logger.info(
            f"Canonicalized structured params for {provider_id}: "
            f"model={canonical.get('model')}, quality={canonical.get('quality')}, "
            f"duration={canonical.get('duration')}, off_peak={canonical.get('off_peak')}"
        )

        return canonical

    def _extract_inputs(
        self,
        params: Dict[str, Any],
        operation_type: OperationType
    ) -> List[Dict[str, Any]]:
        """
        Extract input references from structured params.

        Extracts scene context information to create input references for
        deduplication and reproducibility tracking.

        Note: Only structured params are supported. Legacy flat params were removed in
        Task 128 (Drop Legacy Generation Payloads).

        Returns:
            List of input references like:
            [{"role": "from_scene", "scene_id": "...", "metadata": {...}}]
            [{"role": "seed_image", "scene_id": "...", "metadata": {...}}]
        """
        inputs = []

        # Extract inputs from scene context
        scene_context = params.get("scene_context", {})
        if not isinstance(scene_context, dict):
            scene_context = {}

        from_scene = scene_context.get("from_scene")
        to_scene = scene_context.get("to_scene")

        # For transitions, both scenes are inputs
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
        # For image_to_video, from_scene might have an asset
        elif operation_type == OperationType.IMAGE_TO_VIDEO:
            if from_scene:
                inputs.append({
                    "role": "seed_image",
                    "scene_id": from_scene.get("id") if isinstance(from_scene, dict) else None,
                    "metadata": from_scene
                })

        return inputs

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

        # IMAGE_TO_VIDEO requires image_url
        if operation_type == OperationType.IMAGE_TO_VIDEO:
            if not has_field("image_url"):
                raise InvalidOperationError(
                    "IMAGE_TO_VIDEO operation requires 'image_url' field in generation config"
                )

        # IMAGE_TO_IMAGE requires image_urls or image_url
        elif operation_type == OperationType.IMAGE_TO_IMAGE:
            image_urls = get_field("image_urls")
            image_url = get_field("image_url")

            if not image_urls and not image_url:
                raise InvalidOperationError(
                    "IMAGE_TO_IMAGE operation requires 'image_urls' (list) or 'image_url' (single URL)"
                )

            # If image_urls is provided, ensure it's non-empty
            if image_urls and (not isinstance(image_urls, list) or len(image_urls) == 0):
                raise InvalidOperationError(
                    "IMAGE_TO_IMAGE 'image_urls' must be a non-empty list"
                )

        # VIDEO_EXTEND requires video_url or original_video_id
        elif operation_type == OperationType.VIDEO_EXTEND:
            if not has_field("video_url") and not has_field("original_video_id"):
                raise InvalidOperationError(
                    "VIDEO_EXTEND operation requires 'video_url' or 'original_video_id'"
                )

        # VIDEO_TRANSITION requires image_urls and prompts with correct counts
        elif operation_type == OperationType.VIDEO_TRANSITION:
            image_urls = get_field("image_urls")
            prompts = get_field("prompts")

            if not image_urls or not isinstance(image_urls, list) or len(image_urls) < 2:
                raise InvalidOperationError(
                    "VIDEO_TRANSITION operation requires 'image_urls' list with at least 2 images"
                )

            if not prompts or not isinstance(prompts, list):
                raise InvalidOperationError(
                    "VIDEO_TRANSITION operation requires 'prompts' list"
                )

            expected_prompts = len(image_urls) - 1
            if len(prompts) != expected_prompts:
                raise InvalidOperationError(
                    f"VIDEO_TRANSITION requires exactly {expected_prompts} prompt(s) "
                    f"for {len(image_urls)} images, but got {len(prompts)}"
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
        from pixsim7.backend.main.domain.prompt_versioning import PromptVersion

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
        from pixsim7.backend.main.domain.prompt_versioning import PromptVersion, PromptFamily

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
