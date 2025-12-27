"""Action Block Service - CRUD operations and search

Provides database operations for action blocks including:
- Create, read, update, delete
- Search and filtering
- Compatibility lookups
- Usage tracking
"""
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from sqlmodel import SQLModel

from pixsim7.backend.main.domain.prompt import PromptBlock
from pixsim7.backend.main.services.prompt.block.tagging import normalize_tags


class ActionBlockService:
    """Service for managing action blocks in database"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_block(
        self,
        block_data: Dict[str, Any],
        created_by: Optional[str] = None
    ) -> PromptBlock:
        """Create a new action block

        Args:
            block_data: Block fields (block_id, kind, prompt, etc)
            created_by: User who created this block

        Returns:
            Created PromptBlock instance
        """
        # Calculate counts
        prompt = block_data['prompt']
        char_count = len(prompt)
        word_count = len(prompt.split())

        # Determine complexity if not provided
        if 'complexity_level' not in block_data:
            if char_count < 300:
                complexity = "simple"
            elif char_count < 600:
                complexity = "moderate"
            elif char_count < 1000:
                complexity = "complex"
            else:
                complexity = "very_complex"
            block_data['complexity_level'] = complexity

        block_data['char_count'] = char_count
        block_data['word_count'] = word_count
        block_data['created_by'] = created_by
        block_data['created_at'] = datetime.utcnow()
        block_data['updated_at'] = datetime.utcnow()

        # Normalize tags to use ontology IDs where possible (Task 84, Task C)
        if 'tags' in block_data and block_data['tags']:
            block_data['tags'] = normalize_tags(block_data['tags'])

        # Create block
        block = PromptBlock(**block_data)
        self.db.add(block)
        await self.db.commit()
        await self.db.refresh(block)

        return block

    async def get_block(self, block_id: UUID) -> Optional[PromptBlock]:
        """Get block by database ID"""
        result = await self.db.execute(
            select(PromptBlock).where(PromptBlock.id == block_id)
        )
        return result.scalar_one_or_none()

    async def get_block_by_block_id(self, block_id: str) -> Optional[PromptBlock]:
        """Get block by block_id (string identifier)"""
        result = await self.db.execute(
            select(PromptBlock).where(PromptBlock.block_id == block_id)
        )
        return result.scalar_one_or_none()

    async def update_block(
        self,
        block_id: UUID,
        updates: Dict[str, Any]
    ) -> Optional[PromptBlock]:
        """Update block fields

        Args:
            block_id: Database ID
            updates: Fields to update

        Returns:
            Updated block or None if not found
        """
        block = await self.get_block(block_id)
        if not block:
            return None

        # Normalize tags if being updated (Task 84, Task C)
        if 'tags' in updates and updates['tags']:
            updates['tags'] = normalize_tags(updates['tags'])

        # Update fields
        for key, value in updates.items():
            if hasattr(block, key):
                setattr(block, key, value)

        # Update counts if prompt changed
        if 'prompt' in updates:
            block.char_count = len(block.prompt)
            block.word_count = len(block.prompt.split())

        block.updated_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(block)
        return block

    async def delete_block(self, block_id: UUID) -> bool:
        """Delete a block

        Returns:
            True if deleted, False if not found
        """
        block = await self.get_block(block_id)
        if not block:
            return False

        await self.db.delete(block)
        await self.db.commit()
        return True

    async def search_blocks(
        self,
        kind: Optional[str] = None,
        complexity_level: Optional[str] = None,
        package_name: Optional[str] = None,
        source_type: Optional[str] = None,
        is_public: Optional[bool] = None,
        tag_filters: Optional[Dict[str, Any]] = None,
        min_rating: Optional[float] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[PromptBlock]:
        """Search and filter action blocks

        Args:
            kind: Filter by kind (single_state, transition)
            complexity_level: Filter by complexity
            package_name: Filter by package
            source_type: Filter by source (library, ai_extracted, etc)
            is_public: Filter by public/private
            tag_filters: Filter by tags (e.g., {"location": "bench_park"})
            min_rating: Minimum average rating
            limit: Max results
            offset: Pagination offset

        Returns:
            List of matching blocks
        """
        query = select(PromptBlock)

        # Apply filters
        if kind:
            query = query.where(PromptBlock.kind == kind)

        if complexity_level:
            query = query.where(PromptBlock.complexity_level == complexity_level)

        if package_name:
            query = query.where(PromptBlock.package_name == package_name)

        if source_type:
            query = query.where(PromptBlock.source_type == source_type)

        if is_public is not None:
            query = query.where(PromptBlock.is_public == is_public)

        if min_rating is not None:
            query = query.where(PromptBlock.avg_rating >= min_rating)

        # Tag filters (JSON queries)
        if tag_filters:
            for tag_key, tag_value in tag_filters.items():
                # PostgreSQL JSON query
                query = query.where(
                    PromptBlock.tags[tag_key].astext == str(tag_value)
                )

        # Order and pagination
        query = query.order_by(PromptBlock.created_at.desc())
        query = query.limit(limit).offset(offset)

        # Execute
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def find_compatible_blocks(
        self,
        block_id: str,
        direction: str = "next"
    ) -> List[PromptBlock]:
        """Find blocks compatible with given block

        Args:
            block_id: Block ID to find compatible blocks for
            direction: "next" or "prev"

        Returns:
            List of compatible blocks
        """
        # Get source block
        source_block = await self.get_block_by_block_id(block_id)
        if not source_block:
            return []

        # Get list of compatible IDs
        if direction == "next":
            compatible_ids = source_block.compatible_next
        else:
            compatible_ids = source_block.compatible_prev

        if not compatible_ids:
            return []

        # Fetch compatible blocks
        query = select(PromptBlock).where(
            PromptBlock.block_id.in_(compatible_ids)
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def increment_usage(
        self,
        block_id: UUID,
        success: bool = True
    ) -> None:
        """Increment usage counters for a block

        Args:
            block_id: Block to update
            success: Whether generation was successful
        """
        block = await self.get_block(block_id)
        if block:
            block.usage_count += 1
            if success:
                block.success_count += 1
            await self.db.commit()

    async def update_rating(
        self,
        block_id: UUID,
        new_rating: float
    ) -> None:
        """Update average rating for a block

        Args:
            block_id: Block to update
            new_rating: New rating (1-5)
        """
        block = await self.get_block(block_id)
        if block:
            if block.avg_rating is None:
                block.avg_rating = new_rating
            else:
                # Simple moving average
                block.avg_rating = (block.avg_rating + new_rating) / 2
            await self.db.commit()

    async def get_package_blocks(
        self,
        package_name: str
    ) -> List[PromptBlock]:
        """Get all blocks for a package

        Args:
            package_name: Package to retrieve

        Returns:
            List of blocks in package
        """
        query = select(PromptBlock).where(
            PromptBlock.package_name == package_name
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_statistics(self) -> Dict[str, Any]:
        """Get overall statistics about action blocks

        Returns:
            Statistics dictionary
        """
        # Total blocks
        total_query = select(func.count(PromptBlock.id))
        total_result = await self.db.execute(total_query)
        total_blocks = total_result.scalar()

        # By complexity
        complexity_query = select(
            PromptBlock.complexity_level,
            func.count(PromptBlock.id)
        ).group_by(PromptBlock.complexity_level)
        complexity_result = await self.db.execute(complexity_query)
        by_complexity = dict(complexity_result.all())

        # By package
        package_query = select(
            PromptBlock.package_name,
            func.count(PromptBlock.id)
        ).group_by(PromptBlock.package_name)
        package_result = await self.db.execute(package_query)
        by_package = dict(package_result.all())

        # By source type
        source_query = select(
            PromptBlock.source_type,
            func.count(PromptBlock.id)
        ).group_by(PromptBlock.source_type)
        source_result = await self.db.execute(source_query)
        by_source = dict(source_result.all())

        # Most used
        most_used_query = select(PromptBlock).order_by(
            PromptBlock.usage_count.desc()
        ).limit(10)
        most_used_result = await self.db.execute(most_used_query)
        most_used = [
            {"block_id": b.block_id, "usage_count": b.usage_count}
            for b in most_used_result.scalars().all()
        ]

        # Highest rated
        highest_rated_query = select(PromptBlock).where(
            PromptBlock.avg_rating.isnot(None)
        ).order_by(PromptBlock.avg_rating.desc()).limit(10)
        highest_rated_result = await self.db.execute(highest_rated_query)
        highest_rated = [
            {"block_id": b.block_id, "avg_rating": b.avg_rating}
            for b in highest_rated_result.scalars().all()
        ]

        return {
            "total_blocks": total_blocks,
            "by_complexity": by_complexity,
            "by_package": by_package,
            "by_source": by_source,
            "most_used": most_used,
            "highest_rated": highest_rated
        }

    async def search_by_text(
        self,
        search_text: str,
        limit: int = 20
    ) -> List[PromptBlock]:
        """Search blocks by text in prompt or description

        Args:
            search_text: Text to search for
            limit: Max results

        Returns:
            List of matching blocks
        """
        search_pattern = f"%{search_text}%"

        query = select(PromptBlock).where(
            or_(
                PromptBlock.prompt.ilike(search_pattern),
                PromptBlock.description.ilike(search_pattern),
                PromptBlock.block_id.ilike(search_pattern)
            )
        ).limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())
