"""
GenerationService - unified generation creation and lifecycle management

Replaces JobService, integrating with the unified Generation model.
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from pixsim7_backend.domain import (
    Generation,
    JobStatus,
    OperationType,
    User,
    ProviderSubmission,
    ProviderAccount,
)
from pixsim7_backend.shared.errors import (
    ResourceNotFoundError,
    InvalidOperationError,
    QuotaError,
)
from pixsim7_backend.infrastructure.events.bus import event_bus, JOB_CREATED, JOB_STARTED, JOB_COMPLETED, JOB_FAILED, JOB_CANCELLED
from pixsim7_backend.services.user.user_service import UserService

logger = logging.getLogger(__name__)


class GenerationService:
    """
    Generation management service - replaces JobService

    Handles:
    - Generation creation with quota checks and canonicalization
    - Generation status tracking
    - Generation lifecycle management
    - Prompt versioning integration
    """

    def __init__(
        self,
        db: AsyncSession,
        user_service: UserService
    ):
        self.db = db
        self.users = user_service

    # ===== GENERATION CREATION =====

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

        # Operation-specific validation
        if operation_type == OperationType.TEXT_TO_VIDEO:
            if 'prompt' not in params:
                raise InvalidOperationError("'prompt' is required for text_to_video")
        elif operation_type == OperationType.IMAGE_TO_VIDEO:
            if 'prompt' not in params or 'image_url' not in params:
                raise InvalidOperationError("'prompt' and 'image_url' are required for image_to_video")
        elif operation_type == OperationType.VIDEO_EXTEND:
            if 'video_url' not in params:
                raise InvalidOperationError("'video_url' is required for video_extend")

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
            status=JobStatus.PENDING,
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
                "process_generation",  # New worker function name
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
        """
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

        Returns:
            List of input references like:
            [{"role": "seed_image", "remote_url": "https://..."}]
            [{"role": "source_video", "asset_id": 123}]
        """
        inputs = []

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

    async def _resolve_prompt(
        self,
        prompt_version_id: UUID,
        params: Dict[str, Any]
    ) -> Optional[str]:
        """
        Resolve prompt from prompt version with variable substitution

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

        # Simple variable substitution (you can make this more sophisticated)
        final_prompt = prompt_version.prompt_text

        # Replace {{variable}} with values from params
        for key, value in params.items():
            placeholder = f"{{{{{key}}}}}"
            if placeholder in final_prompt:
                final_prompt = final_prompt.replace(placeholder, str(value))

        return final_prompt

    # ===== GENERATION STATUS MANAGEMENT =====

    async def update_status(
        self,
        generation_id: int,
        status: JobStatus,
        error_message: Optional[str] = None
    ) -> Generation:
        """
        Update generation status

        Args:
            generation_id: Generation ID
            status: New status
            error_message: Optional error message (for failed generations)

        Returns:
            Updated generation

        Raises:
            ResourceNotFoundError: Generation not found
        """
        generation = await self.get_generation(generation_id)

        # Update status
        generation.status = status
        generation.updated_at = datetime.utcnow()

        # Update timestamps
        if status == JobStatus.PROCESSING and not generation.started_at:
            generation.started_at = datetime.utcnow()
        elif status in {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED}:
            generation.completed_at = datetime.utcnow()

        # Update error message
        if error_message:
            generation.error_message = error_message

        await self.db.commit()
        await self.db.refresh(generation)

        # Emit status change events (include user_id for WebSocket filtering)
        if status == JobStatus.PROCESSING:
            await event_bus.publish(JOB_STARTED, {
                "job_id": generation_id,
                "generation_id": generation_id,
                "user_id": generation.user_id,
                "status": status.value
            })
        elif status == JobStatus.COMPLETED:
            await event_bus.publish(JOB_COMPLETED, {
                "job_id": generation_id,
                "generation_id": generation_id,
                "user_id": generation.user_id,
                "status": status.value
            })
        elif status == JobStatus.FAILED:
            await event_bus.publish(JOB_FAILED, {
                "job_id": generation_id,
                "generation_id": generation_id,
                "user_id": generation.user_id,
                "status": status.value,
                "error": error_message
            })
        elif status == JobStatus.CANCELLED:
            await event_bus.publish(JOB_CANCELLED, {
                "job_id": generation_id,
                "generation_id": generation_id,
                "user_id": generation.user_id,
                "status": status.value
            })

        return generation

    async def mark_started(self, generation_id: int) -> Generation:
        """Mark generation as started"""
        return await self.update_status(generation_id, JobStatus.PROCESSING)

    async def mark_completed(self, generation_id: int, asset_id: int) -> Generation:
        """
        Mark generation as completed

        Args:
            generation_id: Generation ID
            asset_id: Generated asset ID

        Returns:
            Updated generation
        """
        generation = await self.get_generation(generation_id)
        generation.asset_id = asset_id
        generation.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(generation)

        # Increment prompt version metrics if applicable
        if generation.prompt_version_id:
            await self._increment_prompt_metrics(generation.prompt_version_id)

        return await self.update_status(generation_id, JobStatus.COMPLETED)

    async def mark_failed(self, generation_id: int, error_message: str) -> Generation:
        """Mark generation as failed"""
        return await self.update_status(generation_id, JobStatus.FAILED, error_message)

    async def cancel_generation(self, generation_id: int, user: User) -> Generation:
        """
        Cancel generation (user request)

        Args:
            generation_id: Generation ID
            user: User requesting cancellation

        Returns:
            Cancelled generation

        Raises:
            ResourceNotFoundError: Generation not found
            InvalidOperationError: Cannot cancel (wrong user or completed)
        """
        generation = await self.get_generation(generation_id)

        # Check authorization
        if generation.user_id != user.id and not user.is_admin():
            raise InvalidOperationError("Cannot cancel other users' generations")

        # Check if can be cancelled
        if generation.is_terminal:
            raise InvalidOperationError(f"Generation already {generation.status.value}")

        # Cancel on provider if processing
        if generation.status == JobStatus.PROCESSING:
            try:
                from pixsim7_backend.services.provider import ProviderService

                provider_service = ProviderService(self.db)

                # Get latest submission
                result = await self.db.execute(
                    select(ProviderSubmission)
                    .where(ProviderSubmission.generation_id == generation.id)
                    .order_by(ProviderSubmission.submitted_at.desc())
                    .limit(1)
                )
                submission = result.scalar_one_or_none()

                if submission and submission.account_id:
                    # Get account
                    account = await self.db.get(ProviderAccount, submission.account_id)
                    if account:
                        # Try to cancel on provider
                        cancelled = await provider_service.cancel_job(submission, account)
                        if cancelled:
                            logger.info(f"Generation {generation_id} cancelled on provider")

                        # Decrement account's concurrent job count
                        if account.current_processing_jobs > 0:
                            account.current_processing_jobs -= 1
                            await self.db.commit()
            except Exception as e:
                logger.error(f"Failed to cancel generation on provider: {e}")
                # Continue with local cancellation even if provider cancel fails

        return await self.update_status(generation_id, JobStatus.CANCELLED)

    # ===== GENERATION RETRIEVAL =====

    async def get_generation(self, generation_id: int) -> Generation:
        """
        Get generation by ID

        Args:
            generation_id: Generation ID

        Returns:
            Generation

        Raises:
            ResourceNotFoundError: Generation not found
        """
        generation = await self.db.get(Generation, generation_id)
        if not generation:
            raise ResourceNotFoundError("Generation", generation_id)
        return generation

    async def get_generation_for_user(self, generation_id: int, user: User) -> Generation:
        """
        Get generation with authorization check

        Args:
            generation_id: Generation ID
            user: Current user

        Returns:
            Generation

        Raises:
            ResourceNotFoundError: Generation not found
            InvalidOperationError: Not authorized
        """
        generation = await self.get_generation(generation_id)

        # Authorization check
        if generation.user_id != user.id and not user.is_admin():
            raise InvalidOperationError("Cannot access other users' generations")

        return generation

    async def list_generations(
        self,
        user: User,
        workspace_id: Optional[int] = None,
        status: Optional[JobStatus] = None,
        operation_type: Optional[OperationType] = None,
        limit: int = 50,
        offset: int = 0
    ) -> list[Generation]:
        """
        List generations for user

        Args:
            user: User (or admin)
            workspace_id: Filter by workspace
            status: Filter by status
            operation_type: Filter by operation type
            limit: Max results
            offset: Pagination offset

        Returns:
            List of generations
        """
        query = select(Generation)

        # Filter by user (unless admin)
        if not user.is_admin():
            query = query.where(Generation.user_id == user.id)

        # Apply filters
        if workspace_id:
            query = query.where(Generation.workspace_id == workspace_id)
        if status:
            query = query.where(Generation.status == status)
        if operation_type:
            query = query.where(Generation.operation_type == operation_type)

        # Order by priority and creation time
        query = query.order_by(
            Generation.priority.asc(),  # Lower priority number = higher priority
            Generation.created_at.desc()
        )

        # Pagination
        query = query.limit(limit).offset(offset)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count_generations(
        self,
        user: User,
        workspace_id: Optional[int] = None,
        status: Optional[JobStatus] = None,
        operation_type: Optional[OperationType] = None,
    ) -> int:
        """
        Count generations for user with filters

        Args:
            user: User (or admin)
            workspace_id: Filter by workspace
            status: Filter by status
            operation_type: Filter by operation type

        Returns:
            Total count of matching generations
        """
        from sqlalchemy import func

        query = select(func.count(Generation.id))

        # Filter by user (unless admin)
        if not user.is_admin():
            query = query.where(Generation.user_id == user.id)

        # Apply same filters as list_generations
        if workspace_id:
            query = query.where(Generation.workspace_id == workspace_id)
        if status:
            query = query.where(Generation.status == status)
        if operation_type:
            query = query.where(Generation.operation_type == operation_type)

        result = await self.db.execute(query)
        return result.scalar() or 0

    async def get_pending_generations(
        self,
        provider_id: Optional[str] = None,
        limit: int = 10
    ) -> list[Generation]:
        """
        Get pending generations for processing

        Args:
            provider_id: Filter by provider
            limit: Max results

        Returns:
            List of pending generations (sorted by priority)
        """
        query = select(Generation).where(Generation.status == JobStatus.PENDING)

        if provider_id:
            query = query.where(Generation.provider_id == provider_id)

        # Check if scheduled time has passed
        now = datetime.utcnow()
        query = query.where(
            (Generation.scheduled_at == None) |
            (Generation.scheduled_at <= now)
        )

        # Order by priority (lowest number first)
        query = query.order_by(
            Generation.priority.asc(),
            Generation.created_at.asc()
        ).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ===== RETRY LOGIC =====

    async def increment_retry(self, generation_id: int) -> Generation:
        """
        Increment retry count

        Args:
            generation_id: Generation ID

        Returns:
            Updated generation
        """
        generation = await self.get_generation(generation_id)
        generation.retry_count += 1
        generation.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(generation)
        return generation

    # ===== PROMPT VERSIONING INTEGRATION =====

    async def _increment_prompt_metrics(self, prompt_version_id: UUID) -> None:
        """
        Increment prompt version metrics

        Args:
            prompt_version_id: Prompt version ID
        """
        from pixsim7_backend.domain.prompt_versioning import PromptVersion

        result = await self.db.execute(
            select(PromptVersion).where(PromptVersion.id == prompt_version_id)
        )
        prompt_version = result.scalar_one_or_none()

        if prompt_version:
            prompt_version.generation_count += 1
            prompt_version.successful_assets += 1
            await self.db.commit()
            logger.info(f"Incremented metrics for prompt version {prompt_version_id}")
