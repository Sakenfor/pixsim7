"""Link Integrity Service

Provides diagnostic and maintenance utilities for the ObjectLink system:
- Find orphaned links (links pointing to deleted entities)
- Cleanup orphaned links
- Validate link integrity
- Generate integrity reports

Usage:
    service = LinkIntegrityService(db)

    # Find orphaned links
    orphaned = await service.find_orphaned_links()

    # Cleanup with dry run
    report = await service.cleanup_orphaned_links(dry_run=True)

    # Full cleanup
    report = await service.cleanup_orphaned_links(dry_run=False)

    # Get integrity report
    report = await service.get_integrity_report()
"""
from typing import List, Dict, Any, Optional, Set
from uuid import UUID
from datetime import datetime
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, and_

from pixsim7.backend.main.domain.links import ObjectLink
from pixsim7.backend.main.domain.game.entities.character_integrations import CharacterInstance
from pixsim7.backend.main.domain.game.core.models import GameNPC


logger = logging.getLogger(__name__)


class OrphanedLink:
    """Represents an orphaned link with diagnostic information"""

    def __init__(
        self,
        link: ObjectLink,
        reason: str,
        missing_entity_type: str,
    ):
        self.link = link
        self.reason = reason
        self.missing_entity_type = missing_entity_type

    def to_dict(self) -> Dict[str, Any]:
        return {
            "link_id": str(self.link.link_id),
            "template_kind": self.link.template_kind,
            "template_id": self.link.template_id,
            "runtime_kind": self.link.runtime_kind,
            "runtime_id": self.link.runtime_id,
            "reason": self.reason,
            "missing_entity_type": self.missing_entity_type,
            "created_at": self.link.created_at.isoformat() if self.link.created_at else None,
        }


