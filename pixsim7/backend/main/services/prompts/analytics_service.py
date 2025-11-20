"""
Prompt Analytics Service

Provides diff generation, version comparison, and performance analytics.
"""
from __future__ import annotations

from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from pixsim7.backend.main.domain.prompt_versioning import (
    PromptVersion,
    PromptVariantFeedback,
)
from pixsim7.backend.main.domain.generation import Generation
from .diff_utils import generate_inline_diff, get_change_summary


class PromptAnalyticsService:
    """Service for prompt analytics and comparisons"""

    def __init__(self, db: AsyncSession):
        self.db = db

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
            select(Generation)
            .where(Generation.prompt_version_id == version_id)
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
