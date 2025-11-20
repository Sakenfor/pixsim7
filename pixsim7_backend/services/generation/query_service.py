"""
GenerationQueryService - Generation retrieval and listing

Handles all read-only generation queries.
"""
from typing import Optional, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from pixsim7_backend.domain import (
    Generation,
    GenerationStatus,
    OperationType,
    User,
)
from pixsim7_backend.shared.errors import (
    ResourceNotFoundError,
    InvalidOperationError,
)


class GenerationQueryService:
    """
    Generation query service

    Handles:
    - Get generation by ID
    - Get generation with authorization
    - List generations with filters
    - Count generations
    - Get pending generations for workers
    """

    def __init__(self, db: AsyncSession):
        self.db = db

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
        status: Optional[GenerationStatus] = None,
        operation_type: Optional[OperationType] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[Generation]:
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
        status: Optional[GenerationStatus] = None,
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
    ) -> List[Generation]:
        """
        Get pending generations for processing

        Args:
            provider_id: Filter by provider
            limit: Max results

        Returns:
            List of pending generations (sorted by priority)
        """
        query = select(Generation).where(Generation.status == GenerationStatus.PENDING)

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
