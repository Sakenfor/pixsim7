"""
Prompt Variant Service

Manages prompt variants, feedback, ratings, and metrics tracking.
"""
from __future__ import annotations

from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from pixsim7.backend.main.domain.prompt import (
    PromptVersion,
    PromptVariantFeedback,
)
from pixsim7.backend.main.domain.generation.models import Generation
from pixsim7.backend.main.domain.assets.models import Asset


class PromptVariantService:
    """Service for managing prompt variants and feedback"""

    def __init__(self, db: AsyncSession):
        self.db = db

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
            select(Generation).where(Generation.id == artifact_id)
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
            .join(Generation, Asset.source_generation_id == Generation.id)
            .join(Generation, Generation.id == Generation.id)
            .where(Generation.prompt_version_id == version_id)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_version_for_asset(self, asset_id: int) -> Optional[PromptVersion]:
        """Find which prompt version created this asset"""
        result = await self.db.execute(
            select(PromptVersion)
            .join(Generation, PromptVersion.id == Generation.prompt_version_id)
            .join(Generation, Generation.id == Generation.id)
            .where(Generation.asset_id == asset_id)
        )
        return result.scalar_one_or_none()
