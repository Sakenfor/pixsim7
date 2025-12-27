"""Git-like Operations for Prompt Versioning

Provides additional git-like operations:
- History and timeline views
- Rollback operations
- Tag management
- Cherry-pick
- Revert
"""
from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

from pixsim7.backend.main.domain.prompt import PromptVersion, PromptFamily
from pixsim7.backend.main.services.prompt.version_service import PromptVersionService


class GitOperationsService:
    """Additional git-like operations for prompt versioning"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.version_service = PromptVersionService(db)

    # ===== HISTORY & TIMELINE =====

    async def get_timeline(
        self,
        family_id: UUID,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        branch_name: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get timeline view of all changes (like git log --all --graph --date-order)

        Args:
            family_id: Prompt family
            start_date: Filter from this date
            end_date: Filter to this date
            branch_name: Filter by branch

        Returns:
            Timeline of all versions
        """
        query = select(PromptVersion).where(
            PromptVersion.family_id == family_id
        )

        if start_date:
            query = query.where(PromptVersion.created_at >= start_date)
        if end_date:
            query = query.where(PromptVersion.created_at <= end_date)
        if branch_name:
            query = query.where(PromptVersion.branch_name == branch_name)

        query = query.order_by(PromptVersion.created_at.desc())

        result = await self.db.execute(query)
        versions = result.scalars().all()

        timeline = []
        for version in versions:
            # Calculate time since last version
            prev_query = select(PromptVersion).where(
                and_(
                    PromptVersion.family_id == family_id,
                    PromptVersion.created_at < version.created_at
                )
            ).order_by(PromptVersion.created_at.desc()).limit(1)

            prev_result = await self.db.execute(prev_query)
            prev_version = prev_result.scalar_one_or_none()

            time_since_prev = None
            if prev_version:
                delta = version.created_at - prev_version.created_at
                time_since_prev = self._format_timedelta(delta)

            timeline.append({
                "version_id": str(version.id),
                "version_number": version.version_number,
                "branch_name": version.branch_name or "main",
                "commit_message": version.commit_message,
                "author": version.author,
                "created_at": version.created_at.isoformat(),
                "time_since_previous": time_since_prev,
                "parent_version_id": str(version.parent_version_id) if version.parent_version_id else None,
                "tags": version.tags,
                "is_merge": bool(version.tags and 'merge' in version.tags),
                "char_count": len(version.prompt_text),
                "generation_count": version.generation_count,
                "success_count": version.successful_assets
            })

        return timeline

    async def get_activity_summary(
        self,
        family_id: UUID,
        days: int = 30
    ) -> Dict[str, Any]:
        """Get activity summary for last N days

        Args:
            family_id: Prompt family
            days: Number of days to look back

        Returns:
            Activity statistics
        """
        start_date = datetime.utcnow() - timedelta(days=days)

        query = select(PromptVersion).where(
            and_(
                PromptVersion.family_id == family_id,
                PromptVersion.created_at >= start_date
            )
        )
        result = await self.db.execute(query)
        versions = list(result.scalars().all())

        # Group by day
        activity_by_day = {}
        for version in versions:
            day_key = version.created_at.date().isoformat()
            if day_key not in activity_by_day:
                activity_by_day[day_key] = {
                    "date": day_key,
                    "commits": 0,
                    "authors": set(),
                    "branches": set()
                }

            activity_by_day[day_key]["commits"] += 1
            if version.author:
                activity_by_day[day_key]["authors"].add(version.author)
            if version.branch_name:
                activity_by_day[day_key]["branches"].add(version.branch_name)

        # Convert sets to lists and sort by date
        activity_list = []
        for day_data in activity_by_day.values():
            activity_list.append({
                "date": day_data["date"],
                "commits": day_data["commits"],
                "authors": list(day_data["authors"]),
                "author_count": len(day_data["authors"]),
                "branches": list(day_data["branches"]),
                "branch_count": len(day_data["branches"])
            })

        activity_list.sort(key=lambda x: x["date"], reverse=True)

        # Calculate statistics
        total_commits = len(versions)
        unique_authors = set(v.author for v in versions if v.author)
        unique_branches = set(v.branch_name for v in versions if v.branch_name)

        return {
            "period_days": days,
            "total_commits": total_commits,
            "unique_authors": list(unique_authors),
            "author_count": len(unique_authors),
            "unique_branches": list(unique_branches),
            "branch_count": len(unique_branches),
            "activity_by_day": activity_list,
            "avg_commits_per_day": total_commits / days if days > 0 else 0
        }

    # ===== ROLLBACK OPERATIONS =====

    async def rollback_to_version(
        self,
        family_id: UUID,
        target_version_id: UUID,
        author: Optional[str] = None,
        commit_message: Optional[str] = None
    ) -> PromptVersion:
        """Rollback to a previous version (like git reset)

        Creates a new version with content from target version.

        Args:
            family_id: Prompt family
            target_version_id: Version to rollback to
            author: Author of rollback
            commit_message: Custom commit message

        Returns:
            New version with rolled-back content
        """
        target = await self.version_service.get_version(target_version_id)
        if not target or target.family_id != family_id:
            raise ValueError("Target version not found or not in family")

        # Get current latest version
        current = await self.version_service.get_latest_version(family_id)

        # Create new version with target's content
        rollback_version = await self.version_service.create_version(
            family_id=family_id,
            prompt_text=target.prompt_text,
            commit_message=commit_message or f"Rollback to version {target.version_number}",
            author=author,
            parent_version_id=current.id if current else None,
            variables=target.variables,
            provider_hints=target.provider_hints,
            tags=(target.tags or []) + ['rollback', f'rollback_from:{target.version_number}']
        )

        return rollback_version

    async def revert_version(
        self,
        family_id: UUID,
        version_to_revert_id: UUID,
        author: Optional[str] = None
    ) -> PromptVersion:
        """Revert a specific version's changes (like git revert)

        Creates a new version that undoes the changes from version_to_revert.

        Args:
            family_id: Prompt family
            version_to_revert_id: Version whose changes to revert
            author: Author of revert

        Returns:
            New version reverting the changes
        """
        version_to_revert = await self.version_service.get_version(version_to_revert_id)
        if not version_to_revert or version_to_revert.family_id != family_id:
            raise ValueError("Version not found or not in family")

        # Get parent to know what to revert to
        if not version_to_revert.parent_version_id:
            raise ValueError("Cannot revert first version (no parent)")

        parent = await self.version_service.get_version(version_to_revert.parent_version_id)
        current = await self.version_service.get_latest_version(family_id)

        # Create new version with parent's content
        revert_version = await self.version_service.create_version(
            family_id=family_id,
            prompt_text=parent.prompt_text,
            commit_message=f"Revert version {version_to_revert.version_number}",
            author=author,
            parent_version_id=current.id if current else None,
            variables=parent.variables,
            provider_hints=parent.provider_hints,
            tags=['revert', f'revert_of:{version_to_revert.version_number}']
        )

        return revert_version

    # ===== TAG MANAGEMENT =====

    async def add_tag(
        self,
        version_id: UUID,
        tag: str
    ) -> PromptVersion:
        """Add a tag to a version (like git tag)

        Args:
            version_id: Version to tag
            tag: Tag name

        Returns:
            Updated version
        """
        version = await self.version_service.get_version(version_id)
        if not version:
            raise ValueError("Version not found")

        if tag in (version.tags or []):
            raise ValueError(f"Tag '{tag}' already exists on this version")

        version.tags = version.tags or []
        version.tags.append(tag)

        await self.db.commit()
        await self.db.refresh(version)

        return version

    async def remove_tag(
        self,
        version_id: UUID,
        tag: str
    ) -> PromptVersion:
        """Remove a tag from a version

        Args:
            version_id: Version to untag
            tag: Tag name

        Returns:
            Updated version
        """
        version = await self.version_service.get_version(version_id)
        if not version:
            raise ValueError("Version not found")

        if not version.tags or tag not in version.tags:
            raise ValueError(f"Tag '{tag}' not found on this version")

        version.tags.remove(tag)

        await self.db.commit()
        await self.db.refresh(version)

        return version

    async def list_tags(
        self,
        family_id: UUID
    ) -> List[Dict[str, Any]]:
        """List all tags used in a family

        Args:
            family_id: Prompt family

        Returns:
            List of tags with usage count
        """
        query = select(PromptVersion.tags).where(
            PromptVersion.family_id == family_id
        )
        result = await self.db.execute(query)
        all_tags_lists = result.scalars().all()

        # Count tag usage
        tag_counts = {}
        for tags_list in all_tags_lists:
            if tags_list:
                for tag in tags_list:
                    tag_counts[tag] = tag_counts.get(tag, 0) + 1

        # Convert to list and sort by count
        tags = [
            {"tag": tag, "count": count}
            for tag, count in tag_counts.items()
        ]
        tags.sort(key=lambda x: x["count"], reverse=True)

        return tags

    async def find_by_tag(
        self,
        family_id: UUID,
        tag: str
    ) -> List[PromptVersion]:
        """Find all versions with a specific tag

        Args:
            family_id: Prompt family
            tag: Tag to search for

        Returns:
            List of versions with this tag
        """
        query = select(PromptVersion).where(
            and_(
                PromptVersion.family_id == family_id,
                PromptVersion.tags.contains([tag])
            )
        ).order_by(PromptVersion.created_at.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    # ===== CHERRY-PICK =====

    async def cherry_pick(
        self,
        family_id: UUID,
        version_to_pick_id: UUID,
        target_branch: Optional[str] = None,
        author: Optional[str] = None
    ) -> PromptVersion:
        """Cherry-pick a specific version's changes to current branch (like git cherry-pick)

        Args:
            family_id: Prompt family
            version_to_pick_id: Version to cherry-pick
            target_branch: Branch to apply to (None = current/main)
            author: Author of cherry-pick

        Returns:
            New version with cherry-picked changes
        """
        version_to_pick = await self.version_service.get_version(version_to_pick_id)
        if not version_to_pick or version_to_pick.family_id != family_id:
            raise ValueError("Version not found or not in family")

        # Get current head of target branch
        if target_branch:
            # Find latest version on target branch
            query = select(PromptVersion).where(
                and_(
                    PromptVersion.family_id == family_id,
                    PromptVersion.branch_name == target_branch
                )
            ).order_by(PromptVersion.created_at.desc()).limit(1)
            result = await self.db.execute(query)
            current = result.scalar_one_or_none()
        else:
            current = await self.version_service.get_latest_version(family_id)

        if not current:
            raise ValueError("No current version found to cherry-pick onto")

        # Create new version with picked content
        cherry_picked = await self.version_service.create_version(
            family_id=family_id,
            prompt_text=version_to_pick.prompt_text,
            commit_message=f"Cherry-pick: {version_to_pick.commit_message or 'version ' + str(version_to_pick.version_number)}",
            author=author or version_to_pick.author,
            parent_version_id=current.id,
            branch_name=target_branch,
            variables=version_to_pick.variables,
            provider_hints=version_to_pick.provider_hints,
            tags=['cherry-pick', f'picked_from:{version_to_pick.version_number}']
        )

        return cherry_picked

    # ===== HELPER METHODS =====

    def _format_timedelta(self, delta: timedelta) -> str:
        """Format timedelta as human-readable string"""
        seconds = int(delta.total_seconds())

        if seconds < 60:
            return f"{seconds} seconds"
        elif seconds < 3600:
            minutes = seconds // 60
            return f"{minutes} minute{'s' if minutes != 1 else ''}"
        elif seconds < 86400:
            hours = seconds // 3600
            return f"{hours} hour{'s' if hours != 1 else ''}"
        else:
            days = seconds // 86400
            return f"{days} day{'s' if days != 1 else ''}"

    async def get_version_stats(
        self,
        version_id: UUID
    ) -> Dict[str, Any]:
        """Get detailed statistics for a version

        Args:
            version_id: Version to get stats for

        Returns:
            Statistics dictionary
        """
        version = await self.version_service.get_version(version_id)
        if not version:
            raise ValueError("Version not found")

        # Count descendants (how many versions branched from this)
        descendants_query = select(func.count(PromptVersion.id)).where(
            PromptVersion.parent_version_id == version_id
        )
        descendants_result = await self.db.execute(descendants_query)
        descendants_count = descendants_result.scalar()

        # Get generation performance
        success_rate = 0.0
        if version.generation_count > 0:
            success_rate = version.successful_assets / version.generation_count

        return {
            "version_id": str(version.id),
            "version_number": version.version_number,
            "branch_name": version.branch_name or "main",
            "char_count": len(version.prompt_text),
            "word_count": len(version.prompt_text.split()),
            "variable_count": len(version.variables),
            "generation_count": version.generation_count,
            "successful_assets": version.successful_assets,
            "success_rate": success_rate,
            "descendants_count": descendants_count,
            "tags": version.tags or [],
            "created_at": version.created_at.isoformat(),
            "age_days": (datetime.utcnow() - version.created_at).days,
            "author": version.author
        }
