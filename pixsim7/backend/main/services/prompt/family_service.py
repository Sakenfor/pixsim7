"""
Prompt Family and Version Service

Core CRUD operations for prompt families and versions.
"""
from __future__ import annotations

from typing import List, Optional
from uuid import UUID
from datetime import datetime
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from pixsim7.backend.main.domain.prompt import (
    PromptFamily,
    PromptVersion,
)
from pixsim7.backend.main.domain.generation.models import Generation
from .utils.diff_utils import generate_inline_diff


def _slugify(text: str) -> str:
    """Simple slugify implementation"""
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text)
    return text.strip('-')


class PromptFamilyService:
    """Service for managing prompt families and versions"""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ===== Prompt Family Management =====

    async def create_family(
        self,
        title: str,
        prompt_type: str,
        slug: Optional[str] = None,
        description: Optional[str] = None,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        **kwargs
    ) -> PromptFamily:
        """Create a new prompt family

        Args:
            title: Human-readable title
            prompt_type: 'visual', 'narrative', or 'hybrid'
            slug: URL-safe identifier (auto-generated from title if not provided)
            description: Detailed description
            category: Category like 'romance', 'action', etc.
            tags: List of tags
            **kwargs: Additional fields (game_world_id, npc_id, etc.)

        Returns:
            Created PromptFamily
        """
        if not slug:
            slug = _slugify(title)

        family = PromptFamily(
            slug=slug,
            title=title,
            description=description,
            prompt_type=prompt_type,
            category=category,
            tags=tags or [],
            **kwargs
        )

        self.db.add(family)
        await self.db.commit()
        await self.db.refresh(family)
        return family

    async def get_family(self, family_id: UUID) -> Optional[PromptFamily]:
        """Get family by ID"""
        result = await self.db.execute(
            select(PromptFamily).where(PromptFamily.id == family_id)
        )
        return result.scalar_one_or_none()

    async def get_family_by_slug(self, slug: str) -> Optional[PromptFamily]:
        """Get family by slug"""
        result = await self.db.execute(
            select(PromptFamily).where(PromptFamily.slug == slug)
        )
        return result.scalar_one_or_none()

    async def list_families(
        self,
        prompt_type: Optional[str] = None,
        category: Optional[str] = None,
        is_active: bool = True,
        limit: int = 100,
        offset: int = 0
    ) -> List[PromptFamily]:
        """List prompt families with optional filtering"""
        query = select(PromptFamily)

        if prompt_type:
            query = query.where(PromptFamily.prompt_type == prompt_type)
        if category:
            query = query.where(PromptFamily.category == category)
        if is_active is not None:
            query = query.where(PromptFamily.is_active == is_active)

        query = query.order_by(PromptFamily.created_at.desc())
        query = query.limit(limit).offset(offset)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ===== Prompt Version Management =====

    async def create_version(
        self,
        family_id: UUID,
        prompt_text: str,
        commit_message: Optional[str] = None,
        author: Optional[str] = None,
        parent_version_id: Optional[UUID] = None,
        variables: Optional[Dict[str, Any]] = None,
        **kwargs
    ) -> PromptVersion:
        """Create a new prompt version

        Args:
            family_id: Parent family
            prompt_text: The actual prompt text
            commit_message: Description of changes
            author: Who created this version
            parent_version_id: Optional parent for branching
            variables: Template variables
            **kwargs: Additional fields (provider_hints, tags, etc.)

        Returns:
            Created PromptVersion
        """
        # Get next version number for this family
        result = await self.db.execute(
            select(func.max(PromptVersion.version_number))
            .where(PromptVersion.family_id == family_id)
        )
        max_version = result.scalar()
        next_version = (max_version or 0) + 1

        # Auto-generate diff from parent if parent_version_id is provided
        diff_from_parent = None
        if parent_version_id:
            parent = await self.get_version(parent_version_id)
            if parent:
                diff_from_parent = generate_inline_diff(parent.prompt_text, prompt_text)

        version = PromptVersion(
            family_id=family_id,
            version_number=next_version,
            parent_version_id=parent_version_id,
            prompt_text=prompt_text,
            commit_message=commit_message,
            author=author,
            variables=variables or {},
            diff_from_parent=diff_from_parent,
            **kwargs
        )

        self.db.add(version)
        await self.db.commit()
        await self.db.refresh(version)
        return version

    async def get_version(self, version_id: UUID) -> Optional[PromptVersion]:
        """Get version by ID"""
        result = await self.db.execute(
            select(PromptVersion).where(PromptVersion.id == version_id)
        )
        return result.scalar_one_or_none()

    async def get_latest_version(self, family_id: UUID) -> Optional[PromptVersion]:
        """Get the latest version for a family"""
        result = await self.db.execute(
            select(PromptVersion)
            .where(PromptVersion.family_id == family_id)
            .order_by(PromptVersion.version_number.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_versions(
        self,
        family_id: UUID,
        limit: int = 100,
        offset: int = 0
    ) -> List[PromptVersion]:
        """List all versions for a family (newest first)"""
        result = await self.db.execute(
            select(PromptVersion)
            .where(PromptVersion.family_id == family_id)
            .order_by(PromptVersion.version_number.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())
