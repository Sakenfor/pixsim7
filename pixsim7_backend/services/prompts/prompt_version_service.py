"""Prompt versioning service - Git-like prompt management

Phase 1 Implementation:
    - Create and manage prompt families
    - Create and manage prompt versions
    - Simple version history queries
    - Basic metrics tracking
"""
from __future__ import annotations

from typing import List, Optional, Dict, Any
from uuid import UUID
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func

from pixsim7_backend.domain.prompt_versioning import (
    PromptFamily,
    PromptVersion,
    PromptVariantFeedback,
)
from pixsim7_backend.domain.generation_artifact import GenerationArtifact
from pixsim7_backend.domain.asset import Asset
from pixsim7_backend.domain.job import Job


def _slugify(text: str) -> str:
    """Simple slugify implementation"""
    text = text.lower()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[-\s]+', '-', text)
    return text.strip('-')


class PromptVersionService:
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

        version = PromptVersion(
            family_id=family_id,
            version_number=next_version,
            parent_version_id=parent_version_id,
            prompt_text=prompt_text,
            commit_message=commit_message,
            author=author,
            variables=variables or {},
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

    # ===== Forking & Iteration =====

    async def fork_from_artifact(
        self,
        artifact_id: int,
        family_id: UUID,
        commit_message: str,
        modifications: Optional[str] = None,
        author: Optional[str] = None
    ) -> PromptVersion:
        """Create a new version from an existing artifact's prompt

        Args:
            artifact_id: Source artifact to fork from
            family_id: Target family for the new version
            commit_message: Description of changes
            modifications: Modified prompt text (uses artifact's if not provided)
            author: Who created this version

        Returns:
            New PromptVersion
        """
        # Get the artifact
        result = await self.db.execute(
            select(GenerationArtifact).where(GenerationArtifact.id == artifact_id)
        )
        artifact = result.scalar_one_or_none()
        if not artifact:
            raise ValueError(f"Artifact {artifact_id} not found")

        # Use modified prompt or fall back to artifact's final_prompt or canonical params
        prompt_text = modifications
        if not prompt_text:
            prompt_text = artifact.final_prompt or artifact.canonical_params.get("prompt", "")

        # Create new version, linking to the artifact's version as parent if available
        return await self.create_version(
            family_id=family_id,
            prompt_text=prompt_text,
            commit_message=commit_message,
            author=author,
            parent_version_id=artifact.prompt_version_id
        )

    # ===== Metrics & Analytics =====

    async def increment_generation_count(self, version_id: UUID):
        """Increment the generation count for a version"""
        await self.db.execute(
            update(PromptVersion)
            .where(PromptVersion.id == version_id)
            .values(generation_count=PromptVersion.generation_count + 1)
        )
        await self.db.commit()

    async def increment_success_count(self, version_id: UUID):
        """Increment successful asset count"""
        await self.db.execute(
            update(PromptVersion)
            .where(PromptVersion.id == version_id)
            .values(successful_assets=PromptVersion.successful_assets + 1)
        )
        await self.db.commit()

    # ===== Variant Feedback =====

    async def record_variant_feedback(
        self,
        *,
        prompt_version_id: UUID,
        output_asset_id: int,
        input_asset_ids: Optional[List[int]] = None,
        generation_artifact_id: Optional[int] = None,
        user_id: Optional[int] = None,
    ) -> PromptVariantFeedback:
        """
        Create or fetch a feedback row for a specific prompt+asset combination.

        If a row already exists for (prompt_version_id, output_asset_id),
        it will be returned and updated with any new input_asset_ids / artifact.
        """
        result = await self.db.execute(
            select(PromptVariantFeedback).where(
                PromptVariantFeedback.prompt_version_id == prompt_version_id,
                PromptVariantFeedback.output_asset_id == output_asset_id,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Merge input_asset_ids if provided
            if input_asset_ids:
                merged = set(existing.input_asset_ids or [])
                merged.update(input_asset_ids)
                existing.input_asset_ids = list(sorted(merged))
            if generation_artifact_id and not existing.generation_artifact_id:
                existing.generation_artifact_id = generation_artifact_id
            if user_id and not existing.user_id:
                existing.user_id = user_id
            await self.db.commit()
            await self.db.refresh(existing)
            return existing

        variant = PromptVariantFeedback(
            prompt_version_id=prompt_version_id,
            output_asset_id=output_asset_id,
            input_asset_ids=input_asset_ids or [],
            generation_artifact_id=generation_artifact_id,
            user_id=user_id,
        )
        self.db.add(variant)
        await self.db.commit()
        await self.db.refresh(variant)
        return variant

    async def rate_variant(
        self,
        variant_id: int,
        *,
        user_rating: Optional[int] = None,
        is_favorite: Optional[bool] = None,
        notes: Optional[str] = None,
        quality_score: Optional[float] = None,
    ) -> PromptVariantFeedback:
        """Update rating / favorite / notes for a variant feedback row."""
        result = await self.db.execute(
            select(PromptVariantFeedback).where(PromptVariantFeedback.id == variant_id)
        )
        variant = result.scalar_one_or_none()
        if not variant:
            raise ValueError(f"Variant {variant_id} not found")

        if user_rating is not None:
            variant.user_rating = user_rating
        if is_favorite is not None:
            variant.is_favorite = is_favorite
        if notes is not None:
            variant.notes = notes
        if quality_score is not None:
            variant.quality_score = quality_score

        await self.db.commit()
        await self.db.refresh(variant)
        return variant

    async def list_variants_for_version(
        self,
        version_id: UUID,
        limit: int = 100,
        offset: int = 0,
    ) -> List[PromptVariantFeedback]:
        """List feedback variants for a specific prompt version."""
        result = await self.db.execute(
            select(PromptVariantFeedback)
            .where(PromptVariantFeedback.prompt_version_id == version_id)
            .order_by(PromptVariantFeedback.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def get_assets_for_version(
        self,
        version_id: UUID,
        limit: int = 100
    ) -> List[Asset]:
        """Get all assets generated from this prompt version"""
        result = await self.db.execute(
            select(Asset)
            .join(Job, Asset.source_job_id == Job.id)
            .join(GenerationArtifact, Job.id == GenerationArtifact.job_id)
            .where(GenerationArtifact.prompt_version_id == version_id)
            .order_by(Asset.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_version_for_asset(self, asset_id: int) -> Optional[PromptVersion]:
        """Find which prompt version created this asset"""
        result = await self.db.execute(
            select(PromptVersion)
            .join(GenerationArtifact, PromptVersion.id == GenerationArtifact.prompt_version_id)
            .join(Job, GenerationArtifact.job_id == Job.id)
            .where(Job.asset_id == asset_id)
        )
        return result.scalar_one_or_none()
