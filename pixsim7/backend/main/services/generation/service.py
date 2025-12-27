"""
GenerationService - Backward compatibility layer

Composes focused services to maintain existing API.
Split into focused services for better maintainability and AI agent navigation.

Services:
- GenerationCreationService: Creation, validation, canonicalization
- GenerationLifecycleService: Status transitions
- GenerationQueryService: Retrieval and listing
- GenerationRetryService: Retry logic
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

from pixsim7.backend.main.domain import (
    Generation,
    GenerationStatus,
    OperationType,
    User,
)
from pixsim7.backend.main.services.user.user_service import UserService

# Import focused services
from .creation import GenerationCreationService
from .lifecycle import GenerationLifecycleService
from .query import GenerationQueryService
from .retry import GenerationRetryService

logger = logging.getLogger(__name__)


class GenerationService:
    """
    Generation management service - backward compatibility layer

    Delegates to focused services:
    - Creation: GenerationCreationService
    - Lifecycle: GenerationLifecycleService
    - Query: GenerationQueryService
    - Retry: GenerationRetryService

    This maintains backward compatibility while providing a cleaner architecture.
    """

    def __init__(
        self,
        db: AsyncSession,
        user_service: UserService
    ):
        self.db = db
        self.users = user_service

        # Compose focused services
        self._creation = GenerationCreationService(db, user_service)
        self._lifecycle = GenerationLifecycleService(db)
        self._query = GenerationQueryService(db)
        self._retry = GenerationRetryService(db, self._creation)

    # ===== CREATION METHODS =====

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
    ) -> Generation:
        """Delegate to creation service"""
        return await self._creation.create_generation(
            user=user,
            operation_type=operation_type,
            provider_id=provider_id,
            params=params,
            workspace_id=workspace_id,
            name=name,
            description=description,
            priority=priority,
            scheduled_at=scheduled_at,
            parent_generation_id=parent_generation_id,
            prompt_version_id=prompt_version_id,
            force_new=force_new,
            analyzer_id=analyzer_id,
        )

    # ===== LIFECYCLE METHODS =====

    async def update_status(
        self,
        generation_id: int,
        status: GenerationStatus,
        error_message: Optional[str] = None
    ) -> Generation:
        """Delegate to lifecycle service"""
        return await self._lifecycle.update_status(generation_id, status, error_message)

    async def mark_started(self, generation_id: int) -> Generation:
        """Delegate to lifecycle service"""
        return await self._lifecycle.mark_started(generation_id)

    async def mark_completed(self, generation_id: int, asset_id: int) -> Generation:
        """Delegate to lifecycle service"""
        return await self._lifecycle.mark_completed(generation_id, asset_id)

    async def mark_failed(self, generation_id: int, error_message: str) -> Generation:
        """Delegate to lifecycle service"""
        return await self._lifecycle.mark_failed(generation_id, error_message)

    async def cancel_generation(self, generation_id: int, user: User) -> Generation:
        """Delegate to lifecycle service"""
        return await self._lifecycle.cancel_generation(generation_id, user)

    async def delete_generation(self, generation_id: int, user: User) -> None:
        """Delegate to lifecycle service"""
        return await self._lifecycle.delete_generation(generation_id, user)

    # ===== QUERY METHODS =====

    async def get_generation(self, generation_id: int) -> Generation:
        """Delegate to query service"""
        return await self._query.get_generation(generation_id)

    async def get_generation_for_user(self, generation_id: int, user: User) -> Generation:
        """Delegate to query service"""
        return await self._query.get_generation_for_user(generation_id, user)

    async def list_generations(
        self,
        user: User,
        workspace_id: Optional[int] = None,
        status: Optional[GenerationStatus] = None,
        operation_type: Optional[OperationType] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Generation]:
        """Delegate to query service"""
        return await self._query.list_generations(
            user=user,
            workspace_id=workspace_id,
            status=status,
            operation_type=operation_type,
            limit=limit,
            offset=offset
        )

    async def count_generations(
        self,
        user: User,
        workspace_id: Optional[int] = None,
        status: Optional[GenerationStatus] = None,
        operation_type: Optional[OperationType] = None,
    ) -> int:
        """Delegate to query service"""
        return await self._query.count_generations(
            user=user,
            workspace_id=workspace_id,
            status=status,
            operation_type=operation_type
        )

    async def get_pending_generations(
        self,
        provider_id: Optional[str] = None,
        limit: int = 10
    ) -> List[Generation]:
        """Delegate to query service"""
        return await self._query.get_pending_generations(provider_id=provider_id, limit=limit)

    # ===== RETRY METHODS =====

    async def increment_retry(self, generation_id: int) -> Generation:
        """Delegate to retry service"""
        return await self._retry.increment_retry(generation_id)

    async def retry_generation(
        self,
        generation_id: int,
        user: User,
        max_retries: int | None = None
    ) -> Generation:
        """Delegate to retry service"""
        return await self._retry.retry_generation(generation_id, user, max_retries)

    async def should_auto_retry(self, generation: Generation) -> bool:
        """Delegate to retry service"""
        return await self._retry.should_auto_retry(generation)

    # ===== PROMPT VERSIONING INTEGRATION =====

    async def _increment_prompt_metrics(self, prompt_version_id: UUID) -> None:
        """Delegate to lifecycle service (internal method)"""
        return await self._lifecycle._increment_prompt_metrics(prompt_version_id)
