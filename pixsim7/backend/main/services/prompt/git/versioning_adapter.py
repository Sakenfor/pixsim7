"""Prompt versioning adapter using shared base.

This module provides a PromptVersioningService that extends the shared
VersioningServiceBase, enabling prompts to use the same common operations
as assets (timeline, ancestry, version chain, etc.).

The existing GitBranchService, GitMergeService, and GitOperationsService
remain for prompt-specific operations (branches, AI merge, cherry-pick, etc.).
This adapter complements those services.

Usage:
    # For common operations (timeline, ancestry, etc.)
    prompt_versioning = PromptVersioningService(db)
    timeline = await prompt_versioning.get_timeline(family_id)
    ancestors = await prompt_versioning.get_ancestry(version_id)

    # For prompt-specific operations (branches, merge, etc.)
    git_branch = GitBranchService(db)
    await git_branch.create_branch(family_id, "feature-x")
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from pixsim7.backend.main.domain.prompt import PromptVersion, PromptFamily
from pixsim7.backend.main.services.versioning import (
    VersionContext,
    VersioningServiceBase,
    TimelineEntry,
)
from pixsim7.backend.main.services.prompt.utils.diff import generate_inline_diff


class PromptVersioningService(VersioningServiceBase[PromptFamily, PromptVersion]):
    """
    Prompt versioning service using shared base.

    Provides common versioning operations for prompts:
    - Timeline queries
    - Ancestry/descendant traversal
    - Version chain navigation
    - Family statistics

    For prompt-specific operations (branches, merge, cherry-pick),
    use the dedicated GitBranchService, GitMergeService, etc.
    """

    def __init__(self, db: AsyncSession):
        super().__init__(db)

    # =========================================================================
    # ABSTRACT METHOD IMPLEMENTATIONS
    # =========================================================================

    def get_family_model(self) -> type:
        return PromptFamily

    def get_entity_model(self) -> type:
        return PromptVersion

    def get_family_id_field(self, entity: PromptVersion) -> Optional[str]:
        return str(entity.family_id) if entity.family_id else None

    def get_parent_id(self, entity: PromptVersion) -> Optional[UUID]:
        return entity.parent_version_id

    def get_entity_id(self, entity: PromptVersion) -> UUID:
        return entity.id

    def get_version_number(self, entity: PromptVersion) -> Optional[int]:
        return entity.version_number

    def get_version_message(self, entity: PromptVersion) -> Optional[str]:
        return entity.commit_message

    def get_head_id(self, family: PromptFamily) -> Optional[UUID]:
        # Prompts don't have explicit HEAD - return None
        # Could be extended to return latest version on main branch
        return None

    def build_family_id_filter(self, family_id: UUID):
        return PromptVersion.family_id == family_id

    def build_entity_id_filter(self, entity_id: UUID):
        return PromptVersion.id == entity_id

    def build_parent_id_filter(self, parent_id: UUID):
        return PromptVersion.parent_version_id == parent_id

    def get_timeline_metadata(self, entity: PromptVersion) -> Dict[str, Any]:
        """Extract prompt-specific metadata for timeline entries."""
        return {
            "branch_name": entity.branch_name or "main",
            "author": entity.author,
            "tags": entity.tags or [],
            "char_count": len(entity.prompt_text) if entity.prompt_text else 0,
            "generation_count": entity.generation_count or 0,
            "success_count": entity.successful_assets or 0,
            "is_merge": bool(entity.tags and 'merge' in entity.tags),
        }

    # =========================================================================
    # PROMPT-SPECIFIC EXTENSIONS
    # =========================================================================

    async def get_branches(self, family_id: UUID) -> List[str]:
        """Get all branch names in a family."""
        from sqlalchemy import select, distinct
        result = await self.db.execute(
            select(distinct(PromptVersion.branch_name))
            .where(PromptVersion.family_id == family_id)
            .where(PromptVersion.branch_name.isnot(None))
        )
        branches = [row[0] for row in result.all()]
        # Add "main" if not present (versions without branch_name are on main)
        if "main" not in branches:
            branches.insert(0, "main")
        return branches

    async def get_branch_timeline(
        self,
        family_id: UUID,
        branch_name: Optional[str] = None
    ) -> List[TimelineEntry]:
        """
        Get timeline for a specific branch.

        Args:
            family_id: The prompt family
            branch_name: Branch to filter by (None = main branch)
        """
        from sqlalchemy import select
        query = select(PromptVersion).where(
            PromptVersion.family_id == family_id
        )

        if branch_name and branch_name != "main":
            query = query.where(PromptVersion.branch_name == branch_name)
        else:
            # Main branch = versions with no branch_name OR branch_name='main'
            query = query.where(
                (PromptVersion.branch_name.is_(None)) |
                (PromptVersion.branch_name == "main")
            )

        query = query.order_by(PromptVersion.version_number.asc())
        result = await self.db.execute(query)
        versions = list(result.scalars().all())

        return [
            TimelineEntry(
                entity_id=v.id,
                version_number=v.version_number or 0,
                version_message=v.commit_message,
                parent_id=v.parent_version_id,
                is_head=False,  # Prompts don't track HEAD
                created_at=v.created_at,
                metadata=self.get_timeline_metadata(v),
            )
            for v in versions
        ]

    async def get_latest_version(
        self,
        family_id: UUID,
        branch_name: Optional[str] = None
    ) -> Optional[PromptVersion]:
        """Get latest version in family, optionally filtered by branch."""
        from sqlalchemy import select
        query = select(PromptVersion).where(
            PromptVersion.family_id == family_id
        )

        if branch_name is None:
            pass
        elif branch_name != "main":
            query = query.where(PromptVersion.branch_name == branch_name)
        else:
            query = query.where(
                (PromptVersion.branch_name.is_(None)) |
                (PromptVersion.branch_name == "main")
            )

        query = query.order_by(PromptVersion.version_number.desc()).limit(1)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_version(self, version_id: UUID) -> Optional[PromptVersion]:
        """Compatibility wrapper for git services (delegates to get_entity)."""
        return await self.get_entity(version_id)

    async def create_version(
        self,
        family_id: UUID,
        prompt_text: str,
        commit_message: Optional[str] = None,
        author: Optional[str] = None,
        parent_version_id: Optional[UUID] = None,
        branch_name: Optional[str] = None,
        variables: Optional[Dict[str, Any]] = None,
        provider_hints: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None,
    ) -> PromptVersion:
        """
        Create a new version in a family.

        This is a convenience wrapper - for full version creation with
        all options, use PromptFamilyService.create_version() directly.
        """
        # Get next version number with locking
        next_version = await self.get_next_version_number(family_id, lock=True)

        diff_from_parent = None
        if parent_version_id:
            parent = await self.get_entity(parent_version_id)
            if parent:
                diff_from_parent = generate_inline_diff(parent.prompt_text, prompt_text)

        version = PromptVersion(
            family_id=family_id,
            version_number=next_version,
            prompt_text=prompt_text,
            commit_message=commit_message,
            author=author,
            parent_version_id=parent_version_id,
            branch_name=branch_name,
            variables=variables or {},
            provider_hints=provider_hints or {},
            tags=tags or [],
            diff_from_parent=diff_from_parent,
        )
        self.db.add(version)
        await self.db.commit()
        await self.db.refresh(version)
        return version