class LinkIntegrityService:
    """Service for checking and maintaining link integrity

    Provides utilities to find orphaned links (links pointing to deleted entities)
    and clean them up to maintain data integrity.
    """

    def __init__(self, db: AsyncSession):
        """Initialize integrity service

        Args:
            db: Database session for integrity operations
        """
        self.db = db

    async def find_orphaned_links(
        self,
        template_kind: Optional[str] = None,
        runtime_kind: Optional[str] = None,
        limit: int = 1000,
    ) -> List[OrphanedLink]:
        """Find links pointing to non-existent entities

        Checks both template and runtime sides of links to find any
        that reference deleted entities.

        Args:
            template_kind: Filter by template kind (e.g., 'characterInstance')
            runtime_kind: Filter by runtime kind (e.g., 'npc')
            limit: Maximum number of orphaned links to return

        Returns:
            List of OrphanedLink objects with diagnostic information
        """
        orphaned: List[OrphanedLink] = []

        # Build query for links
        query = select(ObjectLink)

        if template_kind:
            query = query.where(ObjectLink.template_kind == template_kind)
        if runtime_kind:
            query = query.where(ObjectLink.runtime_kind == runtime_kind)

        query = query.limit(limit)

        result = await self.db.execute(query)
        links = list(result.scalars().all())

        # Check characterInstance -> npc links
        character_instance_links = [
            link for link in links
            if link.template_kind == 'characterInstance' and link.runtime_kind == 'npc'
        ]

        if character_instance_links:
            orphaned.extend(
                await self._check_character_npc_links(character_instance_links)
            )

        # TODO: Add checks for other link types as they are implemented
        # - itemTemplate -> item
        # - propTemplate -> prop

        return orphaned

    async def _check_character_npc_links(
        self,
        links: List[ObjectLink],
    ) -> List[OrphanedLink]:
        """Check characterInstance->npc links for orphaned references

        Args:
            links: Links to check

        Returns:
            List of orphaned links
        """
        orphaned: List[OrphanedLink] = []

        # Extract IDs to check
        instance_ids: Set[str] = {link.template_id for link in links}
        npc_ids: Set[int] = {link.runtime_id for link in links}

        # Batch check CharacterInstances
        # Note: Include inactive instances to detect soft-deleted entities
        existing_instances: Set[str] = set()
        active_instances: Set[str] = set()

        if instance_ids:
            try:
                uuids = [UUID(id_str) for id_str in instance_ids]
                result = await self.db.execute(
                    select(CharacterInstance.id, CharacterInstance.is_active)
                    .where(CharacterInstance.id.in_(uuids))
                )
                for row in result.all():
                    existing_instances.add(str(row[0]))
                    if row[1]:  # is_active
                        active_instances.add(str(row[0]))
            except Exception as e:
                logger.warning(f"Error checking CharacterInstances: {e}")

        # Batch check GameNPCs
        existing_npcs: Set[int] = set()
        if npc_ids:
            result = await self.db.execute(
                select(GameNPC.id).where(GameNPC.id.in_(list(npc_ids)))
            )
            existing_npcs = {row[0] for row in result.all()}

        # Find orphaned links
        for link in links:
            # Check template side
            if link.template_id not in existing_instances:
                orphaned.append(OrphanedLink(
                    link=link,
                    reason="CharacterInstance does not exist (hard deleted)",
                    missing_entity_type="template",
                ))
            elif link.template_id not in active_instances:
                orphaned.append(OrphanedLink(
                    link=link,
                    reason="CharacterInstance is inactive (soft deleted)",
                    missing_entity_type="template",
                ))

            # Check runtime side
            if link.runtime_id not in existing_npcs:
                orphaned.append(OrphanedLink(
                    link=link,
                    reason="GameNPC does not exist",
                    missing_entity_type="runtime",
                ))

        return orphaned

    async def cleanup_orphaned_links(
        self,
        dry_run: bool = True,
        template_kind: Optional[str] = None,
        runtime_kind: Optional[str] = None,
        include_soft_deleted: bool = False,
    ) -> Dict[str, Any]:
        """Remove orphaned links from the database

        Args:
            dry_run: If True, only report what would be deleted without deleting
            template_kind: Filter by template kind
            runtime_kind: Filter by runtime kind
            include_soft_deleted: If True, also remove links to soft-deleted entities

        Returns:
            Report dict with cleanup results
        """
        orphaned = await self.find_orphaned_links(
            template_kind=template_kind,
            runtime_kind=runtime_kind,
        )

        # Filter based on deletion type
        to_delete: List[OrphanedLink] = []
        for orphan in orphaned:
            if "soft deleted" in orphan.reason:
                if include_soft_deleted:
                    to_delete.append(orphan)
            else:
                to_delete.append(orphan)

        deleted_count = 0
        deleted_ids: List[str] = []

        if not dry_run and to_delete:
            link_ids = [orphan.link.link_id for orphan in to_delete]
            await self.db.execute(
                delete(ObjectLink).where(ObjectLink.link_id.in_(link_ids))
            )
            await self.db.commit()
            deleted_count = len(link_ids)
            deleted_ids = [str(id) for id in link_ids]

            logger.info(
                f"Cleaned up {deleted_count} orphaned links",
                extra={"link_ids": deleted_ids}
            )

        return {
            "dry_run": dry_run,
            "orphaned_found": len(orphaned),
            "would_delete": len(to_delete),
            "deleted_count": deleted_count if not dry_run else 0,
            "deleted_ids": deleted_ids if not dry_run else [],
            "orphaned_details": [o.to_dict() for o in to_delete[:100]],  # Limit details
            "include_soft_deleted": include_soft_deleted,
        }

    async def get_integrity_report(self) -> Dict[str, Any]:
        """Generate a comprehensive integrity report

        Returns:
            Report with link statistics and integrity issues
        """
        # Count total links
        total_count = await self.db.scalar(
            select(func.count(ObjectLink.link_id))
        )

        # Count by mapping type
        mapping_counts_result = await self.db.execute(
            select(ObjectLink.mapping_id, func.count(ObjectLink.link_id))
            .group_by(ObjectLink.mapping_id)
        )
        mapping_counts = {
            mapping_id: count
            for mapping_id, count in mapping_counts_result.all()
        }

        # Count enabled vs disabled
        enabled_count = await self.db.scalar(
            select(func.count(ObjectLink.link_id))
            .where(ObjectLink.sync_enabled == True)
        )
        disabled_count = total_count - enabled_count if total_count else 0

        # Find orphaned links (limited sample)
        orphaned = await self.find_orphaned_links(limit=100)

        # Count by orphan type
        orphan_by_type: Dict[str, int] = {}
        for orphan in orphaned:
            key = f"{orphan.link.template_kind}->{orphan.link.runtime_kind}"
            orphan_by_type[key] = orphan_by_type.get(key, 0) + 1

        return {
            "generated_at": datetime.utcnow().isoformat(),
            "total_links": total_count or 0,
            "enabled_links": enabled_count or 0,
            "disabled_links": disabled_count,
            "links_by_mapping": mapping_counts,
            "orphaned_links_sample": len(orphaned),
            "orphans_by_type": orphan_by_type,
            "has_integrity_issues": len(orphaned) > 0,
            "sample_orphans": [o.to_dict() for o in orphaned[:10]],
        }

    async def validate_link(self, link_id: UUID) -> Dict[str, Any]:
        """Validate a specific link

        Args:
            link_id: Link UUID to validate

        Returns:
            Validation result with status and any issues found
        """
        link = await self.db.get(ObjectLink, link_id)
        if not link:
            return {
                "valid": False,
                "link_id": str(link_id),
                "error": "Link not found",
            }

        issues: List[str] = []

        # Check based on link type
        if link.template_kind == 'characterInstance' and link.runtime_kind == 'npc':
            # Check CharacterInstance
            try:
                instance_uuid = UUID(link.template_id)
                instance = await self.db.get(CharacterInstance, instance_uuid)
                if not instance:
                    issues.append("CharacterInstance not found (hard deleted)")
                elif not instance.is_active:
                    issues.append("CharacterInstance is inactive (soft deleted)")
            except ValueError:
                issues.append(f"Invalid template_id format: {link.template_id}")

            # Check GameNPC
            npc = await self.db.get(GameNPC, link.runtime_id)
            if not npc:
                issues.append("GameNPC not found")

        return {
            "valid": len(issues) == 0,
            "link_id": str(link_id),
            "template_kind": link.template_kind,
            "template_id": link.template_id,
            "runtime_kind": link.runtime_kind,
            "runtime_id": link.runtime_id,
            "sync_enabled": link.sync_enabled,
            "issues": issues,
        }

    async def get_links_for_entity(
        self,
        entity_kind: str,
        entity_id: Any,
        side: str = "both",
    ) -> List[Dict[str, Any]]:
        """Get all links involving a specific entity

        Args:
            entity_kind: Entity kind (e.g., 'characterInstance', 'npc')
            entity_id: Entity ID
            side: Which side to search - 'template', 'runtime', or 'both'

        Returns:
            List of link details
        """
        links: List[ObjectLink] = []

        if side in ("template", "both"):
            result = await self.db.execute(
                select(ObjectLink).where(
                    and_(
                        ObjectLink.template_kind == entity_kind,
                        ObjectLink.template_id == str(entity_id)
                    )
                )
            )
            links.extend(result.scalars().all())

        if side in ("runtime", "both"):
            result = await self.db.execute(
                select(ObjectLink).where(
                    and_(
                        ObjectLink.runtime_kind == entity_kind,
                        ObjectLink.runtime_id == int(entity_id)
                    )
                )
            )
            links.extend(result.scalars().all())

        return [
            {
                "link_id": str(link.link_id),
                "template_kind": link.template_kind,
                "template_id": link.template_id,
                "runtime_kind": link.runtime_kind,
                "runtime_id": link.runtime_id,
                "mapping_id": link.mapping_id,
                "sync_enabled": link.sync_enabled,
                "sync_direction": link.sync_direction,
                "priority": link.priority,
                "created_at": link.created_at.isoformat() if link.created_at else None,
            }
            for link in links
        ]


async def delete_links_for_entity(
    db: AsyncSession,
    entity_kind: str,
    entity_id: Any,
    side: str = "both",
) -> int:
    """Delete all links involving a specific entity

    Utility function for cleaning up links when an entity is deleted.
    Can be called from entity deletion services.

    Args:
        db: Database session
        entity_kind: Entity kind (e.g., 'characterInstance', 'npc')
        entity_id: Entity ID
        side: Which side to delete - 'template', 'runtime', or 'both'

    Returns:
        Number of links deleted
    """
    deleted_count = 0

    if side in ("template", "both"):
        result = await db.execute(
            delete(ObjectLink).where(
                and_(
                    ObjectLink.template_kind == entity_kind,
                    ObjectLink.template_id == str(entity_id)
                )
            )
        )
        deleted_count += result.rowcount or 0

    if side in ("runtime", "both"):
        result = await db.execute(
            delete(ObjectLink).where(
                and_(
                    ObjectLink.runtime_kind == entity_kind,
                    ObjectLink.runtime_id == int(entity_id)
                )
            )
        )
        deleted_count += result.rowcount or 0

    return deleted_count
