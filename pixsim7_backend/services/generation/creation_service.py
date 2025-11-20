"""
GenerationCreationService - Generation creation, validation, and canonicalization

Handles all generation creation logic including parameter validation, content rating
enforcement, prompt resolution, and ARQ job queueing.
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from pixsim7_backend.domain import (
    Generation,
    GenerationStatus,
    OperationType,
    User,
)
from pixsim7_backend.shared.errors import (
    QuotaError,
    InvalidOperationError,
)
from pixsim7_backend.infrastructure.events.bus import event_bus, JOB_CREATED
from pixsim7_backend.services.user.user_service import UserService
from pixsim7_backend.services.generation.social_context_builder import RATING_ORDER

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
        from pixsim7_backend.services.provider.registry import registry

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

        # Check if params use new structured format (from unified generations API)
        # Structured format has keys: generation_config, scene_context, player_context, social_context
        is_structured = 'generation_config' in params or 'scene_context' in params

        if is_structured:
            # New structured format - validation handled by schema
            # Just verify we have the necessary context for the operation
            logger.info(f"Structured params detected for {operation_type.value}")
        else:
            # Legacy flat format - apply operation-specific validation
            if operation_type == OperationType.TEXT_TO_VIDEO:
                if 'prompt' not in params:
                    raise InvalidOperationError("'prompt' is required for text_to_video")
            elif operation_type == OperationType.IMAGE_TO_VIDEO:
                if 'prompt' not in params or 'image_url' not in params:
                    raise InvalidOperationError("'prompt' and 'image_url' are required for image_to_video")
            elif operation_type == OperationType.VIDEO_EXTEND:
                if 'video_url' not in params:
                    raise InvalidOperationError("'video_url' is required for video_extend")

        # === PHASE 8: Content Rating Enforcement ===
        # Validate content rating against world/user constraints
        if is_structured and params.get("social_context"):
            # Extract world_meta if available (may come from world lookup or be embedded in params)
            world_meta = None
            player_context = params.get("player_context", {})
            world_id = player_context.get("world_id")

            # Note: In a full implementation, we'd fetch world_meta from DB here
            # For now, assume world_meta is passed in params if available
            # This can be enhanced later to fetch from GameWorld model

            # Extract user preferences if available
            user_preferences = None  # Could be passed from frontend or fetched from user settings

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

        # Resolve prompt if version provided
        final_prompt = None
        if prompt_version_id:
            final_prompt = await self._resolve_prompt(prompt_version_id, params)

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
            from pixsim7_backend.infrastructure.redis import get_arq_pool
            arq_pool = await get_arq_pool()
            await arq_pool.enqueue_job(
                "process_generation",  # ARQ worker function (see workers/job_processor.py)
                generation_id=generation.id,
                _queue_name="default",
            )
            logger.info(f"Generation {generation.id} queued for processing")
        except Exception as e:
            logger.error(f"Failed to queue generation {generation.id}: {e}")
            # Don't fail generation creation if ARQ is down
            # Worker can pick it up later via scheduled polling

        return generation

    async def _canonicalize_params(
        self,
        params: Dict[str, Any],
        operation_type: OperationType,
        provider_id: str
    ) -> Dict[str, Any]:
        """
        Canonicalize parameters using parameter mappers

        This extracts common fields and normalizes them into a provider-agnostic format.
        Handles both legacy flat params and new structured params.
        """
        # Check if params are already structured (from unified generations API)
        is_structured = 'generation_config' in params or 'scene_context' in params

        if is_structured:
            # Already structured - return as-is
            # The structured format is already canonical
            logger.info("Params already structured, using as canonical")
            return params

        # Legacy flat params - canonicalize to common format
        # For now, just copy params as-is
        # In the full pipeline refactor, we'd use parameter mappers here
        # Example: from pixsim7_backend.services.submission.parameter_mappers import get_mapper
        # mapper = get_mapper(operation_type)
        # return mapper.canonicalize(params, provider_id)

        # Simple canonicalization for now
        canonical = {
            "prompt": params.get("prompt"),
            "negative_prompt": params.get("negative_prompt"),
            "quality": params.get("quality"),
            "duration": params.get("duration"),
            "aspect_ratio": params.get("aspect_ratio"),
            "seed": params.get("seed"),
            "model": params.get("model"),
        }

        # Add operation-specific fields
        if operation_type == OperationType.IMAGE_TO_VIDEO:
            canonical["image_url"] = params.get("image_url")
        elif operation_type == OperationType.VIDEO_EXTEND:
            canonical["video_url"] = params.get("video_url")

        # Remove None values
        return {k: v for k, v in canonical.items() if v is not None}

    def _extract_inputs(
        self,
        params: Dict[str, Any],
        operation_type: OperationType
    ) -> List[Dict[str, Any]]:
        """
        Extract input references from params

        Handles both legacy flat params and new structured params.

        Returns:
            List of input references like:
            [{"role": "seed_image", "remote_url": "https://..."}]
            [{"role": "source_video", "asset_id": 123}]
        """
        inputs = []

        # Check if structured format
        is_structured = 'generation_config' in params or 'scene_context' in params

        if is_structured:
            # Extract inputs from scene context
            scene_context = params.get("scene_context", {})
            from_scene = scene_context.get("from_scene")
            to_scene = scene_context.get("to_scene")

            # For transitions, both scenes are inputs
            if operation_type == OperationType.VIDEO_TRANSITION:
                if from_scene:
                    inputs.append({
                        "role": "from_scene",
                        "scene_id": from_scene.get("id"),
                        "metadata": from_scene
                    })
                if to_scene:
                    inputs.append({
                        "role": "to_scene",
                        "scene_id": to_scene.get("id"),
                        "metadata": to_scene
                    })
            # For image_to_video, from_scene might have an asset
            elif operation_type == OperationType.IMAGE_TO_VIDEO:
                if from_scene:
                    inputs.append({
                        "role": "seed_image",
                        "scene_id": from_scene.get("id"),
                        "metadata": from_scene
                    })

            return inputs

        # Legacy flat params format
        if operation_type == OperationType.IMAGE_TO_VIDEO:
            if "image_url" in params:
                inputs.append({
                    "role": "seed_image",
                    "remote_url": params["image_url"]
                })
            if "image_asset_id" in params:
                inputs.append({
                    "role": "seed_image",
                    "asset_id": params["image_asset_id"]
                })

        elif operation_type == OperationType.VIDEO_EXTEND:
            if "video_url" in params:
                inputs.append({
                    "role": "source_video",
                    "remote_url": params["video_url"]
                })
            if "video_asset_id" in params:
                inputs.append({
                    "role": "source_video",
                    "asset_id": params["video_asset_id"]
                })

        return inputs

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
        from pixsim7_backend.domain.prompt_versioning import PromptVersion

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
        from pixsim7_backend.domain.prompt_versioning import PromptVersion, PromptFamily

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
