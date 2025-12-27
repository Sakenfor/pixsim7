"""Git-like Branch Management for Prompt Versioning

Provides branch management features similar to git:
- Create/delete branches
- List branches
- Switch branches
- Branch visualization
"""
from typing import List, Dict, Any, Optional, Tuple
from uuid import UUID
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

from pixsim7.backend.main.domain.prompt import PromptVersion, PromptFamily
from pixsim7.backend.main.services.prompt.version_service import PromptVersionService


class GitBranchService:
    """Git-like branch management for prompt versions"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.version_service = PromptVersionService(db)

    async def create_branch(
        self,
        family_id: UUID,
        branch_name: str,
        from_version_id: Optional[UUID] = None,
        author: Optional[str] = None
    ) -> PromptVersion:
        """Create a new branch (like git branch or git checkout -b)

        Args:
            family_id: Prompt family
            branch_name: Name for the branch
            from_version_id: Branch from this version (or latest if None)
            author: Creator

        Returns:
            Initial version on new branch
        """
        # Check if branch name already exists
        existing = await self._get_branch_head(family_id, branch_name)
        if existing:
            raise ValueError(f"Branch '{branch_name}' already exists")

        # Get source version
        if from_version_id:
            source_version = await self.version_service.get_version(from_version_id)
            if not source_version:
                raise ValueError(f"Version {from_version_id} not found")
        else:
            # Branch from latest version in family
            source_version = await self.version_service.get_latest_version(family_id)
            if not source_version:
                raise ValueError("No versions found in family to branch from")

        # Create new version on branch
        new_version = await self.version_service.create_version(
            family_id=family_id,
            prompt_text=source_version.prompt_text,
            commit_message=f"Branch '{branch_name}' from version {source_version.version_number}",
            author=author,
            parent_version_id=source_version.id,
            branch_name=branch_name,
            variables=source_version.variables,
            provider_hints=source_version.provider_hints,
            tags=source_version.tags.copy() if source_version.tags else []
        )

        return new_version

    async def delete_branch(
        self,
        family_id: UUID,
        branch_name: str,
        force: bool = False
    ) -> Dict[str, Any]:
        """Delete a branch (like git branch -d)

        Args:
            family_id: Prompt family
            branch_name: Branch to delete
            force: Force delete even if unmerged

        Returns:
            Deletion result
        """
        # Get all versions on this branch
        query = select(PromptVersion).where(
            and_(
                PromptVersion.family_id == family_id,
                PromptVersion.branch_name == branch_name
            )
        )
        result = await self.db.execute(query)
        versions = list(result.scalars().all())

        if not versions:
            raise ValueError(f"Branch '{branch_name}' not found")

        # Check if branch has been merged (unless force)
        if not force:
            unmerged = await self._check_unmerged(family_id, branch_name)
            if unmerged:
                raise ValueError(
                    f"Branch '{branch_name}' has unmerged changes. Use force=True to delete anyway."
                )

        # Mark versions as archived (don't actually delete)
        for version in versions:
            version.tags = version.tags or []
            if 'archived' not in version.tags:
                version.tags.append('archived')
            if 'deleted_branch' not in version.tags:
                version.tags.append('deleted_branch')

        await self.db.commit()

        return {
            "success": True,
            "branch_name": branch_name,
            "versions_archived": len(versions),
            "message": f"Deleted branch '{branch_name}'"
        }

    async def list_branches(
        self,
        family_id: UUID
    ) -> List[Dict[str, Any]]:
        """List all branches in a family (like git branch)

        Args:
            family_id: Prompt family

        Returns:
            List of branches with metadata
        """
        # Get all distinct branch names
        query = select(
            PromptVersion.branch_name,
            func.max(PromptVersion.created_at).label('last_commit'),
            func.count(PromptVersion.id).label('commit_count'),
            func.max(PromptVersion.version_number).label('latest_version_number')
        ).where(
            and_(
                PromptVersion.family_id == family_id,
                PromptVersion.branch_name.isnot(None),
                ~PromptVersion.tags.contains(['archived'])  # Exclude archived
            )
        ).group_by(PromptVersion.branch_name)

        result = await self.db.execute(query)
        branches_data = result.all()

        branches = []
        for branch_name, last_commit, commit_count, latest_version_number in branches_data:
            # Get head (latest version on branch)
            head = await self._get_branch_head(family_id, branch_name)

            branches.append({
                "name": branch_name,
                "head_version_id": str(head.id) if head else None,
                "latest_version_number": latest_version_number,
                "commit_count": commit_count,
                "last_commit": last_commit.isoformat() if last_commit else None,
                "author": head.author if head else None,
                "is_main": branch_name == "main" or branch_name == "master"
            })

        # Add implicit "main" branch (versions without branch_name)
        main_query = select(
            func.count(PromptVersion.id).label('commit_count'),
            func.max(PromptVersion.created_at).label('last_commit'),
            func.max(PromptVersion.version_number).label('latest_version_number')
        ).where(
            and_(
                PromptVersion.family_id == family_id,
                PromptVersion.branch_name.is_(None)
            )
        )
        main_result = await self.db.execute(main_query)
        main_data = main_result.first()

        if main_data and main_data.commit_count > 0:
            main_head = await self.version_service.get_latest_version(family_id)
            branches.insert(0, {
                "name": "main",
                "head_version_id": str(main_head.id) if main_head else None,
                "latest_version_number": main_data.latest_version_number,
                "commit_count": main_data.commit_count,
                "last_commit": main_data.last_commit.isoformat() if main_data.last_commit else None,
                "author": main_head.author if main_head else None,
                "is_main": True
            })

        return branches

    async def get_branch_history(
        self,
        family_id: UUID,
        branch_name: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get commit history for a branch (like git log)

        Args:
            family_id: Prompt family
            branch_name: Branch to get history for (None = main)
            limit: Max commits to return

        Returns:
            List of commits (versions) in chronological order
        """
        query = select(PromptVersion).where(
            PromptVersion.family_id == family_id
        )

        if branch_name:
            query = query.where(PromptVersion.branch_name == branch_name)
        else:
            # Main branch = no branch_name
            query = query.where(PromptVersion.branch_name.is_(None))

        query = query.order_by(PromptVersion.created_at.desc()).limit(limit)

        result = await self.db.execute(query)
        versions = result.scalars().all()

        history = []
        for version in versions:
            history.append({
                "version_id": str(version.id),
                "version_number": version.version_number,
                "commit_message": version.commit_message,
                "author": version.author,
                "created_at": version.created_at.isoformat(),
                "parent_version_id": str(version.parent_version_id) if version.parent_version_id else None,
                "branch_name": version.branch_name,
                "tags": version.tags,
                "char_count": len(version.prompt_text),
                "generation_count": version.generation_count
            })

        return history

    async def visualize_branches(
        self,
        family_id: UUID
    ) -> Dict[str, Any]:
        """Generate branch visualization data (like git log --graph)

        Args:
            family_id: Prompt family

        Returns:
            Graph structure for visualization
        """
        # Get all versions
        query = select(PromptVersion).where(
            PromptVersion.family_id == family_id
        ).order_by(PromptVersion.created_at.asc())

        result = await self.db.execute(query)
        versions = list(result.scalars().all())

        # Build graph structure
        nodes = []
        edges = []

        for version in versions:
            nodes.append({
                "id": str(version.id),
                "version_number": version.version_number,
                "branch_name": version.branch_name or "main",
                "commit_message": version.commit_message,
                "author": version.author,
                "created_at": version.created_at.isoformat(),
                "tags": version.tags
            })

            if version.parent_version_id:
                edges.append({
                    "from": str(version.parent_version_id),
                    "to": str(version.id),
                    "type": "parent"
                })

        # Identify branch points
        branch_points = []
        for version in versions:
            # Count how many versions have this as parent
            children_query = select(func.count(PromptVersion.id)).where(
                PromptVersion.parent_version_id == version.id
            )
            children_result = await self.db.execute(children_query)
            children_count = children_result.scalar()

            if children_count > 1:
                branch_points.append({
                    "version_id": str(version.id),
                    "children_count": children_count
                })

        return {
            "nodes": nodes,
            "edges": edges,
            "branch_points": branch_points,
            "total_versions": len(versions),
            "total_branches": len(set(v.branch_name or "main" for v in versions))
        }

    async def _get_branch_head(
        self,
        family_id: UUID,
        branch_name: str
    ) -> Optional[PromptVersion]:
        """Get the head (latest version) of a branch"""
        query = select(PromptVersion).where(
            and_(
                PromptVersion.family_id == family_id,
                PromptVersion.branch_name == branch_name
            )
        ).order_by(PromptVersion.created_at.desc()).limit(1)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def _check_unmerged(
        self,
        family_id: UUID,
        branch_name: str
    ) -> bool:
        """Check if branch has unmerged changes

        A branch is considered merged if there's a version on main
        that has a version from this branch as a parent.
        """
        # Get all versions on this branch
        branch_query = select(PromptVersion.id).where(
            and_(
                PromptVersion.family_id == family_id,
                PromptVersion.branch_name == branch_name
            )
        )
        branch_result = await self.db.execute(branch_query)
        branch_version_ids = [v[0] for v in branch_result.all()]

        if not branch_version_ids:
            return False

        # Check if any main branch version has a branch version as parent
        main_query = select(PromptVersion).where(
            and_(
                PromptVersion.family_id == family_id,
                PromptVersion.branch_name.is_(None),
                PromptVersion.parent_version_id.in_(branch_version_ids)
            )
        )
        main_result = await self.db.execute(main_query)
        merged_version = main_result.first()

        # If no merged version found, branch is unmerged
        return merged_version is None

    async def switch_branch(
        self,
        family_id: UUID,
        branch_name: str
    ) -> Dict[str, Any]:
        """Switch to a branch (like git checkout)

        This is mainly for UI state, doesn't change database state.

        Args:
            family_id: Prompt family
            branch_name: Branch to switch to

        Returns:
            Branch head information
        """
        head = await self._get_branch_head(family_id, branch_name)
        if not head:
            raise ValueError(f"Branch '{branch_name}' not found")

        return {
            "branch_name": branch_name,
            "head_version_id": str(head.id),
            "version_number": head.version_number,
            "commit_message": head.commit_message,
            "author": head.author,
            "created_at": head.created_at.isoformat()
        }

    async def get_divergence(
        self,
        family_id: UUID,
        branch1: str,
        branch2: str
    ) -> Dict[str, Any]:
        """Get divergence between two branches

        Args:
            family_id: Prompt family
            branch1: First branch name
            branch2: Second branch name

        Returns:
            Divergence information (commits ahead/behind)
        """
        head1 = await self._get_branch_head(family_id, branch1)
        head2 = await self._get_branch_head(family_id, branch2)

        if not head1:
            raise ValueError(f"Branch '{branch1}' not found")
        if not head2:
            raise ValueError(f"Branch '{branch2}' not found")

        # Find common ancestor
        ancestors1 = await self._get_ancestors(head1.id)
        ancestors2 = await self._get_ancestors(head2.id)

        common_ancestor = None
        for ancestor_id in ancestors1:
            if ancestor_id in ancestors2:
                common_ancestor = ancestor_id
                break

        # Count commits ahead/behind
        commits_ahead = await self._count_commits_between(common_ancestor, head1.id) if common_ancestor else 0
        commits_behind = await self._count_commits_between(common_ancestor, head2.id) if common_ancestor else 0

        return {
            "branch1": branch1,
            "branch2": branch2,
            "common_ancestor_id": str(common_ancestor) if common_ancestor else None,
            "commits_ahead": commits_ahead,
            "commits_behind": commits_behind,
            "diverged": common_ancestor is not None and commits_ahead > 0 and commits_behind > 0
        }

    async def _get_ancestors(
        self,
        version_id: UUID,
        limit: int = 100
    ) -> List[UUID]:
        """Get all ancestor version IDs"""
        ancestors = []
        current_id = version_id

        for _ in range(limit):
            query = select(PromptVersion.parent_version_id).where(
                PromptVersion.id == current_id
            )
            result = await self.db.execute(query)
            parent_id = result.scalar_one_or_none()

            if not parent_id:
                break

            ancestors.append(parent_id)
            current_id = parent_id

        return ancestors

    async def _count_commits_between(
        self,
        from_version_id: UUID,
        to_version_id: UUID
    ) -> int:
        """Count commits between two versions"""
        count = 0
        current_id = to_version_id

        # Walk back from to_version_id until we hit from_version_id
        for _ in range(100):  # Safety limit
            if current_id == from_version_id:
                break

            query = select(PromptVersion.parent_version_id).where(
                PromptVersion.id == current_id
            )
            result = await self.db.execute(query)
            parent_id = result.scalar_one_or_none()

            if not parent_id:
                break

            count += 1
            current_id = parent_id

        return count
