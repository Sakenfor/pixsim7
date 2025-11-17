"""Prompt versioning service - Git-like prompt management

Phase 1 Implementation:
    - Create and manage prompt families
    - Create and manage prompt versions
    - Simple version history queries
    - Basic metrics tracking

Phase 2 Implementation:
    - Automatic diff generation
    - Analytics and performance metrics
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
from .diff_utils import generate_inline_diff, get_change_summary


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

    # ===== Diff Generation (Phase 2) =====

    async def get_version_diff(
        self,
        version_id: UUID,
        format: str = "inline"
    ) -> Optional[Dict[str, Any]]:
        """Get diff for a version compared to its parent

        Args:
            version_id: Version to get diff for
            format: Diff format ('inline', 'unified', 'summary')

        Returns:
            Dict with diff information or None if no parent
        """
        version = await self.get_version(version_id)
        if not version or not version.parent_version_id:
            return None

        parent = await self.get_version(version.parent_version_id)
        if not parent:
            return None

        from .diff_utils import generate_unified_diff, generate_inline_diff, get_change_summary

        result = {
            "version_id": str(version_id),
            "version_number": version.version_number,
            "parent_version_id": str(version.parent_version_id),
            "parent_version_number": parent.version_number,
        }

        if format == "unified":
            result["diff"] = generate_unified_diff(
                parent.prompt_text,
                version.prompt_text,
                from_label=f"v{parent.version_number}",
                to_label=f"v{version.version_number}"
            )
        elif format == "inline":
            result["diff"] = version.diff_from_parent or generate_inline_diff(
                parent.prompt_text,
                version.prompt_text
            )
        elif format == "summary":
            result["summary"] = get_change_summary(parent.prompt_text, version.prompt_text)

        return result

    async def compare_versions(
        self,
        from_version_id: UUID,
        to_version_id: UUID,
        format: str = "inline"
    ) -> Dict[str, Any]:
        """Compare two arbitrary versions

        Args:
            from_version_id: Source version
            to_version_id: Target version
            format: Diff format ('inline', 'unified', 'summary')

        Returns:
            Dict with comparison information
        """
        from_version = await self.get_version(from_version_id)
        to_version = await self.get_version(to_version_id)

        if not from_version or not to_version:
            raise ValueError("One or both versions not found")

        from .diff_utils import generate_unified_diff, generate_inline_diff, get_change_summary

        result = {
            "from_version_id": str(from_version_id),
            "from_version_number": from_version.version_number,
            "to_version_id": str(to_version_id),
            "to_version_number": to_version.version_number,
        }

        if format == "unified":
            result["diff"] = generate_unified_diff(
                from_version.prompt_text,
                to_version.prompt_text,
                from_label=f"v{from_version.version_number}",
                to_label=f"v{to_version.version_number}"
            )
        elif format == "inline":
            result["diff"] = generate_inline_diff(
                from_version.prompt_text,
                to_version.prompt_text
            )
        elif format == "summary":
            result["summary"] = get_change_summary(
                from_version.prompt_text,
                to_version.prompt_text
            )

        return result

    # ===== Analytics (Phase 2) =====

    async def get_version_analytics(self, version_id: UUID) -> Dict[str, Any]:
        """Get comprehensive analytics for a version

        Returns:
            Dict with performance metrics, usage stats, and ratings
        """
        version = await self.get_version(version_id)
        if not version:
            raise ValueError(f"Version {version_id} not found")

        # Get all artifacts for this version
        artifacts_result = await self.db.execute(
            select(GenerationArtifact)
            .where(GenerationArtifact.prompt_version_id == version_id)
        )
        artifacts = list(artifacts_result.scalars().all())

        # Get all variants (feedback records)
        variants_result = await self.db.execute(
            select(PromptVariantFeedback)
            .where(PromptVariantFeedback.prompt_version_id == version_id)
        )
        variants = list(variants_result.scalars().all())

        # Calculate success rate
        total_generations = len(artifacts)
        successful_generations = version.successful_assets

        # Calculate ratings
        ratings = [v.user_rating for v in variants if v.user_rating is not None]
        avg_rating = sum(ratings) / len(ratings) if ratings else None
        favorites_count = sum(1 for v in variants if v.is_favorite)

        # Calculate quality scores
        quality_scores = [v.quality_score for v in variants if v.quality_score is not None]
        avg_quality = sum(quality_scores) / len(quality_scores) if quality_scores else None

        return {
            "version_id": str(version_id),
            "version_number": version.version_number,
            "usage": {
                "total_generations": total_generations,
                "successful_generations": successful_generations,
                "success_rate": successful_generations / total_generations if total_generations > 0 else 0,
                "generation_count": version.generation_count,
            },
            "ratings": {
                "average_rating": round(avg_rating, 2) if avg_rating else None,
                "total_ratings": len(ratings),
                "favorites_count": favorites_count,
            },
            "quality": {
                "average_quality_score": round(avg_quality, 2) if avg_quality else None,
                "total_quality_scores": len(quality_scores),
            },
            "variants": {
                "total_variants": len(variants),
                "rated_variants": len(ratings),
            }
        }

    async def get_family_analytics(self, family_id: UUID) -> Dict[str, Any]:
        """Get aggregate analytics for all versions in a family

        Returns:
            Dict with family-wide performance metrics
        """
        family = await self.get_family(family_id)
        if not family:
            raise ValueError(f"Family {family_id} not found")

        # Get all versions for this family
        versions = await self.list_versions(family_id, limit=1000)

        if not versions:
            return {
                "family_id": str(family_id),
                "total_versions": 0,
                "total_generations": 0,
                "success_rate": 0,
            }

        # Aggregate metrics
        total_generations = sum(v.generation_count for v in versions)
        total_successful = sum(v.successful_assets for v in versions)

        # Get all variants across all versions
        version_ids = [v.id for v in versions]
        variants_result = await self.db.execute(
            select(PromptVariantFeedback)
            .where(PromptVariantFeedback.prompt_version_id.in_(version_ids))
        )
        variants = list(variants_result.scalars().all())

        # Calculate average ratings
        ratings = [v.user_rating for v in variants if v.user_rating is not None]
        avg_rating = sum(ratings) / len(ratings) if ratings else None

        # Find best performing version
        best_version = max(versions, key=lambda v: v.successful_assets) if versions else None

        return {
            "family_id": str(family_id),
            "family_slug": family.slug,
            "family_title": family.title,
            "total_versions": len(versions),
            "usage": {
                "total_generations": total_generations,
                "successful_generations": total_successful,
                "success_rate": total_successful / total_generations if total_generations > 0 else 0,
            },
            "ratings": {
                "average_rating": round(avg_rating, 2) if avg_rating else None,
                "total_ratings": len(ratings),
            },
            "best_version": {
                "version_id": str(best_version.id) if best_version else None,
                "version_number": best_version.version_number if best_version else None,
                "successful_assets": best_version.successful_assets if best_version else 0,
            } if best_version else None,
            "latest_version": {
                "version_id": str(versions[0].id),
                "version_number": versions[0].version_number,
            } if versions else None,
        }

    async def get_top_performing_versions(
        self,
        family_id: Optional[UUID] = None,
        limit: int = 10,
        metric: str = "success_rate"
    ) -> List[Dict[str, Any]]:
        """Get top performing versions by various metrics

        Args:
            family_id: Optional family to filter by
            limit: Number of results to return
            metric: Metric to sort by ('success_rate', 'total_generations', 'avg_rating')

        Returns:
            List of version performance summaries
        """
        query = select(PromptVersion)

        if family_id:
            query = query.where(PromptVersion.family_id == family_id)

        result = await self.db.execute(query)
        versions = list(result.scalars().all())

        # Calculate metrics for each version
        version_metrics = []
        for version in versions:
            success_rate = (
                version.successful_assets / version.generation_count
                if version.generation_count > 0
                else 0
            )

            # Get average rating for this version
            variants_result = await self.db.execute(
                select(PromptVariantFeedback)
                .where(PromptVariantFeedback.prompt_version_id == version.id)
            )
            variants = list(variants_result.scalars().all())
            ratings = [v.user_rating for v in variants if v.user_rating is not None]
            avg_rating = sum(ratings) / len(ratings) if ratings else 0

            version_metrics.append({
                "version_id": str(version.id),
                "family_id": str(version.family_id),
                "version_number": version.version_number,
                "success_rate": success_rate,
                "total_generations": version.generation_count,
                "successful_assets": version.successful_assets,
                "avg_rating": avg_rating,
                "total_ratings": len(ratings),
            })

        # Sort by requested metric
        if metric == "success_rate":
            version_metrics.sort(key=lambda x: x["success_rate"], reverse=True)
        elif metric == "total_generations":
            version_metrics.sort(key=lambda x: x["total_generations"], reverse=True)
        elif metric == "avg_rating":
            version_metrics.sort(key=lambda x: x["avg_rating"], reverse=True)

        return version_metrics[:limit]
